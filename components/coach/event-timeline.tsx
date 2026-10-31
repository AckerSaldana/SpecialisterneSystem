// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Historial de eventos del perfil (profile_events), del más reciente al más antiguo.
// Cada estado se escribe en texto. Los "no me representa" de la persona muestran
// su comentario y la dimensión a la que se refieren. Las propuestas de seguimiento dicen también
// el avance, el contexto y el siguiente paso, con el tipo y la fecha de la sesión (spec 004).
import { Aprobacion, etiquetaDimension, type AprobacionEntrada, type Descartado, type ProfileEventPayload } from "@/lib/profile/schema";
import type { TipoSesion } from "@/lib/followup/schema";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatFecha, textoTipoSesion } from "./labels";

export type EventoVista = {
  id: string;
  status: "proposed" | "approved" | "rejected";
  payload: ProfileEventPayload;
  approvedPayload: AprobacionEntrada | null;
  decidedAt: Date | null;
  decididoPor: string | null; // nombre de pila de quien aprobó o rechazó
  creadoPor: string | null; // nombre de pila de quien creó el evento
  promptVersion: string | null;
  model: string | null;
  createdAt: Date;
  sesionTipo: TipoSesion | null;
  sesionFecha: Date | null;
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

// Mismo criterio que proposal-review.
function contarDescartados(descartados: Descartado[]) {
  return {
    citas: descartados.filter((d) => d.motivo === "cita_no_encontrada").length,
    repetidos: descartados.filter((d) => d.motivo === "dimension_duplicada").length,
  };
}

// "2 cambios, 1 señal, 3 avances, 1 nota de contexto y siguiente paso: sí".
function resumenSeguimiento(cambios: number, senales: number, avances: number, contexto: number, paso: boolean) {
  return (
    `${cambios} ${plural(cambios, "cambio", "cambios")}, ${senales} ${plural(senales, "señal", "señales")}, ` +
    `${avances} ${plural(avances, "avance", "avances")}, ${contexto} ${plural(contexto, "nota de contexto", "notas de contexto")} ` +
    `y siguiente paso: ${paso ? "sí" : "no"}`
  );
}

function Dato({ termino, children }: { termino: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-medium">{termino}:</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function EventTimeline({ eventos, nombre }: { eventos: EventoVista[]; nombre: string }) {
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
              {p.tipo === "propuesta_seguimiento" ? (
                <>
                  <h3 className="flex flex-wrap items-center gap-2 font-medium">
                    Propuesta de la IA
                    <Badge variant="outline" className="h-auto">
                      Estado: {ESTADO_PROPUESTA[e.status]}
                    </Badge>
                  </h3>
                  <dl className="flex flex-col gap-1">
                    <Dato termino="Fecha">{formatFecha(e.createdAt)}</Dato>
                    {e.sesionTipo && e.sesionFecha ? (
                      <Dato termino="Sesión">
                        {textoTipoSesion(e.sesionTipo, nombre)}, el {formatFecha(e.sesionFecha)}
                      </Dato>
                    ) : null}
                    <Dato termino="Propuso">
                      {resumenSeguimiento(
                        p.update.cambios.length,
                        p.update.senales.length,
                        p.update.avance.length,
                        p.update.contexto.length,
                        p.update.siguientePaso !== null,
                      )}
                    </Dato>
                    {e.status === "approved" && e.approvedPayload ? (
                      <Dato termino="Se aplicó">
                        {(() => {
                          // Un approved_payload anterior a 004 se lee con los valores por defecto.
                          const a = Aprobacion.parse(e.approvedPayload);
                          return resumenSeguimiento(a.cambios.length, a.senales.length, a.avance.length, a.contexto.length, a.siguientePaso);
                        })()}
                      </Dato>
                    ) : null}
                    {contarDescartados(p.descartados).citas > 0 ? (
                      <Dato termino="Citas quitadas por no estar en la nota">{contarDescartados(p.descartados).citas}</Dato>
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
              ) : p.tipo === "propuesta_ia" ? (
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
