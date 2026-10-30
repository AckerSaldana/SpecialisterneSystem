// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Conexión a Postgres (Supabase, transaction pooler). Este cliente entra como el rol
// "postgres" y por lo tanto IGNORA RLS. En la app nunca se usa directo: todo pasa por
// withRls() de lib/db/rls.ts, que baja al rol "authenticated" con los claims del usuario.
//
// La conexión se crea en el primer uso, no al importar: así "next build" no necesita
// DATABASE_URL y el error aparece solo cuando de verdad se consulta la base.
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function crearDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en .env.local");
  // prepare: false porque el transaction pooler de Supabase no soporta prepared statements.
  return drizzle(postgres(url, { prepare: false, max: 5 }), { schema });
}

export type Db = ReturnType<typeof crearDb>;

// Reutiliza la conexión entre recargas de dev.
const globalForDb = globalThis as unknown as { db?: Db };

export function getDb(): Db {
  globalForDb.db ??= crearDb();
  return globalForDb.db;
}
