// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Decisión del coach sobre una propuesta de la IA, de 001 o de seguimiento (spec 004, tarea 17).
// Todo pasa en una sola transacción con RLS:
//   - rechazar: marca el evento. Nada más cambia.
//   - aprobar: revisa la selección y el texto final de cada cambio (R-004.59); si hay cambios o
//     señales, crea un snapshot con version + 1 y su copia para la persona; guarda avance, preguntas,
//     contexto y siguiente paso. Sin cambios ni señales no hay snapshot (R-004.56).
// Si dos aprobaciones de propuestas distintas del mismo engagement intentan guardar la misma
// version, la restricción única profile_snapshots_engagement_version rechaza la segunda: 409.
import "server-only";
import { eq } from "drizzle-orm";
import { DecisionRequest, type DecisionResponse } from "@/lib/api/contracts";
import { conError, type RespuestaRuta, type UsuarioRuta } from "@/lib/api/ruta";
import { withRls } from "@/lib/db/rls";
import {
  engagements,
  followupContext,
  personaProfiles,
  planItemUpdates,
  profileEvents,
  profileSnapshots,
  sessions,
  signalStates,
  users,
} from "@/lib/db/schema";
import {
  aprobacionVacia,
  bloqueosDeCambios,
  citasDePropuesta,
  comoFollowup,
  seleccionValida,
  SIN_SELECCION,
  textoBloqueo,
} from "@/lib/followup/aprobacion";
import { itemEquivalente } from "@/lib/followup/avance";
import { leerEstadosSenales, leerPlanConAvance, leerUltimoSnapshot } from "@/lib/followup/lectura";
import { PayloadSeguimientoIA } from "@/lib/followup/schema";
import { logError } from "@/lib/log";
import { citasDelPerfil, fichaVerificada, violaUnico } from "@/lib/plan/server";
import { applyApproval, tiposReabiertos, validarIndices } from "@/lib/profile/merge";
import { PayloadPropuestaIA, PERFIL_VACIO, vistaPersona, type EvidenciaGuardada } from "@/lib/profile/schema";
import { tiposCerrados } from "@/lib/profile/senales";

const MENSAJES = {
  sinPropuesta: "No encontramos esta propuesta.",
  noEsPropuesta: "Este evento no es una propuesta de la IA. No se puede aprobar ni rechazar.",
  yaRevisada: "Esta propuesta ya fue revisada. Recarga la página para ver su estado.",
  seleccion: "La selección no coincide con la propuesta. Recarga la página.",
  sinEquivalente: "Este punto ya no está en el plan aprobado. Quítalo de la selección para aprobar.",
  fichaNoValida: "La ficha de este siguiente paso ya no está verificada. Quítalo de la selección para aprobar.",
  simultanea: "Otra aprobación se guardó al mismo tiempo. Recarga la página y revisa de nuevo.",
  errorGuardar: "No se pudo guardar la decisión. Intenta de nuevo.",
} as const;

// "opciones.ahora" solo lo pasa el seed del demo, para que las fechas sigan la historia (R-007.60). La
// ruta no lo pasa y nada del body llega aquí.
export async function decidirPropuesta(user: UsuarioRuta, eventId: string, body: unknown, opciones: { ahora?: Date } = {}): Promise<RespuestaRuta> {
  const parsed = DecisionRequest.safeParse(body);
  if (!parsed.success) return conError(400, "La decisión no es válida.");
  const decision = parsed.data;

  try {
    return await withRls(user.claims, async (tx): Promise<RespuestaRuta> => {
      // "for update" bloquea la fila: si llegan dos decisiones a la vez, la segunda espera
      // y luego ve el status ya cambiado (responde 409).
      const [evento] = await tx
        .select({
          id: profileEvents.id,
          engagementId: profileEvents.engagementId,
          sessionId: profileEvents.sessionId,
          tipo: profileEvents.tipo,
          status: profileEvents.status,
          payload: profileEvents.payload,
        })
        .from(profileEvents)
        .where(eq(profileEvents.id, eventId))
        .limit(1)
        .for("update");

      // RLS: si el coach no es de este engagement, no ve el evento.
      if (!evento) return conError(404, MENSAJES.sinPropuesta);
      if (evento.tipo !== "propuesta_ia") return conError(409, MENSAJES.noEsPropuesta);
      if (evento.status !== "proposed") return conError(409, MENSAJES.yaRevisada);

      const ahora = opciones.ahora ?? new Date();

      if (decision.accion === "rechazar") {
        await tx
          .update(profileEvents)
          .set({ status: "rejected", decidedBy: user.id, decidedAt: ahora })
          .where(eq(profileEvents.id, evento.id));
        const respuesta: DecisionResponse = { eventId: evento.id, status: "rejected", snapshotId: null, version: null };
        return { status: 200, cuerpo: respuesta };
      }

      // --- aprobar ---
      const { aprobacion } = decision;
      if (aprobacionVacia(aprobacion)) return conError(400, SIN_SELECCION);

      const seguimiento = evento.payload.tipo === "propuesta_seguimiento";
      const payload = seguimiento ? PayloadSeguimientoIA.parse(evento.payload) : PayloadPropuestaIA.parse(evento.payload);
      const update = "indicePlan" in payload ? payload.update : comoFollowup(payload.update);
      const indicePlan = "indicePlan" in payload ? payload.indicePlan : [];

      try {
        validarIndices(update, aprobacion);
      } catch {
        return conError(400, MENSAJES.seleccion);
      }
      if (!seleccionValida(update, aprobacion)) return conError(400, MENSAJES.seleccion);

      // Una propuesta de la IA siempre viene de una sesión; si no, el dato está roto.
      if (!evento.sessionId) throw new Error("profile_event sin session_id");
      const sessionId = evento.sessionId;

      const ultimo = await leerUltimoSnapshot(tx, evento.engagementId);

      // R-004.59: el resumen llega tal cual a persona_profiles. Ninguna confirmación lo salta.
      // R-008.6: las observaciones previas pueden traer citas que el último snapshot ya no tiene.
      const citas = [
        ...citasDePropuesta(update),
        ...citasDelPerfil(ultimo?.perfil ?? PERFIL_VACIO),
        ...payload.indiceObservaciones.map((e) => e.cita),
      ];
      const [sesion] = await tx.select({ nota: sessions.notaOriginal }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      const [bloqueo] = bloqueosDeCambios(update, aprobacion, citas, sesion ? [sesion.nota] : []);
      if (bloqueo) {
        const [persona] = await tx
          .select({ nombrePila: users.nombrePila })
          .from(engagements)
          .innerJoin(users, eq(users.id, engagements.personaId))
          .where(eq(engagements.id, evento.engagementId))
          .limit(1);
        const nombre = persona?.nombrePila ?? "la persona";
        return conError(400, textoBloqueo(nombre, bloqueo.dimension, bloqueo.termino), { ruta: bloqueo.ruta });
      }

      // R-004.41 y R-004.53: lo aprobado se guarda sobre el ítem equivalente de la versión vigente.
      const plan = await leerPlanConAvance(tx, evento.engagementId);
      const vigentes = plan.items.map((i) => i.id);
      const itemVigente = (ref: string) => {
        const entrada = indicePlan.find((e) => e.ref === ref);
        return entrada ? itemEquivalente(entrada.planItemId, vigentes, plan.cadena) : null;
      };

      const filasAvance = [];
      for (const i of new Set(aprobacion.avance)) {
        const a = update.avance[i];
        const planItemId = itemVigente(a.itemRef);
        if (!planItemId) return conError(400, MENSAJES.sinEquivalente, { ruta: `avance[${i}]` });
        const evidencia: EvidenciaGuardada[] = a.evidencia.map((e) => ({ cita: e.cita, sessionId }));
        filasAvance.push({
          engagementId: evento.engagementId,
          planItemId,
          sessionId,
          eventId: evento.id,
          estado: a.estado,
          resumen: a.resumen,
          evidencia,
          approvedBy: user.id,
          approvedAt: ahora,
        });
      }

      const filaBase = {
        engagementId: evento.engagementId,
        sessionId,
        eventId: evento.id,
        approvedBy: user.id,
        approvedAt: ahora,
      };
      const filasContexto: (typeof followupContext.$inferInsert)[] = [
        ...[...new Set(aprobacion.preguntas)].map((i) => ({
          ...filaBase,
          tipo: "pregunta" as const,
          texto: update.preguntasParaSiguienteSesion[i],
        })),
        ...[...new Set(aprobacion.contexto)].map((i) => ({
          ...filaBase,
          tipo: "contexto" as const,
          texto: update.contexto[i].texto,
          evidencia: update.contexto[i].evidencia.map((e) => ({ cita: e.cita, sessionId })),
        })),
      ];

      if (aprobacion.siguientePaso && update.siguientePaso) {
        const paso = update.siguientePaso;
        const planItemId = paso.itemRef ? itemVigente(paso.itemRef) : null;
        if (paso.itemRef && !planItemId) return conError(400, MENSAJES.sinEquivalente, { ruta: "siguientePaso" });
        // La ficha pudo dejar de estar verificada mientras la propuesta esperaba.
        if (paso.fichaId && !(await fichaVerificada(tx, paso.fichaId))) {
          return conError(400, MENSAJES.fichaNoValida, { ruta: "siguientePaso" });
        }
        filasContexto.push({
          ...filaBase,
          tipo: "siguiente_paso",
          texto: paso.texto,
          evidencia: paso.evidencia.map((e) => ({ cita: e.cita, sessionId })),
          planItemId,
          knowledgeCardId: paso.fichaId,
        });
      }

      // Snapshot solo si se aprobó al menos un cambio o una señal (R-004.56).
      let snapshot: { id: string; version: number } | null = null;
      if (aprobacion.cambios.length > 0 || aprobacion.senales.length > 0) {
        const estados = await leerEstadosSenales(tx, evento.engagementId);
        const cerrados = tiposCerrados(estados);
        const perfil = applyApproval(ultimo?.perfil ?? PERFIL_VACIO, update, aprobacion, {
          sessionId,
          eventId: evento.id,
          now: ahora,
          tiposCerrados: cerrados,
        });

        // La restricción única (engagement_id, version) evita dos snapshots con la misma versión.
        const [creado] = await tx
          .insert(profileSnapshots)
          .values({
            engagementId: evento.engagementId,
            version: (ultimo?.version ?? 0) + 1,
            perfil,
            sourceEventId: evento.id,
            createdBy: user.id,
          })
          .returning({ id: profileSnapshots.id, version: profileSnapshots.version });
        snapshot = creado;

        // Copia sin citas ni señales para la persona (ver persona_profiles en lib/db/schema.ts).
        await tx.insert(personaProfiles).values({
          snapshotId: creado.id,
          engagementId: evento.engagementId,
          version: creado.version,
          contenido: vistaPersona(perfil),
        });

        // R-004.55: una señal aprobada de un tipo cerrado lo vuelve a abrir.
        const reabiertos = tiposReabiertos(update, aprobacion, cerrados);
        if (reabiertos.length > 0) {
          await tx.insert(signalStates).values(
            reabiertos.map((tipo) => ({
              engagementId: evento.engagementId,
              tipo,
              estado: "activa" as const,
              eventId: evento.id,
              createdBy: user.id,
            })),
          );
        }
      }

      if (filasAvance.length > 0) await tx.insert(planItemUpdates).values(filasAvance);
      if (filasContexto.length > 0) await tx.insert(followupContext).values(filasContexto);

      await tx
        .update(profileEvents)
        .set({ status: "approved", approvedPayload: aprobacion, decidedBy: user.id, decidedAt: ahora })
        .where(eq(profileEvents.id, evento.id));

      const respuesta: DecisionResponse = {
        eventId: evento.id,
        status: "approved",
        snapshotId: snapshot?.id ?? null,
        version: snapshot?.version ?? null,
      };
      return { status: 200, cuerpo: respuesta };
    });
  } catch (e) {
    if (violaUnico(e, "profile_snapshots_engagement_version")) return conError(409, MENSAJES.simultanea);
    logError("decision: error al guardar la decisión", e);
    return conError(500, MENSAJES.errorGuardar);
  }
}
