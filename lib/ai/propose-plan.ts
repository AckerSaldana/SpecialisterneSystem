// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Llama al modelo con el perfil aprobado y las fichas verificadas, y devuelve un PlanProposal
// validado con Zod (spec 003, R-003.6 y R-003.7). No toca la base de datos: la ruta
// POST /api/engagements/[id]/plans guarda el resultado y audita, y eval/compare.ts usa esta misma
// función sin base.
//
// Esta función NO revisa fichas ni evidencia. Eso lo hace sanitizePlan() de lib/plan/validate.ts,
// que se llama después con el índice que devuelve esta función.
import "server-only";
import { generateText, Output } from "ai";
import { MODEL_ID, modelo } from "@/lib/ai/model";
import type { EngagementType } from "@/lib/engagements/config";
import { indiceEvidencia, type IndiceEvidencia } from "@/lib/plan/evidence";
import { PlanProposal } from "@/lib/plan/schema";
import { mensajeUsuarioPlan, PROMPT_VERSION_PLAN, soloVerificadas, systemPromptPlan, type FichaPrompt } from "@/lib/prompts";
import type { Perfil } from "@/lib/profile/schema";

export type { FichaPrompt };

export async function proposePlan(entrada: {
  nombrePila: string;
  engagementType: EngagementType;
  perfil: Perfil;
  fichas: FichaPrompt[];
}): Promise<{
  propuesta: PlanProposal;
  indice: IndiceEvidencia;
  usage: { entrada?: number; salida?: number; cacheLectura?: number };
  latenciaMs: number;
  modelo: string;
  promptVersion: string;
}> {
  const inicio = Date.now();

  // R-003.5: solo fichas verificadas. La ruta ya filtra; esto es por si acaso.
  const fichas = soloVerificadas(entrada.fichas);
  // El mismo índice arma el prompt y después resuelve los IDs (R-003.14).
  const indice = indiceEvidencia(entrada.perfil);

  const result = await generateText({
    model: modelo,
    // System prompt con las fichas: igual entre llamadas mientras las fichas no cambien, por eso se
    // marca para el cache de Anthropic (R-003.6). Si es más corto que el mínimo del modelo, la
    // llamada funciona igual, solo que sin cache.
    instructions: {
      role: "system",
      content: systemPromptPlan(fichas),
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    prompt: mensajeUsuarioPlan({
      nombrePila: entrada.nombrePila,
      engagementType: entrada.engagementType,
      indice,
      perfil: entrada.perfil,
    }),
    // Salida estructurada con el esquema estricto (R-003.7). Si la respuesta no cumple el esquema
    // Zod completo, el AI SDK lanza error y la ruta no guarda nada.
    output: Output.object({
      schema: PlanProposal,
      name: "PlanProposal",
      description: "Propuesta de plan de acompañamiento con evidencia citada por ID (E-nn) del perfil aprobado.",
    }),
    // Sin temperature: claude-haiku-5-5 no la acepta. Hasta 16 puntos de unos 300 tokens cada uno.
    maxOutputTokens: 8000,
  });

  const usage = result.totalUsage;
  return {
    propuesta: result.output,
    indice,
    usage: {
      entrada: usage.inputTokens ?? undefined,
      salida: usage.outputTokens ?? undefined,
      cacheLectura: usage.inputTokenDetails?.cacheReadTokens ?? undefined,
    },
    latenciaMs: Date.now() - inicio,
    modelo: MODEL_ID,
    promptVersion: PROMPT_VERSION_PLAN,
  };
}
