// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Un paso de la sección "Alta" del coach (spec 012, R-012.39; textos de la spec 002): tarjeta con el número en un
// círculo y el título. El paso terminado dice "Hecho"; el primero sin terminar lleva la barra de acento. El número
// y "Hecho" están en el texto, no solo en el color.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const TEXTO_HECHO = "Hecho";

type Props = {
  numero: 1 | 2 | 3;
  // El id del título: los enlaces "#verificacion" y el aria-labelledby lo usan.
  id: string;
  titulo: string;
  hecho: boolean;
  sigue: boolean;
  children: ReactNode;
};

export function PasoDelAlta({ numero, id, titulo, hecho, sigue, children }: Props) {
  return (
    <li>
      <section
        aria-labelledby={id}
        className={cn(
          "flex flex-col gap-4 rounded-lg border-(length:--border-w) border-border bg-card px-6 py-5",
          sigue ? "border-l-4 border-l-primary" : "",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full border-(length:--border-w) font-semibold",
              hecho ? "border-primary bg-accent" : sigue ? "border-primary" : "border-border text-muted-foreground",
            )}
          >
            {numero}
          </span>
          {/* El círculo se oculta al lector de pantalla; el número del título solo lo lee él, para no repetirlo a la vista. */}
          <h3 id={id} className="scroll-mt-6 text-xl font-semibold">
            <span className="sr-only">{numero}. </span>
            {titulo}
          </h3>
          {hecho ? <span className="rounded-full bg-accent px-3 py-0.5 font-medium">{TEXTO_HECHO}</span> : null}
        </div>
        {children}
      </section>
    </li>
  );
}
