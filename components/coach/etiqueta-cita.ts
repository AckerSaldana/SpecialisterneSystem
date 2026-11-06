// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Spec 008 (R-008.10): lo que se dice de una cita de cambios o de avance al revisar una propuesta.
// Vive aparte de labels.ts porque ese archivo también llega al navegador de la persona, y este importa
// los nombres de los dominios (C-09).
import {
  etiquetaDireccionFE,
  etiquetaDominioFE,
  type Descartado,
  type EvidenciaEtiquetada,
  type EvidenciaPropuesta,
} from "@/lib/profile/schema";

// Una propuesta vieja no trae etiquetas y no dice nada. "ruta" es la de la propuesta limpia, igual que
// la de los descartes de limpiarEtiquetas.
export function textoEtiquetaCita(
  evidencia: EvidenciaEtiquetada | EvidenciaPropuesta,
  ruta: string,
  descartados: Descartado[],
  nombre: string,
): string | undefined {
  if (!("dominio" in evidencia)) return undefined;
  const textos = [
    evidencia.dominio
      ? `Función ejecutiva propuesta: ${etiquetaDominioFE(evidencia.dominio)}. Dirección: ${evidencia.direccion ? etiquetaDireccionFE(evidencia.direccion) : "Sin dirección"}.`
      : "Sin dominio de función ejecutiva.",
  ];
  for (const d of descartados) {
    if (d.ruta !== ruta) continue;
    if (d.motivo === "etiqueta_sin_anterior") textos.push("La IA marcó un cambio sin decir respecto a qué cita. Se quitó esa dirección.");
    if (d.motivo === "etiqueta_participacion") {
      textos.push(`La IA marcó como apoyo una cita que solo dice que ${nombre} habla o participa poco. Se quitó esa etiqueta.`);
    }
  }
  return textos.join(" ");
}
