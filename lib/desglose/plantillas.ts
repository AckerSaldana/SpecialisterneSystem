// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Plantillas de tareas por organización (spec 010, R-010.39 a R-010.42, R-010.45). Solo el coach, y todo con RLS.
//   - guardarPlantilla: el coach revisa el texto y aquí se revisa otra vez, sin excepción, porque una plantilla les llega
//     a otras personas (R-010.40, decisión 6 del plan). Del desglose solo se usa de qué acompañamiento salió. No guarda
//     notas, porQue, origen, minutos ni contexto, y nada de esto dice de qué persona salió (R-010.39).
//   - archivarPlantilla: solo las dos columnas que tienen grant. Nunca se edita (R-010.41).
//   - aplicarPlantilla: los mismos chequeos de pedir un desglose, y una plantilla oculta o archivada no se aplica. Sin la
//     excepción de R-010.15 y R-010.16, porque nada de esa entrada lo escribió la persona (R-010.42).
// Decisión abierta 5, opción B: la plantilla se liga por origen_engagement_id, y ninguna lectura ni respuesta lo muestra.
// No importa lib/auth, solo su tipo, y el modelo llega como parámetro, así un script lo prueba sin red (lib/api/ruta.ts).
import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { errorPasoPlantilla, PLANTILLA_NO_DISPONIBLE, PLANTILLA_YA_ARCHIVADA } from "@/components/coach/desglose/textos";
import { AplicarPlantillaRequest, ArchivarPlantillaRequest, GuardarPlantillaRequest, type DesgloseCreadoResponse, type GuardarPlantillaResponse } from "@/lib/api/contracts";
import { conError, type RespuestaRuta, type UsuarioRuta } from "@/lib/api/ruta";
import { exigirConsentimiento } from "@/lib/consent";
import { withRls, type Tx } from "@/lib/db/rls";
import { engagements, taskBreakdowns, taskTemplates, users } from "@/lib/db/schema";
import { perfilMarcaIniciacion, refsDeInicio } from "@/lib/desglose/adaptaciones";
import {
  ACCION_PLANTILLA,
  chequeosDelPedido,
  generarPasos,
  MENSAJES_DESGLOSE,
  MODELO_REAL,
  reservarCupo,
  revisarLoEscrito,
  type DepsDesglose,
  type ListoParaGenerar,
  type SigueVigente,
  type UsuarioDesglose,
} from "@/lib/desglose/generar";
import { PasoPlantilla } from "@/lib/desglose/schema";
import { mensajeBloqueoPlantilla, revisarTextoDesglose, tieneNombre, validarPasos } from "@/lib/desglose/validate";
import { logError } from "@/lib/log";
import { PROMPT_VERSION_DESGLOSE } from "@/lib/prompts";

// Sin texto en la spec, salvo los que vienen de components/coach/desglose/textos.ts.
export const MENSAJES_PLANTILLAS = {
  guardarInvalido: "Revisa lo que escribiste. Llena el puesto, el título, la tarea y cada paso.",
  sinTarea: "No encontramos esta tarea.",
  archivarInvalido: "No se pudo leer lo que pediste. Intenta de nuevo.",
  aplicarInvalido: "Elige una plantilla. Cada dato opcional puede tener hasta 200 caracteres.",
  noDisponible: PLANTILLA_NO_DISPONIBLE,
  yaArchivada: PLANTILLA_YA_ARCHIVADA,
  errorGuardar: "No se pudo guardar. Intenta de nuevo.",
} as const;

type TextoPlantilla = { puesto: string; titulo: string; tarea: string; pasos: readonly { accion: string; criterioTerminado: string }[] };

// R-010.40, sin base ni red. null: se puede guardar. El nombre y los términos van antes: lo primero que hay que quitar es
// lo que no puede pasar de una persona a otra.
export function bloqueoDePlantilla(plantilla: TextoPlantilla, nombrePila: string): string | null {
  const textos = [plantilla.puesto, plantilla.titulo, plantilla.tarea, ...plantilla.pasos.flatMap((p) => [p.accion, p.criterioTerminado])];
  for (const texto of textos) {
    if (tieneNombre(texto, nombrePila)) return mensajeBloqueoPlantilla(nombrePila);
    const [termino] = revisarTextoDesglose(texto);
    if (termino) return mensajeBloqueoPlantilla(termino);
  }
  // Sin R-010.14 y sin texto de persona. La entrada de R-010.17 es lo que dice la plantilla fuera de sus pasos: con los
  // pasos adentro, esa regla no atraparía nada, y el contexto del desglose ya no viaja.
  const [problema] = validarPasos(plantilla.pasos, { textoPersona: [], entradaModelo: [plantilla.puesto, plantilla.titulo, plantilla.tarea].join("\n") });
  return problema ? errorPasoPlantilla(problema.paso, problema.problema) : null;
}

// POST /api/task-templates. Solo el coach del acompañamiento de origen (R-010.41): RLS le oculta el desglose a otro coach,
// y sin consentimiento vigente a todos. Si se guarda, responde 201 con su id y nada más (CA-010.39).
export async function guardarPlantilla(user: UsuarioRuta, body: unknown): Promise<RespuestaRuta> {
  const parsed = GuardarPlantillaRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES_PLANTILLAS.guardarInvalido);
  const { breakdownId, puesto, titulo, tarea, pasos } = parsed.data;

  try {
    return await withRls(user.claims, async (tx) => {
      const [origen] = await tx
        .select({ engagementId: engagements.id, orgId: engagements.orgId, nombrePila: users.nombrePila })
        .from(taskBreakdowns)
        .innerJoin(engagements, eq(engagements.id, taskBreakdowns.engagementId))
        .innerJoin(users, eq(users.id, engagements.personaId))
        .where(and(eq(taskBreakdowns.id, breakdownId), eq(engagements.coachId, user.id)))
        .limit(1);
      if (!origen) return conError(404, MENSAJES_PLANTILLAS.sinTarea);

      const bloqueo = bloqueoDePlantilla({ puesto, titulo, tarea, pasos }, origen.nombrePila);
      if (bloqueo) return conError(400, bloqueo);

      const id = randomUUID();
      await tx.insert(taskTemplates).values({
        id,
        orgId: origen.orgId,
        // Solo para ocultarla con el retiro y borrarla con la purga (R-010.39, R-010.45).
        origenEngagementId: origen.engagementId,
        puesto,
        titulo,
        tarea,
        // Campo por campo: PasoPlantilla es estricto y lo que no está aquí no se guarda.
        pasos: pasos.map((p) => PasoPlantilla.parse({ id: randomUUID(), accion: p.accion, criterioTerminado: p.criterioTerminado })),
        creadaPor: user.id,
      });
      return { status: 201, cuerpo: { plantillaId: id } satisfies GuardarPlantillaResponse };
    });
  } catch (e) {
    logError("task_templates: error al guardar", e);
    return conError(500, MENSAJES_PLANTILLAS.errorGuardar);
  }
}

// PATCH /api/task-templates/[id]. Cualquier coach de la organización, mientras el consentimiento de su origen esté vigente
// (R-010.41, R-010.45). Los desgloses hechos con ella no cambian.
export async function archivarPlantilla(user: UsuarioRuta, plantillaId: string, body: unknown): Promise<RespuestaRuta> {
  if (!ArchivarPlantillaRequest.safeParse(body).success) return conError(400, MENSAJES_PLANTILLAS.archivarInvalido);

  try {
    return await withRls(user.claims, async (tx) => {
      const archivada = await tx
        .update(taskTemplates)
        .set({ archivadaPor: user.id, archivadaEn: new Date() })
        .where(and(eq(taskTemplates.id, plantillaId), isNull(taskTemplates.archivadaEn)))
        .returning({ id: taskTemplates.id });
      if (archivada.length > 0) return { status: 200, cuerpo: {} };

      // RLS oculta la plantilla de otra organización y la que dejó de verse por un retiro. Lo demás ya estaba archivado.
      const [existe] = await tx.select({ id: taskTemplates.id }).from(taskTemplates).where(eq(taskTemplates.id, plantillaId)).limit(1);
      return existe ? conError(409, MENSAJES_PLANTILLAS.yaArchivada) : conError(404, MENSAJES_PLANTILLAS.noDisponible);
    });
  } catch (e) {
    logError("task_templates: error al archivar", e);
    return conError(500, MENSAJES_PLANTILLAS.errorGuardar);
  }
}

// Una plantilla que RLS deja ver y que no está archivada. Sin origen_engagement_id: no hace falta para aplicarla (R-010.39).
async function plantillaParaAplicar(tx: Tx, plantillaId: string) {
  const [plantilla] = await tx
    .select({ tarea: taskTemplates.tarea, pasos: taskTemplates.pasos })
    .from(taskTemplates)
    .where(and(eq(taskTemplates.id, plantillaId), isNull(taskTemplates.archivadaEn)))
    .limit(1);
  return plantilla ?? null;
}

type ListoParaAplicar = ListoParaGenerar & { plantilla: NonNullable<Awaited<ReturnType<typeof plantillaParaAplicar>>> };

// POST /api/engagements/[id]/task-breakdowns/from-template. Mismo orden que pedir un desglose (lib/desglose/generar.ts):
// primero R-010.3, después la plantilla y R-010.1 sobre su tarea y el contexto, porque la tarea sale de ella. Cualquier
// corte no llama al modelo, no audita y no guarda.
export async function aplicarPlantilla(user: UsuarioDesglose, engagementId: string, body: unknown, deps: DepsDesglose = MODELO_REAL): Promise<RespuestaRuta> {
  const parsed = AplicarPlantillaRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES_PLANTILLAS.aplicarInvalido);
  const { plantillaId } = parsed.data;
  const contexto = parsed.data.contexto && Object.keys(parsed.data.contexto).length > 0 ? parsed.data.contexto : null;

  let listo: RespuestaRuta | ListoParaAplicar;
  try {
    listo = await withRls(user.claims, async (tx) => {
      const chequeos = await chequeosDelPedido(tx, user, engagementId);
      if ("status" in chequeos) return chequeos;
      // Solo su coach la aplica (R-010.42). La persona no ve las plantillas, y su pantalla tampoco.
      if (!chequeos.solicitud.esCoach) return conError(404, MENSAJES_DESGLOSE.sinAcompanamiento);

      const plantilla = await plantillaParaAplicar(tx, plantillaId);
      if (!plantilla) return conError(404, MENSAJES_PLANTILLAS.noDisponible);

      const revisado = await revisarLoEscrito(tx, engagementId, chequeos, plantilla.tarea, contexto);
      if ("status" in revisado) return revisado;
      await reservarCupo(tx, user, engagementId, PROMPT_VERSION_DESGLOSE);
      return { ...revisado, plantilla };
    });
  } catch (e) {
    logError(`${ACCION_PLANTILLA}: error al leer la plantilla`, e);
    return conError(500, MENSAJES_DESGLOSE.errorGuardar);
  }
  if ("status" in listo) return listo;
  const { solicitud, perfil, apoyos, plantilla } = listo;

  const sigueVigente: SigueVigente = async (tx) => {
    // R-010.46: el consentimiento pudo retirarse mientras esperábamos al modelo.
    if (!(await exigirConsentimiento(tx, engagementId))) return conError(409, solicitud.textos.retiro);
    // Lo mismo con la plantilla: archivada o con el retiro de su origen, la política rechazaría la fila, y su texto ya no le
    // puede llegar al modelo en un reintento (R-010.42, R-010.45).
    return (await plantillaParaAplicar(tx, plantillaId)) ? null : conError(409, MENSAJES_PLANTILLAS.noDisponible);
  };

  const generados = await generarPasos(
    user,
    engagementId,
    ACCION_PLANTILLA,
    { tarea: plantilla.tarea, contexto, apoyos, plantilla: { pasos: plantilla.pasos } },
    // R-010.42: sin la excepción de R-010.15 y R-010.16, porque nada de esto lo escribió la persona.
    { textoPersona: [], exigirInicio: perfilMarcaIniciacion(perfil.dimensiones) ? refsDeInicio(apoyos) : undefined },
    apoyos,
    deps,
    sigueVigente,
  );
  if (!generados) return conError(502, solicitud.textos.errorModelo);
  if ("status" in generados) return generados;

  const id = randomUUID();
  try {
    const conflicto = await withRls(user.claims, async (tx) => {
      const vigente = await sigueVigente(tx);
      if (vigente) return vigente;
      await tx.insert(taskBreakdowns).values({
        id,
        engagementId,
        tareaOriginal: plantilla.tarea,
        contexto,
        pasos: generados.pasos,
        // R-010.9: el id del snapshot, nunca una copia de su contenido.
        generadoDesde: perfil.snapshotId,
        promptVersion: generados.promptVersion,
        model: generados.modelo,
        plantillaId,
        descartados: generados.descartados,
        creadoPor: user.id,
      });
      return null;
    });
    if (conflicto) return conflicto;
  } catch (e) {
    logError(`${ACCION_PLANTILLA}: error al guardar`, e);
    return conError(500, MENSAJES_DESGLOSE.errorGuardar);
  }

  return { status: 201, cuerpo: { breakdownId: id } satisfies DesgloseCreadoResponse };
}
