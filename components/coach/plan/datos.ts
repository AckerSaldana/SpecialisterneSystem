// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Lectura del plan para /coach/engagements/[id] (spec 003, tareas 18 y 19). Corre dentro del
// withRls de la página, con la sesión del coach: si el consentimiento no está vigente, RLS
// devuelve 0 filas de plans y plan_items (R-003.53), pero la página ni siquiera llama a esta
// función en ese caso. Lee: plan vigente (aprobado con la versión más alta), borrador, sus ítems,
// el snapshot base del borrador (para recalcular banderas) y las fichas (solo el coach las lee,
// R-003.41).
import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { ItemPlanVista } from "@/lib/api/contracts";
import type { Tx } from "@/lib/db/rls";
import { knowledgeCards, planItems, plans, profileSnapshots, users } from "@/lib/db/schema";
import type { DescartadoPlan } from "@/lib/plan/schema";
import { citasDelPerfil, columnasItem, vistaItem } from "@/lib/plan/server";
import type { Perfil } from "@/lib/profile/schema";
import { notasDelAcompanamiento } from "@/lib/sessions/copiado";
import { formatFecha } from "@/components/coach/labels";
import type { PlanVigenteDatos } from "./plan-vigente";
import type { FichaOpcion, ItemLectura } from "./tipos";

export type DatosPlan = {
  vigente: PlanVigenteDatos | null;
  borrador: {
    id: string;
    snapshotVersion: number;
    items: ItemPlanVista[];
    descartados: DescartadoPlan[];
  } | null;
  hayHistorial: boolean; // hay al menos un plan aprobado o descartado
  fichas: FichaOpcion[];
};

export async function leerPlan(
  tx: Tx,
  engagementId: string,
  snapshotActual: { id: string; perfil: Perfil } | undefined,
): Promise<DatosPlan> {
  const aprobador = alias(users, "aprobador_plan");

  // Tabla chica (fichas cortas): se leen todas para mostrar "Ficha {id}: {título}" aunque una
  // ficha ya no esté verificada. El selector del borrador solo ofrece las verificadas.
  const fichas = await tx
    .select({ id: knowledgeCards.id, titulo: knowledgeCards.titulo, verificada: knowledgeCards.verificada })
    .from(knowledgeCards)
    .orderBy(asc(knowledgeCards.id));

  const lista = await tx
    .select({
      id: plans.id,
      status: plans.status,
      version: plans.version,
      approvedAt: plans.approvedAt,
      aprobadoPor: aprobador.nombrePila,
      profileSnapshotId: plans.profileSnapshotId,
      snapshotVersion: profileSnapshots.version,
    })
    .from(plans)
    .innerJoin(profileSnapshots, eq(profileSnapshots.id, plans.profileSnapshotId))
    .leftJoin(aprobador, eq(aprobador.id, plans.approvedBy))
    .where(eq(plans.engagementId, engagementId));

  // R-003.33: el vigente es el aprobado con la versión más alta.
  const vigenteFila = lista
    .filter((p) => p.status === "aprobado" && p.version !== null)
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  // R-003.3: hay a lo más un borrador (índice plans_un_borrador).
  const borradorFila = lista.find((p) => p.status === "borrador");

  const ids = [vigenteFila?.id, borradorFila?.id].filter((x): x is string => Boolean(x));
  // Mismas columnas que leen las rutas del plan (lib/plan/server.ts).
  const filas =
    ids.length === 0
      ? []
      : await tx
          .select(columnasItem)
          .from(planItems)
          .where(inArray(planItems.planId, ids))
          .orderBy(asc(planItems.orden), asc(planItems.createdAt));

  const filasDe = (planId: string) => filas.filter((f) => f.planId === planId);
  // Plan vigente: ya aprobado y no se edita, así que no se le calculan banderas (citas vacías).
  const lectura = (f: (typeof filas)[number]): ItemLectura => vistaItem(f, []);

  const vigente: PlanVigenteDatos | null = vigenteFila
    ? {
        id: vigenteFila.id,
        version: vigenteFila.version!,
        aprobadoEn: vigenteFila.approvedAt ? formatFecha(vigenteFila.approvedAt) : "día registrado",
        aprobadoPor: vigenteFila.aprobadoPor ?? "un coach",
        snapshotVersion: vigenteFila.snapshotVersion,
        items: filasDe(vigenteFila.id).map(lectura),
      }
    : null;

  let borrador: DatosPlan["borrador"] = null;
  if (borradorFila) {
    const [extra] = await tx
      .select({ propuestaIa: plans.propuestaIa })
      .from(plans)
      .where(eq(plans.id, borradorFila.id))
      .limit(1);

    // Las banderas se calculan contra las citas del snapshot base del borrador (R-003.18, R-003.46),
    // que puede no ser el último si el perfil cambió después de pedir la propuesta. Mismas citas y
    // misma función que usan las rutas al guardar (citasDelPerfil, vistaItem), así la pantalla y
    // la respuesta de la ruta muestran las mismas banderas. Las notas de las sesiones también (R-003.62).
    let perfilBase: Perfil | undefined =
      snapshotActual && snapshotActual.id === borradorFila.profileSnapshotId ? snapshotActual.perfil : undefined;
    if (!perfilBase) {
      const [base] = await tx
        .select({ perfil: profileSnapshots.perfil })
        .from(profileSnapshots)
        .where(eq(profileSnapshots.id, borradorFila.profileSnapshotId))
        .limit(1);
      perfilBase = base?.perfil;
    }
    const citas = perfilBase ? citasDelPerfil(perfilBase) : [];
    const notas = await notasDelAcompanamiento(tx, engagementId);

    borrador = {
      id: borradorFila.id,
      snapshotVersion: borradorFila.snapshotVersion,
      descartados: extra?.propuestaIa?.descartados ?? [],
      // R-003.27: las banderas se recalculan con código cada vez que se muestra el borrador.
      items: filasDe(borradorFila.id).map((f) => vistaItem(f, citas, notas)),
    };
  }

  return {
    vigente,
    borrador,
    hayHistorial: lista.some((p) => p.status !== "borrador"),
    fichas,
  };
}
