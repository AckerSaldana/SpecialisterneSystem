// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Marcar pasos, "Ya no la uso", "Ya lo revisé" y decidir ajustes (spec 010, R-010.26 a R-010.29, R-010.33, R-010.38). Solo la persona marca: cada
// marca es una fila nueva, y la base rechaza cualquier otra escritura (R-010.51). Una marca, también "Me atoré aquí", no
// pasa por el modelo y no genera señales ni alertas: no toca ninguna otra tabla (R-010.10, R-010.31). Estas revisiones
// dan el texto correcto; lo que decide es la política, con private.app_paso_marcable. No importa lib/auth, así un script
// las prueba con cuentas sintéticas (lib/api/ruta.ts).
import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ArchivarDesgloseRequest, DecidirAjustesRequest, MarcarPasoRequest, RevisarMarcaRequest, type MarcarPasoResponse, type RevisarMarcaResponse } from "@/lib/api/contracts";
import { conError, type RespuestaRuta, type UsuarioRuta } from "@/lib/api/ruta";
import { DECIDE_AJUSTES, DEMASIADOS_PASOS, errorAjuste, SIN_CONSENTIMIENTO, TAREA_YA_NO_DISPONIBLE, YA_DECIDISTE } from "@/components/persona/desglose/textos";
import { exigirConsentimiento } from "@/lib/consent";
import { withRls } from "@/lib/db/rls";
import { taskBreakdowns, taskStepEvents } from "@/lib/db/schema";
import { aplicarAjustes, textosDelPedido } from "@/lib/desglose/ajustes";
import { miAcompanamiento } from "@/lib/engagements/persona";
import { logError } from "@/lib/log";

// Sin texto en la spec, salvo los que vienen de components/persona/desglose/textos.ts.
export const MENSAJES_MARCAS = {
  marcaInvalida: "Esta marca no es válida. Lo que escribas puede tener hasta 1000 caracteres.",
  archivarInvalido: "No se pudo leer lo que pediste. Intenta de nuevo.",
  sinTarea: "No encontramos esta tarea.",
  sinPaso: "No encontramos este paso.",
  sinConsentimiento: SIN_CONSENTIMIENTO,
  decideAjustes: DECIDE_AJUSTES,
  yaNoDisponible: TAREA_YA_NO_DISPONIBLE,
  errorGuardar: "No se pudo guardar. Intenta de nuevo.",
  revisarInvalido: "No se pudo leer lo que pediste. Intenta de nuevo.",
  sinMarca: "No encontramos esta marca.",
  yaRevisada: "Esta marca ya está revisada.",
  decidirInvalido: "No se pudo leer lo que elegiste. Intenta de nuevo.",
  yaDecidiste: YA_DECIDISTE,
} as const;

const incluyePaso = (pasos: readonly { id: string }[], pasoId: string) => pasos.some((p) => p.id === pasoId);

// POST /api/task-breakdowns/[id]/steps/[pasoId]/events. Sin texto, "Me atoré aquí" se guarda con texto nulo (R-010.28).
export async function marcarPaso(user: UsuarioRuta, breakdownId: string, pasoId: string, body: unknown): Promise<RespuestaRuta> {
  const parsed = MarcarPasoRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES_MARCAS.marcaInvalida);
  const pedido = parsed.data;
  const texto = pedido.estado === "atorado" && pedido.texto ? pedido.texto : null;

  try {
    return await withRls(user.claims, async (tx) => {
      // Su único acompañamiento (R-002.4). La persona no tiene SELECT sobre app.engagements (R-002.40).
      const mio = await miAcompanamiento(tx);
      if (!mio) return conError(404, MENSAJES_MARCAS.sinTarea);
      if (!(await exigirConsentimiento(tx, mio.id))) return conError(409, MENSAJES_MARCAS.sinConsentimiento);

      const [desglose] = await tx
        .select({ pasos: taskBreakdowns.pasos, archivadoEn: taskBreakdowns.archivadoEn, ajustes: taskBreakdowns.ajustes, ajustesDecididosEn: taskBreakdowns.ajustesDecididosEn })
        .from(taskBreakdowns)
        .where(and(eq(taskBreakdowns.id, breakdownId), eq(taskBreakdowns.engagementId, mio.id)))
        .limit(1);
      if (!desglose) return conError(404, MENSAJES_MARCAS.sinTarea);
      if (desglose.archivadoEn) return conError(409, MENSAJES_MARCAS.yaNoDisponible); // R-010.29
      if (desglose.ajustes && !desglose.ajustesDecididosEn) return conError(409, MENSAJES_MARCAS.decideAjustes); // R-010.38
      if (!incluyePaso(desglose.pasos, pasoId)) return conError(404, MENSAJES_MARCAS.sinPaso);

      const [marca] = await tx
        .insert(taskStepEvents)
        .values({ engagementId: mio.id, breakdownId, pasoId, estado: pedido.estado, texto, creadoPor: user.id })
        .returning({ id: taskStepEvents.id });
      return { status: 201, cuerpo: { marcaId: marca.id } satisfies MarcarPasoResponse };
    });
  } catch (e) {
    logError("task_step_events: error al guardar", e);
    return conError(500, MENSAJES_MARCAS.errorGuardar);
  }
}

// PATCH /api/task-breakdowns/[id]. "Ya no la uso": la persona o el coach, con RLS. No se borra y el coach lo sigue
// viendo (R-010.29). Solo escribe las dos columnas que tienen grant.
export async function archivarDesglose(user: UsuarioRuta, breakdownId: string, body: unknown): Promise<RespuestaRuta> {
  const parsed = ArchivarDesgloseRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES_MARCAS.archivarInvalido);

  try {
    return await withRls(user.claims, async (tx) => {
      const archivado = await tx
        .update(taskBreakdowns)
        .set({ archivadoPor: user.id, archivadoEn: new Date() })
        .where(and(eq(taskBreakdowns.id, breakdownId), isNull(taskBreakdowns.archivadoEn)))
        .returning({ id: taskBreakdowns.id });
      if (archivado.length > 0) return { status: 200, cuerpo: {} };

      // RLS oculta la fila ajena y la fila sin consentimiento vigente. Lo demás ya estaba archivado.
      const [existe] = await tx.select({ id: taskBreakdowns.id }).from(taskBreakdowns).where(eq(taskBreakdowns.id, breakdownId)).limit(1);
      return existe ? conError(409, MENSAJES_MARCAS.yaNoDisponible) : conError(404, MENSAJES_MARCAS.sinTarea);
    });
  } catch (e) {
    logError("task_breakdowns: error al archivar", e);
    return conError(500, MENSAJES_MARCAS.errorGuardar);
  }
}

// PATCH /api/task-step-events/[id]. "Ya lo revisé": solo el coach, con RLS, y solo las dos columnas que tienen grant. No
// borra nada: la marca sale del panel y sigue en el detalle (R-010.33).
export async function revisarMarca(user: UsuarioRuta, marcaId: number, body: unknown): Promise<RespuestaRuta> {
  const parsed = RevisarMarcaRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES_MARCAS.revisarInvalido);

  try {
    return await withRls(user.claims, async (tx) => {
      const revisada = await tx
        .update(taskStepEvents)
        .set({ revisadoPor: user.id, revisadoEn: new Date() })
        .where(and(eq(taskStepEvents.id, marcaId), eq(taskStepEvents.estado, "atorado"), isNull(taskStepEvents.revisadoEn)))
        .returning({ id: taskStepEvents.id });
      if (revisada.length > 0) return { status: 200, cuerpo: { marcaId } satisfies RevisarMarcaResponse };

      // RLS oculta la marca ajena y la marca sin consentimiento vigente.
      const [existe] = await tx.select({ revisadoEn: taskStepEvents.revisadoEn }).from(taskStepEvents).where(eq(taskStepEvents.id, marcaId)).limit(1);
      return existe?.revisadoEn ? conError(409, MENSAJES_MARCAS.yaRevisada) : conError(404, MENSAJES_MARCAS.sinMarca);
    });
  } catch (e) {
    logError("task_step_events: error al revisar", e);
    return conError(500, MENSAJES_MARCAS.errorGuardar);
  }
}

// POST /api/task-breakdowns/[id]/ajustes. La persona guarda su elección una sola vez. aplicarAjustes arma los pasos con
// código y la escritura va por private.app_decidir_ajustes, porque ella no tiene permiso de UPDATE sobre pasos (R-010.38,
// R-010.51). Si un ajuste elegido ya no sirve responde 400, no cambia nada y puede quitarlo de su elección. Elegir cero
// ajustes no puede fallar por validación, y es lo que la deja marcar pasos.
export async function decidirAjustes(user: UsuarioRuta, breakdownId: string, body: unknown): Promise<RespuestaRuta> {
  const parsed = DecidirAjustesRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES_MARCAS.decidirInvalido);

  try {
    return await withRls(user.claims, async (tx) => {
      const mio = await miAcompanamiento(tx);
      if (!mio) return conError(404, MENSAJES_MARCAS.sinTarea);
      if (!(await exigirConsentimiento(tx, mio.id))) return conError(409, MENSAJES_MARCAS.sinConsentimiento);

      const [desglose] = await tx
        .select({
          tarea: taskBreakdowns.tareaOriginal,
          contexto: taskBreakdowns.contexto,
          pasos: taskBreakdowns.pasos,
          ajustes: taskBreakdowns.ajustes,
          ajustesDecididosEn: taskBreakdowns.ajustesDecididosEn,
          archivadoEn: taskBreakdowns.archivadoEn,
        })
        .from(taskBreakdowns)
        .where(and(eq(taskBreakdowns.id, breakdownId), eq(taskBreakdowns.engagementId, mio.id)))
        .limit(1);
      if (!desglose) return conError(404, MENSAJES_MARCAS.sinTarea);
      if (desglose.archivadoEn) return conError(409, MENSAJES_MARCAS.yaNoDisponible);
      if (!desglose.ajustes || desglose.ajustesDecididosEn) return conError(409, MENSAJES_MARCAS.yaDecidiste);

      const resultado = aplicarAjustes(desglose.pasos, desglose.ajustes, parsed.data.aceptados, { textoPersona: textosDelPedido(desglose.tarea, desglose.contexto) });
      if (resultado.estado === "no_existe") return conError(400, MENSAJES_MARCAS.decidirInvalido);
      if (resultado.estado === "no_valido") return conError(400, errorAjuste(resultado.numero));
      if (resultado.estado === "demasiados") return conError(400, DEMASIADOS_PASOS);

      // El parámetro va como texto y Postgres lo convierte: con un parámetro jsonb, el driver guardaría un texto y no un
      // arreglo, y la función no escribiría (jsonb_typeof).
      const filas = await tx.execute(
        sql`select private.app_decidir_ajustes(${breakdownId}::uuid, ${JSON.stringify(resultado.pasos)}::text::jsonb, ${JSON.stringify(resultado.aceptados)}::text::jsonb) as escribio`,
      );
      const [fila] = [...filas] as { escribio: boolean }[];
      return fila?.escribio ? { status: 200, cuerpo: {} } : conError(409, MENSAJES_MARCAS.yaDecidiste);
    });
  } catch (e) {
    logError("task_breakdowns: error al decidir ajustes", e);
    return conError(500, MENSAJES_MARCAS.errorGuardar);
  }
}
