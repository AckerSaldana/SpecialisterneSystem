// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Cliente admin de Supabase Auth (spec 002, R-002.16). Usa la clave secreta, que solo vive
// en la variable de entorno del servidor SUPABASE_SECRET_KEY (nunca NEXT_PUBLIC_, nunca en el repo).
// Solo expone tres operaciones sobre cuentas de Auth. No lee ni escribe tablas del esquema app:
// eso siempre pasa por withRls con la sesión del coach o de la persona.
import "server-only";
import { createClient } from "@supabase/supabase-js";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Falta SUPABASE_SECRET_KEY en .env.local");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).auth.admin;
}

export class CorreoRepetidoError extends Error {
  constructor() {
    super("El correo ya tiene cuenta");
    this.name = "CorreoRepetidoError";
  }
}

// Crea la cuenta de la persona sin contraseña utilizable (R-002.2). El correo queda confirmado
// porque los dominios .test no reciben correo; la persona entra con el código del coach.
export async function crearCuentaPersona(email: string): Promise<{ userId: string }> {
  const { data, error } = await admin().createUser({ email, email_confirm: true });
  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") throw new CorreoRepetidoError();
    throw new Error(`createUser: ${error.code ?? error.name}`);
  }
  return { userId: data.user.id };
}

// Pone el código de invitación como contraseña temporal (R-002.14). Auth la guarda con hash;
// la app nunca guarda el código (R-002.47). El error no incluye el código.
export async function ponerContrasenaTemporal(userId: string, codigo: string): Promise<void> {
  const { error } = await admin().updateUserById(userId, { password: codigo });
  if (error) throw new Error(`updateUserById: ${error.code ?? error.name}`);
}

// Si el alta falla en la base, se borra la cuenta recién creada (R-002.2).
export async function borrarCuenta(userId: string): Promise<void> {
  const { error } = await admin().deleteUser(userId);
  if (error) throw new Error(`deleteUser: ${error.code ?? error.name}`);
}
