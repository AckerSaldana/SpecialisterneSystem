// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Server Action de /bienvenida/contrasena (spec 002, R-002.18). La persona entró con el código y
// crea su contraseña. Al guardarla, su invitación pendiente queda usada (usada_en = now()) y el
// código deja de servir, porque la contraseña ya es otra (R-002.45: es una de las escrituras
// permitidas a la persona, política invitations_update_persona).
// La action no confía en la página: vuelve a revisar el estado de la invitación.
"use server";

import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth";
import { invitations } from "@/lib/db/schema";
import { withRls } from "@/lib/db/rls";
import { tieneFormaDeCodigo } from "@/lib/invitations/code";
import { logError } from "@/lib/log";
import { INVITACION_VENCIDA, leerInvitacion } from "@/lib/persona/puerta";
import { createClient } from "@/lib/supabase/server";

export type ContrasenaState = { error: string | null; campo: "contrasena" | "repetida" | null };

const ERROR_DISTINTAS = "Las dos contraseñas no son iguales.";
const ERROR_DEBIL = "La contraseña es muy corta o muy fácil. Prueba con una más larga.";
const ERROR_IGUAL = "Esa contraseña no se puede usar. Elige una distinta.";
const ERROR_SERVIDOR = "No pudimos guardar tu contraseña por un problema del sistema. Intenta de nuevo en unos minutos.";
const ERROR_YA_GUARDADA = "Tu contraseña ya quedó guardada, pero no pudimos terminar este paso por un problema del sistema. Escríbela otra vez en unos minutos.";

// Códigos de Supabase Auth que significan "esta contraseña no sirve". El mínimo lo pone la
// política de contraseñas del proyecto de Supabase, no la app.
const CODIGOS_DEBIL = new Set(["weak_password", "validation_failed"]);

export async function guardarContrasena(_prev: ContrasenaState, formData: FormData): Promise<ContrasenaState> {
  const contrasena = String(formData.get("contrasena") ?? "");
  const repetida = String(formData.get("repetida") ?? "");

  const user = await getUserWithRole("persona");
  if (!user) redirect("/login");

  if (!contrasena) return { error: ERROR_DEBIL, campo: "contrasena" };
  if (contrasena !== repetida) return { error: ERROR_DISTINTAS, campo: "repetida" };

  let invitacion: Awaited<ReturnType<typeof leerInvitacion>>;
  try {
    invitacion = await withRls(user.claims, (tx) => leerInvitacion(tx, user.id));
  } catch (e) {
    logError("bienvenida/contrasena: no se pudo leer la invitación", e);
    return { error: ERROR_SERVIDOR, campo: null };
  }

  const supabase = await createClient();
  if (invitacion.estado === "vencida") {
    // Venció mientras la persona tenía la pantalla abierta (R-002.39).
    await supabase.auth.signOut();
    redirect(INVITACION_VENCIDA);
  }
  // Sin invitación pendiente, este paso ya no aplica: la puerta del aviso decide.
  if (invitacion.estado !== "pendiente") redirect("/bienvenida/aviso");

  const { error } = await supabase.auth.updateUser({ password: contrasena });
  // Con la invitación pendiente, "es la misma" quiere decir que ya se guardó en un intento anterior y falló la marca de abajo:
  // se sigue a marcarla. Salvo que sea el código: esa sería su contraseña actual, y no puede quedarse como la nueva (R-002.18).
  const yaGuardada = error?.code === "same_password" && !tieneFormaDeCodigo(contrasena);
  if (error && !yaGuardada) {
    // Sesión revocada: el coach generó un código nuevo mientras esta pantalla estaba abierta
    // (cambiar la contraseña temporal cierra las sesiones de la persona). Es un código vencido,
    // no una falla del sistema (R-002.17).
    if (isAuthSessionMissingError(error) || error.code === "session_not_found") {
      await supabase.auth.signOut({ scope: "local" });
      redirect(INVITACION_VENCIDA);
    }
    // No se registra el error de Supabase: podría repetir lo que se envió.
    if (error.code === "same_password") return { error: ERROR_IGUAL, campo: "contrasena" };
    if ((error.code && CODIGOS_DEBIL.has(error.code)) || error.status === 422) {
      return { error: ERROR_DEBIL, campo: "contrasena" };
    }
    logError("bienvenida/contrasena: updateUser falló", new Error(error.code ?? "sin código"));
    return { error: ERROR_SERVIDOR, campo: null };
  }

  try {
    const marcadas = await withRls(user.claims, (tx) =>
      tx
        .update(invitations)
        .set({ usadaEn: sql`now()` })
        .where(and(eq(invitations.id, invitacion.id), isNull(invitations.usadaEn)))
        .returning({ id: invitations.id }),
    );
    // 0 filas: la invitación cambió entre la lectura y la marca (venció o el coach la reemplazó).
    // No se sigue como si nada: se reporta y la puerta vuelve a decidir con el estado real.
    if (marcadas.length === 0) throw new Error("la invitación no se marcó como usada");
  } catch (e) {
    // La contraseña ya cambió, así que el código ya no sirve, y decir que no se guardó sería falso. Si la marca falla, la
    // puerta vuelve a pedir la contraseña y la persona puede escribir la misma (yaGuardada) o una distinta.
    logError("bienvenida/contrasena: no se pudo marcar la invitación como usada", e);
    return { error: ERROR_YA_GUARDADA, campo: null };
  }

  redirect("/bienvenida/aviso");
}
