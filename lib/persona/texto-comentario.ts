// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Textos de "Esto no me representa" que también corren en el navegador (spec 005, R-005.24, R-005.28).
// Este archivo llega al JavaScript de /persona: no importa lib/profile/schema, ni siquiera a través de
// otro archivo, porque ese módulo trae los nombres de los dominios y de las señales (C-09, R-005.2).

export type ParteComentario = {
  origen: "perfil" | "plan";
  resultado: "pendiente" | "con_cambios" | "sin_cambios";
};

// La fecha llega ya formateada: lib no depende de los formatos de las pantallas.
export function textoEstado({ origen, resultado }: ParteComentario, fecha: string): string {
  if (resultado === "pendiente") return `Enviaste esto el ${fecha}. Tu coach lo va a revisar contigo.`;
  const revisado = `Tu coach lo revisó contigo el ${fecha}.`;
  if (origen === "perfil") {
    return resultado === "con_cambios" ? `${revisado} Tu perfil se actualizó.` : `${revisado} Acordaron dejar esta parte como está.`;
  }
  return resultado === "con_cambios" ? `${revisado} Tu plan se actualizó.` : `${revisado} Acordaron dejar esta parte del plan como está.`;
}

// Lo que recibe el botón: el texto y si el botón se esconde mientras está pendiente (R-005.28).
export type VistaEstado = { pendiente: boolean; texto: string };

// La línea del diálogo. El texto de un ítem del plan ya trae su punto final.
export function textoSobre(sobre: string): string {
  const conPunto = /[.!?…]\s*$/.test(sobre) ? sobre.trimEnd() : `${sobre}.`;
  return `Sobre: ${conPunto} Tu coach recibe tu mensaje y lo habla contigo.`;
}
