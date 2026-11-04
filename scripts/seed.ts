// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Carga los datos sintéticos de scripts/seed.sql en la base.
// Uso: npm run seed  (necesita DATABASE_URL en .env.local y las migraciones de drizzle/ ya aplicadas).
// Entra como el rol "postgres", que ignora RLS: solo para scripts, nunca desde la app.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL en .env.local. Cópiala de Supabase (Connect → Transaction pooler) y vuelve a correr el seed.");
  process.exit(1);
}

async function main(url: string) {
  // prepare: false porque el transaction pooler de Supabase no soporta prepared statements.
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    const archivo = resolve(process.cwd(), "scripts/seed.sql");
    const contenido = readFileSync(archivo, "utf8");
    // Sin parámetros, unsafe usa el protocolo "simple", que acepta varias sentencias en un solo texto.
    await sql.unsafe(contenido);
    console.log("Seed aplicado.");
  } finally {
    await sql.end();
  }
}

main(url).catch((error) => {
  console.error("El seed falló:", error);
  process.exit(1);
});
