// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Revisión determinista de la propuesta de plan (spec 003). Funciones puras: sin red ni base.
//
// sanitizePlan quita lo que no se puede guardar y anota por qué (descartados), y después marca
// lo que el coach tiene que revisar (banderas):
//   1. Ficha (R-003.15): si el ítem cita una ficha que no estaba en las fichas enviadas, se quita
//      el ítem completo (motivo "ficha_no_existe").
//   2. Evidencia (R-003.13): cada ID que no está en el índice se quita ("evidencia_no_existe").
//      Un ítem que se queda sin evidencia se quita completo ("sin_evidencia").
//   3. dominioFE (R-003.19): si no es un ID de DOMINIOS_FE queda null. No es un descarte.
//   4. textoPersona en tipos que la persona no ve (R-003.11): se quita el texto y el ítem se
//      queda ("textoPersona_en_tipo_interno").
//   5. Banderas (R-003.16 a R-003.18, R-003.46, R-003.47) con banderasDeItem.
// Las rutas de "descartados" son sobre la respuesta ORIGINAL del modelo; las de "banderas", sobre
// la propuesta YA LIMPIA (la que ve el coach), igual que en lib/profile/validate.ts.
import type { IndiceEvidencia } from "@/lib/plan/evidence";
import {
  esVisiblePersona,
  type BanderaPlan,
  type DescartadoPlan,
  type ItemPropuesto,
  type PlanProposal,
  type TipoItemPlan,
} from "@/lib/plan/schema";
import { DOMINIOS_FE } from "@/lib/profile/schema";
import { buscarCondiciones, buscarTerminos, citasCopiadas, revisarTextoPersona, TERMINOS_CONDICION } from "@/lib/profile/terminos";

export { TERMINOS_CONDICION };

// ---------------------------------------------------------------------------
// Banderas de un ítem
// ---------------------------------------------------------------------------

// Todas las banderas de un ítem. La usan sanitizePlan, las rutas de edición (R-003.27) y la
// aprobación (R-003.30). "citas" son las citas del snapshot base del plan.
export function banderasDeItem(
  item: { tipo: TipoItemPlan; descripcion: string; textoPersona: string | null },
  ctx: { citas: string[]; ruta: string },
): BanderaPlan[] {
  const banderas: BanderaPlan[] = [];
  const agregar = (campo: BanderaPlan["campo"], motivo: BanderaPlan["motivo"], terminos: string[]) => {
    for (const termino of terminos) banderas.push({ ruta: ctx.ruta, campo, termino, motivo });
  };

  // descripcion: la lee el coach. Términos no permitidos y condiciones (R-003.16, R-003.47).
  const enDescripcion = buscarTerminos(item.descripcion);
  agregar("descripcion", "termino_no_permitido", enDescripcion);
  agregar("descripcion", "mencion_condicion", buscarCondiciones(item.descripcion, enDescripcion));
  // R-003.18: lo del líder no copia las notas del coach. Avisa, no bloquea.
  if (item.tipo === "comunicacion_lider") {
    agregar("descripcion", "cita_en_texto_lider", citasCopiadas(item.descripcion, ctx.citas));
  }

  // textoPersona: lo lee la persona. La misma revisión que el resumen del perfil: además de lo anterior, términos
  // clínicos, nada interno, citas ni pedazos de citas (R-003.17, R-003.46, R-004.59).
  if (item.textoPersona !== null) {
    for (const { termino, motivo } of revisarTextoPersona(item.textoPersona, ctx.citas)) agregar("textoPersona", motivo, [termino]);
  }

  return banderas;
}

// R-003.30: banderas que impiden aprobar. termino_no_permitido y mencion_condicion en cualquier
// campo; termino_interno y cita_en_texto_persona solo en textoPersona. cita_en_texto_lider avisa
// sin bloquear, porque la persona no lee ese texto tal cual ni sale de la app. Sí es entrada del modelo
// de "Cómo trabajar conmigo", pero un ítem que copia una cita no entra (R-009.9).
export function banderasQueBloquean(banderas: BanderaPlan[]): BanderaPlan[] {
  return banderas.filter(
    (b) =>
      b.motivo === "termino_no_permitido" ||
      b.motivo === "mencion_condicion" ||
      (b.campo === "textoPersona" && (b.motivo === "termino_interno" || b.motivo === "cita_en_texto_persona")),
  );
}

// ---------------------------------------------------------------------------
// sanitizePlan
// ---------------------------------------------------------------------------

const IDS_DOMINIOS: readonly string[] = DOMINIOS_FE.map((d) => d.id);

export function sanitizePlan(
  propuesta: PlanProposal,
  ctx: { fichasEnviadas: string[]; indice: IndiceEvidencia },
): { propuesta: PlanProposal; descartados: DescartadoPlan[]; banderas: BanderaPlan[] } {
  const descartados: DescartadoPlan[] = [];
  const fichas = new Set(ctx.fichasEnviadas);
  const items: ItemPropuesto[] = [];

  propuesta.items.forEach((item, i) => {
    const ruta = `items[${i}]`;

    // 1. Ficha inventada o no enviada: el ítem completo se va (C-06).
    if (item.fichaId !== null && !fichas.has(item.fichaId)) {
      descartados.push({ ruta, motivo: "ficha_no_existe", valor: item.fichaId });
      return;
    }

    // 2. Evidencia: solo IDs del índice, sin repetir.
    const vistos = new Set<string>();
    const evidencia: ItemPropuesto["evidencia"] = [];
    item.evidencia.forEach((e, j) => {
      if (!ctx.indice.porId.has(e.evidenciaId)) {
        descartados.push({ ruta: `${ruta}.evidencia[${j}]`, motivo: "evidencia_no_existe", valor: e.evidenciaId });
        return;
      }
      if (vistos.has(e.evidenciaId)) return; // el mismo ID dos veces no es un error, solo se junta
      vistos.add(e.evidenciaId);
      evidencia.push({ evidenciaId: e.evidenciaId });
    });
    if (evidencia.length === 0) {
      descartados.push({ ruta, motivo: "sin_evidencia", valor: "" });
      return;
    }

    // 3. dominioFE fuera del catálogo: queda null.
    const dominioFE = item.dominioFE !== null && IDS_DOMINIOS.includes(item.dominioFE) ? item.dominioFE : null;

    // 4. Solo objetivo y apoyo_fe llevan texto para la persona (decisión 4).
    let textoPersona = item.textoPersona;
    if (textoPersona !== null && !esVisiblePersona(item.tipo)) {
      descartados.push({ ruta: `${ruta}.textoPersona`, motivo: "textoPersona_en_tipo_interno", valor: "" });
      textoPersona = null;
    }

    items.push({ ...item, dominioFE, textoPersona, evidencia });
  });

  // 5. Banderas sobre la propuesta limpia.
  const citas = ctx.indice.lista.map((e) => e.cita);
  const banderas = items.flatMap((item, k) => banderasDeItem(item, { citas, ruta: `items[${k}]` }));

  return { propuesta: { items }, descartados, banderas };
}
