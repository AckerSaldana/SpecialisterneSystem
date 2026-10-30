// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Botón "Esto no me representa". Abre un Dialog con un comentario opcional y lo
// envía a POST /api/persona/feedback. El resultado se muestra en la misma tarjeta.
// dimension = null significa "el perfil en general".
"use client";

import { useRef, useState } from "react";
import { ApiError, FeedbackRequest, FeedbackResponse } from "@/lib/api/contracts";
import type { DimensionId } from "@/lib/profile/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  dimension: DimensionId | null;
  // Nombre de la parte del perfil, para que el Dialog diga de qué se trata.
  sobre: string;
  textoBoton?: string;
};

export function NotMeButton({ dimension, sobre, textoBoton = "Esto no me representa" }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const mensajeRef = useRef<HTMLParagraphElement>(null);

  // Un id distinto por botón, porque hay varios en la misma página.
  const idCampo = `que-cambiarias-${dimension ?? "general"}`;

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      const body = FeedbackRequest.parse({ dimension, comentario });
      const res = await fetch("/api/persona/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const err = ApiError.safeParse(json);
        setError(err.success ? err.data.error : "No se pudo enviar. Intenta de nuevo.");
        return;
      }
      FeedbackResponse.parse(json);
      setEnviado(true);
      setAbierto(false);
    } catch {
      setError("No se pudo enviar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* El Dialog sigue montado después de enviar, para poder mover el foco al mensaje al cerrarse. */}
      <Dialog
        open={abierto}
        onOpenChange={(v) => {
          if (!enviando) setAbierto(v);
        }}
      >
        {enviado ? (
          // tabIndex -1 para poder mover el foco aquí al cerrar el Dialog.
          <p ref={mensajeRef} tabIndex={-1} role="status" className="text-sm font-medium outline-none">
            Tu coach lo va a revisar contigo.
          </p>
        ) : (
          <DialogTrigger asChild>
            <Button variant="outline" className="w-fit">
              {textoBoton}
            </Button>
          </DialogTrigger>
        )}
        <DialogContent
          showCloseButton={false}
          onCloseAutoFocus={(e) => {
            // Si ya se envió, el botón ya no existe: el foco va al mensaje.
            if (enviado) {
              e.preventDefault();
              mensajeRef.current?.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Esto no me representa</DialogTitle>
            <DialogDescription>Sobre: {sobre}. Tu coach recibe tu mensaje y lo habla contigo.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={idCampo}>¿Qué cambiarías? (opcional)</Label>
            <Textarea
              id={idCampo}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              readOnly={enviando}
              maxLength={2000}
              rows={4}
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>
                <p>{error}</p>
              </AlertDescription>
            </Alert>
          ) : null}
          <p role="status" className="text-sm">
            {enviando ? "Enviando." : ""}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={enviando}>
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={enviar} disabled={enviando}>
              Enviar a mi coach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
