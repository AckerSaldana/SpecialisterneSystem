// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Server Action del formulario de inicio de sesión (se usa con useActionState).
"use server";

import { redirect } from "next/navigation";
import { getSessionUser, HOME_BY_ROLE } from "@/lib/auth";
import { logError } from "@/lib/log";
import { authNoRespondio, resumenAuth } from "@/lib/supabase/errores";
import { createClient } from "@/lib/supabase/server";

// email se devuelve para no obligar a escribirlo de nuevo si hubo un error.
export type LoginState = { error: string | null; email: string };

const ERROR_CREDENCIALES = "El correo o la contraseña no coinciden.";
const ERROR_SIN_CUENTA = "Tu cuenta existe, pero todavía no tiene un rol asignado. Pide ayuda a tu coach o al equipo.";
const ERROR_SERVIDOR = "No pudimos entrar por un problema del sistema. Intenta de nuevo en unos minutos.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Escribe tu correo y tu contraseña.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Sin red, un 5xx o el límite de intentos: la contraseña pudo estar bien, así que no se dice que no coincide.
    if (authNoRespondio(error)) {
      logError("login: Auth no respondió", resumenAuth(error));
      return { error: ERROR_SERVIDOR, email };
    }
    // Mismo mensaje para correo inexistente y contraseña incorrecta: no revelamos cuál falló.
    return { error: ERROR_CREDENCIALES, email };
  }

  // signInWithPassword ya escribió las cookies; en una Server Action las lecturas
  // siguientes de cookies() ven los valores nuevos, así que getSessionUser encuentra la sesión.
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await getSessionUser();
  } catch (e) {
    // Falla de la base (p. ej. sin DATABASE_URL): mensaje en la página en vez de pantalla en blanco.
    logError("login: no se pudo leer el rol", e);
    await supabase.auth.signOut();
    return { error: ERROR_SERVIDOR, email };
  }
  if (!user) {
    // Hay cuenta en Auth pero no fila en public.users: cerramos la sesión para no dejarla a medias.
    await supabase.auth.signOut();
    return { error: ERROR_SIN_CUENTA, email };
  }

  // redirect() lanza una excepción especial de Next: va fuera de cualquier try/catch.
  redirect(HOME_BY_ROLE[user.role]);
}
