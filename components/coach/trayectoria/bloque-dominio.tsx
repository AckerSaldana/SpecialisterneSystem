// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Un bloque de la pantalla "Función ejecutiva": un dominio o "Citas sin dominio" (spec 008, R-008.22 a
// R-008.25). Sin totales, barras ni números junto al título (R-008.26). Las líneas ya vienen en el
// orden de R-008.22. La lista no muestra marcadores: sus números se leerían como un conteo.
// Spec 012 (R-012.31): cada bloque es una tarjeta; uno vacío solo lleva su título y el texto de vacío.
import type { ReactNode } from "react";
import { TituloEnfocable } from "@/components/coach/plan/titulo-enfocable";
import type { Linea } from "@/lib/trayectoria/lineas";
import { LineaTrayectoria, type ContextoLineas } from "./linea";

type Props = {
  id: string;
  titulo: string;
  ayuda?: string;
  lineas: Linea[];
  vacio: string;
  contexto: ContextoLineas;
  // El resumen. Va aparte de "lineas" porque toma el bloque sin filtros (R-008.34).
  pie?: ReactNode;
};

export function BloqueDominio({ id, titulo, ayuda, lineas, vacio, contexto, pie }: Props) {
  return (
    <section aria-labelledby={id} className="flex scroll-mt-6 flex-col gap-4 rounded-lg border-(length:--border-w) border-border bg-card px-6 py-5">
      <TituloEnfocable id={id} nivel={2} className="text-2xl">
        {titulo}
      </TituloEnfocable>
      {ayuda ? <p className="prose-measure text-muted-foreground">{ayuda}</p> : null}
      {lineas.length > 0 ? (
        <ol className="flex flex-col gap-6">
          {lineas.map((l) => (
            <LineaTrayectoria key={l.lineaId} linea={l} contexto={contexto} />
          ))}
        </ol>
      ) : (
        <p className="prose-measure text-muted-foreground">{vacio}</p>
      )}
      {pie}
    </section>
  );
}
