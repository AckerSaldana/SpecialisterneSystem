// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Server Action de /invitacion (spec 002, R-002.17, R-002.39, CA-002.13, CA-002.15).
// La persona entra con su correo y el código que le dio su coach. El código es la contraseña
// temporal de su cuenta de Auth, así que se revisa con signInWithPassword.
// R-002.47: el código solo viaja en el cuerpo POST de esta action. No se devuelve en el estado,
// no va en ningún redirect y no pasa por logError ni console.
"use server";

import { redirect } from "next/navigation";
import { getSessionUser, HOME_BY_ROLE } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { normalizarCodigo } from "@/lib/invitations/code";
import { logError } from "@/lib/log";
import { ERROR_VENCIDO, leerInvitacion, type EstadoInvitacion } from "@/lib/persona/puerta";
import { authNoRespondio, resumenAuth } from "@/lib/supabase/errores";
import { createClient } from "@/lib/supabase/server";

// Solo el correo vuelve al formulario, para no escribirlo otra vez. El código nunca.
export type InvitacionState = { error: string | null; email: string };

const ERROR_NO_COINCIDEN = "El correo o el código no coinciden.";
const ERROR_FALTA = "Escribe tu correo y tu código.";
const ERROR_SERVIDOR = "No pudimos entrar por un problema del sistema. Intenta de nuevo en unos minutos.";

export async function entrarConCodigo(_prev: InvitacionState, formData: FormData): Promise<InvitacionState> {
  const email = String(formData.get("email") ?? "").trim();
  const codigo = normalizarCodigo(String(formData.get("codigo") ?? ""));

  if (!email || !codigo) return { error: ERROR_FALTA, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: codigo });
  // Sin red, un 5xx o el límite de intentos: el código pudo estar bien. Decir que no coincide la mandaría a pedir otro, y
  // eso invalidaría este (R-002.15, R-002.17). Solo se registra el código de error de Supabase, nunca su mensaje.
  if (error && authNoRespondio(error)) {
    logError("invitacion: Auth no respondió", resumenAuth(error));
    return { error: ERROR_SERVIDOR, email };
  }
  // Mismo mensaje si falla el correo o el código (R-002.17). Un código reemplazado ya no es la
  // contraseña, así que también cae aquí (CA-002.13). El error de Supabase no se registra.
  if (error) return { error: ERROR_NO_COINCIDEN, email };

  let destino: string;
  try {
    const user = await getSessionUser();
    if (!user) {
      // Cuenta de Auth sin fila en app.users: no se deja la sesión a medias.
      await supabase.auth.signOut();
      return { error: ERROR_NO_COINCIDEN, email };
    }
    if (user.role !== "persona") {
      destino = HOME_BY_ROLE[user.role];
    } else {
      const invitacion: EstadoInvitacion = await withRls(user.claims, (tx) => leerInvitacion(tx, user.id));
      if (invitacion.estado === "vencida") {
        // Vencida o reemplazada: se cierra la sesión aquí mismo (R-002.17, CA-002.15).
        await supabase.auth.signOut();
        return { error: ERROR_VENCIDO, email };
      }
      // Pendiente → crear contraseña. Usada o sin invitación → la puerta decide el paso.
      destino = invitacion.estado === "pendiente" ? "/bienvenida/contrasena" : "/persona";
    }
  } catch (e) {
    // Mensaje fijo; el error es de la base, no lleva el código.
    logError("invitacion: no se pudo revisar la invitación", e);
    await supabase.auth.signOut();
    return { error: ERROR_SERVIDOR, email };
  }

  // redirect() va fuera del try/catch. La URL no lleva datos.
  redirect(destino);
}
