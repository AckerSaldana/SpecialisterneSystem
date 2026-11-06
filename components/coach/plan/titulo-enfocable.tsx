// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Título que puede recibir el foco por código (tabIndex -1) cuando una acción del plan lo pide
// con enfocarDespues(id). Ver foco.ts.
"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useFocoPendiente } from "./foco";

type Props = { id: string; nivel: 1 | 2 | 3 | 4; className?: string; children: ReactNode };

export function TituloEnfocable({ id, nivel, className, children }: Props) {
  const ref = useRef<HTMLHeadingElement>(null);
  useFocoPendiente(id, ref);
  const comun = { id, ref, tabIndex: -1, className: cn("foco-destino", className) };
  if (nivel === 1) return <h1 {...comun}>{children}</h1>;
  if (nivel === 2) return <h2 {...comun}>{children}</h2>;
  if (nivel === 3) return <h3 {...comun}>{children}</h3>;
  return <h4 {...comun}>{children}</h4>;
}
