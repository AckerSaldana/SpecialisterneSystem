// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// POST /api/profile-events/[id]/decision
// El coach aprueba una parte (o todo) de una propuesta de la IA, o la rechaza.
// Todo pasa en una sola transacción con RLS:
//   - aprobar: aplica lo aprobado al último perfil (applyApproval), guarda un
//     profile_snapshot con version + 1 y marca el evento como "approved".
//   - rechazar: marca el evento como "rejected". El perfil no cambia.
// Si dos aprobaciones de propuestas distintas del mismo engagement intentan guardar la misma
// version, la restricción única profile_snapshots_engagement_version rechaza la segunda: 409.
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { DecisionRequest, type ApiError, type DecisionResponse } from "@/lib/api/contracts";
import { getUserWithRole } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { logError } from "@/lib/log";
import { personaProfiles, profileEvents, profileSnapshots } from "@/lib/db/schema";
import { applyApproval, validarIndices } from "@/lib/profile/merge";
import { PayloadPropuestaIA, PERFIL_VACIO, vistaPersona } from "@/lib/profile/schema";

const error = (status: number, mensaje: string) => Response.json({ error: mensaje } satisfies ApiError, { status });

// true si el error es la violación de la restricción única (engagement_id, version) de
// profile_snapshots. Drizzle envuelve el error de Postgres en "cause" (si no viene envuelto, se lee el error mismo).
function esVersionDuplicada(e: unknown): boolean {
  const causa = e instanceof Error ? (e.cause ?? e) : undefined;
  if (!causa || typeof causa !== "object") return false;
  const { code, constraint_name } = causa as { code?: unknown; constraint_name?: unknown };
  return code === "23505" && constraint_name === "profile_snapshots_engagement_version";
}

// Resultado de la transacción: o una respuesta lista, o un error con su código HTTP.
type Resultado = { ok: true; respuesta: DecisionResponse } | { ok: false; status: number; mensaje: string };

export async function POST(req: Request, ctx: RouteContext<"/api/profile-events/[id]/decision">) {
  const user = await getUserWithRole("coach");
  if (!user) return error(401, "Necesitas iniciar sesión con una cuenta de coach.");

  const { id: eventId } = await ctx.params;
  if (!z.uuid().safeParse(eventId).success) return error(404, "No encontramos esta propuesta.");

  const body = await req.json().catch(() => null);
  const parsed = DecisionRequest.safeParse(body);
  if (!parsed.success) return error(400, "La decisión no es válida.");
  const decision = parsed.data;

  let resultado: Resultado;
  try {
    resultado = await withRls(user.claims, async (tx): Promise<Resultado> => {
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
      if (!evento) return { ok: false, status: 404, mensaje: "No encontramos esta propuesta." };
      if (evento.tipo !== "propuesta_ia") {
        return { ok: false, status: 409, mensaje: "Este evento no es una propuesta de la IA. No se puede aprobar ni rechazar." };
      }
      if (evento.status !== "proposed") {
        return { ok: false, status: 409, mensaje: "Esta propuesta ya fue revisada. Recarga la página para ver su estado." };
      }

      const ahora = new Date();

      if (decision.accion === "rechazar") {
        await tx
          .update(profileEvents)
          .set({ status: "rejected", decidedBy: user.id, decidedAt: ahora })
          .where(eq(profileEvents.id, evento.id));
        return { ok: true, respuesta: { eventId: evento.id, status: "rejected", snapshotId: null, version: null } };
      }

      // --- aprobar ---
      const { aprobacion } = decision;
      if (aprobacion.cambios.length === 0 && aprobacion.senales.length === 0) {
        return { ok: false, status: 400, mensaje: "Selecciona al menos un cambio o una señal, o rechaza la propuesta." };
      }

      const payload = PayloadPropuestaIA.parse(evento.payload);
      try {
        validarIndices(payload.update, aprobacion);
      } catch {
        return { ok: false, status: 400, mensaje: "La selección no coincide con la propuesta. Recarga la página." };
      }
      // Una propuesta de la IA siempre viene de una sesión; si no, el dato está roto.
      if (!evento.sessionId) throw new Error(`profile_event ${evento.id} sin session_id`);

      const [ultimo] = await tx
        .select({ version: profileSnapshots.version, perfil: profileSnapshots.perfil })
        .from(profileSnapshots)
        .where(eq(profileSnapshots.engagementId, evento.engagementId))
        .orderBy(desc(profileSnapshots.version))
        .limit(1);

      const perfil = applyApproval(ultimo?.perfil ?? PERFIL_VACIO, payload.update, aprobacion, {
        sessionId: evento.sessionId,
        eventId: evento.id,
        now: ahora,
      });

      // La restricción única (engagement_id, version) evita dos snapshots con la misma versión.
      const [snapshot] = await tx
        .insert(profileSnapshots)
        .values({
          engagementId: evento.engagementId,
          version: (ultimo?.version ?? 0) + 1,
          perfil,
          sourceEventId: evento.id,
          createdBy: user.id,
        })
        .returning({ id: profileSnapshots.id, version: profileSnapshots.version });

      // Copia sin citas ni señales para la persona (ver persona_profiles en lib/db/schema.ts).
      await tx.insert(personaProfiles).values({
        snapshotId: snapshot.id,
        engagementId: evento.engagementId,
        version: snapshot.version,
        contenido: vistaPersona(perfil),
      });

      await tx
        .update(profileEvents)
        .set({ status: "approved", approvedPayload: aprobacion, decidedBy: user.id, decidedAt: ahora })
        .where(eq(profileEvents.id, evento.id));

      return {
        ok: true,
        respuesta: { eventId: evento.id, status: "approved", snapshotId: snapshot.id, version: snapshot.version },
      };
    });
  } catch (e) {
    if (esVersionDuplicada(e)) {
      return error(409, "Otra aprobación se guardó al mismo tiempo. Recarga la página y revisa de nuevo.");
    }
    logError("decision: error al guardar la decisión", e);
    return error(500, "No se pudo guardar la decisión. Intenta de nuevo.");
  }

  if (!resultado.ok) return error(resultado.status, resultado.mensaje);
  return Response.json(resultado.respuesta);
}
