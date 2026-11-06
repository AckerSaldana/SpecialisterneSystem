// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Párrafo que puede recibir el foco por código cuando una acción lo pide con enfocarDespues(id). La página lo pinta en
// lugar del botón de pedir: al refrescar, el botón y el foco ya no existen, y sin esto el foco caería en <body>
// (R-009.59). Ver components/coach/plan/foco.ts.
"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useFocoPendiente } from "@/components/coach/plan/foco";

export function ParrafoEnfocable({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useFocoPendiente(id, ref);
  return (
    <p ref={ref} id={id} tabIndex={-1} className={cn("foco-destino", className)}>
      {children}
    </p>
  );
}
