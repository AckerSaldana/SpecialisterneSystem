// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Quién es el usuario y qué rol tiene. getClaims() verifica la firma del JWT;
// el rol sale de public.users (no del JWT), leído con RLS activa.
import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { users } from "@/lib/db/schema";
import { withRls, type RlsClaims } from "@/lib/db/rls";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "coach" | "persona";

export type SessionUser = {
  id: string;
  role: AppRole;
  orgId: string;
  nombrePila: string;
  claims: RlsClaims;
};

export const HOME_BY_ROLE: Record<AppRole, string> = { coach: "/coach", persona: "/persona" };

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const claims = data.claims as RlsClaims;
  const [row] = await withRls(claims, (tx) =>
    tx
      .select({ id: users.id, role: users.role, orgId: users.orgId, nombrePila: users.nombrePila })
      .from(users)
      .where(eq(users.id, claims.sub))
      .limit(1),
  );
  if (!row) return null;
  return { ...row, claims };
}

// Para páginas y layouts: redirige si no hay sesión o si el rol no corresponde.
export async function requireRole(role: AppRole): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(HOME_BY_ROLE[user.role]);
  return user;
}

// Para Route Handlers: devuelve null en vez de redirigir (el handler responde 401/403).
export async function getUserWithRole(role: AppRole): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user && user.role === role ? user : null;
}
