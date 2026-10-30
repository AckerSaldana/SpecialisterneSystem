// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Cliente de Supabase para Server Components, Server Actions y Route Handlers.
// Solo se usa para Auth (sesión en cookies). Los datos se leen con Drizzle + withRls.
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Llamado desde un Server Component: no puede escribir cookies.
            // proxy.ts refresca la sesión, así que se puede ignorar.
          }
        },
      },
    },
  );
}
