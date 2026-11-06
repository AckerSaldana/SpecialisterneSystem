// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Lo que el coach hace sobre señales, alertas y contexto guardado (spec 004, tarea 18).
// Nada de esto crea snapshots ni cambia la versión del perfil (R-004.13). La app no avisa a nadie:
// el coach pasa la alerta fuera del sistema y registra que lo hizo (R-004.16, R-004.42).
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { CambiarAlertaRequest, CerrarSenalRequest, CrearAlertaRequest } from "@/lib/api/contracts";
import { conError, type RespuestaRuta, type UsuarioRuta } from "@/lib/api/ruta";
import { exigirConsentimiento } from "@/lib/consent";
import { withRls, type Tx } from "@/lib/db/rls";
import { engagements, followupContext, signalStates, strongAlerts } from "@/lib/db/schema";
import { leerEstadosSenales, leerUltimoSnapshot } from "@/lib/followup/lectura";
import { logError } from "@/lib/log";
import { violaUnico } from "@/lib/plan/server";
import { PERFIL_VACIO, TipoSenal, type SenalActiva } from "@/lib/profile/schema";
import { senalesVigentes } from "@/lib/profile/senales";

const MENSAJES = {
  sinAcompanamiento: "No encontramos este acompañamiento.",
  sinConsentimiento: "La persona no tiene consentimiento vigente. No se guardó nada.",
  sinSenal: "Esta señal no está activa. Recarga la página.",
  alertaVigente: "Esta señal ya tiene una alerta sin atender.",
  sinAlerta: "No encontramos esta alerta.",
  alertaOrden: "Esta alerta ya cambió de estado. Recarga la página.",
  sinContexto: "No encontramos este punto, o ya lo quitaste. Recarga la página.",
  errorGuardar: "No se pudo guardar el cambio. Intenta de nuevo.",
  noValido: "Revisa lo que escribiste. No se guardó nada.",
} as const;

// Una nota vacía no es una nota.
const textoONulo = (texto: string | undefined) => (texto ? texto : null);

// Primero el acompañamiento (404) y el consentimiento (409), igual que el reintento. Con el
// consentimiento retirado RLS ocultaría las señales y la respuesta diría algo que no es.
async function revisarAcompanamiento(tx: Tx, engagementId: string): Promise<RespuestaRuta | null> {
  const [engagement] = await tx
    .select({ id: engagements.id })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement) return conError(404, MENSAJES.sinAcompanamiento);
  if (!(await exigirConsentimiento(tx, engagementId))) return conError(409, MENSAJES.sinConsentimiento);
  return null;
}

async function senalVigente(tx: Tx, engagementId: string, tipo: TipoSenal): Promise<SenalActiva | null> {
  const ultimo = await leerUltimoSnapshot(tx, engagementId);
  const vigentes = senalesVigentes(ultimo?.perfil ?? PERFIL_VACIO, await leerEstadosSenales(tx, engagementId));
  return vigentes.find((s) => s.tipo === tipo) ?? null;
}

// POST /api/engagements/[id]/signals/[tipo]/close (R-004.13)
export async function cerrarSenal(user: UsuarioRuta, engagementId: string, tipoCrudo: string, body: unknown): Promise<RespuestaRuta> {
  const tipo = TipoSenal.safeParse(tipoCrudo);
  if (!tipo.success) return conError(404, MENSAJES.sinSenal);
  const parsed = CerrarSenalRequest.safeParse(body ?? {});
  if (!parsed.success) return conError(400, MENSAJES.noValido);

  try {
    return await withRls(user.claims, async (tx): Promise<RespuestaRuta> => {
      const problema = await revisarAcompanamiento(tx, engagementId);
      if (problema) return problema;
      if (!(await senalVigente(tx, engagementId, tipo.data))) return conError(409, MENSAJES.sinSenal);
      await tx.insert(signalStates).values({
        engagementId,
        tipo: tipo.data,
        estado: "cerrada",
        motivo: textoONulo(parsed.data.motivo),
        createdBy: user.id,
      });
      return { status: 200, cuerpo: { ok: true } };
    });
  } catch (e) {
    logError("signals: error al cerrar la señal", e);
    return conError(500, MENSAJES.errorGuardar);
  }
}

// POST /api/engagements/[id]/alerts (R-004.15, R-004.16)
export async function crearAlerta(user: UsuarioRuta, engagementId: string, body: unknown): Promise<RespuestaRuta> {
  const parsed = CrearAlertaRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES.noValido);

  try {
    return await withRls(user.claims, async (tx): Promise<RespuestaRuta> => {
      const problema = await revisarAcompanamiento(tx, engagementId);
      if (problema) return problema;
      // Solo desde una señal aprobada y activa. event_id es el evento de esa señal.
      const senal = await senalVigente(tx, engagementId, parsed.data.tipoSenal);
      if (!senal) return conError(409, MENSAJES.sinSenal);
      const [alerta] = await tx
        .insert(strongAlerts)
        .values({
          engagementId,
          tipoSenal: parsed.data.tipoSenal,
          eventId: senal.eventoId,
          marcadaPor: user.id,
          nota: textoONulo(parsed.data.nota),
        })
        .returning({ id: strongAlerts.id });
      return { status: 200, cuerpo: { id: alerta.id } };
    });
  } catch (e) {
    if (violaUnico(e, "strong_alerts_una_vigente")) return conError(409, MENSAJES.alertaVigente);
    logError("alerts: error al crear la alerta", e);
    return conError(500, MENSAJES.errorGuardar);
  }
}

// PATCH /api/alerts/[id] (R-004.42). Solo avanza de abierta a escalada a atendida, y la fecha la
// pone el servidor. "for update": dos pestañas no pisan el mismo cambio.
export async function cambiarAlerta(user: UsuarioRuta, alertaId: string, body: unknown): Promise<RespuestaRuta> {
  const parsed = CambiarAlertaRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES.noValido);
  const { estado, notaEscalada } = parsed.data;

  try {
    return await withRls(user.claims, async (tx): Promise<RespuestaRuta> => {
      const [alerta] = await tx
        .select({ id: strongAlerts.id, estado: strongAlerts.estado })
        .from(strongAlerts)
        .where(eq(strongAlerts.id, alertaId))
        .limit(1)
        .for("update");
      if (!alerta) return conError(404, MENSAJES.sinAlerta);

      const ahora = new Date();
      if (estado === "escalada" && alerta.estado === "abierta") {
        await tx
          .update(strongAlerts)
          .set({ estado, notaEscalada: textoONulo(notaEscalada), escaladaEn: ahora })
          .where(eq(strongAlerts.id, alertaId));
      } else if (estado === "atendida" && alerta.estado === "escalada") {
        await tx.update(strongAlerts).set({ estado, atendidaEn: ahora }).where(eq(strongAlerts.id, alertaId));
      } else {
        return conError(409, MENSAJES.alertaOrden);
      }
      return { status: 200, cuerpo: { ok: true } };
    });
  } catch (e) {
    logError("alerts: error al cambiar la alerta", e);
    return conError(500, MENSAJES.errorGuardar);
  }
}

// PATCH /api/followup-context/[id] (R-004.23). Marca, no borra: queda en el historial.
export async function quitarContexto(user: UsuarioRuta, contextoId: string): Promise<RespuestaRuta> {
  try {
    return await withRls(user.claims, async (tx): Promise<RespuestaRuta> => {
      const filas = await tx
        .update(followupContext)
        .set({ quitadaPor: user.id, quitadaEn: new Date() })
        .where(and(eq(followupContext.id, contextoId), isNull(followupContext.quitadaEn)))
        .returning({ id: followupContext.id });
      if (filas.length === 0) return conError(404, MENSAJES.sinContexto);
      return { status: 200, cuerpo: { ok: true } };
    });
  } catch (e) {
    logError("followup-context: error al quitar", e);
    return conError(500, MENSAJES.errorGuardar);
  }
}

