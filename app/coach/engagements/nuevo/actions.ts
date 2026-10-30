// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Server Action de /coach/engagements/nuevo (spec 002, R-002.1 a R-002.5, tarea 9).
// 1. Valida tipo, nombre de pila y correo .test con Zod.
// 2. Crea la cuenta de Auth de la persona con el cliente admin (sin contraseña utilizable).
// 3. Con withRls del coach inserta app.users y app.engagements en una transacción.
//    Si la base falla, borra la cuenta de Auth recién creada (R-002.2).
// El correo solo llega a Supabase Auth: no se guarda en tablas de app ni en logs.
"use server";

import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { logError } from "@/lib/log";
import { borrarCuenta, CorreoRepetidoError, crearCuentaPersona } from "@/lib/supabase/admin";
import { NuevoAcompanamiento } from "@/lib/validators/alta";
import { insertarAcompanamiento, insertarPersona } from "@/lib/db/insertar";

type Campo = "type" | "nombrePila" | "email";

export type NuevoAcompanamientoState = {
  errores: Partial<Record<Campo | "general", string>>;
  // Se devuelven para no obligar a escribirlos otra vez si hubo un error.
  valores: { type: string; nombrePila: string; email: string };
};

const ERROR_REPETIDO =
  "Ya existe una cuenta con ese correo. Por ahora el sistema no permite dos acompañamientos para la misma persona.";
const ERROR_FALLO = "No se pudo crear el acompañamiento. No se guardó nada. Intenta de nuevo.";
const ERROR_SESION = "Necesitas iniciar sesión con una cuenta de coach.";
// El validador compartido no trae texto propio para un nombre muy largo; el campo ya limita a 60.
const ERROR_NOMBRE_LARGO = "Escribe solo el nombre de pila, con 60 caracteres o menos.";

// Recibe solo el FormData: el estado anterior trae el correo y no debe volver al servidor.
export async function crearAcompanamiento(formData: FormData): Promise<NuevoAcompanamientoState> {
  const valores = {
    type: String(formData.get("type") ?? ""),
    nombrePila: String(formData.get("nombrePila") ?? ""),
    email: String(formData.get("email") ?? ""),
  };

  const user = await getUserWithRole("coach");
  if (!user) return { errores: { general: ERROR_SESION }, valores };

  const parsed = NuevoAcompanamiento.safeParse({
    // Sin opción elegida llega undefined y el validador responde "Elige el tipo de acompañamiento."
    type: formData.get("type") ?? undefined,
    nombrePila: valores.nombrePila,
    email: valores.email,
  });
  if (!parsed.success) {
    const errores: NuevoAcompanamientoState["errores"] = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0] as Campo | undefined;
      if (!campo || errores[campo]) continue;
      errores[campo] = campo === "nombrePila" && issue.code === "too_big" ? ERROR_NOMBRE_LARGO : issue.message;
    }
    return { errores, valores };
  }
  const { type, nombrePila, email } = parsed.data;

  // --- 1. Cuenta de Auth ------------------------------------------------------
  let userId: string;
  try {
    ({ userId } = await crearCuentaPersona(email));
  } catch (e) {
    if (e instanceof CorreoRepetidoError) return { errores: { email: ERROR_REPETIDO }, valores };
    // Mensaje fijo: el error de Supabase podría traer el correo.
    logError("alta: no se pudo crear la cuenta de Auth", new Error("createUser falló"));
    return { errores: { general: ERROR_FALLO }, valores };
  }

  // --- 2. Filas en app, con RLS del coach -------------------------------------
  let engagementId: string;
  try {
    engagementId = await withRls(user.claims, async (tx) => {
      await insertarPersona(tx, { id: userId, orgId: user.orgId, nombrePila });
      // Etapa alta y diagnostico_verificado = false los pone la base por default (R-002.5).
      const fila = await insertarAcompanamiento(tx, { orgId: user.orgId, type, coachId: user.id, personaId: userId });
      return fila.id;
    });
  } catch (e) {
    // resumirError (lib/log.ts) no imprime los params de Drizzle, así que el nombre no sale.
    logError("alta: no se pudo guardar el acompañamiento", e);
    try {
      await borrarCuenta(userId);
    } catch {
      logError("alta: no se pudo borrar la cuenta de Auth tras el fallo", new Error("deleteUser falló"));
    }
    return { errores: { general: ERROR_FALLO }, valores };
  }

  // redirect() lanza una excepción especial de Next: va fuera de cualquier try/catch.
  redirect(`/coach/engagements/${engagementId}`);
}
