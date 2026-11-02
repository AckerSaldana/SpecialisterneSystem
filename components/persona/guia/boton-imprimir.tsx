// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// El PDF se hace con la impresión del navegador, sin librería nueva (spec 009, R-009.44).
"use client";

import { Button } from "@/components/ui/button";
import { HOJA } from "./textos";

export function BotonImprimir() {
  return (
    <div>
      <Button type="button" size="lg" onClick={() => window.print()}>
        {HOJA.imprimir}
      </Button>
    </div>
  );
}
