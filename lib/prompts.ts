// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Arma los textos que se envían al modelo.
// Cada system prompt vive en prompts/<version>.md (versionado por fecha).
// Los catálogos (dimensiones, dominios FE, señales, tipos de punto del plan) se insertan desde
// lib/profile/schema.ts y lib/plan/schema.ts para que el prompt y el esquema nunca digan cosas distintas.
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ENGAGEMENT_CONFIG, type EngagementType } from "@/lib/engagements/config";
import type { IndiceEvidencia } from "@/lib/plan/evidence";
import { ESTADOS_AVANCE, etiquetaEstadoAvance, type EstadoAvance, type TipoSesion } from "@/lib/followup/schema";
import { TIPOS_ITEM_PLAN } from "@/lib/plan/schema";
import { DIMENSIONES, DOMINIOS_FE, SECCIONES, SENALES, type Perfil } from "@/lib/profile/schema";

// Nombre del archivo sin ".md". Se guarda en profile_events.prompt_version y en audit_log.
export const PROMPT_VERSION = "2026-10-29_profile-update";
// Spec 003 (R-003.43). Se guarda en plans.prompt_version y en audit_log.
export const PROMPT_VERSION_PLAN = "2026-10-29_plan-acompanamiento";
// Spec 004. Se guarda en profile_events.prompt_version y en audit_log. El prompt de 001 no cambia.
export const PROMPT_VERSION_SEGUIMIENTO = "2026-10-30_seguimiento";

// Todo lo que está arriba de esta línea en el .md es encabezado para humanos y no se envía.
// Se busca como línea completa para no confundirla con una mención dentro del encabezado.
const MARCADOR = /^<!-- PROMPT -->[ \t]*$/m;

// Plantillas ya leídas, por versión. Se leen una vez por proceso.
const plantillas = new Map<string, string>();

function leerPlantilla(version: string): string {
  const enCache = plantillas.get(version);
  if (enCache) return enCache;

  // process.cwd() es la raíz del proyecto tanto en Next como en "npm run eval".
  // En producción, next.config.ts incluye ./prompts/** en el paquete de las rutas /api.
  const archivo = path.join(process.cwd(), "prompts", `${version}.md`);
  const md = readFileSync(archivo, "utf8");

  const marcador = MARCADOR.exec(md);
  if (!marcador) throw new Error(`El prompt ${version} no tiene la línea <!-- PROMPT -->`);
  const plantilla = md.slice(marcador.index + marcador[0].length).trim();
  plantillas.set(version, plantilla);
  return plantilla;
}

const MARCADORES = /\{\{([A-Z_]+)\}\}/g;

// Reemplaza cada {{MARCADOR}} de la plantilla en un solo paso. Si alguien agrega un marcador nuevo
// al .md y olvida llenarlo aquí, mejor fallar ya. La revisión se hace sobre la plantilla, antes de
// insertar datos: una ficha con "{{" en su título o contenido no debe tumbar el prompt.
function llenar(version: string, reemplazos: Record<string, string>): string {
  const plantilla = leerPlantilla(version);
  const sinLlenar = [...plantilla.matchAll(MARCADORES)].map((m) => m[1]).filter((m) => !Object.hasOwn(reemplazos, m));
  if (sinLlenar.length > 0 || plantilla.replace(MARCADORES, "").includes("{{")) {
    throw new Error(`El prompt ${version} tiene marcadores sin llenar`);
  }
  // Con una función como reemplazo, un "$" dentro del valor (p. ej. en el contenido de una ficha)
  // no se interpreta como patrón especial de String.replace. Lo insertado ya no se vuelve a revisar.
  return plantilla.replace(MARCADORES, (_, marcador: string) => reemplazos[marcador]);
}

const listaDominios = () => DOMINIOS_FE.map((d) => `- ${d.id}: ${d.etiqueta}`).join("\n");
const listaSenales = () => SENALES.map((s) => `- ${s.id}: ${s.etiqueta}`).join("\n");
const listaDimensiones = () => {
  const seccion = (id: string) => SECCIONES.find((s) => s.id === id)!.etiqueta;
  return DIMENSIONES.map((d) => `- ${d.id}: ${d.etiqueta} (${seccion(d.seccion)})`).join("\n");
};

// ===========================================================================
// Perfil (spec 001)
// ===========================================================================

let cachePerfil: string | null = null;

export function systemPromptProfileUpdate(): string {
  if (cachePerfil) return cachePerfil;

  cachePerfil = llenar(PROMPT_VERSION, { DIMENSIONES: listaDimensiones(), DOMINIOS_FE: listaDominios(), SENALES: listaSenales() });
  return cachePerfil;
}

// Perfil previo reducido: lo que el modelo necesita para detectar coincidencias y
// contradicciones. Se quitan IDs y fechas (no le sirven y gastan tokens).
function perfilParaModelo(perfil: Perfil) {
  return {
    dimensiones: Object.fromEntries(
      Object.entries(perfil.dimensiones).map(([id, d]) => [
        id,
        { resumen: d!.resumen, tipo: d!.tipo, dominiosFE: d!.dominiosFE, citas: d!.evidencia.map((e) => e.cita) },
      ]),
    ),
    senalesActivas: perfil.senalesActivas.map((s) => ({ tipo: s.tipo, descripcion: s.descripcion })),
  };
}

export type EntradaProfileUpdate = {
  nota: string;
  nombrePila: string;
  engagementType: EngagementType;
  perfilPrevio: Perfil;
};

// Mensaje de usuario: cambia en cada llamada, por eso va fuera del system prompt (que se cachea).
export function mensajeUsuarioProfileUpdate({ nota, nombrePila, engagementType, perfilPrevio }: EntradaProfileUpdate) {
  const engagement = ENGAGEMENT_CONFIG[engagementType];
  return [
    `Nombre de pila de la persona: ${nombrePila}`,
    `Tipo de acompañamiento: ${engagement.etiqueta}. ${engagement.descripcion}`,
    "",
    "Perfil previo aprobado por el coach (JSON):",
    "<perfil_previo>",
    JSON.stringify(perfilParaModelo(perfilPrevio), null, 2),
    "</perfil_previo>",
    "",
    "Nota del coach (las citas se copian de aquí, letra por letra):",
    "<nota_del_coach>",
    nota,
    "</nota_del_coach>",
  ].join("\n");
}

// ===========================================================================
// Plan de acompañamiento (spec 003)
// ===========================================================================

// Ficha de knowledge_cards tal como entra al prompt. La ruta la arma desde la fila de la base.
export type FichaPrompt = { id: string; titulo: string; tipo: string; dominioFe: string | null; contenido: string };

// R-003.5: solo fichas verificadas. La ruta ya filtra en la consulta; esto es por si acaso llega
// un objeto con "verificada: false" (por ejemplo, el catálogo de un caso del eval).
export function soloVerificadas<T extends FichaPrompt & { verificada?: boolean }>(fichas: T[]): T[] {
  return fichas.filter((f) => f.verificada !== false);
}

function textoFichas(fichas: FichaPrompt[]): string {
  if (fichas.length === 0) return "No hay fichas verificadas. Deja `fichaId` en null en todos los puntos.";
  return fichas
    .map((f) => {
      const dominio = DOMINIOS_FE.find((d) => d.id === f.dominioFe);
      return [
        `### ${f.id}`,
        `- título: ${f.titulo}`,
        `- tipo: ${f.tipo}`,
        `- dominio: ${dominio ? `${dominio.id} (${dominio.etiqueta})` : "ninguno"}`,
        `- contenido: ${f.contenido}`,
      ].join("\n");
    })
    .join("\n\n");
}

// System prompt del plan (R-003.6). La plantilla se cachea; el texto con las fichas se arma en
// cada llamada porque las fichas viven en la base. Para el mismo conjunto de fichas el texto sale
// igual, así el cache de Anthropic funciona entre llamadas.
export function systemPromptPlan(fichas: (FichaPrompt & { verificada?: boolean })[]): string {
  const tipos = TIPOS_ITEM_PLAN.map((t) => `- ${t.id}: ${t.grupo}`).join("\n");
  return llenar(PROMPT_VERSION_PLAN, {
    TIPOS_ITEM: tipos,
    DOMINIOS_FE: listaDominios(),
    FICHAS: textoFichas(soloVerificadas(fichas)),
  });
}

export type EntradaPlan = {
  nombrePila: string;
  engagementType: EngagementType;
  indice: IndiceEvidencia;
  perfil: Perfil;
};

// Mensaje de usuario del plan (R-003.4, CA-003.5). Solo nombre de pila, tipo de acompañamiento y
// las dimensiones del perfil aprobado (resumen, tipo, dominios) con cada cita identificada por su
// ID E-nn. No lleva cédula, verificación del diagnóstico, notas completas, sessionId ni señales
// activas (decisión 5).
export function mensajeUsuarioPlan({ nombrePila, engagementType, indice, perfil }: EntradaPlan): string {
  const engagement = ENGAGEMENT_CONFIG[engagementType];

  // Mismo orden que el índice (orden de DIMENSIONES).
  const dimensiones: Record<string, unknown> = {};
  for (const d of DIMENSIONES) {
    const dim = perfil.dimensiones[d.id];
    if (!dim) continue;
    dimensiones[d.id] = {
      etiqueta: d.etiqueta,
      resumen: dim.resumen,
      tipo: dim.tipo,
      dominiosFE: dim.dominiosFE,
      evidencia: indice.lista.filter((e) => e.dimension === d.id).map((e) => ({ id: e.id, cita: e.cita })),
    };
  }

  return [
    `Nombre de pila de la persona: ${nombrePila}`,
    `Tipo de acompañamiento: ${engagement.etiqueta}. ${engagement.descripcion}`,
    "",
    "Perfil aprobado por el coach (JSON). Cita la evidencia solo por su id:",
    "<perfil_aprobado>",
    JSON.stringify({ dimensiones }, null, 2),
    "</perfil_aprobado>",
  ].join("\n");
}

// ===========================================================================
// Sesiones de seguimiento (spec 004)
// ===========================================================================

// System prompt de seguimiento. Mismo filtro de fichas que el plan (R-004.24).
export function systemPromptSeguimiento(fichas: (FichaPrompt & { verificada?: boolean })[]): string {
  const verificadas = soloVerificadas(fichas);
  return llenar(PROMPT_VERSION_SEGUIMIENTO, {
    DIMENSIONES: listaDimensiones(),
    DOMINIOS_FE: listaDominios(),
    SENALES: listaSenales(),
    ESTADOS_AVANCE: ESTADOS_AVANCE.map((e) => `- ${e.id}: ${e.etiqueta}`).join("\n"),
    FICHAS:
      verificadas.length === 0
        ? "No hay fichas verificadas. Si propones un siguiente paso, tiene que salir de un punto del plan y `fichaId` queda en null."
        : textoFichas(verificadas),
  });
}

// Un punto del plan tal como entra al prompt: con ID corto, nunca con el id real (R-004.54).
export type ItemPrompt = { ref: string; tipo: string; descripcion: string; ultimoEstado: EstadoAvance | null };

export type EntradaSeguimiento = {
  nota: string;
  nombrePila: string;
  engagementType: EngagementType;
  tipoSesion: TipoSesion;
  // Con solo sus señales vigentes (perfilConSenalesVigentes, R-004.52).
  perfilPrevio: Perfil;
  itemsPlan: ItemPrompt[];
  contextoGuardado: { tipo: "pregunta" | "contexto" | "siguiente_paso"; texto: string }[];
};

const TIPO_SESION_PROMPT: Record<TipoSesion, string> = {
  persona: "sesión con la persona",
  red_de_apoyo: "sesión con la red de apoyo (el líder y el mentor)",
};

// Mensaje de usuario de seguimiento. No recibe datos de la verificación del diagnóstico (R-004.36)
// ni notas completas de sesiones anteriores.
export function mensajeUsuarioSeguimiento({
  nota,
  nombrePila,
  engagementType,
  tipoSesion,
  perfilPrevio,
  itemsPlan,
  contextoGuardado,
}: EntradaSeguimiento): string {
  const engagement = ENGAGEMENT_CONFIG[engagementType];
  const puntos = itemsPlan.map((i) => ({
    id: i.ref,
    tipo: i.tipo,
    descripcion: i.descripcion,
    ultimoEstado: i.ultimoEstado ? etiquetaEstadoAvance(i.ultimoEstado) : "Sin avance registrado",
  }));
  return [
    `Nombre de pila de la persona: ${nombrePila}`,
    `Tipo de acompañamiento: ${engagement.etiqueta}. ${engagement.descripcion}`,
    `Tipo de sesión: ${TIPO_SESION_PROMPT[tipoSesion]}`,
    "",
    "Perfil previo aprobado por el coach, con las señales activas (JSON):",
    "<perfil_previo>",
    JSON.stringify(perfilParaModelo(perfilPrevio), null, 2),
    "</perfil_previo>",
    "",
    itemsPlan.length > 0
      ? "Puntos vigentes del plan aprobado (JSON). En `itemRef` usa su id tal cual:"
      : "Este acompañamiento no tiene plan aprobado. Deja `avance` vacío:",
    "<plan_aprobado>",
    JSON.stringify(puntos, null, 2),
    "</plan_aprobado>",
    "",
    "Lo que el coach guardó para esta sesión (JSON):",
    "<contexto_guardado>",
    JSON.stringify(contextoGuardado, null, 2),
    "</contexto_guardado>",
    "",
    "Nota del coach (las citas se copian de aquí, letra por letra):",
    "<nota_del_coach>",
    nota,
    "</nota_del_coach>",
  ].join("\n");
}
