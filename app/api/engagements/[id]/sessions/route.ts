// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// POST /api/engagements/[id]/sessions
// El coach envía su nota. Pasos:
//   1. tx1 (con RLS): lee el engagement, el nombre de pila de la persona y el último perfil;
//      guarda la sesión con la nota original. Si el engagement no tiene consentimiento
//      registrado, responde 409 sin guardar la nota ni llamar al modelo.
//   2. Fuera de cualquier transacción: llama al modelo (puede tardar varios segundos y no
//      queremos una conexión de base abierta mientras tanto).
//   3. tx2 (con RLS): limpia la propuesta (sanitizeUpdate), guarda el profile_event con
//      status "proposed" y registra la llamada en audit_log.
// Nada se aplica al perfil aquí: eso pasa cuando el coach aprueba (ruta de decisión).
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/ai/audit";
import { MODEL_ID } from "@/lib/ai/model";
import { proposeProfileUpdate } from "@/lib/ai/propose-profile-update";
import { ProposeRequest, type ApiError, type ProposeResponse } from "@/lib/api/contracts";
import { getUserWithRole } from "@/lib/auth";
import { logError, resumirError } from "@/lib/log";
import { withRls } from "@/lib/db/rls";
import { engagements, profileEvents, profileSnapshots, sessions, users } from "@/lib/db/schema";
import { PROMPT_VERSION } from "@/lib/prompts";
import { PayloadPropuestaIA, PERFIL_VACIO } from "@/lib/profile/schema";
import { sanitizeUpdate } from "@/lib/profile/validate";

const ACCION = "propose_profile_update";

// Marcador que devuelve tx1 cuando falta el consentimiento (no se insertó nada).
const SIN_CONSENTIMIENTO = "sin_consentimiento" as const;

const error = (status: number, mensaje: string) => Response.json({ error: mensaje } satisfies ApiError, { status });

export async function POST(req: Request, ctx: RouteContext<"/api/engagements/[id]/sessions">) {
  const user = await getUserWithRole("coach");
  if (!user) return error(401, "Necesitas iniciar sesión con una cuenta de coach.");

  const { id: engagementId } = await ctx.params;
  // Un id que no es UUID haría fallar a Postgres; se responde igual que "no existe".
  if (!z.uuid().safeParse(engagementId).success) return error(404, "No encontramos este acompañamiento.");

  const body = await req.json().catch(() => null);
  const parsed = ProposeRequest.safeParse(body);
  if (!parsed.success) return error(400, parsed.error.issues[0]?.message ?? "La nota no es válida.");
  const { nota } = parsed.data;

  // --- 1. tx1: leer contexto y guardar la sesión ----------------------------
  let contexto;
  try {
    contexto = await withRls(user.claims, async (tx) => {
      // RLS: si el coach no participa en este engagement, la consulta no devuelve filas.
      const [engagement] = await tx
        .select({
          id: engagements.id,
          type: engagements.type,
          personaId: engagements.personaId,
          consentimientoEn: engagements.consentimientoEn,
        })
        .from(engagements)
        .where(eq(engagements.id, engagementId))
        .limit(1);
      if (!engagement) return null;
      // Sin consentimiento no se guarda la nota ni se manda a la IA.
      if (!engagement.consentimientoEn) return SIN_CONSENTIMIENTO;

      const [persona] = await tx
        .select({ nombrePila: users.nombrePila })
        .from(users)
        .where(eq(users.id, engagement.personaId))
        .limit(1);

      const [snapshot] = await tx
        .select({ perfil: profileSnapshots.perfil })
        .from(profileSnapshots)
        .where(eq(profileSnapshots.engagementId, engagementId))
        .orderBy(desc(profileSnapshots.version))
        .limit(1);

      const [sesion] = await tx
        .insert(sessions)
        .values({ engagementId, coachId: user.id, notaOriginal: nota })
        .returning({ id: sessions.id });

      return {
        engagementType: engagement.type,
        // Si por alguna razón no se puede leer el nombre, el prompt usa un genérico.
        nombrePila: persona?.nombrePila ?? "la persona",
        perfilPrevio: snapshot?.perfil ?? PERFIL_VACIO,
        sessionId: sesion.id,
      };
    });
  } catch (e) {
    logError("sessions: error al guardar la sesión", e);
    return error(500, "No se pudo guardar la nota. Intenta de nuevo.");
  }
  if (!contexto) return error(404, "No encontramos este acompañamiento.");
  if (contexto === SIN_CONSENTIMIENTO) {
    return error(409, "Falta registrar el consentimiento de la persona. No se guardó la nota ni se envió a la IA.");
  }

  // --- 2. Llamada al modelo, fuera de la transacción -------------------------
  const inicio = Date.now();
  let resultado;
  try {
    resultado = await proposeProfileUpdate({
      nota,
      nombrePila: contexto.nombrePila,
      engagementType: contexto.engagementType,
      perfilPrevio: contexto.perfilPrevio,
    });
  } catch (e) {
    logError("sessions: error del modelo", e);
    try {
      await withRls(user.claims, (tx) =>
        registrarAuditoria(tx, {
          userId: user.id,
          engagementId,
          accion: ACCION,
          modelo: MODEL_ID,
          promptVersion: PROMPT_VERSION,
          latenciaMs: Date.now() - inicio,
          ok: false,
          // Resumen sin datos personales (ver lib/log.ts), no el message completo.
          error: resumirError(e),
        }),
      );
    } catch (auditError) {
      // Si tampoco se puede auditar, se registra en el log del servidor y se sigue.
      logError("sessions: no se pudo escribir audit_log", auditError);
    }
    return error(502, "No se pudo generar la propuesta. La nota quedó guardada; intenta de nuevo.");
  }

  // --- 3. tx2: limpiar la propuesta y guardarla ------------------------------
  const { update, descartados, banderas } = sanitizeUpdate(resultado.update, nota);
  // Validación final antes de escribir: si algo no cumple el contrato, falla aquí y no en la UI.
  const payload = PayloadPropuestaIA.parse({ tipo: "propuesta_ia", update, descartados, banderas });

  let eventId: string;
  try {
    eventId = await withRls(user.claims, async (tx) => {
      const [evento] = await tx
        .insert(profileEvents)
        .values({
          engagementId,
          sessionId: contexto.sessionId,
          tipo: "propuesta_ia",
          status: "proposed",
          payload,
          promptVersion: resultado.promptVersion,
          model: resultado.modelo,
          createdBy: user.id,
        })
        .returning({ id: profileEvents.id });

      await registrarAuditoria(tx, {
        userId: user.id,
        engagementId,
        accion: ACCION,
        modelo: resultado.modelo,
        promptVersion: resultado.promptVersion,
        tokensEntrada: resultado.usage.entrada,
        tokensSalida: resultado.usage.salida,
        tokensCacheLectura: resultado.usage.cacheLectura,
        latenciaMs: resultado.latenciaMs,
        ok: true,
      });

      return evento.id;
    });
  } catch (e) {
    logError("sessions: error al guardar la propuesta", e);
    return error(500, "No se pudo guardar la propuesta. La nota quedó guardada; intenta de nuevo.");
  }

  const respuesta: ProposeResponse = {
    sessionId: contexto.sessionId,
    eventId,
    propuesta: update,
    descartados,
    banderas,
    promptVersion: resultado.promptVersion,
    modelo: resultado.modelo,
  };
  return Response.json(respuesta);
}
