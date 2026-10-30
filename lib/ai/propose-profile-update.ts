// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Llama al modelo con la nota del coach y devuelve un ProfileUpdate validado con Zod.
// No toca la base de datos: la ruta POST /api/engagements/[id]/sessions guarda el resultado
// y eval/compare.ts usa esta misma función sin base.
//
// Esta función NO revisa que las citas estén en la nota. Eso lo hace sanitizeUpdate()
// de lib/profile/validate.ts, que se llama después.
import "server-only";
import { generateText, Output } from "ai";
import { MODEL_ID, modelo } from "@/lib/ai/model";
import { mensajeUsuarioProfileUpdate, PROMPT_VERSION, systemPromptProfileUpdate, type EntradaProfileUpdate } from "@/lib/prompts";
import { ProfileUpdate } from "@/lib/profile/schema";

export type UsoTokens = {
  entrada: number | null;
  salida: number | null;
  cacheLectura: number | null;
};

export type ResultadoPropuesta = {
  update: ProfileUpdate;
  usage: UsoTokens;
  latenciaMs: number;
  modelo: string;
  promptVersion: string;
};

export async function proposeProfileUpdate(entrada: EntradaProfileUpdate): Promise<ResultadoPropuesta> {
  const inicio = Date.now();

  const result = await generateText({
    model: modelo,
    // El system prompt es igual en todas las llamadas: se marca para el cache de Anthropic.
    // Nota: Anthropic solo cachea prompts por encima de un mínimo de tokens (depende del modelo).
    // Si el prompt es más corto, la llamada funciona igual, solo que sin cache.
    instructions: {
      role: "system",
      content: systemPromptProfileUpdate(),
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    prompt: mensajeUsuarioProfileUpdate(entrada),
    // Salida estructurada. Con el modo por defecto ("auto") el proveedor usa la salida
    // estructurada nativa de Anthropic y quita del JSON Schema las restricciones que Anthropic
    // no acepta (min/max de strings y arrays), pasándolas a la descripción del campo.
    // Después, el AI SDK valida la respuesta con el esquema Zod completo: si no cumple, lanza error.
    output: Output.object({
      schema: ProfileUpdate,
      name: "ProfileUpdate",
      description: "Propuesta de actualización del perfil con evidencia citada de la nota.",
    }),
    // Sin temperature: claude-haiku-5-5 no la acepta (el proveedor la ignora con un aviso).
    maxOutputTokens: 8000,
  });

  const usage = result.totalUsage;
  return {
    update: result.output,
    usage: {
      entrada: usage.inputTokens ?? null,
      salida: usage.outputTokens ?? null,
      cacheLectura: usage.inputTokenDetails?.cacheReadTokens ?? null,
    },
    latenciaMs: Date.now() - inicio,
    modelo: MODEL_ID,
    promptVersion: PROMPT_VERSION,
  };
}
