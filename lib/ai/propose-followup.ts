// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Llama al modelo con la nota de una sesión de seguimiento y devuelve un FollowupUpdate validado
// con Zod (spec 004, decisión 4: una sola llamada con un esquema extendido). No toca la base de
// datos: lib/sessions/proponer.ts guarda el resultado y eval/compare.ts usa esta misma función.
//
// Esta función NO revisa citas, ítems ni fichas. Eso lo hace sanitizeFollowup() después.
import "server-only";
import { generateText, Output } from "ai";
import { MODEL_ID, modelo } from "@/lib/ai/model";
import type { UsoTokens } from "@/lib/ai/propose-profile-update";
import { FollowupUpdateEtiquetado } from "@/lib/followup/schema";
import {
  mensajeUsuarioSeguimiento,
  PROMPT_VERSION_SEGUIMIENTO,
  systemPromptSeguimiento,
  type EntradaSeguimiento,
  type FichaPrompt,
} from "@/lib/prompts";

export type ResultadoSeguimientoModelo = {
  update: FollowupUpdateEtiquetado;
  usage: UsoTokens;
  latenciaMs: number;
  modelo: string;
  promptVersion: string;
};

export async function proposeFollowup(
  entrada: EntradaSeguimiento & { fichas: (FichaPrompt & { verificada?: boolean })[] },
): Promise<ResultadoSeguimientoModelo> {
  const inicio = Date.now();

  const result = await generateText({
    model: modelo,
    instructions: {
      role: "system",
      content: systemPromptSeguimiento(entrada.fichas),
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    prompt: mensajeUsuarioSeguimiento(entrada),
    output: Output.object({
      // Esquema etiquetado (spec 008, R-008.4): toda cita de cambios y avance lleva sus tres llaves.
      schema: FollowupUpdateEtiquetado,
      name: "FollowupUpdate",
      description: "Propuesta de una sesión de seguimiento con evidencia citada de la nota.",
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
    promptVersion: PROMPT_VERSION_SEGUIMIENTO,
  };
}
