// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Helpers de servidor que comparten las rutas del plan (spec 003, tareas 15 a 17):
//   - textos de error literales de la spec,
//   - leer un plan con su snapshot base y bloquear su fila,
//   - validar ficha, citas y "Sigue al punto" (origen_item_id) contra la base,
//   - armar ItemPlanVista con sus banderas recalculadas (R-003.27).
// Todo recibe la transacción de withRls: RLS decide qué filas ve el coach.
import "server-only";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { ApiError, ItemPlanVista } from "@/lib/api/contracts";
import type { Tx } from "@/lib/db/rls";
import { knowledgeCards, planItems, plans, profileSnapshots } from "@/lib/db/schema";
import { indiceEvidencia } from "@/lib/plan/evidence";
import type { EvidenciaPlan, TipoItemPlan } from "@/lib/plan/schema";
import { banderasDeItem } from "@/lib/plan/validate";
import type { Perfil } from "@/lib/profile/schema";

// ---------------------------------------------------------------------------
// Respuestas y mensajes
// ---------------------------------------------------------------------------

// Textos de la sección "Pantallas y textos" de la spec 003 (literales).
export const MENSAJES = {
  sinPerfil: "Primero aprueba el perfil. El plan se arma a partir del perfil aprobado.",
  sinConsentimiento: (nombre: string) =>
    `${nombre} no ha dado su consentimiento o lo retiró. Sin consentimiento no se envía nada a la IA.`,
  borradorAbierto: "Ya hay un borrador de plan. Apruébalo o descártalo antes de pedir otro.",
  errorModelo: "No se pudo generar la propuesta. No se guardó nada. Intenta de nuevo.",
  planRevisado: "Este plan ya fue revisado. Recarga la página para ver su estado.",
  aprobacionSimultanea: "Otra aprobación se guardó al mismo tiempo. Recarga la página y revisa de nuevo.",
  sinObjetivo: "El plan necesita al menos un objetivo.",
  origenInvalido: "Un punto sigue a otro que no es del plan vigente o es de otro tipo. Revisa «Sigue al punto».",
  palabraNoPermitida: (grupo: string, termino: string) =>
    `Hay una palabra que no usamos en ${grupo}: «${termino}». Corrígela para aprobar.`,
  textoPersonaInterno: (nombre: string, grupo: string) =>
    `Lo que verá ${nombre} en ${grupo} nombra una función ejecutiva o copia una cita de tus notas. Corrígelo para aprobar.`,
  // Los siguientes no tienen texto en la spec; siguen el mismo tono literal.
  noCoach: "Necesitas iniciar sesión con una cuenta de coach.",
  sinAcompanamiento: "No encontramos este acompañamiento.",
  sinPlan: "No encontramos este plan.",
  sinItem: "No encontramos este punto del plan.",
  fichaInvalida: "Esa ficha no existe o no está verificada. Elige otra o quita la ficha.",
  citaInvalida: "Una cita de este punto no está en el perfil en que se basa el plan. Recarga la página.",
  textoPersonaNoAplica: "Este tipo de punto no lleva texto para la persona. Quita ese texto.",
  tipoNoCambia: "El tipo de un punto no se cambia. Quita el punto y agrega otro.",
  sinCambios: "No hay cambios que guardar.",
  errorGuardar: "No se pudo guardar el cambio. Intenta de nuevo.",
} as const;

// "ruta" (opcional) dice qué punto causó el error: el id del ítem (R-003.30).
export const respuestaError = (status: number, mensaje: string, ruta?: string) =>
  Response.json((ruta === undefined ? { error: mensaje } : { error: mensaje, ruta }) satisfies ApiError, { status });

// Un id que no es UUID haría fallar a Postgres; las rutas lo tratan como "no existe" (404).
export const esUuid = (valor: string) => z.uuid().safeParse(valor).success;

// true si el error es la violación de la restricción o índice único indicado.
// Drizzle envuelve el error de Postgres en "cause" (si no viene envuelto, se lee el error mismo).
export function violaUnico(e: unknown, restriccion: string): boolean {
  const causa = e instanceof Error ? (e.cause ?? e) : undefined;
  if (!causa || typeof causa !== "object") return false;
  const { code, constraint_name } = causa as { code?: unknown; constraint_name?: unknown };
  return code === "23505" && constraint_name === restriccion;
}

// ---------------------------------------------------------------------------
// Plan con su snapshot base
// ---------------------------------------------------------------------------

export type PlanBase = {
  id: string;
  engagementId: string;
  profileSnapshotId: string;
  propuestaIa: (typeof plans.$inferSelect)["propuestaIa"];
  perfil: Perfil;
};

export type LecturaPlan = { estado: "no_existe" } | { estado: "revisado" } | { estado: "borrador"; plan: PlanBase };

// Lee el plan y bloquea su fila mientras dura la transacción:
//   - "share" en las rutas de edición: varias ediciones pueden ir a la vez, pero la aprobación
//     ("update") espera a que terminen y luego lee los ítems ya cambiados.
//   - "update" en la decisión: una segunda decisión espera y luego ve el plan ya revisado.
// Con RLS, "for share" y "for update" solo devuelven filas que pasan la política de UPDATE de
// plans (status = 'borrador'). Si no vuelve nada, una lectura sin bloqueo dice si el plan existe
// (ya revisado: 409) o si el coach no lo ve (404).
export async function leerPlanBloqueado(tx: Tx, planId: string, bloqueo: "share" | "update"): Promise<LecturaPlan> {
  const [plan] = await tx
    .select({
      id: plans.id,
      engagementId: plans.engagementId,
      status: plans.status,
      profileSnapshotId: plans.profileSnapshotId,
      propuestaIa: plans.propuestaIa,
    })
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1)
    .for(bloqueo);

  if (!plan) {
    const [existe] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.id, planId)).limit(1);
    return existe ? { estado: "revisado" } : { estado: "no_existe" };
  }
  if (plan.status !== "borrador") return { estado: "revisado" };

  const [snapshot] = await tx
    .select({ perfil: profileSnapshots.perfil })
    .from(profileSnapshots)
    .where(eq(profileSnapshots.id, plan.profileSnapshotId))
    .limit(1);
  // El FK garantiza el snapshot; si RLS no lo deja leer, el dato está roto para este coach.
  if (!snapshot) throw new Error(`plan ${plan.id} sin snapshot base legible`);

  return {
    estado: "borrador",
    plan: {
      id: plan.id,
      engagementId: plan.engagementId,
      profileSnapshotId: plan.profileSnapshotId,
      propuestaIa: plan.propuestaIa,
      perfil: snapshot.perfil,
    },
  };
}

// ---------------------------------------------------------------------------
// Citas y evidencia del snapshot base
// ---------------------------------------------------------------------------

// Todas las citas del snapshot: las de las dimensiones y también las de las señales activas.
// Se usan para las banderas cita_en_texto_persona y cita_en_texto_lider. Las señales no entran al
// prompt (decisión 5), pero una cita suya en un texto tampoco debe llegar a la persona (C-09).
export function citasDelPerfil(perfil: Perfil): string[] {
  const citas: string[] = [];
  for (const dimension of Object.values(perfil.dimensiones)) {
    for (const e of dimension?.evidencia ?? []) citas.push(e.cita);
  }
  for (const senal of perfil.senalesActivas) {
    for (const e of senal.evidencia) citas.push(e.cita);
  }
  return citas;
}

// true si cada evidencia { cita, sessionId } está en el índice E-nn del snapshot base (R-003.24).
export function evidenciaEnPerfil(evidencia: EvidenciaPlan[], perfil: Perfil): boolean {
  const validas = new Set(indiceEvidencia(perfil).lista.map((e) => `${e.sessionId}\u0000${e.cita}`));
  return evidencia.every((e) => validas.has(`${e.sessionId}\u0000${e.cita}`));
}

// ---------------------------------------------------------------------------
// Fichas y "Sigue al punto"
// ---------------------------------------------------------------------------

// R-003.24: la ficha tiene que existir y estar verificada.
export async function fichaVerificada(tx: Tx, fichaId: string): Promise<boolean> {
  const [ficha] = await tx
    .select({ id: knowledgeCards.id })
    .from(knowledgeCards)
    .where(and(eq(knowledgeCards.id, fichaId), eq(knowledgeCards.verificada, true)))
    .limit(1);
  return Boolean(ficha);
}

// Plan vigente: el aprobado con la versión más alta (R-003.33).
export async function planVigente(tx: Tx, engagementId: string): Promise<{ id: string; version: number } | null> {
  const [vigente] = await tx
    .select({ id: plans.id, version: plans.version })
    .from(plans)
    .where(and(eq(plans.engagementId, engagementId), eq(plans.status, "aprobado"), isNotNull(plans.version)))
    .orderBy(desc(plans.version))
    .limit(1);
  return vigente && vigente.version !== null ? { id: vigente.id, version: vigente.version } : null;
}

// R-003.51: origen_item_id tiene que ser un ítem del plan vigente del mismo acompañamiento, del
// mismo tipo, y no lo puede seguir ya otro ítem del borrador. El índice único
// plan_items_origen_unico atrapa la carrera entre dos ediciones (23505).
export async function origenItemValido(
  tx: Tx,
  datos: { engagementId: string; planId: string; tipo: TipoItemPlan; origenItemId: string; itemId: string | null },
): Promise<boolean> {
  const vigente = await planVigente(tx, datos.engagementId);
  if (!vigente) return false;

  const [anterior] = await tx
    .select({ tipo: planItems.tipo })
    .from(planItems)
    .where(and(eq(planItems.id, datos.origenItemId), eq(planItems.planId, vigente.id)))
    .limit(1);
  if (!anterior || anterior.tipo !== datos.tipo) return false;

  const yaUsado = await tx
    .select({ id: planItems.id })
    .from(planItems)
    .where(
      and(
        eq(planItems.planId, datos.planId),
        eq(planItems.origenItemId, datos.origenItemId),
        // Al editar, el mismo ítem puede conservar su liga.
        datos.itemId ? ne(planItems.id, datos.itemId) : undefined,
      ),
    )
    .limit(1);
  return yaUsado.length === 0;
}

// ---------------------------------------------------------------------------
// Vista del ítem para el coach
// ---------------------------------------------------------------------------

// Columnas que se leen de plan_items para armar ItemPlanVista.
export const columnasItem = {
  id: planItems.id,
  planId: planItems.planId,
  engagementId: planItems.engagementId,
  tipo: planItems.tipo,
  descripcion: planItems.descripcion,
  textoPersona: planItems.textoPersona,
  knowledgeCardId: planItems.knowledgeCardId,
  dominioFe: planItems.dominioFe,
  evidencia: planItems.evidencia,
  orden: planItems.orden,
  origen: planItems.origen,
  origenItemId: planItems.origenItemId,
};

export type FilaItem = {
  id: string;
  tipo: TipoItemPlan;
  descripcion: string;
  textoPersona: string | null;
  knowledgeCardId: string | null;
  dominioFe: string | null;
  evidencia: EvidenciaPlan[];
  orden: number;
  origen: ItemPlanVista["origen"];
  origenItemId: string | null;
};

// La ruta de las banderas de un ítem guardado es su id: la propuesta limpia usa "items[i]",
// pero un ítem del borrador cambia de posición y el id no.
// "notas": las de las sesiones del acompañamiento (R-003.62). Sin ellas, solo cuentan las citas.
export function banderasDeFila(fila: FilaItem, citas: string[], notas: string[] = []) {
  return banderasDeItem(
    { tipo: fila.tipo, descripcion: fila.descripcion, textoPersona: fila.textoPersona },
    { citas, ruta: fila.id, notas },
  );
}

export function vistaItem(fila: FilaItem, citas: string[], notas: string[] = []): ItemPlanVista {
  return {
    id: fila.id,
    tipo: fila.tipo,
    descripcion: fila.descripcion,
    textoPersona: fila.textoPersona,
    fichaId: fila.knowledgeCardId,
    dominioFe: fila.dominioFe,
    evidencia: fila.evidencia,
    orden: fila.orden,
    origen: fila.origen,
    origenItemId: fila.origenItemId,
    banderas: banderasDeFila(fila, citas, notas),
  };
}
