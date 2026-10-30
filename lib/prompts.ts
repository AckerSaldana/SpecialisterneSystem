// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Arma los textos que se envían al modelo.
// El system prompt vive en prompts/<PROMPT_VERSION>.md (versionado por fecha).
// Los catálogos (dimensiones, dominios FE, señales) se insertan desde lib/profile/schema.ts
// para que el prompt y el esquema nunca digan cosas distintas.
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ENGAGEMENT_CONFIG, type EngagementType } from "@/lib/engagements/config";
import { DIMENSIONES, DOMINIOS_FE, SECCIONES, SENALES, type Perfil } from "@/lib/profile/schema";

// Nombre del archivo sin ".md". Se guarda en profile_events.prompt_version y en audit_log.
export const PROMPT_VERSION = "2026-10-29_profile-update";

// Todo lo que está arriba de esta línea en el .md es encabezado para humanos y no se envía.
// Se busca como línea completa para no confundirla con una mención dentro del encabezado.
const MARCADOR = /^<!-- PROMPT -->[ \t]*$/m;

let cache: string | null = null;

export function systemPromptProfileUpdate(): string {
  if (cache) return cache;

  // process.cwd() es la raíz del proyecto tanto en Next como en "npm run eval".
  // En producción, next.config.ts incluye ./prompts/** en el paquete de las rutas /api.
  const archivo = path.join(process.cwd(), "prompts", `${PROMPT_VERSION}.md`);
  const md = readFileSync(archivo, "utf8");

  const marcador = MARCADOR.exec(md);
  if (!marcador) throw new Error(`El prompt ${PROMPT_VERSION} no tiene la línea <!-- PROMPT -->`);
  const plantilla = md.slice(marcador.index + marcador[0].length).trim();

  const seccion = (id: string) => SECCIONES.find((s) => s.id === id)!.etiqueta;
  const dimensiones = DIMENSIONES.map((d) => `- ${d.id}: ${d.etiqueta} (${seccion(d.seccion)})`).join("\n");
  const dominios = DOMINIOS_FE.map((d) => `- ${d.id}: ${d.etiqueta}`).join("\n");
  const senales = SENALES.map((s) => `- ${s.id}: ${s.etiqueta}`).join("\n");

  const texto = plantilla
    .replace("{{DIMENSIONES}}", dimensiones)
    .replace("{{DOMINIOS_FE}}", dominios)
    .replace("{{SENALES}}", senales);

  // Si alguien agrega un marcador nuevo al .md y olvida llenarlo aquí, mejor fallar ya.
  if (texto.includes("{{")) throw new Error(`El prompt ${PROMPT_VERSION} tiene marcadores sin llenar`);

  cache = texto;
  return texto;
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
