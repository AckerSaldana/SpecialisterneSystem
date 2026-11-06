// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Botón "Esto no me representa". Abre un Dialog con un comentario opcional y lo envía a
// POST /api/persona/feedback. Sirve para el perfil y para el plan (spec 005, R-005.22, R-005.32).
// dimension = null y planItemId = null significan "en general".
// El estado guardado llega de la página (R-005.24, R-005.28): mientras está pendiente no hay botón, y
// ya cerrado se muestra el resultado y el botón vuelve a estar disponible. Al enviar, la página se
// refresca; mientras tanto se muestra lo mismo que va a llegar del servidor.
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
// Solo contracts-cliente y texto-comentario: este archivo llega al navegador de la persona y no puede
// traer los valores de lib/profile/schema (C-09, R-005.2). DimensionId entra solo como tipo.
import { ApiError, FeedbackCuerpo, FeedbackResponse } from "@/lib/api/contracts-cliente";
import { textoEstado, textoSobre, type VistaEstado } from "@/lib/persona/texto-comentario";
import type { DimensionId } from "@/lib/profile/schema";
import { formatFecha } from "@/components/coach/labels";
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
  origen?: "perfil" | "plan";
  dimension?: DimensionId | null;
  planItemId?: string | null;
  // Nombre de la parte, para que el Dialog diga de qué se trata.
  sobre: string;
  textoBoton?: string;
  estado?: VistaEstado | null;
};

export function NotMeButton({
  origen = "perfil",
  dimension = null,
  planItemId = null,
  sobre,
  textoBoton = "Esto no me representa",
  estado = null,
}: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cuándo se envió, hasta que el refresco traiga el estado guardado.
  const [enviadoEn, setEnviadoEn] = useState<Date | null>(null);
  const mensajeRef = useRef<HTMLParagraphElement>(null);
  const moverFoco = useRef(false);

  if (enviadoEn && estado?.pendiente) setEnviadoEn(null);

  const pendiente = enviadoEn !== null || estado?.pendiente === true;
  const mensaje = enviadoEn ? textoEstado({ origen, resultado: "pendiente" }, formatFecha(enviadoEn)) : (estado?.texto ?? null);

  // Un id distinto por botón, porque hay varios en la misma página.
  const idCampo = `que-cambiarias-${origen}-${planItemId ?? dimension ?? "general"}`;

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      const body = FeedbackCuerpo.parse({ dimension, comentario, origen, ...(origen === "plan" ? { planItemId } : {}) });
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
      moverFoco.current = true;
      setEnviadoEn(new Date());
      setComentario("");
      setAbierto(false);
      router.refresh();
    } catch {
      setError("No se pudo enviar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {mensaje ? (
        // tabIndex -1 para poder mover el foco aquí al cerrar el Dialog.
        <p ref={mensajeRef} tabIndex={-1} role="status" className="prose-measure text-sm font-medium outline-none">
          {mensaje}
        </p>
      ) : null}
      {/* El Dialog sigue montado después de enviar, para poder mover el foco al mensaje al cerrarse. */}
      <Dialog
        open={abierto}
        onOpenChange={(v) => {
          if (!enviando) setAbierto(v);
        }}
      >
        {pendiente ? null : (
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
            if (moverFoco.current) {
              moverFoco.current = false;
              e.preventDefault();
              mensajeRef.current?.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Esto no me representa</DialogTitle>
            <DialogDescription>{textoSobre(sobre)}</DialogDescription>
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
