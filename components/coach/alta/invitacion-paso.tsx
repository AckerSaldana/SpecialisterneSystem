// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Paso 2 del alta: invitación con código de un solo uso (spec 002, R-002.13 a R-002.15, R-002.38).
// El código solo llega en la respuesta de la Server Action y vive en la memoria de esta pantalla:
// no va en la URL, no se guarda en el navegador y al recargar ya no se ve (R-002.47).
// Reemplazar un código pide confirmación con un Dialog (R-002.35).
"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { generarInvitacion, type InvitacionState } from "@/app/coach/engagements/[id]/actions";
import { conFalloDeRed, ERROR_SIN_RESPUESTA } from "@/components/formulario-accion";
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

// Lo que la página leyó de app.invitations (sin código: la tabla no lo tiene).
export type EstadoInvitacion =
  | { tipo: "sin_verificacion" }
  | { tipo: "ninguna" }
  | { tipo: "pendiente"; vence: string }
  | { tipo: "vencida"; vence: string }
  | { tipo: "usada"; fecha: string };

type Props = { engagementId: string; nombre: string; estado: EstadoInvitacion };

const estadoInicial: InvitacionState = { error: null, resultado: null };

export function InvitacionPaso({ engagementId, nombre, estado }: Props) {
  // El estado anterior (con el código) no se manda al servidor: la action solo recibe el FormData.
  const [state, formAction, pending] = useActionState(
    conFalloDeRed<InvitacionState>(
      (_prev, formData) => generarInvitacion(formData),
      (previo) => ({ ...previo, error: ERROR_SIN_RESPUESTA }),
    ),
    estadoInicial,
  );
  const [confirmando, setConfirmando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const avisoRef = useRef<HTMLDivElement>(null);

  // Después de cada respuesta, el foco va al resultado o al error para que se lea en voz alta.
  useEffect(() => {
    if (state.error || state.resultado) avisoRef.current?.focus();
  }, [state]);

  if (estado.tipo === "sin_verificacion") {
    return <p className="prose-measure">Primero registra la verificación del diagnóstico. Después puedes generar la invitación.</p>;
  }

  // R-002.38: invitación usada, sin botón para generar otro código.
  if (estado.tipo === "usada") {
    return (
      <div className="flex flex-col gap-3">
        {state.error ? (
          <Alert variant="destructive" ref={avisoRef} tabIndex={-1} className="foco-destino">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        <p className="prose-measure">
          {nombre} ya creó su contraseña el {estado.fecha}.
        </p>
      </div>
    );
  }

  const r = state.resultado;
  // Hay un código vigente si la página lo leyó o si se acaba de generar uno.
  const hayCodigo = r !== null || estado.tipo !== "ninguna";

  return (
    <div className="flex flex-col gap-4">
      {r ? (
        <div
          ref={avisoRef}
          tabIndex={-1}
          // Spec 012 (R-012.39): aviso con barra de acento, como el de la verificación.
          className="foco-destino prose-measure rounded-md border-l-4 border-primary bg-accent px-4 py-3"
        >
          <p>
            Código de invitación de {r.nombre}:{" "}
            <strong className="font-mono text-2xl tracking-wider">{r.codigo}</strong>. Dáselo en persona o por
            teléfono, no por un chat de grupo ni por un canal que vean otras personas. Este código solo se muestra
            esta vez. Vence el {r.vence}. {r.nombre} entra en {r.urlInvitacion}.
          </p>
        </div>
      ) : estado.tipo === "pendiente" ? (
        <p className="prose-measure">Hay un código pendiente. Vence el {estado.vence}.</p>
      ) : estado.tipo === "vencida" ? (
        // La spec no fija este texto; sigue el mismo formato que el pendiente.
        <p className="prose-measure">El código pendiente venció el {estado.vence}. Genera un código nuevo.</p>
      ) : null}

      {state.error ? (
        <Alert variant="destructive" ref={avisoRef} tabIndex={-1} className="foco-destino">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <form ref={formRef} action={formAction}>
        <input type="hidden" name="engagementId" value={engagementId} />
        {hayCodigo ? (
          <Dialog open={confirmando} onOpenChange={setConfirmando}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="lg" disabled={pending}>
                {pending ? "Generando…" : "Generar un código nuevo"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generar un código nuevo</DialogTitle>
                <DialogDescription>Vas a generar un código nuevo. El código anterior deja de funcionar.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  onClick={() => {
                    // El Dialog vive en un portal, fuera del form: se envía el form por su ref.
                    formRef.current?.requestSubmit();
                    setConfirmando(false);
                  }}
                >
                  Sí, generar uno nuevo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Generando…" : "Generar código de invitación"}
          </Button>
        )}
      </form>
    </div>
  );
}
