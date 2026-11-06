// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Lo que decide la persona sobre su guía (spec 009, R-009.20 a R-009.32, R-009.38): decisiones por línea,
// líneas propias, nombre, "Listo", retirar, descartar y "Hacer cambios". Cada acción abre una transacción con
// RLS, exige consentimiento (R-009.52) y lee la fila con for update, como leerPlanBloqueado: dos "Listo" a la
// vez no crean dos versiones, porque el segundo espera y ya la ve lista (R-009.29). Las transiciones también
// las hace cumplir el trigger private.app_shared_guide_transicion (R-009.56).
//
// Nada de aquí llama al modelo ni cuenta para el límite (R-009.17), y nada cambia el perfil, el plan, las
// señales o la etapa (R-009.19). Lo que escribe la persona pasa por revisarTextoPropio, que no busca citas
// (R-009.25). Los errores van al log solo con clase y código: el texto de la persona nunca se registra.
// No importa lib/auth, así un script la prueba con cuentas sintéticas (lib/api/ruta.ts).
import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { conError, type RespuestaRuta, type UsuarioRuta } from "@/lib/api/ruta";
import { TEXTO_SIN_LINEAS, TEXTO_TOPE, textoFaltaDecidir } from "@/components/persona/guia/textos";
import { exigirConsentimiento } from "@/lib/consent";
import { withRls, type Tx } from "@/lib/db/rls";
import { sharedGuides } from "@/lib/db/schema";
import { miAcompanamiento } from "@/lib/engagements/persona";
import { aplicarAccion } from "@/lib/guia/decidir";
import { armarDocumento } from "@/lib/guia/documento";
import { bloquearVersiones, MENSAJES_GUIA } from "@/lib/guia/generar";
import {
  AccionLineaRequest,
  AgregarLineaRequest,
  DescartesGuia,
  huellaDeGuia,
  LineaGuia,
  ListoRequest,
  MAX_LINEAS_INCLUIDAS,
  NombreGuiaRequest,
  vistaDeGuia,
  type EstadoGuia,
} from "@/lib/guia/schema";
import { mensajeDeBloqueoDe } from "@/lib/guia/terminos";
import { logError } from "@/lib/log";
import { violaUnico } from "@/lib/plan/server";

// Textos de la spec 009, "Pantallas y textos". Los que no tienen texto ahí siguen el mismo tono.
export const MENSAJES_ACCIONES = {
  tope: TEXTO_TOPE,
  faltaDecidir: textoFaltaDecidir,
  sinLineas: TEXTO_SIN_LINEAS,
  // Sin texto en la spec.
  invalido: "El pedido no es válido. Recarga la página.",
  sinGuia: "No encontramos esta hoja.",
  sinLinea: "No encontramos esta línea. Recarga la página.",
  noAplica: "Esa acción ya no aplica a esta línea. Recarga la página.",
  noEstaLista: "Esta versión ya no está lista. Vuelve a abrir la página para verla.",
  noEsLaUltima: "Hay una versión más reciente de esta hoja. Vuelve a abrir la página.",
  borradorCambio: "Este borrador cambió en otra pestaña o ventana. No se marcó como lista. Recarga la página y revísalo otra vez.",
  errorGuardar: "No se pudo guardar el cambio. Intenta de nuevo.",
} as const;

const LineasGuardadas = z.array(LineaGuia);

const EN_LA_HOJA: readonly LineaGuia["estado"][] = ["incluida", "editada", "propia"];
const enLaHoja = (l: LineaGuia) => EN_LA_HOJA.includes(l.estado);
const contarEnLaHoja = (lineas: LineaGuia[]) => lineas.filter(enLaHoja).length;
const sinDecidir = (l: LineaGuia) => l.estado === "pendiente" || l.cambio?.decision === "pendiente";

type GuiaLeida = {
  id: string;
  engagementId: string;
  estado: EstadoGuia;
  version: number | null;
  nombreAMostrar: string;
  lineas: LineaGuia[];
  descartes: DescartesGuia;
};

const respuestaGuia = (g: GuiaLeida, status = 200): RespuestaRuta => ({ status, cuerpo: { guia: vistaDeGuia(g) } });

// Lo común: su acompañamiento (404), consentimiento (409) y la fila bloqueada (404). Un borrador descartado ya
// no existe para ella (R-009.31). RLS deja fuera la guía de otra persona.
async function conGuia(user: UsuarioRuta, guiaId: string, contexto: string, accion: (tx: Tx, guia: GuiaLeida) => Promise<RespuestaRuta>): Promise<RespuestaRuta> {
  try {
    return await withRls(user.claims, async (tx): Promise<RespuestaRuta> => {
      const engagement = await miAcompanamiento(tx);
      if (!engagement) return conError(404, MENSAJES_GUIA.sinAcompanamiento);
      if (!(await exigirConsentimiento(tx, engagement.id))) return conError(409, MENSAJES_GUIA.personaSinConsentimiento);

      const [fila] = await tx
        .select({
          id: sharedGuides.id,
          engagementId: sharedGuides.engagementId,
          estado: sharedGuides.estado,
          version: sharedGuides.version,
          nombreAMostrar: sharedGuides.nombreAMostrar,
          lineas: sharedGuides.lineas,
          descartes: sharedGuides.descartes,
        })
        .from(sharedGuides)
        .where(and(eq(sharedGuides.id, guiaId), eq(sharedGuides.engagementId, engagement.id)))
        .limit(1)
        .for("update");
      if (!fila || fila.estado === "descartada") return conError(404, MENSAJES_ACCIONES.sinGuia);

      return accion(tx, { ...fila, lineas: LineasGuardadas.parse(fila.lineas), descartes: DescartesGuia.parse(fila.descartes) });
    });
  } catch (e) {
    logError(`shared-guides: ${contexto}`, e);
    return conError(500, MENSAJES_ACCIONES.errorGuardar);
  }
}

function conBorrador(user: UsuarioRuta, guiaId: string, contexto: string, accion: (tx: Tx, guia: GuiaLeida) => Promise<RespuestaRuta>): Promise<RespuestaRuta> {
  return conGuia(user, guiaId, contexto, (tx, guia) => (guia.estado === "borrador" ? accion(tx, guia) : Promise.resolve(conError(409, MENSAJES_GUIA.yaEstaLista))));
}

// R-009.24: bloquea con el texto literal. Ninguna confirmación lo salta.
function bloqueoDe(texto: string, sujeto?: "Este nombre"): RespuestaRuta | null {
  const mensaje = mensajeDeBloqueoDe(texto, sujeto);
  return mensaje === null ? null : conError(400, mensaje);
}

async function guardarLineas(tx: Tx, guia: GuiaLeida, lineas: LineaGuia[], status = 200): Promise<RespuestaRuta> {
  const validas = LineasGuardadas.parse(lineas);
  await tx.update(sharedGuides).set({ lineas: validas }).where(eq(sharedGuides.id, guia.id));
  return respuestaGuia({ ...guia, lineas: validas }, status);
}

// ---------------------------------------------------------------------------
// Decisiones por línea
// ---------------------------------------------------------------------------

// PATCH /api/persona/shared-guides/[id]/lineas/[lineaId]
export async function decidirLinea(user: UsuarioRuta, guiaId: string, lineaId: string, body: unknown): Promise<RespuestaRuta> {
  const parsed = AccionLineaRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES_ACCIONES.invalido);
  const pedido = parsed.data;

  if (pedido.accion === "editar") {
    const bloqueo = bloqueoDe(pedido.texto);
    if (bloqueo) return bloqueo;
  }

  return conBorrador(user, guiaId, "decidir línea", async (tx, guia) => {
    const linea = guia.lineas.find((l) => l.id === lineaId);
    if (!linea) return conError(404, MENSAJES_ACCIONES.sinLinea);

    const nueva = aplicarAccion(linea, pedido);
    if (!nueva) return conError(400, MENSAJES_ACCIONES.noAplica);

    const lineas = guia.lineas.map((l) => (l.id === lineaId ? nueva : l));
    // R-009.20: ninguna acción deja más de 20. Bajar de un exceso siempre se puede.
    const antes = contarEnLaHoja(guia.lineas);
    const despues = contarEnLaHoja(lineas);
    if (despues > MAX_LINEAS_INCLUIDAS && despues > antes) return conError(400, MENSAJES_ACCIONES.tope);

    return guardarLineas(tx, guia, lineas);
  });
}

// POST /api/persona/shared-guides/[id]/lineas (R-009.23)
export async function agregarLinea(user: UsuarioRuta, guiaId: string, body: unknown): Promise<RespuestaRuta> {
  const parsed = AgregarLineaRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES_ACCIONES.invalido);
  const { seccion, texto } = parsed.data;

  const bloqueo = bloqueoDe(texto);
  if (bloqueo) return bloqueo;

  return conBorrador(user, guiaId, "agregar línea", async (tx, guia) => {
    if (contarEnLaHoja(guia.lineas) >= MAX_LINEAS_INCLUIDAS) return conError(400, MENSAJES_ACCIONES.tope);
    const ordenes = guia.lineas.filter((l) => l.seccion === seccion).map((l) => l.orden);
    const nueva: LineaGuia = {
      id: randomUUID(),
      seccion,
      texto,
      estado: "propia",
      textoIa: null,
      origenes: [],
      orden: ordenes.length ? Math.max(...ordenes) + 1 : 0,
      lineaAnteriorId: null,
      cambio: null,
    };
    return guardarLineas(tx, guia, [...guia.lineas, nueva], 201);
  });
}

// DELETE /api/persona/shared-guides/[id]/lineas/[lineaId]. Se elimina del JSON y no queda rastro: el coach
// nunca la ve (R-009.23). Solo una línea propia: las de la IA se quitan, y se pueden regresar.
export async function borrarLineaPropia(user: UsuarioRuta, guiaId: string, lineaId: string): Promise<RespuestaRuta> {
  return conBorrador(user, guiaId, "borrar línea", async (tx, guia) => {
    const linea = guia.lineas.find((l) => l.id === lineaId);
    if (!linea) return conError(404, MENSAJES_ACCIONES.sinLinea);
    if (linea.estado !== "propia") return conError(400, MENSAJES_ACCIONES.noAplica);
    return guardarLineas(tx, guia, guia.lineas.filter((l) => l.id !== lineaId));
  });
}

// PATCH /api/persona/shared-guides/[id] (R-009.26)
export async function cambiarNombre(user: UsuarioRuta, guiaId: string, body: unknown): Promise<RespuestaRuta> {
  const parsed = NombreGuiaRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES_ACCIONES.invalido);
  const { nombreAMostrar } = parsed.data;

  const bloqueo = bloqueoDe(nombreAMostrar, "Este nombre");
  if (bloqueo) return bloqueo;

  return conBorrador(user, guiaId, "cambiar nombre", async (tx, guia) => {
    await tx.update(sharedGuides).set({ nombreAMostrar }).where(eq(sharedGuides.id, guia.id));
    return respuestaGuia({ ...guia, nombreAMostrar });
  });
}

// ---------------------------------------------------------------------------
// "Listo", retirar, descartar y "Hacer cambios"
// ---------------------------------------------------------------------------

// POST /api/persona/shared-guides/[id]/listo (R-009.28, R-009.29). Repite lo que la pantalla ya revisa. El cuerpo trae la
// huella de lo que la pantalla mostró: si la fila ya no es eso, por otra pestaña, no se congela algo que ella no vio.
export async function marcarLista(user: UsuarioRuta, guiaId: string, body: unknown): Promise<RespuestaRuta> {
  const parsed = ListoRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES_ACCIONES.invalido);

  return conBorrador(user, guiaId, "marcar lista", async (tx, guia) => {
    if (huellaDeGuia(guia) !== parsed.data.huella) return conError(409, MENSAJES_ACCIONES.borradorCambio);

    // Una versión a la vez: un pedido que está por guardarse ya no puede partir de una base vieja (R-009.18).
    await bloquearVersiones(tx, guia.engagementId);

    const faltan = guia.lineas.filter(sinDecidir).length;
    if (faltan > 0) return conError(400, MENSAJES_ACCIONES.faltaDecidir(faltan));

    const entran = guia.lineas.filter(enLaHoja);
    if (entran.length === 0) return conError(400, MENSAJES_ACCIONES.sinLineas);
    if (entran.length > MAX_LINEAS_INCLUIDAS) return conError(400, MENSAJES_ACCIONES.tope);

    // R-009.29: lo que entra se vuelve a revisar, porque aquí se congela.
    for (const l of entran) {
      const bloqueo = bloqueoDe(l.texto);
      if (bloqueo) return bloqueo;
    }
    const bloqueoNombre = bloqueoDe(guia.nombreAMostrar, "Este nombre");
    if (bloqueoNombre) return bloqueoNombre;

    const [ultima] = await tx
      .select({ version: sharedGuides.version })
      .from(sharedGuides)
      .where(and(eq(sharedGuides.engagementId, guia.engagementId), isNotNull(sharedGuides.version)))
      .orderBy(desc(sharedGuides.version))
      .limit(1);
    const version = (ultima?.version ?? 0) + 1;
    const documento = armarDocumento(guia.lineas, guia.nombreAMostrar);

    // Solo estas tres columnas: la base pone aprobada_por_persona_en, y el trigger rechaza cualquier otra.
    await tx.update(sharedGuides).set({ estado: "lista", version, documento }).where(eq(sharedGuides.id, guia.id));
    return respuestaGuia({ ...guia, estado: "lista", version });
  });
}

// POST /api/persona/shared-guides/[id]/retirar (R-009.38)
export async function retirarVersion(user: UsuarioRuta, guiaId: string): Promise<RespuestaRuta> {
  return conGuia(user, guiaId, "retirar", async (tx, guia) => {
    if (guia.estado !== "lista") return conError(409, MENSAJES_ACCIONES.noEstaLista);
    await tx.update(sharedGuides).set({ estado: "retirada" }).where(eq(sharedGuides.id, guia.id));
    return respuestaGuia({ ...guia, estado: "retirada" });
  });
}

// POST /api/persona/shared-guides/[id]/descartar (R-009.31, R-009.49)
export async function descartarBorrador(user: UsuarioRuta, guiaId: string): Promise<RespuestaRuta> {
  return conBorrador(user, guiaId, "descartar", async (tx, guia) => {
    await tx.update(sharedGuides).set({ estado: "descartada" }).where(eq(sharedGuides.id, guia.id));
    return respuestaGuia({ ...guia, estado: "descartada" });
  });
}

// POST /api/persona/shared-guides/[id]/copiar: "Hacer cambios" (R-009.32). Un borrador desde la última
// versión, sin llamar al modelo y sin contar para el límite. Las líneas conservan su estado.
export async function copiarVersion(user: UsuarioRuta, guiaId: string): Promise<RespuestaRuta> {
  try {
    return await withRls(user.claims, async (tx): Promise<RespuestaRuta> => {
      const engagement = await miAcompanamiento(tx);
      if (!engagement) return conError(404, MENSAJES_GUIA.sinAcompanamiento);
      if (!(await exigirConsentimiento(tx, engagement.id))) return conError(409, MENSAJES_GUIA.personaSinConsentimiento);

      const [base] = await tx
        .select({
          version: sharedGuides.version,
          nombreAMostrar: sharedGuides.nombreAMostrar,
          lineas: sharedGuides.lineas,
          generadaDesdeSnapshotId: sharedGuides.generadaDesdeSnapshotId,
          perfilVersion: sharedGuides.perfilVersion,
          planVersion: sharedGuides.planVersion,
          revisadaSinCambios: sharedGuides.revisadaSinCambios,
        })
        .from(sharedGuides)
        .where(and(eq(sharedGuides.id, guiaId), eq(sharedGuides.engagementId, engagement.id), isNotNull(sharedGuides.version)))
        .limit(1);
      if (!base) return conError(404, MENSAJES_ACCIONES.sinGuia);

      const [ultima] = await tx
        .select({ version: sharedGuides.version })
        .from(sharedGuides)
        .where(and(eq(sharedGuides.engagementId, engagement.id), isNotNull(sharedGuides.version)))
        .orderBy(desc(sharedGuides.version))
        .limit(1);
      if (ultima?.version !== base.version) return conError(409, MENSAJES_ACCIONES.noEsLaUltima);

      const [abierto] = await tx
        .select({ id: sharedGuides.id })
        .from(sharedGuides)
        .where(and(eq(sharedGuides.engagementId, engagement.id), eq(sharedGuides.estado, "borrador")))
        .limit(1);
      if (abierto) return conError(409, MENSAJES_GUIA.personaYaHayBorrador);

      const id = randomUUID();
      const lineas = LineasGuardadas.parse(base.lineas).map((l) => ({ ...l, id: randomUUID(), lineaAnteriorId: l.id, cambio: null }));
      await tx.insert(sharedGuides).values({
        id,
        engagementId: engagement.id,
        nombreAMostrar: base.nombreAMostrar,
        lineas,
        generadaDesdeSnapshotId: base.generadaDesdeSnapshotId,
        perfilVersion: base.perfilVersion,
        planVersion: base.planVersion,
        // Sigue partiendo de los mismos insumos: lo que ya se revisó sin cambios no se vuelve a avisar (R-009.46).
        revisadaSinCambios: base.revisadaSinCambios,
        guiaBaseId: guiaId,
        generadaPor: user.id,
      });
      return respuestaGuia({ id, engagementId: engagement.id, estado: "borrador", version: null, nombreAMostrar: base.nombreAMostrar, lineas, descartes: {} }, 201);
    });
  } catch (e) {
    if (violaUnico(e, "shared_guides_un_borrador")) return conError(409, MENSAJES_GUIA.personaYaHayBorrador);
    logError("shared-guides: copiar", e);
    return conError(500, MENSAJES_ACCIONES.errorGuardar);
  }
}
