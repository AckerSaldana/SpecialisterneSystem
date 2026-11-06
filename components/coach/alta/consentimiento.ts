// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Textos del consentimiento que ve el coach (spec 002, "Pantallas y textos"). Los usan el paso 3
// de la sección "Alta", la línea "Consentimiento:" del encabezado y la página de nueva sesión.
// El estado sale de estadoConsentimiento (lib/consent.ts), nunca de otra columna (R-002.28).
import type { EstadoConsentimiento } from "@/lib/consent";
import { formatFecha } from "@/components/coach/labels";

// Paso 3 y línea "Consentimiento:" del encabezado: los mismos tres textos.
export function textoConsentimiento(nombre: string, c: EstadoConsentimiento): string {
  switch (c.estado) {
    case "sin_eventos":
      return `Pendiente. ${nombre} lo da cuando entra por primera vez. Tú no lo puedes registrar por ${nombre}.`;
    case "vigente":
      return `Sí, desde el ${formatFecha(c.fecha)} (aviso versión ${c.versionAviso}).`;
    case "retirado":
      return `${nombre} retiró su consentimiento el ${formatFecha(c.fecha)}.`;
  }
}

// En lugar del botón "Nueva sesión" cuando no hay consentimiento vigente (R-002.32).
export const textoSinNotas = (nombre: string) => `No puedes guardar notas hasta que ${nombre} dé su consentimiento.`;

// /coach/engagements/[id]/sessions/new sin consentimiento vigente (R-002.32). No le pide registrarlo:
// el coach no puede registrar el consentimiento por la persona (R-002.24).
export function textoNuevaSesionSinConsentimiento(nombre: string, c: EstadoConsentimiento): string {
  if (c.estado === "retirado") {
    return `${nombre} retiró su consentimiento el ${formatFecha(c.fecha)}. No puedes guardar notas de sesión hasta que lo dé otra vez.`;
  }
  return `${nombre} todavía no da su consentimiento. Lo da cuando entra por primera vez y tú no lo puedes registrar por ${nombre}. Mientras tanto no puedes guardar notas de sesión.`;
}

// Decisión b: con el consentimiento retirado, RLS oculta notas, perfil e historial también al coach.
export const textoDatosOcultos = (nombre: string, fecha: Date) =>
  `${nombre} retiró su consentimiento el ${formatFecha(fecha)}. Lo que estaba guardado no se muestra mientras no lo dé otra vez.`;
