// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Cerrar sesión. Se usa como action de un <form> en el encabezado.
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  // Borra las cookies de sesión. Si falla (p. ej. sin red), igual mandamos a /login.
  await supabase.auth.signOut();
  redirect("/login");
}
