// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Perfil actual visto por el coach: dimensiones agrupadas por sección, con su
// evidencia, y las señales activas aparte. Recibe el perfil del último snapshot.
import type { ReactNode } from "react";
import {
  DIMENSIONES,
  SECCIONES,
  etiquetaDimension,
  etiquetaDominioFE,
  etiquetaSenal,
  type EvidenciaGuardada,
  type Perfil,
  type SenalActiva,
} from "@/lib/profile/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Citas } from "./citas";
import { formatFecha } from "./labels";
import { TipoBadge } from "./tipo-badge";

type Props = {
  perfil: Perfil;
  // sessionId -> fecha ya formateada, para mostrar de qué sesión sale cada cita.
  fechasSesion: Record<string, string>;
  // sessionId -> rol de quien observó, cuando se registró (R-011.11).
  observadores?: Record<string, string>;
};

function Evidencia({ evidencia, fechasSesion, observadores = {} }: { evidencia: EvidenciaGuardada[]; fechasSesion: Record<string, string>; observadores?: Record<string, string> }) {
  const n = evidencia.length;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-medium underline-offset-4 hover:underline">
        Ver evidencia ({n} {n === 1 ? "cita" : "citas"})
      </summary>
      <div className="mt-3">
        <Citas citas={evidencia.map((e) => ({ cita: e.cita, fecha: fechasSesion[e.sessionId], detalle: observadores[e.sessionId] ? `Observó: ${observadores[e.sessionId]}` : undefined }))} />
      </div>
    </details>
  );
}

export function ProfileView({ perfil, fechasSesion, observadores }: Props) {
  return (
    <div className="flex flex-col gap-8">
      {SECCIONES.map((seccion) => {
        // Dimensiones de esta sección que ya tienen información, en el orden del catálogo.
        const presentes = DIMENSIONES.filter((d) => d.seccion === seccion.id && perfil.dimensiones[d.id]);
        return (
          <section key={seccion.id} aria-labelledby={`seccion-${seccion.id}`} className="flex flex-col gap-3">
            <h3 id={`seccion-${seccion.id}`} className="text-lg font-semibold">
              {seccion.etiqueta}
            </h3>
            {presentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay información en esta sección.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {presentes.map((d) => {
                  const dim = perfil.dimensiones[d.id]!;
                  return (
                    <li key={d.id}>
                      <Card>
                        <CardHeader>
                          <h4 className="font-medium">{etiquetaDimension(d.id)}</h4>
                          <div>
                            <TipoBadge tipo={dim.tipo} />
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="prose-measure">{dim.resumen}</p>
                          {dim.dominiosFE.length > 0 ? (
                            <p className="mt-2 text-sm">
                              <span className="font-medium">Funciones ejecutivas relacionadas: </span>
                              {dim.dominiosFE.map(etiquetaDominioFE).join(", ")}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-muted-foreground">Actualizado el {formatFecha(dim.actualizadoEn)}</p>
                          <Evidencia evidencia={dim.evidencia} fechasSesion={fechasSesion} observadores={observadores} />
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

// Señales de riesgo activas. Solo las ve el coach. Recibe solo las vigentes (R-004.52).
export function SenalesView({
  senales,
  fechasSesion,
  acciones,
}: {
  senales: SenalActiva[];
  fechasSesion: Record<string, string>;
  acciones?: (senal: SenalActiva) => ReactNode;
}) {
  if (senales.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay señales activas.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {senales.map((s, i) => (
        <li key={`${s.eventoId}-${i}`}>
          <Card>
            <CardHeader>
              <h3 className="font-medium">{etiquetaSenal(s.tipo)}</h3>
            </CardHeader>
            <CardContent>
              <p className="prose-measure">{s.descripcion}</p>
              <p className="mt-2 text-xs text-muted-foreground">Registrada el {formatFecha(s.detectadaEn)}</p>
              <Evidencia evidencia={s.evidencia} fechasSesion={fechasSesion} />
              {acciones?.(s)}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
