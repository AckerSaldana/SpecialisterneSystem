// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Lo que lee el desglose de tareas para armar la lista de apoyos (spec 010, R-010.4, R-010.5) y las lecturas de sus
// pantallas. Todo con RLS. La persona no lee profile_snapshots, así que el perfil sale de la única función que se lo
// deja ver, con solo estas columnas. dominiosFe no sale del servidor: lo traduce lib/desglose/adaptaciones.ts y nunca
// llega al modelo ni a una respuesta (R-010.6). No importa lib/auth, así un script la prueba con cuentas sintéticas
// (lib/api/ruta.ts). lib/followup/lectura.ts importa de aquí, nunca al revés.
import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Tx } from "@/lib/db/rls";
import { personaPlans, taskBreakdowns, taskStepEvents, taskTemplates, users } from "@/lib/db/schema";
import type { DimensionDesglose } from "@/lib/desglose/adaptaciones";
import { compararConPlantilla, quedoIgual, type EntradaDiferencia } from "@/lib/desglose/diferencia";
import { estadoDePaso, ultimasMarcas, vistaDeAjuste, vistaDePaso, type AjusteGuardado, type AjusteVista, type DescartadoDesglose, type EstadoPaso, type PasoDesglose, type PasoDesgloseVista, type PasoPlantilla } from "@/lib/desglose/schema";
import { PlanPersona } from "@/lib/plan/schema";
import { DimensionId, DominioFE, TipoHallazgo } from "@/lib/profile/schema";

const FilaPerfil = z.object({
  snapshot_id: z.uuid(),
  version: z.int(),
  dimension: DimensionId,
  tipo: TipoHallazgo,
  resumen: z.string(),
  dominios_fe: z.array(DominioFE),
});

export type PerfilParaDesglose = { snapshotId: string; version: number; dimensiones: DimensionDesglose[] };

// null si quien llama no participa en ese acompañamiento, sin consentimiento vigente o sin dimensiones (R-010.4).
export async function leerPerfilParaDesglose(tx: Tx, engagementId: string): Promise<PerfilParaDesglose | null> {
  const filas = await tx.execute(
    sql`select snapshot_id, version, dimension, tipo, resumen, dominios_fe from private.app_perfil_para_desglose(${engagementId}::uuid)`,
  );
  const dimensiones = z.array(FilaPerfil).parse([...filas]);
  const [primera] = dimensiones;
  if (!primera) return null;
  return {
    snapshotId: primera.snapshot_id,
    version: primera.version,
    dimensiones: dimensiones.map((d) => ({ dimension: d.dimension, tipo: d.tipo, resumen: d.resumen, dominiosFe: d.dominios_fe })),
  };
}

// La última versión de persona_plans: lo único del plan que lee la persona, y lo único que le llega al modelo (R-010.5).
export async function leerPlanParaDesglose(tx: Tx, engagementId: string): Promise<PlanPersona | null> {
  const [plan] = await tx
    .select({ contenido: personaPlans.contenido })
    .from(personaPlans)
    .where(eq(personaPlans.engagementId, engagementId))
    .orderBy(desc(personaPlans.version))
    .limit(1);
  return plan ? PlanPersona.parse(plan.contenido) : null;
}

// Si el acompañamiento ya tiene un perfil del que salgan pasos. Solo un booleano para la pantalla: sin perfil no hay
// formulario, y la ruta responde lo mismo con un 409 (R-010.3).
export async function hayPerfilParaDesglose(tx: Tx, engagementId: string): Promise<boolean> {
  return (await leerPerfilParaDesglose(tx, engagementId)) !== null;
}

// ---------------------------------------------------------------------------
// Pantallas de la persona (R-010.11, R-010.26 a R-010.29)
// ---------------------------------------------------------------------------

const todosHechos = (pasos: readonly { id: string }[], ultimas: ReadonlyMap<string, { estado: EstadoPaso }>) => pasos.length > 0 && pasos.every((p) => estadoDePaso(p.id, ultimas) === "hecho");

export type TareaEnLista = { id: string; tarea: string; creadaEn: Date; laPreparoSuCoach: boolean; terminada: boolean };

// Lo archivado sale de su lista (R-010.29). Sin pasos, marcas ni textos: solo lo que dice la lista.
export async function leerTareasPersona(tx: Tx, engagementId: string, personaId: string): Promise<TareaEnLista[]> {
  const filas = await tx
    .select({ id: taskBreakdowns.id, tarea: taskBreakdowns.tareaOriginal, pasos: taskBreakdowns.pasos, creadaEn: taskBreakdowns.createdAt, creadoPor: taskBreakdowns.creadoPor })
    .from(taskBreakdowns)
    .where(and(eq(taskBreakdowns.engagementId, engagementId), isNull(taskBreakdowns.archivadoEn)))
    .orderBy(desc(taskBreakdowns.createdAt));
  const marcas = await tx.select({ id: taskStepEvents.id, pasoId: taskStepEvents.pasoId, estado: taskStepEvents.estado }).from(taskStepEvents).where(eq(taskStepEvents.engagementId, engagementId));
  const ultimas = ultimasMarcas(marcas);
  return filas.map((f) => ({ id: f.id, tarea: f.tarea, creadaEn: f.creadaEn, laPreparoSuCoach: f.creadoPor !== personaId, terminada: todosHechos(f.pasos, ultimas) }));
}

// Un "Me atoré aquí" tal como lo lee la persona: con la fecha en que su coach lo leyó, nunca con quién (R-010.33).
export type AtoradoPersona = { id: number; texto: string | null; creadoEn: Date; revisadoEn: Date | null };

// Sin origen: lo que no está en PasoDesgloseVista no sale al navegador (R-010.24).
export type PasoPersona = { paso: PasoDesgloseVista; estado: EstadoPaso; hechoEn: Date | null; atorados: AtoradoPersona[] };

// numero: el paso de esta copia al que se refiere, para "Propuesta: cambiar el paso {n}." (R-010.38).
export type AjustePersona = { ajuste: AjusteVista; numero: number };

export type TareaPersona =
  | { archivada: true; origenId: string | null; tarea: string }
  | { archivada: false; id: string; origenId: string | null; tarea: string; creadaEn: Date; laPreparoSuCoach: boolean; terminada: boolean; ajustesSinDecidir: boolean; ajustes: AjustePersona[]; pasos: PasoPersona[] };

// null: no existe, o no es de esta persona.
export async function leerTareaPersona(tx: Tx, engagementId: string, breakdownId: string, personaId: string): Promise<TareaPersona | null> {
  const [fila] = await tx
    .select({
      id: taskBreakdowns.id,
      tarea: taskBreakdowns.tareaOriginal,
      pasos: taskBreakdowns.pasos,
      creadaEn: taskBreakdowns.createdAt,
      creadoPor: taskBreakdowns.creadoPor,
      archivadoEn: taskBreakdowns.archivadoEn,
      ajustes: taskBreakdowns.ajustes,
      ajustesDecididosEn: taskBreakdowns.ajustesDecididosEn,
      origenId: taskBreakdowns.origenBreakdownId,
    })
    .from(taskBreakdowns)
    .where(and(eq(taskBreakdowns.id, breakdownId), eq(taskBreakdowns.engagementId, engagementId)))
    .limit(1);
  if (!fila) return null;
  if (fila.archivadoEn) return { archivada: true, origenId: fila.origenId, tarea: fila.tarea };

  const marcas = await tx
    .select({
      id: taskStepEvents.id,
      pasoId: taskStepEvents.pasoId,
      estado: taskStepEvents.estado,
      texto: taskStepEvents.texto,
      creadaEn: taskStepEvents.createdAt,
      revisadaEn: taskStepEvents.revisadoEn,
    })
    .from(taskStepEvents)
    .where(eq(taskStepEvents.breakdownId, breakdownId))
    .orderBy(asc(taskStepEvents.id));
  const ultimas = ultimasMarcas(marcas);
  const ajustesSinDecidir = fila.ajustes !== null && fila.ajustesDecididosEn === null;
  return {
    archivada: false,
    id: fila.id,
    origenId: fila.origenId,
    tarea: fila.tarea,
    creadaEn: fila.creadaEn,
    laPreparoSuCoach: fila.creadoPor !== personaId,
    terminada: todosHechos(fila.pasos, ultimas),
    // R-010.38: mientras no decida, no marca pasos.
    ajustesSinDecidir,
    // Solo mientras decide. Sin origen: lo que no está en AjusteVista no sale al navegador (R-010.24).
    ajustes: ajustesSinDecidir ? (fila.ajustes ?? []).map((a) => ({ ajuste: vistaDeAjuste(a), numero: fila.pasos.findIndex((p) => p.id === a.pasoId) + 1 })) : [],
    pasos: fila.pasos.map((p) => {
      const ultima = ultimas.get(p.id);
      return {
        paso: vistaDePaso(p),
        estado: estadoDePaso(p.id, ultimas),
        hechoEn: ultima?.estado === "hecho" ? ultima.creadaEn : null,
        // Todos, también los de antes de un "Deshacer": su coach los sigue leyendo, y no se borran (R-010.28).
        atorados: marcas.filter((m) => m.pasoId === p.id && m.estado === "atorado").map((m) => ({ id: m.id, texto: m.texto, creadoEn: m.creadaEn, revisadoEn: m.revisadaEn })),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Panel "Antes de esta sesión" (R-010.30 a R-010.33)
// ---------------------------------------------------------------------------

export type FilaAtorado = {
  id: number;
  // Literal, sin resumen ni clasificación. Nulo si no escribió (R-010.32).
  texto: string | null;
  creadoEn: Date;
  tarea: string;
  paso: { numero: number; accion: string } | null;
  // Si la última marca de ese paso es "hecho", y es posterior.
  hechoDespuesEn: Date | null;
};

// Cada atorado sin revisar, del más viejo al más nuevo. Va aparte de las señales y no se cuenta (R-010.31).
export async function leerAtorados(tx: Tx, engagementId: string): Promise<FilaAtorado[]> {
  const atorados = await tx
    .select({
      id: taskStepEvents.id,
      pasoId: taskStepEvents.pasoId,
      texto: taskStepEvents.texto,
      creadoEn: taskStepEvents.createdAt,
      tarea: taskBreakdowns.tareaOriginal,
      pasos: taskBreakdowns.pasos,
    })
    .from(taskStepEvents)
    .innerJoin(taskBreakdowns, eq(taskBreakdowns.id, taskStepEvents.breakdownId))
    .where(and(eq(taskStepEvents.engagementId, engagementId), eq(taskStepEvents.estado, "atorado"), isNull(taskStepEvents.revisadoEn)))
    .orderBy(asc(taskStepEvents.id));
  if (atorados.length === 0) return [];

  const marcas = await tx
    .select({ id: taskStepEvents.id, pasoId: taskStepEvents.pasoId, estado: taskStepEvents.estado, creadaEn: taskStepEvents.createdAt })
    .from(taskStepEvents)
    .where(eq(taskStepEvents.engagementId, engagementId));
  const ultimas = ultimasMarcas(marcas);

  return atorados.map((a) => {
    const indice = a.pasos.findIndex((p) => p.id === a.pasoId);
    const ultima = ultimas.get(a.pasoId);
    return {
      id: a.id,
      texto: a.texto,
      creadoEn: a.creadoEn,
      tarea: a.tarea,
      paso: indice >= 0 ? { numero: indice + 1, accion: a.pasos[indice]!.accion } : null,
      hechoDespuesEn: ultima?.estado === "hecho" && ultima.id > a.id ? ultima.creadaEn : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Pantallas del coach (R-010.2, R-010.11, R-010.34)
// ---------------------------------------------------------------------------

export type TareaDelCoach = { id: string; tarea: string; creadaEn: Date; laPidioLaPersona: boolean; archivadaEn: Date | null };

// También las archivadas: el coach las sigue viendo (R-010.29).
export async function leerTareasCoach(tx: Tx, engagementId: string, personaId: string): Promise<TareaDelCoach[]> {
  const filas = await tx
    .select({ id: taskBreakdowns.id, tarea: taskBreakdowns.tareaOriginal, creadaEn: taskBreakdowns.createdAt, creadoPor: taskBreakdowns.creadoPor, archivadaEn: taskBreakdowns.archivadoEn })
    .from(taskBreakdowns)
    .where(eq(taskBreakdowns.engagementId, engagementId))
    .orderBy(desc(taskBreakdowns.createdAt));
  return filas.map((f) => ({ id: f.id, tarea: f.tarea, creadaEn: f.creadaEn, laPidioLaPersona: f.creadoPor === personaId, archivadaEn: f.archivadaEn }));
}

export type MarcaDelCoach = { id: number; estado: EstadoPaso; texto: string | null; creadaEn: Date; revisadaEn: Date | null; revisadaPor: string | null };

// usada: nulo mientras la persona no decide (R-010.38).
export type AjusteDelCoach = { ajuste: AjusteGuardado; usada: boolean | null };

// R-010.44. disponible falso: RLS ya no deja leer la plantilla, porque se retiró el consentimiento de su origen. Una
// plantilla que se borró con la purga deja plantilla_id nulo, y entonces no hay comparación que decir.
export type ComparacionPlantilla = { disponible: false } | { disponible: true; diferencia: EntradaDiferencia[]; quedoIgual: boolean };

export type DetalleDelCoach = {
  id: string;
  tarea: string;
  creadaEn: Date;
  laPidioLaPersona: boolean;
  archivadaEn: Date | null;
  descartados: DescartadoDesglose[];
  ajustes: AjusteDelCoach[];
  // Nulo si no salió de una plantilla.
  plantilla: ComparacionPlantilla | null;
  pasos: { paso: PasoDesglose; marcas: MarcaDelCoach[] }[];
};

// Cada paso con todas sus marcas, en orden, con fecha y texto (R-010.34).
export async function leerTareaCoach(tx: Tx, engagementId: string, breakdownId: string, personaId: string): Promise<DetalleDelCoach | null> {
  const [fila] = await tx
    .select({
      id: taskBreakdowns.id,
      tarea: taskBreakdowns.tareaOriginal,
      pasos: taskBreakdowns.pasos,
      creadaEn: taskBreakdowns.createdAt,
      creadoPor: taskBreakdowns.creadoPor,
      archivadaEn: taskBreakdowns.archivadoEn,
      descartados: taskBreakdowns.descartados,
      ajustes: taskBreakdowns.ajustes,
      ajustesAceptados: taskBreakdowns.ajustesAceptados,
      ajustesDecididosEn: taskBreakdowns.ajustesDecididosEn,
      plantillaId: taskBreakdowns.plantillaId,
    })
    .from(taskBreakdowns)
    .where(and(eq(taskBreakdowns.id, breakdownId), eq(taskBreakdowns.engagementId, engagementId)))
    .limit(1);
  if (!fila) return null;

  const revisor = alias(users, "revisor");
  const marcas = await tx
    .select({
      id: taskStepEvents.id,
      pasoId: taskStepEvents.pasoId,
      estado: taskStepEvents.estado,
      texto: taskStepEvents.texto,
      creadaEn: taskStepEvents.createdAt,
      revisadaEn: taskStepEvents.revisadoEn,
      revisadaPor: revisor.nombrePila,
    })
    .from(taskStepEvents)
    .leftJoin(revisor, eq(revisor.id, taskStepEvents.revisadoPor))
    .where(eq(taskStepEvents.breakdownId, breakdownId))
    .orderBy(asc(taskStepEvents.id));

  return {
    id: fila.id,
    tarea: fila.tarea,
    creadaEn: fila.creadaEn,
    laPidioLaPersona: fila.creadoPor === personaId,
    archivadaEn: fila.archivadaEn,
    descartados: fila.descartados,
    ajustes: (fila.ajustes ?? []).map((ajuste) => ({ ajuste, usada: fila.ajustesDecididosEn ? (fila.ajustesAceptados ?? []).includes(ajuste.id) : null })),
    plantilla: fila.plantillaId ? await compararConLaPlantilla(tx, fila.plantillaId, fila.pasos) : null,
    pasos: fila.pasos.map((paso) => ({
      paso,
      marcas: marcas.filter((m) => m.pasoId === paso.id).map((m) => ({ id: m.id, estado: m.estado, texto: m.texto, creadaEn: m.creadaEn, revisadaEn: m.revisadaEn, revisadaPor: m.revisadaPor })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Plantillas (R-010.39, R-010.41, R-010.44). Solo el coach: la persona no lee task_templates, y sus pantallas tampoco.
// Ninguna lectura trae origen_engagement_id: ninguna pantalla lo muestra (R-010.39).
// ---------------------------------------------------------------------------

export type PlantillaEnLista = { id: string; puesto: string; titulo: string; tarea: string; pasos: PasoPlantilla[]; creadaEn: Date };

// Las de su organización, sin archivar. RLS oculta las que dejaron de verse por un retiro (R-010.45).
export async function leerPlantillas(tx: Tx): Promise<PlantillaEnLista[]> {
  return tx
    .select({ id: taskTemplates.id, puesto: taskTemplates.puesto, titulo: taskTemplates.titulo, tarea: taskTemplates.tarea, pasos: taskTemplates.pasos, creadaEn: taskTemplates.createdAt })
    .from(taskTemplates)
    .where(isNull(taskTemplates.archivadaEn))
    .orderBy(asc(taskTemplates.puesto), asc(taskTemplates.titulo), asc(taskTemplates.createdAt));
}

// Una plantilla archivada se sigue comparando: los desgloses hechos con ella no cambian (R-010.41).
async function compararConLaPlantilla(tx: Tx, plantillaId: string, pasos: readonly PasoDesglose[]): Promise<ComparacionPlantilla> {
  const [plantilla] = await tx.select({ pasos: taskTemplates.pasos }).from(taskTemplates).where(eq(taskTemplates.id, plantillaId)).limit(1);
  if (!plantilla) return { disponible: false };
  const diferencia = compararConPlantilla(plantilla.pasos, pasos);
  return { disponible: true, diferencia, quedoIgual: quedoIgual(diferencia) };
}
