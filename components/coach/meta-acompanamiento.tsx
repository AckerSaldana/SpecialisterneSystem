// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// "Tipo" y "Etapa" de un acompañamiento (spec 012, R-012.17; DISENO.md, Tipografía): el tipo identifica el
// acompañamiento y va en el acento; la etapa es metadato y su valor va en texto apagado.
import { ENGAGEMENT_CONFIG, etiquetaEtapa } from "@/lib/engagements/config";
import type { engagements } from "@/lib/db/schema";

type Engagement = typeof engagements.$inferSelect;

export function MetaAcompanamiento({ tipo, etapa }: { tipo: Engagement["type"]; etapa: Engagement["stage"] }) {
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-1">
      <div className="flex flex-wrap gap-x-2 text-primary">
        <dt>Tipo:</dt>
        <dd>{ENGAGEMENT_CONFIG[tipo].etiqueta}</dd>
      </div>
      <div className="flex flex-wrap gap-x-2">
        <dt className="text-primary">Etapa:</dt>
        <dd className="text-muted-foreground">{etiquetaEtapa(etapa)}</dd>
      </div>
    </dl>
  );
}
