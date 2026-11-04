// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["app"],
  // Los roles anon/authenticated/service_role ya existen en Supabase: no los crea ni los borra.
  entities: { roles: { provider: "supabase" } },
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
