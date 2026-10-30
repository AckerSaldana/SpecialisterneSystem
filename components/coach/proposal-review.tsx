// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Revisión de la propuesta de la IA. El coach elige qué cambios y señales aplicar
// (todos marcados por defecto), confirma en un Dialog y se envía la decisión a
// POST /api/profile-events/[eventId]/decision. La IA propone; el coach decide.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiError, DecisionRequest, DecisionResponse, type ProposeResponse } from "@/lib/api/contracts";
import { etiquetaDimension, etiquetaDominioFE, etiquetaSenal } from "@/lib/profile/schema";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Citas } from "./citas";
import { ETIQUETA_TIPO } from "./labels";
import { TipoBadge } from "./tipo-badge";

type Props = { engagementId: string; respuesta: ProposeResponse };

type Decision =
  | { tipo: "aprobada"; cambios: number; senales: number; version: number | null }
  | { tipo: "rechazada" };

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

// Checkbox nativo: accesible por teclado y con foco visible sin componentes extra.
const claseCheckbox =
  "mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ProposalReview({ engagementId, respuesta }: Props) {
  const { propuesta, descartados, banderas, eventId } = respuesta;

  const [selCambios, setSelCambios] = useState<boolean[]>(() => propuesta.cambios.map(() => true));
  const [selSenales, setSelSenales] = useState<boolean[]>(() => propuesta.senales.map(() => true));
  const [dialogo, setDialogo] = useState<"aprobar" | "rechazar" | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const resultadoRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  // Este componente reemplaza al formulario de la nota. Sin esto el foco quedaría en <body>;
  // así va al título y el lector de pantalla empieza a leer desde ahí.
  useEffect(() => {
    tituloRef.current?.focus();
  }, []);

  // Las citas quitadas y los cambios repetidos se explican por separado.
  // Se compara solo contra "cita_no_encontrada": cualquier otro motivo es un cambio repetido.
  const citasQuitadas = descartados.filter((d) => d.motivo === "cita_no_encontrada");
  const cambiosRepetidos = descartados.filter((d) => d.motivo !== "cita_no_encontrada");

  // Al terminar, el foco va al mensaje de resultado para que se lea primero.
  useEffect(() => {
    if (decision) resultadoRef.current?.focus();
  }, [decision]);

  const indicesCambios = selCambios.flatMap((sel, i) => (sel ? [i] : []));
  const indicesSenales = selSenales.flatMap((sel, i) => (sel ? [i] : []));
  const nadaSeleccionado = indicesCambios.length === 0 && indicesSenales.length === 0;

  // Términos marcados en una parte de la propuesta, p. ej. prefijo "cambios[2]".
  function terminosEn(prefijo: string): string[] {
    const terminos = banderas
      .filter((b) => b.ruta === prefijo || b.ruta.startsWith(`${prefijo}.`))
      .map((b) => b.termino);
    return [...new Set(terminos)];
  }
  const todosLosTerminos = [...new Set(banderas.map((b) => b.termino))];

  async function enviarDecision(body: DecisionRequest) {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/profile-events/${eventId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(DecisionRequest.parse(body)),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const err = ApiError.safeParse(json);
        setError(err.success ? err.data.error : "No se pudo guardar la decisión. Intenta de nuevo.");
        setDialogo(null);
        return;
      }
      const data = DecisionResponse.parse(json);
      setDecision(
        data.status === "approved"
          ? { tipo: "aprobada", cambios: indicesCambios.length, senales: indicesSenales.length, version: data.version }
          : { tipo: "rechazada" },
      );
      setDialogo(null);
    } catch {
      setError("No se pudo guardar la decisión. Revisa tu conexión e intenta de nuevo.");
      setDialogo(null);
    } finally {
      setGuardando(false);
    }
  }

  // Mientras se guarda, el Dialog no se puede cerrar.
  function cambiarDialogo(abierto: boolean) {
    if (!abierto && !guardando) setDialogo(null);
  }

  // Si ya hay decisión, el botón que abrió el Dialog ya no existe: el foco va al resultado.
  function alCerrarDialogo(e: Event) {
    if (decision) {
      e.preventDefault();
      resultadoRef.current?.focus();
    }
  }

  const bloqueado = decision !== null;

  return (
    <div className="flex flex-col gap-6">
      <h2 ref={tituloRef} tabIndex={-1} className="foco-destino text-xl font-semibold">
        Revisa la propuesta
      </h2>
      <p className="prose-measure text-sm text-muted-foreground">
        La propuesta quedó guardada como pendiente. Nada cambia en el perfil hasta que la apruebes. Modelo:{" "}
        {respuesta.modelo}. Versión de instrucciones: {respuesta.promptVersion}.
      </p>

      {descartados.length > 0 || banderas.length > 0 ? (
        <Alert>
          <AlertTitle>Revisa esto antes de decidir</AlertTitle>
          <AlertDescription>
            {citasQuitadas.length > 0 ? (
              <>
                <p>
                  Quitamos {plural(citasQuitadas.length, "cita que no aparece", "citas que no aparecen")} en la nota.
                </p>
                <details>
                  <summary className="cursor-pointer">Ver las citas quitadas</summary>
                  <ul className="mt-2 list-disc pl-5">
                    {citasQuitadas.map((d, i) => (
                      <li key={i}>“{d.cita}”</li>
                    ))}
                  </ul>
                </details>
              </>
            ) : null}
            {cambiosRepetidos.length > 0 ? (
              <p>
                Quitamos{" "}
                {plural(cambiosRepetidos.length, "cambio repetido", "cambios repetidos")} para la misma parte del
                perfil.
              </p>
            ) : null}
            {todosLosTerminos.length > 0 ? <p>Revisa estos términos: {todosLosTerminos.join(", ")}.</p> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset disabled={bloqueado} className="flex flex-col gap-3">
        <legend className="mb-3 text-lg font-semibold">
          Cambios al perfil ({propuesta.cambios.length})
        </legend>
        {propuesta.cambios.length === 0 ? (
          <p className="text-sm text-muted-foreground">La IA no propuso cambios al perfil con esta nota.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {propuesta.cambios.map((c, i) => {
              const terminos = terminosEn(`cambios[${i}]`);
              return (
                <li key={i}>
                  <Card>
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          id={`cambio-${i}`}
                          checked={selCambios[i]}
                          onChange={(e) => setSelCambios((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
                          aria-describedby={`cambio-${i}-estado`}
                          className={claseCheckbox}
                        />
                        <div className="flex flex-col gap-1">
                          <h3 className="font-medium">
                            <label htmlFor={`cambio-${i}`}>{etiquetaDimension(c.dimension)}</label>
                          </h3>
                          <p id={`cambio-${i}-estado`} className="text-xs">
                            {selCambios[i] ? "Incluido. Se va a aplicar." : "No incluido. No se va a aplicar."}
                          </p>
                          <div>
                            <TipoBadge tipo={c.tipo} />
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <p className="prose-measure">{c.resumen}</p>
                      {c.dominiosFE.length > 0 ? (
                        <p className="text-sm">
                          <span className="font-medium">Funciones ejecutivas relacionadas: </span>
                          {c.dominiosFE.map(etiquetaDominioFE).join(", ")}
                        </p>
                      ) : null}
                      {terminos.length > 0 ? (
                        <p className="text-sm font-medium">Revisa estos términos: {terminos.join(", ")}.</p>
                      ) : null}
                      <Citas citas={c.evidencia} />
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <fieldset disabled={bloqueado} className="flex flex-col gap-3">
        <legend className="mb-3 text-lg font-semibold">Señales ({propuesta.senales.length})</legend>
        <p className="prose-measure text-sm text-muted-foreground">Las señales solo las ves tú. La persona no las ve.</p>
        {propuesta.senales.length === 0 ? (
          <p className="text-sm text-muted-foreground">La IA no propuso señales con esta nota.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {propuesta.senales.map((s, i) => {
              const terminos = terminosEn(`senales[${i}]`);
              return (
                <li key={i}>
                  <Card>
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          id={`senal-${i}`}
                          checked={selSenales[i]}
                          onChange={(e) => setSelSenales((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
                          aria-describedby={`senal-${i}-estado`}
                          className={claseCheckbox}
                        />
                        <div className="flex flex-col gap-1">
                          <h3 className="font-medium">
                            <label htmlFor={`senal-${i}`}>{etiquetaSenal(s.tipo)}</label>
                          </h3>
                          <p id={`senal-${i}-estado`} className="text-xs">
                            {selSenales[i] ? "Incluida. Se va a registrar." : "No incluida. No se va a registrar."}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <p className="prose-measure">{s.descripcion}</p>
                      {terminos.length > 0 ? (
                        <p className="text-sm font-medium">Revisa estos términos: {terminos.join(", ")}.</p>
                      ) : null}
                      <Citas citas={s.evidencia} />
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      {propuesta.relacionesConPerfilPrevio.length > 0 ? (
        <section aria-labelledby="relaciones" className="flex flex-col gap-3">
          <h2 id="relaciones" className="text-lg font-semibold">
            Relación con el perfil anterior
          </h2>
          <ul className="flex flex-col gap-3">
            {propuesta.relacionesConPerfilPrevio.map((r, i) => (
              <li key={i} className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
                <h3 className="font-medium">
                  {r.tipo === "coincidencia" ? "Coincide con el perfil" : "No coincide con el perfil"}:{" "}
                  {etiquetaDimension(r.dimension)}
                </h3>
                <p className="prose-measure">{r.descripcion}</p>
                <Citas citas={r.evidencia} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {propuesta.preguntasParaSiguienteSesion.length > 0 ? (
        <section aria-labelledby="preguntas" className="flex flex-col gap-3">
          <h2 id="preguntas" className="text-lg font-semibold">
            Preguntas para la siguiente sesión
          </h2>
          <ol className="prose-measure list-decimal pl-5 text-sm">
            {propuesta.preguntasParaSiguienteSesion.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {decision ? (
        <div ref={resultadoRef} tabIndex={-1} role="status" className="rounded-lg border p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          {decision.tipo === "aprobada" ? (
            <p>
              Listo. Se aplicaron {plural(decision.cambios, "cambio", "cambios")} y{" "}
              {plural(decision.senales, "señal", "señales")} al perfil.
              {decision.version !== null ? ` El perfil ahora está en la versión ${decision.version}.` : ""}
            </p>
          ) : (
            <p>Rechazaste la propuesta. El perfil no cambió.</p>
          )}
          <p className="mt-2">
            <Link href={`/coach/engagements/${engagementId}`} className="font-medium underline underline-offset-4">
              Ver perfil
            </Link>
          </p>
        </div>
      ) : (
        <section aria-labelledby="decision" className="flex flex-col gap-3">
          <h2 id="decision" className="text-lg font-semibold">
            Tu decisión
          </h2>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>No se guardó la decisión</AlertTitle>
              <AlertDescription>
                <p>{error}</p>
              </AlertDescription>
            </Alert>
          ) : null}
          {nadaSeleccionado ? (
            <p className="text-sm">Selecciona al menos un cambio o una señal para aprobar.</p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button size="lg" disabled={nadaSeleccionado} onClick={() => setDialogo("aprobar")}>
              Aprobar lo seleccionado
            </Button>
            <Button size="lg" variant="outline" onClick={() => setDialogo("rechazar")}>
              Rechazar propuesta
            </Button>
          </div>
        </section>
      )}

      {/* Confirmación antes de aplicar al perfil. */}
      <Dialog open={dialogo === "aprobar"} onOpenChange={cambiarDialogo}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={alCerrarDialogo} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>¿Aplicar esto al perfil?</DialogTitle>
            <DialogDescription>
              La persona va a ver los cambios al perfil. Las señales solo las ves tú.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto text-sm">
            <div>
              <h3 className="font-medium">Cambios ({indicesCambios.length})</h3>
              {indicesCambios.length === 0 ? (
                <p className="text-muted-foreground">Ninguno.</p>
              ) : (
                <ul className="list-disc pl-5">
                  {indicesCambios.map((i) => (
                    <li key={i}>
                      {etiquetaDimension(propuesta.cambios[i].dimension)} ({ETIQUETA_TIPO[propuesta.cambios[i].tipo]})
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="font-medium">Señales ({indicesSenales.length})</h3>
              {indicesSenales.length === 0 ? (
                <p className="text-muted-foreground">Ninguna.</p>
              ) : (
                <ul className="list-disc pl-5">
                  {indicesSenales.map((i) => (
                    <li key={i}>{etiquetaSenal(propuesta.senales[i].tipo)}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p role="status" className="text-sm">
            {guardando ? "Guardando la decisión." : ""}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={guardando}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              disabled={guardando}
              onClick={() =>
                enviarDecision({ accion: "aprobar", aprobacion: { cambios: indicesCambios, senales: indicesSenales } })
              }
            >
              Confirmar y aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación antes de rechazar. */}
      <Dialog open={dialogo === "rechazar"} onOpenChange={cambiarDialogo}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={alCerrarDialogo}>
          <DialogHeader>
            <DialogTitle>¿Rechazar la propuesta?</DialogTitle>
            <DialogDescription>
              No se aplica ningún cambio al perfil. La nota de la sesión queda guardada.
            </DialogDescription>
          </DialogHeader>
          <p role="status" className="text-sm">
            {guardando ? "Guardando la decisión." : ""}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={guardando}>
                Cancelar
              </Button>
            </DialogClose>
            <Button variant="destructive" disabled={guardando} onClick={() => enviarDecision({ accion: "rechazar" })}>
              Rechazar propuesta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
