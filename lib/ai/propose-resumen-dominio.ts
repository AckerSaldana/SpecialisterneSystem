// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Llama al modelo con las líneas de un bloque y devuelve un ResumenDominioIA validado con Zod (spec 008,
// R-008.34 y R-008.35). No toca la base de datos: lib/trayectoria/resumen.ts guarda el resultado.
//
// Esta función NO revisa la oración ni sus referencias. Eso lo hace revisarResumen() después.
import "server-only";
import { generateText, Output } from "ai";
import { MODEL_ID, modelo } from "@/lib/ai/model";
import type { UsoTokens } from "@/lib/ai/propose-profile-update";
import { mensajeUsuarioResumenDominio, PROMPT_VERSION_RESUMEN_DOMINIO, systemPromptResumenDominio, type EntradaResumenDominio } from "@/lib/prompts";
import { ResumenDominioIA } from "@/lib/trayectoria/validate";

export type ResultadoResumenModelo = {
  salida: ResumenDominioIA;
  usage: UsoTokens;
  latenciaMs: number;
  modelo: string;
  promptVersion: string;
};

export async function proposeResumenDominio(entrada: EntradaResumenDominio): Promise<ResultadoResumenModelo> {
  const inicio = Date.now();

  const result = await generateText({
    model: modelo,
    instructions: {
      role: "system",
      content: systemPromptResumenDominio(),
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    prompt: mensajeUsuarioResumenDominio(entrada),
    output: Output.object({
      schema: ResumenDominioIA,
      name: "ResumenDominio",
      description: "Una oración para el coach, con los ids de las citas que usa.",
    }),
    // Sin temperature: claude-haiku-5-5 no la acepta (el proveedor la ignora con un aviso).
    maxOutputTokens: 1000,
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
    promptVersion: PROMPT_VERSION_RESUMEN_DOMINIO,
  };
}
