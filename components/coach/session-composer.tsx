// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Formulario de la nota de sesión. Envía la nota a POST /api/engagements/[id]/sessions
// y, con la respuesta, muestra la revisión de la propuesta (ProposalReview).
// La propuesta queda guardada como evento "propuesto" en cuanto llega la respuesta,
// aunque el coach cierre la página sin decidir.
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, ProposeRequest, ProposeResponse } from "@/lib/api/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProposalReview } from "./proposal-review";

// Lee el mensaje { error } de una respuesta fallida; si no viene, usa uno genérico.
async function leerError(res: Response, porDefecto: string): Promise<string> {
  try {
    const parsed = ApiError.safeParse(await res.json());
    if (parsed.success) return parsed.data.error;
  } catch {
    // La respuesta no era JSON.
  }
  return porDefecto;
}

export function SessionComposer({ engagementId }: { engagementId: string }) {
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sube en cada error, aunque el mensaje se repita: así el efecto de abajo vuelve a correr.
  const [intentosConError, setIntentosConError] = useState(0);
  const [respuesta, setRespuesta] = useState<ProposeResponse | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  function mostrarError(mensaje: string) {
    setError(mensaje);
    setIntentosConError((n) => n + 1);
  }

  // El foco va al mensaje de error para que el lector de pantalla lo lea, también si es el mismo de antes.
  useEffect(() => {
    if (intentosConError > 0) errorRef.current?.focus();
  }, [intentosConError]);

  async function pedirPropuesta(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Misma validación que el servidor, para avisar antes de enviar.
    const body = ProposeRequest.safeParse({ nota });
    if (!body.success) {
      mostrarError(body.error.issues[0]?.message ?? "Revisa la nota.");
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body.data),
      });
      if (!res.ok) {
        mostrarError(await leerError(res, "No se pudo generar la propuesta. Intenta de nuevo."));
        return;
      }
      setRespuesta(ProposeResponse.parse(await res.json()));
    } catch {
      mostrarError("No se pudo generar la propuesta. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  // Con la propuesta lista, la nota queda solo de consulta y se muestra la revisión.
  if (respuesta) {
    return (
      <div className="flex flex-col gap-6">
        <details>
          <summary className="cursor-pointer text-sm font-medium">Ver la nota que enviaste</summary>
          <p className="prose-measure mt-2 whitespace-pre-wrap rounded-lg border p-3 text-sm">{nota}</p>
        </details>
        <ProposalReview engagementId={engagementId} respuesta={respuesta} />
      </div>
    );
  }

  return (
    <form onSubmit={pedirPropuesta} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="nota">Nota de la sesión</Label>
        <p id="nota-ayuda" className="prose-measure text-sm text-muted-foreground">
          Escribe con tus palabras lo que pasó en la sesión. La IA propone cambios al perfil y cita partes de esta
          nota. Tú decides qué se aplica. La persona no ve esta nota.
        </p>
        <Textarea
          id="nota"
          name="nota"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          readOnly={enviando}
          aria-describedby={error ? "nota-ayuda nota-error" : "nota-ayuda"}
          aria-invalid={error ? true : undefined}
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
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <div>
          <Button type="submit" size="lg" disabled={enviando}>
            Pedir propuesta
          </Button>
        </div>
        {/* Estado en texto, sin spinner. aria-live lo anuncia a lectores de pantalla. */}
        <p role="status" aria-live="polite" className="text-sm">
          {enviando ? "Generando la propuesta. Puede tardar unos segundos." : ""}
        </p>
      </div>
    </form>
  );
}
