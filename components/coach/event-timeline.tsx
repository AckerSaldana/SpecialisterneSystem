// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Historial de eventos del perfil (profile_events), del más reciente al más antiguo.
// Cada estado se escribe en texto. Los "no me representa" de la persona muestran
// su comentario y la dimensión a la que se refieren.
import { etiquetaDimension, type Aprobacion, type Descartado, type ProfileEventPayload } from "@/lib/profile/schema";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatFecha } from "./labels";

export type EventoVista = {
  id: string;
  status: "proposed" | "approved" | "rejected";
  payload: ProfileEventPayload;
  approvedPayload: Aprobacion | null;
  decidedAt: Date | null;
  decididoPor: string | null; // nombre de pila de quien aprobó o rechazó
  creadoPor: string | null; // nombre de pila de quien creó el evento
  promptVersion: string | null;
  model: string | null;
  createdAt: Date;
};

const ESTADO_PROPUESTA = {
  proposed: "Pendiente de revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
} as const;

const ESTADO_COMENTARIO = {
  proposed: "Sin revisar",
  approved: "Revisado, con cambios al perfil",
  rejected: "Revisado, sin cambios al perfil",
} as const;

function plural(n: number, uno: string, varios: string) {
  return n === 1 ? uno : varios;
}

// Mismo criterio que proposal-review: lo que no es cita no encontrada es un cambio repetido.
function contarDescartados(descartados: Descartado[]) {
  const citas = descartados.filter((d) => d.motivo === "cita_no_encontrada").length;
  return { citas, repetidos: descartados.length - citas };
}

function Dato({ termino, children }: { termino: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-medium">{termino}:</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function EventTimeline({ eventos }: { eventos: EventoVista[] }) {
  if (eventos.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay eventos.</p>;
  }

  return (
    <ol className="flex flex-col gap-4">
      {eventos.map((e) => {
        const p = e.payload;
        return (
          <li key={e.id} className="rounded-lg border p-4">
            <article className="flex flex-col gap-2 text-sm">
              {p.tipo === "propuesta_ia" ? (
                <>
                  <h3 className="flex flex-wrap items-center gap-2 font-medium">
                    Propuesta de la IA
                    <Badge variant="outline" className="h-auto">
                      Estado: {ESTADO_PROPUESTA[e.status]}
                    </Badge>
                  </h3>
                  <dl className="flex flex-col gap-1">
                    <Dato termino="Fecha">{formatFecha(e.createdAt)}</Dato>
                    <Dato termino="Propuso">
                      {p.update.cambios.length} {plural(p.update.cambios.length, "cambio", "cambios")} y{" "}
                      {p.update.senales.length} {plural(p.update.senales.length, "señal", "señales")}
                    </Dato>
                    {e.status === "approved" && e.approvedPayload ? (
                      <Dato termino="Se aplicó">
                        {e.approvedPayload.cambios.length} de {p.update.cambios.length}{" "}
                        {plural(p.update.cambios.length, "cambio", "cambios")} y {e.approvedPayload.senales.length} de{" "}
                        {p.update.senales.length} {plural(p.update.senales.length, "señal", "señales")}
                      </Dato>
                    ) : null}
                    {contarDescartados(p.descartados).citas > 0 ? (
                      <Dato termino="Citas quitadas por no estar en la nota">{contarDescartados(p.descartados).citas}</Dato>
                    ) : null}
                    {contarDescartados(p.descartados).repetidos > 0 ? (
                      <Dato termino="Cambios repetidos quitados">{contarDescartados(p.descartados).repetidos}</Dato>
                    ) : null}
                    <Dato termino="Versión de instrucciones">{e.promptVersion ?? "Sin dato"}</Dato>
                    <Dato termino="Modelo">{e.model ?? "Sin dato"}</Dato>
                    {e.status !== "proposed" ? (
                      <Dato termino={e.status === "approved" ? "Aprobó" : "Rechazó"}>
                        {e.decididoPor ?? "Sin dato"}
                        {e.decidedAt ? `, el ${formatFecha(e.decidedAt)}` : ""}
                      </Dato>
                    ) : null}
                  </dl>
                </>
              ) : (
                <>
                  <h3 className="flex flex-wrap items-center gap-2 font-medium">
                    La persona dijo: “Esto no me representa”
                    <Badge variant="outline" className="h-auto">
                      Estado: {ESTADO_COMENTARIO[e.status]}
                    </Badge>
                  </h3>
                  <dl className="flex flex-col gap-1">
                    <Dato termino="Fecha">{formatFecha(e.createdAt)}</Dato>
                    <Dato termino="Sobre">{p.dimension ? etiquetaDimension(p.dimension) : "El perfil en general"}</Dato>
                    {e.creadoPor ? <Dato termino="Lo envió">{e.creadoPor}</Dato> : null}
                  </dl>
                  {p.comentario ? (
                    <blockquote className="prose-measure border-l-4 border-border pl-3">“{p.comentario}”</blockquote>
                  ) : (
                    <p className="text-muted-foreground">No dejó comentario.</p>
                  )}
                </>
              )}
            </article>
          </li>
        );
      })}
    </ol>
  );
}
