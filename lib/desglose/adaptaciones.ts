// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// De lo que dice el perfil a la lista de apoyos del desglose de tareas (spec 010, R-010.5, R-010.6). Funciones
// puras, sin red ni base. Corren solo en el servidor: esta tabla nombra los dominios, y la persona no los ve
// (C-09). El modelo recibe la adaptación, nunca el dominio. porQue también se arma aquí, porque el modelo solo
// elige apoyoRef (R-010.21): sale de lo que la persona ya puede leer, con la etiqueta de DIMENSIONES_PERSONA.
import "server-only";
import type { OrigenPaso } from "@/lib/desglose/schema";
import { revisarTextoDesglose } from "@/lib/desglose/validate";
import { DIMENSIONES_PERSONA, type DimensionVisible } from "@/lib/persona/dimensiones";
import type { PlanPersona } from "@/lib/plan/schema";
import type { DimensionId, DominioFE } from "@/lib/profile/schema";

export const ADAPTACIONES = ["iniciar", "ordenar", "estimar", "cambiar_de_tarea"] as const;
export type Adaptacion = (typeof ADAPTACIONES)[number];

// R-010.6 (decisión abierta 7): lectura del equipo sobre los nombres de BRIEF-A (F-017), sin validación clínica. Los
// otros cinco dominios no tienen adaptación fija y su dimensión entra solo como texto.
const ADAPTACIONES_POR_DOMINIO: Readonly<Partial<Record<DominioFE, readonly Adaptacion[]>>> = {
  iniciacion: ["iniciar"],
  planeacion_organizacion: ["ordenar", "estimar"],
  organizacion_de_materiales: ["ordenar"],
  flexibilidad: ["cambiar_de_tarea"],
};

export function adaptacionesDe(dominios: readonly DominioFE[]): Adaptacion[] {
  const hay = new Set(dominios.flatMap((d) => ADAPTACIONES_POR_DOMINIO[d] ?? []));
  return ADAPTACIONES.filter((a) => hay.has(a));
}

// Una fila de private.app_perfil_para_desglose (R-010.4).
export type DimensionDesglose = { dimension: DimensionId; tipo: string; resumen: string; dominiosFe: readonly DominioFE[] };

export type TipoApoyo = "fortaleza" | "area_de_apoyo" | PlanPersona["items"][number]["tipo"];

// Un renglón de la lista A-nn. ref, tipo, texto y adaptaciones es lo que recibe el modelo. origen y porQue se quedan
// en el código: el primero solo lleva IDs (R-010.24) y el segundo se guarda solo si el paso conserva su nota.
export type Apoyo = {
  ref: string;
  tipo: TipoApoyo;
  texto: string;
  adaptaciones: Adaptacion[];
  origen: OrigenPaso;
  porQue: string;
};

// R-010.21: el texto de "¿Por qué este paso?".
export const porQueDimension = (etiqueta: string, resumen: string) => `Tu perfil dice esto en "${etiqueta}": ${resumen}`;
export const porQuePlan = (texto: string) => `Tu plan dice: ${texto}`;

// R-010.5: un texto con un término no llega al modelo. Un resumen aprobado antes de R-004.59 puede decir "tiene TDAH", y
// revisarTextoPersona no revisa todas las formas que revisa 010. Su nota se descartaría igual (R-010.22), pero para
// entonces el modelo ya habría recibido ese dato de salud.
const sinTerminos = (texto: string) => revisarTextoDesglose(texto).length === 0;

// Dimensiones que sí entran a la lista: de tipo fortaleza o area_de_apoyo, que la persona puede ver (R-010.5, R-005.4) y sin
// términos. Una fuera de DIMENSIONES_PERSONA no entra, porque porQue la mostraría. Se conservan en ese orden.
function dimensionesDeLaLista(perfil: readonly DimensionDesglose[], visibles: readonly DimensionVisible[]) {
  return visibles.flatMap((visible) => {
    const fila = perfil.find((f) => f.dimension === visible.id);
    return fila && (fila.tipo === "fortaleza" || fila.tipo === "area_de_apoyo") && sinTerminos(fila.resumen) ? [{ ...fila, tipo: fila.tipo, etiqueta: visible.etiqueta }] : [];
  });
}

// R-010.5: primero las dimensiones y después los ítems de la última versión de persona_plans, con IDs cortos.
export function construirApoyos(perfil: readonly DimensionDesglose[], plan: PlanPersona | null, visibles: readonly DimensionVisible[] = DIMENSIONES_PERSONA): Apoyo[] {
  const deDimensiones = dimensionesDeLaLista(perfil, visibles).map((d) => ({
    tipo: d.tipo as TipoApoyo,
    texto: d.resumen,
    adaptaciones: adaptacionesDe(d.dominiosFe),
    origen: { tipo: "dimension", dimension: d.dimension } as OrigenPaso,
    porQue: porQueDimension(d.etiqueta, d.resumen),
  }));
  const dePlan = (plan?.items ?? []).filter((i) => sinTerminos(i.texto)).map((i) => ({
    tipo: i.tipo as TipoApoyo,
    texto: i.texto,
    adaptaciones: [] as Adaptacion[],
    origen: { tipo: "plan", planItemId: i.planItemId } as OrigenPaso,
    porQue: porQuePlan(i.texto),
  }));
  return [...deDimensiones, ...dePlan].map((a, i) => ({ ref: `A-${String(i + 1).padStart(2, "0")}`, ...a }));
}

// R-010.14: la regla del primer paso solo aplica con iniciacion en una dimensión area_de_apoyo de la lista. Con iniciacion
// solo en una fortaleza, en una dimensión que la persona no ve o en una que se quedó fuera por un término, no aplica: no
// habría a qué apoyo apuntar.
export function perfilMarcaIniciacion(perfil: readonly DimensionDesglose[], visibles: readonly DimensionVisible[] = DIMENSIONES_PERSONA): boolean {
  return dimensionesDeLaLista(perfil, visibles).some((d) => d.tipo === "area_de_apoyo" && d.dominiosFe.includes("iniciacion"));
}

// Los A-nn con la adaptación iniciar: lo que validarPasos recibe como exigirInicio.
export const refsDeInicio = (apoyos: readonly Apoyo[]): ReadonlySet<string> => new Set(apoyos.filter((a) => a.adaptaciones.includes("iniciar")).map((a) => a.ref));
