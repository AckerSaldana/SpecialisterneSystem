// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Fecha de la sesión (spec 004, R-004.58). El servidor corre en UTC y el equipo y el partner están
// en Monterrey: "hoy" se calcula en esa zona y la sesión se guarda a las 12:00 de ese día, para que
// no cambie de día al mostrarse. También corre en el navegador, para el valor inicial del campo.

export const ZONA = "America/Monterrey";

// en-CA da el formato AAAA-MM-DD.
const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });

const formatoHora = new Intl.DateTimeFormat("en-US", { timeZone: ZONA, hourCycle: "h23", hour: "2-digit", minute: "2-digit" });

export function hoyEnMonterrey(ahora: Date = new Date()): string {
  return formatoDia.format(ahora);
}

// Las dos fechas son AAAA-MM-DD, así que se comparan como texto.
export function esFechaFutura(fecha: string, ahora: Date = new Date()): boolean {
  return fecha > hoyEnMonterrey(ahora);
}

// Las 12:00 de ese día en Monterrey. Se parte de las 12:00 UTC y se corrige con la hora que marca
// la zona en ese momento, sin escribir el desfase a mano.
export function aRealizadaEn(fecha: string): Date {
  const utc = new Date(`${fecha}T12:00:00.000Z`);
  const [hora, minuto] = formatoHora.format(utc).split(":").map(Number);
  return new Date(utc.getTime() + ((12 - hora) * 60 - minuto) * 60_000);
}
