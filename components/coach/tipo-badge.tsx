// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Etiqueta del tipo de hallazgo: texto ("Fortaleza", "Área de apoyo", "Contexto") más color.
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TipoHallazgo } from "@/lib/profile/schema";
import { CLASES_TIPO, ETIQUETA_TIPO } from "./labels";

export function TipoBadge({ tipo }: { tipo: TipoHallazgo }) {
  return (
    <Badge variant="outline" className={cn("h-auto", CLASES_TIPO[tipo])}>
      {ETIQUETA_TIPO[tipo]}
    </Badge>
  );
}
