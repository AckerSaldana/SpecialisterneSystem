// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Llama al modelo con una tarea y sus apoyos y devuelve un DesgloseProposal validado con Zod (spec 010,
// R-010.8, R-010.49), o con una tarea repetida y sus marcas y devuelve un AjustesProposal (R-010.36). No toca la base de
// datos: lib/desglose/generar.ts guarda el resultado.
//
// Estas funciones NO revisan lo que devuelve el modelo. Eso lo hacen validarPasos() y limpiarPasos(), o limpiarAjustes(),
// después, con la lista de apoyos.
import "server-only";
import { generateText, Output } from "ai";
import { MODEL_ID, modelo } from "@/lib/ai/model";
import type { UsoTokens } from "@/lib/ai/propose-profile-update";
import { AjustesProposal, DesgloseProposal } from "@/lib/desglose/schema";
import {
  mensajeUsuarioAjustes,
  mensajeUsuarioDesglose,
  PROMPT_VERSION_DESGLOSE,
  PROMPT_VERSION_DESGLOSE_AJUSTES,
  systemPromptAjustes,
  systemPromptDesglose,
  type EntradaAjustesModelo,
  type EntradaDesgloseModelo,
} from "@/lib/prompts";

export type ResultadoDesgloseModelo = {
  salida: DesgloseProposal;
  usage: UsoTokens;
  latenciaMs: number;
  modelo: string;
  promptVersion: string;
};

export type ResultadoAjustesModelo = Omit<ResultadoDesgloseModelo, "salida"> & { salida: AjustesProposal };

export async function proposeDesglose(entrada: EntradaDesgloseModelo): Promise<ResultadoDesgloseModelo> {
  const inicio = Date.now();

  const result = await generateText({
    model: modelo,
    instructions: {
      role: "system",
      content: systemPromptDesglose(),
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    prompt: mensajeUsuarioDesglose(entrada),
    output: Output.object({
      schema: DesgloseProposal,
      name: "DesgloseProposal",
      description: "Pasos de una tarea, cada uno con una sola acción y un criterio de terminado que se puede comprobar.",
    }),
    // Sin temperature: claude-haiku-5-5 no la acepta. Medido el 1 nov: unos 330 tokens por paso, y hasta 15 pasos.
    maxOutputTokens: 6000,
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
    promptVersion: PROMPT_VERSION_DESGLOSE,
  };
}

// R-010.36: esta llamada no tiene reintento. Cero ajustes es una respuesta válida (R-010.37).
export async function proposeAjustes(entrada: EntradaAjustesModelo): Promise<ResultadoAjustesModelo> {
  const inicio = Date.now();

  const result = await generateText({
    model: modelo,
    instructions: {
      role: "system",
      content: systemPromptAjustes(),
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    prompt: mensajeUsuarioAjustes(entrada),
    output: Output.object({
      schema: AjustesProposal,
      name: "AjustesProposal",
      description: 'Ajustes a los pasos que la persona marcó con "Me atoré aquí". Puede ser una lista vacía.',
    }),
    // Sin temperature: claude-haiku-5-5 no la acepta. Medido el 1 nov: de 720 a 1020 tokens por ajuste, y hasta 5 ajustes.
    maxOutputTokens: 6000,
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
    promptVersion: PROMPT_VERSION_DESGLOSE_AJUSTES,
  };
}
