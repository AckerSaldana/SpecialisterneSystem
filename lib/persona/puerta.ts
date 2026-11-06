// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Puerta de entrada de la persona (spec 002, tarea 14: R-002.18, R-002.19, R-002.39).
// La usan el layout y las páginas de /persona y las páginas de /bienvenida. Decide en qué paso
// está la persona y la manda ahí:
//   1. Invitación vencida o reemplazada, sin usar → cierra la sesión y va a /invitacion con el
//      aviso de código vencido (R-002.39). Supabase Auth no sabe que el código vence, por eso la
//      revisión vive aquí y no solo en /invitacion: también cubre la entrada por /login.
//   2. Invitación pendiente → /bienvenida/contrasena (R-002.18).
//   3. Sin consentimiento vigente → /bienvenida/aviso (R-002.19).
// Cada página dice en qué paso está, así ninguna se redirige a sí misma (sin bucles).
// Solo lee el acompañamiento con miAcompanamiento (R-002.40), nunca app.engagements.
import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSessionUser, HOME_BY_ROLE, type SessionUser } from "@/lib/auth";
import { estadoConsentimiento, type EstadoConsentimiento } from "@/lib/consent";
import { invitations } from "@/lib/db/schema";
import { withRls, type Tx } from "@/lib/db/rls";
import { miAcompanamiento, type MiAcompanamiento } from "@/lib/engagements/persona";

// Ruta que cierra la sesión cuando el código venció. Un Server Component no puede borrar
// cookies, así que la puerta manda a este Route Handler, que sí puede (app/invitacion/vencido).
// La URL no lleva ningún dato (R-002.47).
export const RUTA_VENCIDO = "/invitacion/vencido";
// Página de /invitacion con el aviso de código vencido. El parámetro no lleva datos.
export const INVITACION_VENCIDA = "/invitacion?vencido=1";
// Texto literal de la spec ("Persona: entrar con código").
export const ERROR_VENCIDO =
  "Tu código ya no funciona porque venció o porque tu coach generó uno nuevo. Pide un código nuevo a tu coach.";

export type EstadoInvitacion =
  // La persona no entró por invitación (p. ej. el seed de demo con contraseña): no hay paso de código.
  | { estado: "sin_invitacion" }
  // Ya creó su contraseña: el código ya no sirve y no se generan más (R-002.38).
  | { estado: "usada" }
  // Entró con el código y todavía no crea su contraseña.
  | { estado: "pendiente"; id: string; expiraEn: Date }
  // El código venció, o el coach generó uno nuevo y esta sesión es del código anterior.
  | { estado: "vencida" };

type FilaInvitacion = { id: string; expiraEn: Date; usadaEn: Date | null; reemplazadaEn: Date | null; createdAt: Date };

// Regla pura, para poder probarla sin base. La pendiente es la más reciente con usada_en y
// reemplazada_en nulos (spec 002, "Datos"). No se ordena solo por created_at porque el
// reemplazo marca la anterior e inserta la nueva en la misma transacción (mismo now()).
export function evaluarInvitaciones(filas: FilaInvitacion[], ahora: Date = new Date()): EstadoInvitacion {
  if (filas.length === 0) return { estado: "sin_invitacion" };
  if (filas.some((f) => f.usadaEn !== null)) return { estado: "usada" };
  const pendiente = filas
    .filter((f) => f.reemplazadaEn === null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!pendiente || pendiente.expiraEn.getTime() <= ahora.getTime()) return { estado: "vencida" };
  return { estado: "pendiente", id: pendiente.id, expiraEn: pendiente.expiraEn };
}

export async function leerInvitacion(tx: Tx, personaId: string): Promise<EstadoInvitacion> {
  // RLS (invitations_select_participants) ya limita a las de esta persona; el filtro lo deja explícito.
  const filas = await tx
    .select({
      id: invitations.id,
      expiraEn: invitations.expiraEn,
      usadaEn: invitations.usadaEn,
      reemplazadaEn: invitations.reemplazadaEn,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(eq(invitations.personaId, personaId));
  return evaluarInvitaciones(filas);
}

export type EstadoPersona = {
  invitacion: EstadoInvitacion;
  acompanamiento: MiAcompanamiento | null;
  // null si no hay acompañamiento.
  consentimiento: EstadoConsentimiento | null;
};

// Lectura compartida por la puerta y por las Server Actions de la persona (que no pasan por
// la puerta y tienen que revisar lo mismo antes de escribir).
export async function leerEstadoPersona(tx: Tx, personaId: string): Promise<EstadoPersona> {
  const invitacion = await leerInvitacion(tx, personaId);
  const acompanamiento = await miAcompanamiento(tx);
  const consentimiento = acompanamiento ? await estadoConsentimiento(tx, acompanamiento.id) : null;
  return { invitacion, acompanamiento, consentimiento };
}

// Una sola lectura por petición aunque la llamen el layout y la página (React cache).
// estado es null cuando quien entra no es persona.
const leerSesionPersona = cache(async (): Promise<{ user: SessionUser; estado: EstadoPersona | null } | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  if (user.role !== "persona") return { user, estado: null };
  const estado = await withRls(user.claims, (tx) => leerEstadoPersona(tx, user.id));
  return { user, estado };
});

// En qué pantalla está quien llama:
//   "contrasena" → /bienvenida/contrasena
//   "aviso"      → /bienvenida/aviso y /bienvenida/no-por-ahora
//   "persona"    → /persona y sus páginas
export type PasoPersona = "contrasena" | "aviso" | "persona";

export type ResultadoPuerta = { user: SessionUser } & EstadoPersona;

export async function puertaPersona(paso: PasoPersona): Promise<ResultadoPuerta> {
  const sesion = await leerSesionPersona();
  if (!sesion) redirect("/login");
  const { user, estado } = sesion;
  if (!estado) redirect(HOME_BY_ROLE[user.role]);

  // 1. Código vencido: antes que cualquier otra cosa, en cualquier paso (R-002.39).
  if (estado.invitacion.estado === "vencida") redirect(RUTA_VENCIDO);

  // 2. Contraseña pendiente: la única pantalla posible es la de la contraseña (R-002.18).
  if (estado.invitacion.estado === "pendiente") {
    if (paso !== "contrasena") redirect("/bienvenida/contrasena");
    return { user, ...estado };
  }
  // Sin invitación pendiente, la pantalla de la contraseña ya no aplica.
  if (paso === "contrasena") redirect("/bienvenida/aviso");

  const vigente = estado.consentimiento?.estado === "vigente";

  // Sin acompañamiento no hay nada que consentir: /persona muestra que todavía no hay uno.
  if (!estado.acompanamiento) {
    if (paso !== "persona") redirect("/persona");
    return { user, ...estado };
  }

  // 3. Sin consentimiento vigente, solo el aviso (R-002.19). Con consentimiento, el aviso
  // de /bienvenida ya no aplica; la versión de solo lectura está en /persona/aviso.
  if (!vigente && paso !== "aviso") redirect("/bienvenida/aviso");
  if (vigente && paso === "aviso") redirect("/persona");

  return { user, ...estado };
}
