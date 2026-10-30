// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Server Actions de la sección "Alta" del acompañamiento (spec 002, tareas 10 y 11).
// - guardarVerificacion: paso 1. Solo envía diagnostico_verificado y cedula_profesional; quién y
//   cuándo los pone el trigger private.app_on_verificacion (R-002.8). RLS limita a la etapa alta
//   y al coach del acompañamiento (R-002.10).
// - generarInvitacion: paso 2. Código de un solo uso como contraseña temporal (decisión a).
//   El código SOLO viaja en la respuesta de esta action (R-002.47): no va en URL, logs,
//   audit_log ni tablas. Los errores se registran con mensajes fijos.
"use server";

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserWithRole } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { engagements, invitations, users } from "@/lib/db/schema";
import { ENGAGEMENT_CONFIG } from "@/lib/engagements/config";
import { formatearCodigo, generarCodigo, venceEn } from "@/lib/invitations/code";
import { logError } from "@/lib/log";
import { ponerContrasenaTemporal } from "@/lib/supabase/admin";
import { Verificacion } from "@/lib/validators/alta";
import { insertarInvitacion } from "@/lib/db/insertar";

const ERROR_SESION = "Necesitas iniciar sesión con una cuenta de coach.";
const ERROR_NO_EXISTE = "No encontramos este acompañamiento.";

// ---------------------------------------------------------------------------
// Paso 1: verificación del diagnóstico
// ---------------------------------------------------------------------------

export type VerificacionState = {
  errores: { casillas?: string; cedula?: string; general?: string };
  // Lo que escribió el coach, para no pedirlo otra vez si hubo un error.
  valores: { cedula: string; revisoDocumento: boolean; consultoSep: boolean };
};

const ERROR_NO_GUARDADA =
  "No se pudo guardar la verificación. Solo se puede registrar mientras el acompañamiento está en alta. Intenta de nuevo.";

export async function guardarVerificacion(_prev: VerificacionState, formData: FormData): Promise<VerificacionState> {
  const valores = {
    cedula: String(formData.get("cedula") ?? ""),
    revisoDocumento: formData.get("revisoDocumento") === "on",
    consultoSep: formData.get("consultoSep") === "on",
  };
  const engagementId = String(formData.get("engagementId") ?? "");

  const user = await getUserWithRole("coach");
  if (!user) return { errores: { general: ERROR_SESION }, valores };
  if (!z.uuid().safeParse(engagementId).success) return { errores: { general: ERROR_NO_EXISTE }, valores };

  const parsed = Verificacion.safeParse(valores);
  if (!parsed.success) {
    const errores: VerificacionState["errores"] = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0];
      if (campo === "cedula") errores.cedula ??= issue.message;
      else errores.casillas ??= issue.message;
    }
    return { errores, valores };
  }

  let actualizadas: number;
  try {
    actualizadas = await withRls(user.claims, async (tx) => {
      // Las dos casillas juntas producen diagnostico_verificado = true (R-002.7). No se envían
      // diagnostico_verificado_por ni diagnostico_verificado_en: authenticated no puede escribirlos.
      const filas = await tx
        .update(engagements)
        .set({ diagnosticoVerificado: true, cedulaProfesional: parsed.data.cedula })
        .where(and(eq(engagements.id, engagementId), eq(engagements.coachId, user.id), eq(engagements.stage, "alta")))
        .returning({ id: engagements.id });
      return filas.length;
    });
  } catch (e) {
    logError("alta: no se pudo guardar la verificación", e);
    return { errores: { general: ERROR_NO_GUARDADA }, valores };
  }
  // RLS (engagements_update_coach_alta) no deja actualizar fuera de alta ni a otro coach: 0 filas.
  if (actualizadas === 0) return { errores: { general: ERROR_NO_GUARDADA }, valores };

  // Sin ?corregir, la página muestra el estado guardado. redirect va fuera de try/catch.
  redirect(`/coach/engagements/${engagementId}`);
}

// ---------------------------------------------------------------------------
// Paso 2: invitación
// ---------------------------------------------------------------------------

export type InvitacionState = {
  error: string | null;
  // Solo existe en la respuesta inmediata de la action. Nunca se guarda ni se registra.
  resultado: { nombre: string; codigo: string; vence: string; urlInvitacion: string } | null;
};

const ERROR_SIN_VERIFICACION = "Primero registra la verificación del diagnóstico. Después puedes generar la invitación.";
const ERROR_FALLO_INVITACION = "No se pudo generar el código. No se guardó nada. Intenta de nuevo.";
const ERROR_FUERA_DE_ALTA = "La invitación solo se genera mientras el acompañamiento está en alta.";
const errorUsada = (nombre: string) => `${nombre} ya creó su contraseña. No se generó un código nuevo.`;

// Error sin datos: si la admin API falla, se lanza esto para que la transacción haga rollback.
class FalloContrasenaTemporal extends Error {
  constructor() {
    super("No se pudo poner la contraseña temporal");
    this.name = "FalloContrasenaTemporal";
  }
}

type ResultadoTx =
  | { tipo: "no_existe" }
  | { tipo: "fuera_de_alta" }
  | { tipo: "sin_verificacion" }
  | { tipo: "usada"; nombre: string }
  | { tipo: "ok"; nombre: string; codigo: string; expira: Date };

// URL de la app para el texto del resultado: la misma desde la que entra el coach.
async function urlDeLaApp(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

// Misma fecha que muestra el resto de la app (components/coach/labels.ts).
const formatoFecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" });

// Recibe solo el FormData: el estado anterior trae el código y no debe volver al servidor (R-002.47).
export async function generarInvitacion(formData: FormData): Promise<InvitacionState> {
  const engagementId = String(formData.get("engagementId") ?? "");
  const user = await getUserWithRole("coach");
  if (!user) return { error: ERROR_SESION, resultado: null };
  if (!z.uuid().safeParse(engagementId).success) return { error: ERROR_NO_EXISTE, resultado: null };

  let r: ResultadoTx;
  try {
    // Una sola transacción con RLS del coach: si la admin API falla, no queda invitación nueva
    // y la anterior sigue pendiente (R-002.15, sección Datos).
    r = await withRls(user.claims, async (tx): Promise<ResultadoTx> => {
      const [e] = await tx
        .select({
          type: engagements.type,
          stage: engagements.stage,
          personaId: engagements.personaId,
          diagnosticoVerificado: engagements.diagnosticoVerificado,
          nombrePila: users.nombrePila,
        })
        .from(engagements)
        .leftJoin(users, eq(users.id, engagements.personaId))
        .where(and(eq(engagements.id, engagementId), eq(engagements.coachId, user.id)))
        .limit(1);
      if (!e) return { tipo: "no_existe" };
      const nombre = e.nombrePila ?? "La persona";

      // R-002.38: con la invitación usada no se genera otro código (cambiaría su contraseña).
      // Se revisa antes que nada y antes de llamar a la admin API.
      const [usada] = await tx
        .select({ id: invitations.id })
        .from(invitations)
        .where(and(eq(invitations.engagementId, engagementId), isNotNull(invitations.usadaEn)))
        .limit(1);
      if (usada) return { tipo: "usada", nombre };
      if (e.stage !== "alta") return { tipo: "fuera_de_alta" };
      // R-002.13: la verificación completa va antes de la invitación si el tipo la pide.
      if (ENGAGEMENT_CONFIG[e.type].requiereDiagnostico && !e.diagnosticoVerificado) return { tipo: "sin_verificacion" };

      // La pendiente (si existe) queda reemplazada: su código deja de funcionar al cambiar la contraseña.
      await tx
        .update(invitations)
        .set({ reemplazadaEn: sql`now()` })
        .where(
          and(eq(invitations.engagementId, engagementId), isNull(invitations.usadaEn), isNull(invitations.reemplazadaEn)),
        );

      const expira = venceEn();
      // invitations_insert_coach vuelve a revisar en la base que ninguna invitación esté usada.
      await insertarInvitacion(tx, { engagementId, personaId: e.personaId, creadaPor: user.id, expiraEn: expira });

      const codigo = generarCodigo();
      try {
        await ponerContrasenaTemporal(e.personaId, codigo);
      } catch {
        // No se reenvía el error de Supabase: se lanza uno fijo para el rollback.
        throw new FalloContrasenaTemporal();
      }
      return { tipo: "ok", nombre, codigo, expira };
    });
  } catch (e) {
    // e es FalloContrasenaTemporal o un error de la base (resumirError no imprime params).
    // Ninguno lleva el código: se genera después de las consultas y no pasa por SQL.
    logError("alta: no se pudo generar la invitación", e);
    return { error: ERROR_FALLO_INVITACION, resultado: null };
  }

  switch (r.tipo) {
    case "no_existe":
      return { error: ERROR_NO_EXISTE, resultado: null };
    case "fuera_de_alta":
      return { error: ERROR_FUERA_DE_ALTA, resultado: null };
    case "sin_verificacion":
      return { error: ERROR_SIN_VERIFICACION, resultado: null };
    case "usada":
      refresh();
      return { error: errorUsada(r.nombre), resultado: null };
    case "ok": {
      // La página vuelve a leer la invitación pendiente; el código solo vive en esta respuesta.
      refresh();
      return {
        error: null,
        resultado: {
          nombre: r.nombre,
          codigo: formatearCodigo(r.codigo),
          vence: formatoFecha.format(r.expira),
          urlInvitacion: `${await urlDeLaApp()}/invitacion`,
        },
      };
    }
  }
}
