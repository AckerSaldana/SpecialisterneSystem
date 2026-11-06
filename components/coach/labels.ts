// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Textos y formatos que comparten las pantallas del coach.
// El tipo de hallazgo siempre se muestra como texto; el color solo acompaña.
import type { TipoSesion } from "@/lib/followup/schema";
import type { TipoHallazgo } from "@/lib/profile/schema";

export const ETIQUETA_TIPO: Record<TipoHallazgo, string> = {
  fortaleza: "Fortaleza",
  area_de_apoyo: "Área de apoyo",
  contexto: "Contexto",
};

// Spec 012 (R-012.27): la línea de tiempo muestra las más recientes; las demás se pliegan.
export const SESIONES_VISIBLES = 4;
export const textoAnteriores = (n: number) => (n === 1 ? "Ver 1 sesión anterior" : `Ver ${n} sesiones anteriores`);

// Spec 012 (R-012.22): textos de la lista de acompañamientos.
export const textoCuantas = (n: number) => (n === 1 ? "Acompañas a 1 persona." : `Acompañas a ${n} personas.`);
export const textoPorRevisar = (n: number) => (n === 1 ? "1 propuesta por revisar" : `${n} propuestas por revisar`);

// Spec 012 (R-012.18): el principio de una nota para la línea de tiempo, en palabra completa. Solo lo ve el coach.
export const MAX_EXTRACTO = 160;
export function extractoNota(nota: string, max: number = MAX_EXTRACTO): string {
  const limpia = nota.replace(/\s+/g, " ").trim();
  if (limpia.length <= max) return limpia;
  const corte = limpia.slice(0, max - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > max / 2 ? corte.slice(0, espacio) : corte).replace(/[\s,.;:]+$/, "")}…`;
}

// Spec 004: el tipo de sesión siempre con estos textos.
export function textoTipoSesion(tipo: TipoSesion, nombre: string): string {
  return tipo === "persona" ? `Sesión con ${nombre}` : "Sesión con la red de apoyo";
}

// Fondos por tipo, con tokens (R-012.3). Siempre van junto con ETIQUETA_TIPO, nunca solos: el color no es la única señal.
export const CLASES_TIPO: Record<TipoHallazgo, string> = {
  fortaleza: "border-border bg-accent text-foreground",
  area_de_apoyo: "border-border bg-muted text-foreground",
  contexto: "border-border bg-card text-muted-foreground",
};

// Fechas en español de México. La zona horaria fija evita que el servidor y el
// navegador muestren días distintos para la misma sesión.
const formatoFecha = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "long",
  timeZone: "America/Mexico_City",
});

export function formatFecha(valor: Date | string): string {
  return formatoFecha.format(new Date(valor));
}
