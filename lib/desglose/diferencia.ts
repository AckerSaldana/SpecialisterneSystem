// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Qué cambió entre una plantilla y lo que quedó para una persona (spec 010, R-010.43, R-010.44, R-010.53). Funciones
// puras, sin red, base ni modelo: dan lo mismo en cada corrida. Son revisiones por palabras: el umbral es interpretación
// del equipo (decisión abierta 9). Corren solo en el servidor: traen lib/profile/terminos.ts (C-09).
import "server-only";
import { normalizar } from "@/lib/profile/terminos";

// Decisión abierta 9. Más alto marca más pasos como agregado y quitado; más bajo empareja pasos distintos.
export const UMBRAL_SIMILITUD = 0.5;

const MIN_LETRAS = 3;

export type TextoDePaso = { accion: string; criterioTerminado: string };
export type PasoComparable = TextoDePaso & { notaApoyo: string | null };

export type TipoDiferencia = "igual" | "ajustado" | "agregado" | "quitado";

// Números de paso, empezando en 1. Un paso agregado no tiene "antes", y uno quitado no tiene "ahora" ni nota.
export type EntradaDiferencia = {
  tipo: TipoDiferencia;
  antes: number | null;
  ahora: number | null;
  conNota: boolean;
  pasoAntes: TextoDePaso | null;
  pasoAhora: TextoDePaso | null;
};

const palabrasDe = (accion: string) => new Set((normalizar(accion).match(/[\p{L}\p{N}]+/gu) ?? []).filter((p) => p.length >= MIN_LETRAS));

// Jaccard entre las palabras de dos acciones. Sin palabras de 3 letras o más en alguna no hay con qué comparar: solo
// cuentan como parecidas si son iguales.
function similitud(a: string, b: string): number {
  const pa = palabrasDe(a);
  const pb = palabrasDe(b);
  if (pa.size === 0 || pb.size === 0) return normalizar(a) === normalizar(b) ? 1 : 0;
  const comunes = [...pa].filter((p) => pb.has(p)).length;
  return comunes / (pa.size + pb.size - comunes);
}

const mismoTexto = (a: TextoDePaso, b: TextoDePaso) => normalizar(a.accion) === normalizar(b.accion) && normalizar(a.criterioTerminado) === normalizar(b.criterioTerminado);

const soloTexto = ({ accion, criterioTerminado }: TextoDePaso): TextoDePaso => ({ accion, criterioTerminado });

// R-010.43: empareja de mayor a menor similitud, sin repetir pasos y con mínimo UMBRAL_SIMILITUD. Un empate se resuelve
// por número de paso, para que dé lo mismo en cada corrida. Sale en el orden de los pasos de ahora, con lo quitado al final.
export function compararConPlantilla(plantilla: readonly TextoDePaso[], pasos: readonly PasoComparable[]): EntradaDiferencia[] {
  const candidatos = plantilla.flatMap((antes, a) => pasos.map((ahora, b) => ({ a, b, valor: similitud(antes.accion, ahora.accion) })));
  candidatos.sort((x, y) => y.valor - x.valor || x.a - y.a || x.b - y.b);

  const parDeAhora = new Map<number, number>();
  const usadosAntes = new Set<number>();
  for (const { a, b, valor } of candidatos) {
    if (valor < UMBRAL_SIMILITUD) break;
    if (usadosAntes.has(a) || parDeAhora.has(b)) continue;
    usadosAntes.add(a);
    parDeAhora.set(b, a);
  }

  const actuales = pasos.map((paso, b): EntradaDiferencia => {
    const a = parDeAhora.get(b);
    const conNota = paso.notaApoyo !== null;
    if (a === undefined) return { tipo: "agregado", antes: null, ahora: b + 1, conNota, pasoAntes: null, pasoAhora: soloTexto(paso) };
    const antes = plantilla[a]!;
    return { tipo: mismoTexto(antes, paso) ? "igual" : "ajustado", antes: a + 1, ahora: b + 1, conNota, pasoAntes: soloTexto(antes), pasoAhora: soloTexto(paso) };
  });
  const quitados = plantilla.flatMap((antes, a): EntradaDiferencia[] => (usadosAntes.has(a) ? [] : [{ tipo: "quitado", antes: a + 1, ahora: null, conNota: false, pasoAntes: soloTexto(antes), pasoAhora: null }]));
  return [...actuales, ...quitados];
}

// R-010.44: "La IA dejó los mismos pasos de la plantilla, sin notas de apoyo." También en el mismo orden: reordenar es justo lo
// que puede cambiar la adaptación "ordenar", y pasosDistintos también lo cuenta como diferencia.
export const quedoIgual = (diferencia: readonly EntradaDiferencia[]) => diferencia.every((d) => d.tipo === "igual" && !d.conNota && d.antes === d.ahora);

const firma = (p: PasoComparable) => [p.accion, p.criterioTerminado, p.notaApoyo ?? ""].map(normalizar).join("\u0000");

// R-010.53 y R-007.73: dos resultados con la misma plantilla y perfiles distintos, en orden. Compara acción, criterio y nota.
export function pasosDistintos(a: readonly PasoComparable[], b: readonly PasoComparable[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((paso, i) => firma(paso) !== firma(b[i]!));
}
