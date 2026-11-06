// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// El resultado de una acción de la página, en una sola región role="status" (R-009.59, CA-009.52). Vive arriba
// de lo que cambia, porque al marcar "Listo" o descartar, el borrador desaparece y su región se perdería con él.
// Se queda hasta la siguiente acción: sin tiempo límite (C-14). Sticky para que se lea desde donde quedó el foco.
"use client";

import { useEffect, useState } from "react";

let avisarEnPagina: ((texto: string) => void) | null = null;

export const avisar = (texto: string) => avisarEnPagina?.(texto);

export function AvisoGuia() {
  const [texto, setTexto] = useState("");

  useEffect(() => {
    avisarEnPagina = setTexto;
    return () => {
      avisarEnPagina = null;
    };
  }, []);

  return (
    <div role="status" className="sticky top-2 z-10 empty:-mb-8 print:hidden">
      {texto ? <p className="prose-measure rounded-lg border-2 border-primary bg-background p-3 font-medium">{texto}</p> : null}
    </div>
  );
}
