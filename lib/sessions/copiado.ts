// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// D-086: lo que el coach escribe para la persona no copia sus notas ni las citas del perfil (R-003.62, R-010.55,
// R-010.56). Las notas se leen con la sesión del coach: la RLS de sessions ya exige que sea su acompañamiento y que el
// consentimiento esté vigente. Nada de esto llega al modelo ni al navegador.
import "server-only";
import { eq } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { sessions } from "@/lib/db/schema";
import { revisarTextoPersona } from "@/lib/profile/terminos";

export async function notasDelAcompanamiento(tx: Tx, engagementId: string): Promise<string[]> {
  const filas = await tx.select({ nota: sessions.notaOriginal }).from(sessions).where(eq(sessions.engagementId, engagementId));
  return filas.map((f) => f.nota);
}

export type FuentesDeCopia = { citas: string[]; notas: string[] };

// Los pedazos copiados, sin repetir. Solo cita_en_texto_persona: los términos los revisa cada spec con su propia regla.
export function copiasEn(textos: readonly string[], { citas, notas }: FuentesDeCopia): string[] {
  const halladas = textos.flatMap((t) => revisarTextoPersona(t, citas, notas).filter((h) => h.motivo === "cita_en_texto_persona").map((h) => h.termino));
  return [...new Set(halladas)];
}
