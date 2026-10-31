// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Formulario de la nota de sesión. Envía la nota a POST /api/engagements/[id]/sessions y, con la
// respuesta, manda a la página de revisión: hay una sola forma de revisar (R-004.26).
// En etapa de seguimiento pide además el tipo de sesión y la fecha (R-004.1).
// Si el modelo falla, la nota ya quedó guardada: el formulario queda solo de consulta y ofrece
// pedir la propuesta otra vez, sin escribirla de nuevo (R-004.29).
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, ProposeRequest, ProposeResponse } from "@/lib/api/contracts";
import { esFechaFutura } from "@/lib/followup/fecha";
import type { TipoSesion } from "@/lib/followup/schema";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  engagementId: string;
  nombre: string;
  seguimiento: boolean; // la etapa decide el flujo (R-004.57)
  sinPlan: boolean; // en seguimiento sin plan aprobado (R-004.3)
  hoy: string; // AAAA-MM-DD en Monterrey, calculado en el servidor
};

export function SessionComposer({ engagementId, nombre, seguimiento, sinPlan, hoy }: Props) {
  const router = useRouter();
  const [nota, setNota] = useState("");
  const [tipo, setTipo] = useState<TipoSesion>("persona");
  const [fecha, setFecha] = useState(hoy);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A qué campo corresponde el error. Los errores del modelo o de la red no marcan ningún campo.
  const [campoConError, setCampoConError] = useState<"nota" | "fecha" | null>(null);
  // No llegó respuesta de la ruta: la nota pudo haberse guardado, así que no se ofrece reenviarla.
  const [sinRespuesta, setSinRespuesta] = useState(false);
  // Sube en cada error, aunque el mensaje se repita: así el efecto de abajo vuelve a correr.
  const [intentosConError, setIntentosConError] = useState(0);
  // La sesión ya guardada cuyo modelo falló, y la propuesta que ya existía si se pide otra vez.
  const [sesionGuardada, setSesionGuardada] = useState<string | null>(null);
  const [propuestaExistente, setPropuestaExistente] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  function mostrarError(mensaje: string, campo: "nota" | "fecha" | null = null) {
    setError(mensaje);
    setCampoConError(campo);
    setIntentosConError((n) => n + 1);
  }

  // El foco va al mensaje de error para que el lector de pantalla lo lea, también si es el mismo de antes.
  useEffect(() => {
    if (intentosConError > 0) errorRef.current?.focus();
  }, [intentosConError]);

  // Manda la petición y resuelve la respuesta. Las dos rutas responden igual.
  async function pedir(url: string, cuerpo: ProposeRequest | null) {
    setError(null);
    setCampoConError(null);
    setEnviando(true);
    // Con éxito sigue en "enviando" hasta que cambie la página: si no, se podría enviar otra vez.
    let navegando = false;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: cuerpo ? { "Content-Type": "application/json" } : undefined,
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const err = ApiError.safeParse(json);
        if (!err.success) {
          perderRespuesta(cuerpo);
          return;
        }
        if (err.data.sessionId) setSesionGuardada(err.data.sessionId);
        if (err.data.eventId) setPropuestaExistente(err.data.eventId);
        mostrarError(err.data.error, res.status === 400 ? (err.data.error.includes("fecha") ? "fecha" : "nota") : null);
        return;
      }
      const { eventId } = ProposeResponse.parse(json);
      navegando = true;
      router.push(`/coach/engagements/${engagementId}/proposals/${eventId}`);
    } catch {
      perderRespuesta(cuerpo);
    } finally {
      if (!navegando) setEnviando(false);
    }
  }

  // Sin respuesta legible de la ruta. Reintentar una sesión ya guardada no duplica nada; reenviar la
  // nota sí podría, porque la ruta guarda la sesión antes de llamar al modelo.
  function perderRespuesta(cuerpo: ProposeRequest | null) {
    if (cuerpo) setSinRespuesta(true);
    mostrarError(
      cuerpo
        ? "No recibimos respuesta y la nota pudo haberse guardado. Revisa el acompañamiento antes de escribirla de nuevo: si se guardó, ahí aparece con la opción de pedir la propuesta."
        : "No se pudo generar la propuesta. Revisa tu conexión e intenta de nuevo.",
    );
  }

  async function pedirPropuesta(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCampoConError(null);
    if (sesionGuardada || sinRespuesta) return;

    // Misma validación que el servidor, para avisar antes de enviar.
    const body = ProposeRequest.safeParse(seguimiento ? { nota, tipo, fecha } : { nota });
    if (!body.success) {
      const issue = body.error.issues[0];
      mostrarError(issue?.message ?? "Revisa la nota.", issue?.path[0] === "fecha" ? "fecha" : "nota");
      return;
    }
    if (seguimiento && esFechaFutura(fecha)) {
      mostrarError("La fecha de la sesión no puede ser después de hoy.", "fecha");
      return;
    }
    await pedir(`/api/engagements/${engagementId}/sessions`, body.data);
  }

  const soloConsulta = enviando || sesionGuardada !== null || sinRespuesta;

  return (
    <form onSubmit={pedirPropuesta} className="flex flex-col gap-4" noValidate>
      {seguimiento && sinPlan ? (
        <Alert>
          <AlertTitle>Sin plan aprobado</AlertTitle>
          <AlertDescription>
            <p>Este acompañamiento todavía no tiene un plan aprobado. Puedes guardar la sesión, pero la IA no va a proponer avance del plan.</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {seguimiento ? (
        <>
          <fieldset disabled={soloConsulta} className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Tipo de sesión</legend>
            <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as TipoSesion)} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="persona" id="tipo-persona" />
                <Label htmlFor="tipo-persona">Sesión con {nombre}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="red_de_apoyo" id="tipo-red" />
                <Label htmlFor="tipo-red">Sesión con la red de apoyo (líder y mentor)</Label>
              </div>
            </RadioGroup>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="fecha">Fecha de la sesión</Label>
            <Input
              id="fecha"
              name="fecha"
              type="date"
              value={fecha}
              max={hoy}
              onChange={(e) => setFecha(e.target.value)}
              readOnly={soloConsulta}
              aria-describedby={campoConError === "fecha" ? "nota-error" : undefined}
              aria-invalid={campoConError === "fecha" ? true : undefined}
              className="w-fit"
            />
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="nota">Nota de la sesión</Label>
        <p id="nota-ayuda" className="prose-measure text-sm text-muted-foreground">
          {seguimiento && tipo === "red_de_apoyo"
            ? `Escribe lo que se habló con el líder y el mentor. No escribas sus nombres: usa "el líder" y "el mentor". ${nombre} no ve esta nota.`
            : "Escribe con tus palabras lo que pasó en la sesión. La IA propone cambios al perfil y cita partes de esta nota. Tú decides qué se aplica. La persona no ve esta nota."}
        </p>
        <Textarea
          id="nota"
          name="nota"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          readOnly={soloConsulta}
          aria-describedby={campoConError === "nota" ? "nota-ayuda nota-error" : "nota-ayuda"}
          aria-invalid={campoConError === "nota" ? true : undefined}
          rows={12}
          maxLength={20000}
          className="prose-measure min-h-64"
        />
      </div>

      {error ? (
        <Alert variant="destructive" id="nota-error" ref={errorRef} tabIndex={-1} className="foco-destino">
          <AlertTitle>No se pudo pedir la propuesta</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            {propuestaExistente ? (
              <p>
                <Link
                  href={`/coach/engagements/${engagementId}/proposals/${propuestaExistente}`}
                  className="font-medium underline underline-offset-4"
                >
                  Ver la propuesta
                </Link>
              </p>
            ) : null}
            {sinRespuesta ? (
              <p>
                <Link href={`/coach/engagements/${engagementId}`} className="font-medium underline underline-offset-4">
                  Volver al acompañamiento
                </Link>
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <div>
          {sinRespuesta ? null : sesionGuardada ? (
            propuestaExistente ? null : (
              <Button
                type="button"
                size="lg"
                disabled={enviando}
                onClick={() => pedir(`/api/engagements/${engagementId}/sessions/${sesionGuardada}/proposal`, null)}
              >
                Pedir la propuesta otra vez
              </Button>
            )
          ) : (
            <Button type="submit" size="lg" disabled={enviando}>
              Pedir propuesta
            </Button>
          )}
        </div>
        {/* Estado en texto, sin spinner. aria-live lo anuncia a lectores de pantalla. */}
        <p role="status" aria-live="polite" className="text-sm">
          {enviando ? "Generando la propuesta. Puede tardar unos segundos." : ""}
        </p>
      </div>
    </form>
  );
}
