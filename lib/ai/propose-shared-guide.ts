// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Llama al modelo con los orígenes de una guía y devuelve una GuiaPropuesta validada con Zod (spec 009,
// R-009.15 y R-009.16). No toca la base de datos: lib/guia/generar.ts guarda el resultado.
//
// Esta función NO revisa las líneas ni sus orígenes. Eso lo hace sanitizeGuia() después, con el índice que
// armó armarEntradaGuia().
import "server-only";
import { generateText, Output } from "ai";
import { MODEL_ID, modelo } from "@/lib/ai/model";
import type { UsoTokens } from "@/lib/ai/propose-profile-update";
import { GuiaPropuesta } from "@/lib/guia/schema";
import { mensajeUsuarioGuia, PROMPT_VERSION_GUIA, systemPromptGuia, type EntradaGuiaModelo } from "@/lib/prompts";

export type ResultadoGuiaModelo = {
  salida: GuiaPropuesta;
  usage: UsoTokens;
  latenciaMs: number;
  modelo: string;
  promptVersion: string;
};

export async function proposeSharedGuide(entrada: EntradaGuiaModelo): Promise<ResultadoGuiaModelo> {
  const inicio = Date.now();

  const result = await generateText({
    model: modelo,
    instructions: {
      role: "system",
      content: systemPromptGuia(),
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    prompt: mensajeUsuarioGuia(entrada),
    output: Output.object({
      schema: GuiaPropuesta,
      name: "GuiaPropuesta",
      description: 'Líneas de "Cómo trabajar conmigo" en primera persona, cada una con los ids de sus orígenes.',
    }),
    // Sin temperature: claude-haiku-5-5 no la acepta. Hasta 30 líneas de unos 80 tokens cada una.
    maxOutputTokens: 4000,
  });

  const usage = result.totalUsage;
  return {
    salida: result.output,
    usage: {
      entrada: usage.inputTokens ?? null,
      salida: usage.outputTokens ?? null,
      cacheLectura: usage.inputTokenDetails?.cacheReadTokens ?? null,
    },
    latenciaMs: Date.now() - inicio,
    modelo: MODEL_ID,
    promptVersion: PROMPT_VERSION_GUIA,
  };
}
