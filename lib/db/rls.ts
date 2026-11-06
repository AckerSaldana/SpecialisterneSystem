// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Ejecuta consultas de Drizzle con las políticas RLS activas.
// Abre una transacción, guarda los claims del JWT (ya verificados por supabase.auth.getClaims())
// en request.jwt.claims y cambia al rol "authenticated". Así auth.uid() y las políticas de
// lib/db/schema.ts aplican igual que si la consulta viniera de supabase-js.
// "set local" y set_config(..., true) solo duran lo que dura la transacción.
import "server-only";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "./client";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type RlsClaims = { sub: string; role?: string; [key: string]: unknown };

export async function withRls<T>(claims: RlsClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
