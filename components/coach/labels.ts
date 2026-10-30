// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Textos y formatos que comparten las pantallas del coach.
// El tipo de hallazgo siempre se muestra como texto; el color solo acompaña.
import type { TipoHallazgo } from "@/lib/profile/schema";

export const ETIQUETA_TIPO: Record<TipoHallazgo, string> = {
  fortaleza: "Fortaleza",
  area_de_apoyo: "Área de apoyo",
  contexto: "Contexto",
};

// Colores suaves por tipo. Siempre van junto con ETIQUETA_TIPO, nunca solos.
export const CLASES_TIPO: Record<TipoHallazgo, string> = {
  fortaleza: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  area_de_apoyo: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  contexto: "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100",
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
