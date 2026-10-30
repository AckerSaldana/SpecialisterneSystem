// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Foco después de una acción del plan. Cada acción termina con router.refresh(): el Server
// Component vuelve a leer la base y a veces el elemento que tenía el foco desaparece (un punto
// quitado, el borrador aprobado). Sin esto el foco caería en <body> y el lector de pantalla
// empezaría desde arriba. La acción anota a dónde va el foco; el elemento con ese id lo toma en
// cuanto se vuelve a pintar. Solo vive en el navegador (lo importan Client Components).
import { useEffect, type RefObject } from "react";

let pendiente: string | null = null;

export function enfocarDespues(id: string) {
  pendiente = id;
}

// Sin lista de dependencias a propósito: router.refresh() no vuelve a montar los elementos que
// siguen en pantalla, solo los vuelve a pintar, y el efecto tiene que revisar en cada pintada.
export function useFocoPendiente(id: string, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (pendiente === id && ref.current) {
      pendiente = null;
      ref.current.focus();
    }
  });
}
