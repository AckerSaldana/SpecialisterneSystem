// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Modelo de lenguaje que usa la app. La key se lee de ANTHROPIC_API_KEY al momento de
// cada llamada (la lee @ai-sdk/anthropic); aquí no hay credenciales.
import "server-only";
import { anthropic } from "@ai-sdk/anthropic";

// Se lee una vez al cargar el módulo. eval/compare.ts carga .env.local antes de importar esto.
export const MODEL_ID = process.env.LLM_MODEL || "claude-haiku-5-5";

export const modelo = anthropic(MODEL_ID);
