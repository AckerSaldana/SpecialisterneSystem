// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Revisión de la propuesta de la IA, de 001 y de seguimiento. Se arma con lo guardado en
// profile_events, sin llamar otra vez al modelo (R-004.26). El coach elige qué aprobar (todo marcado
// por defecto), puede cambiar el tipo y el texto de un cambio (R-004.43, R-004.44), confirma en un
// Dialog y se envía la decisión a POST /api/profile-events/[eventId]/decision. La IA propone; el
// coach decide.
// Spec 012 (R-012.29): en pantallas anchas, "Lo que vas a aprobar" y "Tu decisión" van a la derecha, fijos a la vista; el
// estado de cada tarjeta va como etiqueta. Los textos de 001 y 004 y la lógica no cambian.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiError, DecisionRequest, DecisionResponse } from "@/lib/api/contracts";
import { aprobacionVacia, bloqueosDeCambios, SIN_SELECCION, textoBloqueo } from "@/lib/followup/aprobacion";
import type { VistaPropuesta } from "@/lib/followup/lectura";
import { etiquetaEstadoAvance, type FollowupUpdate } from "@/lib/followup/schema";
import { etiquetaDimension, etiquetaDominioFE, etiquetaSenal, type TipoHallazgo } from "@/lib/profile/schema";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { atribuyeObservador } from "@/lib/profile/terminos";
import { Citas } from "./citas";
import { textoEtiquetaCita } from "./etiqueta-cita";
import { ETIQUETA_TIPO, formatFecha } from "./labels";

type Props = { vista: VistaPropuesta; nombre: string };

const textoObservador = (observador: string | null | undefined) => `Observó: ${observador ?? "sin registrar"}`;

type Decision =
  | { tipo: "aprobada"; cambios: number; senales: number; version: number | null; conSnapshot: boolean }
  | { tipo: "rechazada" };

type Edicion = { tipo?: TipoHallazgo; resumen?: string; abierta?: boolean };

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

const sinPunto = (texto: string) => texto.trim().replace(/[.\s]+$/, "");

// Checkbox nativo: accesible por teclado y con foco visible sin componentes extra.
const claseCheckbox =
  "mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const claseSelect = "min-h-10 w-fit rounded-md border-(length:--border-w) border-input bg-card px-3 text-base";

// Título de cada sección de la propuesta, en serif como los títulos de DISENO.md.
const claseLegend = "mb-3 font-serif text-2xl";
// La tarjeta dice si está incluida: fondo normal si sí, borde punteado y fondo apagado si no. El texto lo dice igual.
const claseTarjeta = (incluido: boolean) => (incluido ? "" : "border-dashed bg-muted");
const claseEstado = (incluido: boolean) =>
  `w-fit rounded-full px-3 py-0.5 text-sm ${incluido ? "bg-accent text-foreground" : "border-(length:--border-w) border-dashed border-input text-muted-foreground"}`;

// R-012.29: "{sección}: {k} de {n}".
const lineaResumen = (titulo: string, sel: boolean[]) => `${titulo}: ${sel.filter(Boolean).length} de ${sel.length}`;

const DESCARTES: Partial<Record<VistaPropuesta["descartados"][number]["motivo"], string>> = {
  item_no_existe: "La IA citó un punto que no está en el plan.",
  avance_duplicado: "La IA propuso dos avances para el mismo punto; se dejó el primero.",
  ficha_no_valida: "La IA propuso una ficha que no existe o no está verificada.",
  siguiente_paso_sin_destino: "La IA propuso un siguiente paso sin decir de dónde sale.",
};

const indices = (sel: boolean[]) => sel.flatMap((s, i) => (s ? [i] : []));

export function ProposalReview({ vista, nombre }: Props) {
  const { update, descartados, banderas, eventId, engagementId, indicePlan, citasBase } = vista;

  const [selCambios, setSelCambios] = useState<boolean[]>(() => update.cambios.map(() => true));
  const [selSenales, setSelSenales] = useState<boolean[]>(() => update.senales.map(() => true));
  // Un avance sin equivalente en la versión vigente no se puede aprobar (R-004.41).
  const [selAvance, setSelAvance] = useState<boolean[]>(() => update.avance.map((_, i) => !vista.avanceSinEquivalente.includes(i)));
  const [selPreguntas, setSelPreguntas] = useState<boolean[]>(() => update.preguntasParaSiguienteSesion.map(() => true));
  const [selContexto, setSelContexto] = useState<boolean[]>(() => update.contexto.map(() => true));
  const [selPaso, setSelPaso] = useState<boolean>(() => update.siguientePaso !== null && !vista.pasoSinEquivalente);
  const [ediciones, setEdiciones] = useState<Record<number, Edicion>>({});
  const [dialogo, setDialogo] = useState<"aprobar" | "rechazar" | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const resultadoRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  // Se llega aquí después de pedir la propuesta. Sin esto el foco quedaría en <body>; así va al
  // título y el lector de pantalla empieza a leer desde ahí.
  useEffect(() => {
    tituloRef.current?.focus();
  }, []);

  // Al terminar, el foco va al mensaje de resultado para que se lea primero.
  useEffect(() => {
    if (decision) resultadoRef.current?.focus();
  }, [decision]);

  const citasQuitadas = descartados.filter((d) => d.motivo === "cita_no_encontrada");
  const cambiosRepetidos = descartados.filter((d) => d.motivo === "dimension_duplicada");
  // Un solo texto por motivo: "La IA citó un punto..." no se repite.
  const otrosDescartes = [...new Set(descartados.flatMap((d) => DESCARTES[d.motivo] ?? []))];

  const indicesCambios = indices(selCambios);
  const indicesSenales = indices(selSenales);
  const indicesAvance = indices(selAvance);
  const indicesPreguntas = indices(selPreguntas);
  const indicesContexto = indices(selContexto);

  // Solo las ediciones que cambian algo, de los cambios seleccionados.
  const edicionesFinales = indicesCambios.flatMap((indice) => {
    const e = ediciones[indice];
    if (!e) return [];
    const original = update.cambios[indice];
    const tipo = e.tipo && e.tipo !== original.tipo ? e.tipo : undefined;
    const resumen = e.resumen !== undefined && e.resumen.trim() !== original.resumen ? e.resumen.trim() : undefined;
    return tipo || resumen !== undefined ? [{ indice, ...(tipo ? { tipo } : {}), ...(resumen !== undefined ? { resumen } : {}) }] : [];
  });

  const aprobacion = {
    cambios: indicesCambios,
    senales: indicesSenales,
    avance: indicesAvance,
    preguntas: indicesPreguntas,
    contexto: indicesContexto,
    siguientePaso: selPaso,
    ediciones: edicionesFinales,
  };

  const nadaSeleccionado = aprobacionVacia(aprobacion);
  // La misma revisión que hace el servidor con el texto final (R-004.59). Lo no seleccionado no bloquea.
  const textoVacio = edicionesFinales.some((e) => e.resumen === "");
  const bloqueos = textoVacio ? [] : bloqueosDeCambios(update, aprobacion, citasBase, vista.nota ? [vista.nota] : []);
  const noSePuedeAprobar = nadaSeleccionado || textoVacio || bloqueos.length > 0;
  const cambiosBloqueados = [...new Set(bloqueos.map((b) => b.indice))];

  // Términos marcados en una parte de la propuesta, p. ej. prefijo "senales[2]". Las banderas
  // solo_participacion usan su propio texto y no salen aquí.
  function terminosEn(prefijo: string): string[] {
    const terminos = banderas
      .filter((b) => b.motivo !== "solo_participacion" && (b.ruta === prefijo || b.ruta.startsWith(`${prefijo}.`)))
      .map((b) => b.termino);
    return [...new Set(terminos)];
  }
  const soloParticipacion = (ruta: string) => banderas.some((b) => b.motivo === "solo_participacion" && b.ruta === ruta);
  // Los de los cambios se revisan en vivo, con el texto final, en cada tarjeta.
  const todosLosTerminos = [
    ...new Set(banderas.filter((b) => b.motivo !== "solo_participacion" && !b.ruta.startsWith("cambios[")).map((b) => b.termino)),
  ];

  const hayAvisos = citasQuitadas.length + cambiosRepetidos.length + otrosDescartes.length + todosLosTerminos.length > 0;

  // R-008.10: el coach ve la etiqueta de cada cita de cambios y avance. Aquí no se edita.
  const conEtiquetas = (evidencia: FollowupUpdate["cambios"][number]["evidencia"], lista: "cambios" | "avance", i: number) =>
    evidencia.map((e, j) => ({ ...e, detalle: textoEtiquetaCita(e, `${lista}[${i}].evidencia[${j}]`, descartados, nombre) }));

  const descripcionItem = (ref: string | null) => indicePlan.find((e) => e.ref === ref)?.descripcion;

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
          ? {
              tipo: "aprobada",
              cambios: indicesCambios.length,
              senales: indicesSenales.length,
              version: data.version,
              conSnapshot: data.snapshotId !== null,
            }
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
  const conCambiosOSenales = indicesCambios.length > 0 || indicesSenales.length > 0;
  const editar = (i: number, cambio: Edicion) => setEdiciones((prev) => ({ ...prev, [i]: { ...prev[i], ...cambio } }));
  const marcar = (setter: typeof setSelCambios, i: number, valor: boolean) =>
    setter((prev) => prev.map((v, j) => (j === i ? valor : v)));

  const resumen = [
    update.cambios.length > 0 ? lineaResumen("Cambios al perfil", selCambios) : null,
    update.senales.length > 0 ? lineaResumen("Señales", selSenales) : null,
    vista.seguimiento && update.avance.length > 0 ? lineaResumen("Avance del plan", selAvance) : null,
    update.preguntasParaSiguienteSesion.length > 0 ? lineaResumen("Preguntas", selPreguntas) : null,
    vista.seguimiento && update.contexto.length > 0 ? lineaResumen("Contexto", selContexto) : null,
    vista.seguimiento && update.siguientePaso ? `Siguiente paso: ${selPaso ? 1 : 0} de 1` : null,
  ].filter((l): l is string => l !== null);

  return (
    <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="flex min-w-0 flex-col gap-8">
      <h2 ref={tituloRef} tabIndex={-1} className="foco-destino text-3xl">
        Revisa la propuesta
      </h2>
      <p className="prose-measure text-muted-foreground">
        La propuesta quedó guardada como pendiente. Nada cambia hasta que la apruebes. Modelo: {vista.modelo ?? "Sin dato"}. Versión
        de instrucciones: {vista.promptVersion ?? "Sin dato"}.
      </p>

      {vista.nota ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Ver la nota de la sesión</summary>
          <p className="prose-measure mt-2 whitespace-pre-wrap rounded-lg border p-3 text-sm">{vista.nota}</p>
        </details>
      ) : null}

      {vista.avisoPerfil ? (
        <Alert>
          <AlertTitle>El perfil cambió</AlertTitle>
          <AlertDescription>
            <p>
              Esta propuesta se hizo con la versión {vista.avisoPerfil.base} del perfil. El perfil ya está en la versión{" "}
              {vista.avisoPerfil.actual}. Revisa que los cambios sigan teniendo sentido antes de aprobar.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {vista.avisoPlan ? (
        <Alert>
          <AlertTitle>El plan cambió</AlertTitle>
          <AlertDescription>
            <p>
              Esta propuesta se hizo con la versión {vista.avisoPlan.base} del plan. El plan aprobado ya es la versión{" "}
              {vista.avisoPlan.actual}. El avance se guarda en los puntos equivalentes; los que ya no están en el plan no se pueden
              aprobar.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {hayAvisos ? (
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
                Quitamos {plural(cambiosRepetidos.length, "cambio repetido", "cambios repetidos")} para la misma parte del perfil.
              </p>
            ) : null}
            {otrosDescartes.map((texto) => (
              <p key={texto}>{texto}</p>
            ))}
            {todosLosTerminos.length > 0 ? <p>Revisa estos términos: {todosLosTerminos.join(", ")}.</p> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset disabled={bloqueado} className="flex flex-col gap-3">
        <legend className={claseLegend}>Cambios al perfil ({update.cambios.length})</legend>
        {update.cambios.length === 0 ? (
          <p className="text-sm text-muted-foreground">La IA no propuso cambios al perfil con esta nota.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {update.cambios.map((c, i) => {
              const edicion = ediciones[i];
              const tipo = edicion?.tipo ?? c.tipo;
              const resumen = edicion?.resumen ?? c.resumen;
              const bloqueosCambio = bloqueos.filter((b) => b.indice === i);
              return (
                <li key={i}>
                  <Card className={claseTarjeta(selCambios[i])}>
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          id={`cambio-${i}`}
                          checked={selCambios[i]}
                          onChange={(e) => marcar(setSelCambios, i, e.target.checked)}
                          aria-describedby={`cambio-${i}-estado`}
                          className={claseCheckbox}
                        />
                        <div className="flex flex-col gap-1">
                          <h3 className="text-lg font-semibold">
                            <label htmlFor={`cambio-${i}`}>{etiquetaDimension(c.dimension)}</label>
                          </h3>
                          <p id={`cambio-${i}-estado`} className={claseEstado(selCambios[i])}>
                            {selCambios[i] ? "Incluido. Se va a aplicar." : "No incluido. No se va a aplicar."}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`cambio-${i}-tipo`} className="font-semibold">Tipo</Label>
                        <select
                          id={`cambio-${i}-tipo`}
                          value={tipo}
                          onChange={(e) => editar(i, { tipo: e.target.value as TipoHallazgo })}
                          className={claseSelect}
                        >
                          {(Object.keys(ETIQUETA_TIPO) as TipoHallazgo[]).map((t) => (
                            <option key={t} value={t}>
                              {ETIQUETA_TIPO[t]}
                            </option>
                          ))}
                        </select>
                        {tipo !== c.tipo ? <p className="text-sm">La IA lo propuso como {ETIQUETA_TIPO[c.tipo]}.</p> : null}
                      </div>

                      {edicion?.abierta ? (
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`cambio-${i}-texto`}>Texto</Label>
                          <p id={`cambio-${i}-ayuda`} className="text-sm text-muted-foreground">
                            Puedes cambiar el texto. Las citas de la nota no se cambian.
                          </p>
                          {/* El botón "Editar texto" desaparece al abrir: el foco pasa a este campo. */}
                          <Textarea
                            id={`cambio-${i}-texto`}
                            autoFocus
                            value={resumen}
                            maxLength={1200}
                            aria-describedby={
                              bloqueosCambio.length > 0 ? `cambio-${i}-ayuda cambio-${i}-bloqueo` : `cambio-${i}-ayuda`
                            }
                            aria-invalid={bloqueosCambio.length > 0 ? true : undefined}
                            onChange={(e) => editar(i, { resumen: e.target.value })}
                            className="prose-measure"
                          />
                        </div>
                      ) : (
                        <>
                          <p className="prose-measure">{resumen}</p>
                          <div>
                            <Button type="button" variant="outline" size="sm" onClick={() => editar(i, { abierta: true })}>
                              Editar texto
                            </Button>
                          </div>
                        </>
                      )}

                      {atribuyeObservador(resumen) ? (
                        <p className="prose-measure font-medium">Este texto parece decir quién observó. La persona lo lee: revísalo.</p>
                      ) : null}

                      {c.dominiosFE.length > 0 ? (
                        <p className="text-sm">
                          <span className="font-medium">Funciones ejecutivas relacionadas: </span>
                          {c.dominiosFE.map(etiquetaDominioFE).join(", ")}
                        </p>
                      ) : null}
                      {bloqueosCambio.length > 0 ? (
                        <div id={`cambio-${i}-bloqueo`} className="flex flex-col gap-1 text-sm font-medium text-destructive">
                          {bloqueosCambio.map((b) => (
                            <p key={`${b.motivo}-${b.termino}`}>{textoBloqueo(nombre, b.dimension, b.termino)}</p>
                          ))}
                        </div>
                      ) : null}
                      <Citas citas={conEtiquetas(c.evidencia, "cambios", i)} />
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <fieldset disabled={bloqueado} className="flex flex-col gap-3">
        <legend className={claseLegend}>Señales ({update.senales.length})</legend>
        <p className="prose-measure text-sm text-muted-foreground">Las señales solo las ves tú. La persona no las ve.</p>
        {update.senales.length === 0 ? (
          <p className="text-sm text-muted-foreground">La IA no propuso señales con esta nota.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {update.senales.map((s, i) => {
              const terminos = terminosEn(`senales[${i}]`);
              return (
                <li key={i}>
                  <Card className={claseTarjeta(selSenales[i])}>
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          id={`senal-${i}`}
                          checked={selSenales[i]}
                          onChange={(e) => marcar(setSelSenales, i, e.target.checked)}
                          aria-describedby={`senal-${i}-estado`}
                          className={claseCheckbox}
                        />
                        <div className="flex flex-col gap-1">
                          <h3 className="font-medium">
                            <label htmlFor={`senal-${i}`}>{etiquetaSenal(s.tipo)}</label>
                          </h3>
                          <p id={`senal-${i}-estado`} className={claseEstado(selSenales[i])}>
                            {selSenales[i] ? "Incluida. Se va a registrar." : "No incluida. No se va a registrar."}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <p className="prose-measure">{s.descripcion}</p>
                      {soloParticipacion(`senales[${i}]`) ? (
                        <p className="prose-measure text-sm font-medium">
                          Revisa esta propuesta. Su única evidencia es que {nombre} habla o participa poco, y hablar poco no cuenta como
                          señal de riesgo.
                        </p>
                      ) : null}
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

      {vista.seguimiento ? (
        <fieldset disabled={bloqueado} className="flex flex-col gap-3">
          <legend className={claseLegend}>Avance del plan ({update.avance.length})</legend>
          {update.avance.length === 0 ? (
            <p className="text-sm text-muted-foreground">La IA no propuso avance del plan con esta nota.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {update.avance.map((a, i) => {
                const terminos = terminosEn(`avance[${i}]`);
                const sinEquivalente = vista.avanceSinEquivalente.includes(i);
                return (
                  <li key={i}>
                    <Card>
                      <CardHeader>
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            id={`avance-${i}`}
                            checked={selAvance[i]}
                            disabled={sinEquivalente}
                            onChange={(e) => marcar(setSelAvance, i, e.target.checked)}
                            className={claseCheckbox}
                          />
                          <div className="flex flex-col gap-1">
                            <h3 className="font-medium">
                              <label htmlFor={`avance-${i}`}>{descripcionItem(a.itemRef) ?? a.itemRef}</label>
                            </h3>
                            <p className="text-sm">Estado propuesto: {etiquetaEstadoAvance(a.estado)}</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <p className="prose-measure">{a.resumen}</p>
                        {sinEquivalente ? (
                          <p className="text-sm font-medium">Este punto ya no está en el plan aprobado. No se puede aprobar.</p>
                        ) : null}
                        {soloParticipacion(`avance[${i}]`) ? (
                          <p className="prose-measure text-sm font-medium">
                            Revisa esta propuesta. Su única evidencia es que {nombre} habla o participa poco, y hablar poco no cuenta como
                            señal de riesgo.
                          </p>
                        ) : null}
                        {terminos.length > 0 ? (
                          <p className="text-sm font-medium">Revisa estos términos: {terminos.join(", ")}.</p>
                        ) : null}
                        <Citas citas={conEtiquetas(a.evidencia, "avance", i)} />
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      ) : null}

      {update.preguntasParaSiguienteSesion.length > 0 ? (
        <fieldset disabled={bloqueado} className="flex flex-col gap-3">
          <legend className={claseLegend}>
            Preguntas para la siguiente sesión ({update.preguntasParaSiguienteSesion.length})
          </legend>
          <p className="prose-measure text-sm text-muted-foreground">Solo tú ves esto.</p>
          <ul className="flex flex-col gap-2">
            {update.preguntasParaSiguienteSesion.map((p, i) => {
              const terminos = terminosEn(`preguntasParaSiguienteSesion[${i}]`);
              return (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    id={`pregunta-${i}`}
                    checked={selPreguntas[i]}
                    onChange={(e) => marcar(setSelPreguntas, i, e.target.checked)}
                    className={claseCheckbox}
                  />
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`pregunta-${i}`} className="prose-measure">
                      {p}
                    </label>
                    {terminos.length > 0 ? <p className="font-medium">Revisa estos términos: {terminos.join(", ")}.</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : null}

      {vista.seguimiento && update.contexto.length > 0 ? (
        <fieldset disabled={bloqueado} className="flex flex-col gap-3">
          <legend className={claseLegend}>Contexto para la siguiente sesión ({update.contexto.length})</legend>
          <p className="prose-measure text-sm text-muted-foreground">Solo tú ves esto.</p>
          <ul className="flex flex-col gap-3">
            {update.contexto.map((c, i) => {
              const terminos = terminosEn(`contexto[${i}]`);
              return (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    id={`contexto-${i}`}
                    checked={selContexto[i]}
                    onChange={(e) => marcar(setSelContexto, i, e.target.checked)}
                    className={claseCheckbox}
                  />
                  <div className="flex flex-col gap-2">
                    <label htmlFor={`contexto-${i}`} className="prose-measure">
                      {c.texto}
                    </label>
                    {terminos.length > 0 ? <p className="font-medium">Revisa estos términos: {terminos.join(", ")}.</p> : null}
                    <Citas citas={c.evidencia} />
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : null}

      {vista.seguimiento && update.siguientePaso ? (
        <fieldset disabled={bloqueado} className="flex flex-col gap-3">
          <legend className={claseLegend}>Siguiente paso</legend>
          <div className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              id="siguiente-paso"
              checked={selPaso}
              disabled={vista.pasoSinEquivalente}
              onChange={(e) => setSelPaso(e.target.checked)}
              className={claseCheckbox}
            />
            <div className="flex flex-col gap-2">
              <label htmlFor="siguiente-paso" className="prose-measure">
                Propuesta: {sinPunto(update.siguientePaso.texto)}. Sale de:{" "}
                {sinPunto(descripcionItem(update.siguientePaso.itemRef) ??
                  (update.siguientePaso.fichaId ? vista.fichas[update.siguientePaso.fichaId] : null) ??
                  "Sin dato")}
                .
              </label>
              {vista.pasoSinEquivalente ? (
                <p className="font-medium">Este punto ya no está en el plan aprobado. No se puede aprobar.</p>
              ) : null}
              {terminosEn("siguientePaso").length > 0 ? (
                <p className="font-medium">Revisa estos términos: {terminosEn("siguientePaso").join(", ")}.</p>
              ) : null}
              <Citas citas={update.siguientePaso.evidencia} />
            </div>
          </div>
        </fieldset>
      ) : null}

      {update.relacionesConPerfilPrevio.length > 0 ? (
        <section aria-labelledby="relaciones" className="flex flex-col gap-3">
          <h2 id="relaciones" className="text-lg font-semibold">
            Relación con el perfil anterior
          </h2>
          <ul className="flex flex-col gap-3">
            {update.relacionesConPerfilPrevio.map((r, i) => (
              <li key={i} className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
                <h3 className="font-medium">
                  {r.tipo === "coincidencia" ? "Coincide con el perfil" : "Contradicción con el perfil"}: {etiquetaDimension(r.dimension)}
                </h3>
                <p className="prose-measure">{r.descripcion}</p>
                {/* Sin la llave citaPrevia: seguimiento o un evento anterior a 011 (R-011.12). Solo hay una frase. */}
                {r.citaPrevia === undefined ? (
                  <Citas citas={r.evidencia} />
                ) : (
                  <>
                    {r.tipo === "contradiccion" ? <p className="font-medium">El sistema no elige. Aclara esto con la persona.</p> : null}
                    <h4 className="font-medium">Esta nota</h4>
                    <Citas
                      citas={r.evidencia.map((e) => ({
                        cita: e.cita,
                        fecha: vista.sesion ? formatFecha(vista.sesion.fecha) : undefined,
                        detalle: textoObservador(vista.sesion?.observador),
                      }))}
                    />
                    {r.citaPrevia !== null ? (
                      <>
                        <h4 className="font-medium">Nota anterior</h4>
                        <Citas
                          citas={[
                            {
                              cita: r.citaPrevia,
                              fecha: r.sesionPrevia && vista.origenes[r.sesionPrevia] ? formatFecha(vista.origenes[r.sesionPrevia].fecha) : undefined,
                              detalle: textoObservador(r.sesionPrevia ? vista.origenes[r.sesionPrevia]?.observador : null),
                            },
                          ]}
                        />
                      </>
                    ) : r.tipo === "contradiccion" ? (
                      <p>No se pudo confirmar la frase anterior en el perfil.</p>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      </div>

      {/* R-012.29: resumen y decisión, después de la revisión en el orden de lectura. */}
      <aside aria-label="Resumen y decisión" className="flex flex-col gap-4 xl:sticky xl:top-6">
      {resumen.length > 0 && !decision ? (
        <section aria-labelledby="resumen-seleccion" className="flex flex-col gap-2 rounded-lg border-(length:--border-w) border-border bg-muted px-5 py-4">
          <h2 id="resumen-seleccion" className="text-xl">
            Lo que vas a aprobar
          </h2>
          <ul className="flex flex-col gap-1">
            {resumen.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {decision ? (
        <div ref={resultadoRef} tabIndex={-1} role="status" className="foco-destino rounded-lg border-(length:--border-w) border-border bg-card p-5">
          {decision.tipo === "rechazada" ? (
            <p>Rechazaste la propuesta. El perfil no cambió.</p>
          ) : decision.conSnapshot ? (
            <p>
              Listo. Se aplicaron {plural(decision.cambios, "cambio", "cambios")} y {plural(decision.senales, "señal", "señales")} al perfil.
              {decision.version !== null ? ` El perfil ahora está en la versión ${decision.version}.` : ""}
            </p>
          ) : (
            <p>Listo. Se guardó lo que aprobaste. El perfil no cambió.</p>
          )}
          <p className="mt-2">
            <Link href={`/coach/engagements/${engagementId}`} className="font-medium underline underline-offset-4">
              Ver perfil
            </Link>
          </p>
        </div>
      ) : (
        <section aria-labelledby="decision" className="flex flex-col gap-3 rounded-lg border-(length:--border-w) border-border bg-card px-5 py-5">
          <h2 id="decision" className="text-2xl">
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
          {nadaSeleccionado ? <p className="text-sm">{SIN_SELECCION}</p> : null}
          {textoVacio ? <p className="text-sm">Escribe el texto del cambio que editaste, o quítalo de la selección.</p> : null}
          {/* Un botón deshabilitado no recibe foco: aquí se dice por qué y dónde corregirlo. */}
          <div role="status" className="text-sm">
            {cambiosBloqueados.length > 0 ? (
              <>
                <p>Para aprobar, corrige el texto de estos cambios o quítalos de la selección:</p>
                <ul className="list-disc pl-5">
                  {cambiosBloqueados.map((i) => (
                    <li key={i}>
                      <a href={`#cambio-${i}`} className="underline underline-offset-4">
                        {etiquetaDimension(update.cambios[i].dimension)}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3 xl:flex-col xl:items-stretch">
            <Button size="lg" disabled={noSePuedeAprobar} onClick={() => setDialogo("aprobar")}>
              Aprobar lo seleccionado
            </Button>
            <Button size="lg" variant="outline" onClick={() => setDialogo("rechazar")}>
              Rechazar propuesta
            </Button>
          </div>
        </section>
      )}

      </aside>

      {/* Confirmación antes de guardar. */}
      <Dialog open={dialogo === "aprobar"} onOpenChange={cambiarDialogo}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={alCerrarDialogo} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{conCambiosOSenales ? "¿Aplicar esto al perfil?" : "¿Guardar esto?"}</DialogTitle>
            <DialogDescription>
              {indicesCambios.length > 0
                ? `${nombre} va a ver los cambios al perfil. Las señales y lo demás solo los ves tú.`
                : conCambiosOSenales
                  ? `${nombre} no ve nada de esto. Las señales solo las ves tú.`
                  : `El perfil no cambia. ${nombre} no ve nada de esto.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto text-sm">
            <ResumenSeccion
              titulo="Cambios"
              vacio="Ninguno."
              lineas={indicesCambios.map((i) => {
                const tipo = ediciones[i]?.tipo ?? update.cambios[i].tipo;
                return `${etiquetaDimension(update.cambios[i].dimension)} (${ETIQUETA_TIPO[tipo]})`;
              })}
            />
            <ResumenSeccion titulo="Señales" vacio="Ninguna." lineas={indicesSenales.map((i) => etiquetaSenal(update.senales[i].tipo))} />
            {vista.seguimiento ? (
              <ResumenSeccion
                titulo="Avance del plan"
                vacio="Ninguno."
                lineas={indicesAvance.map(
                  (i) => `${sinPunto(descripcionItem(update.avance[i].itemRef) ?? update.avance[i].itemRef)}: ${etiquetaEstadoAvance(update.avance[i].estado)}`,
                )}
              />
            ) : null}
            <ResumenSeccion titulo="Preguntas" vacio="Ninguna." lineas={indicesPreguntas.map((i) => update.preguntasParaSiguienteSesion[i])} />
            {vista.seguimiento ? (
              <>
                <ResumenSeccion titulo="Contexto" vacio="Ninguno." lineas={indicesContexto.map((i) => update.contexto[i].texto)} />
                <ResumenSeccion
                  titulo="Siguiente paso"
                  vacio="Ninguno."
                  lineas={selPaso && update.siguientePaso ? [update.siguientePaso.texto] : []}
                />
              </>
            ) : null}
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
            <Button disabled={guardando} onClick={() => enviarDecision({ accion: "aprobar", aprobacion })}>
              {conCambiosOSenales ? "Confirmar y aplicar" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación antes de rechazar. */}
      <Dialog open={dialogo === "rechazar"} onOpenChange={cambiarDialogo}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={alCerrarDialogo}>
          <DialogHeader>
            <DialogTitle>¿Rechazar la propuesta?</DialogTitle>
            <DialogDescription>No se aplica ningún cambio al perfil. La nota de la sesión queda guardada.</DialogDescription>
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

function ResumenSeccion({ titulo, vacio, lineas }: { titulo: string; vacio: string; lineas: string[] }) {
  return (
    <div>
      <h3 className="font-medium">
        {titulo} ({lineas.length})
      </h3>
      {lineas.length === 0 ? (
        <p className="text-muted-foreground">{vacio}</p>
      ) : (
        <ul className="list-disc pl-5">
          {lineas.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
