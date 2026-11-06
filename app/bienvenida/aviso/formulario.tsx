// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Casilla y botón del consentimiento (spec 002, R-002.22, R-002.26). La casilla viene desmarcada
// y el servidor la vuelve a revisar (./actions.ts). El error queda en texto junto a la casilla y
// recibe el foco. Después de un error del sistema, la casilla se queda como ella la dejó: el mensaje le pide intentar de
// nuevo, y desmarcarla sin avisar la haría chocar con otro error (enviarSinReiniciar). "No por ahora" es un enlace a su
// pantalla: no registra nada.
"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { conFalloDeRed, enviarSinReiniciar, ERROR_SIN_RESPUESTA } from "@/components/formulario-accion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { otorgarConsentimiento, type ConsentimientoState } from "./actions";

const estadoInicial: ConsentimientoState = { error: null, campo: null };
const otorgar = conFalloDeRed<ConsentimientoState>(otorgarConsentimiento, () => ({ error: ERROR_SIN_RESPUESTA, campo: null }));

export function FormularioConsentimiento() {
  const [state, formAction, pending] = useActionState(otorgar, estadoInicial);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);

  const errorCasilla = state.error !== null && state.campo === "casilla";

  return (
    <form action={formAction} onSubmit={enviarSinReiniciar(formAction)} className="flex flex-col gap-4" noValidate>
      {/* Opción de respuesta de DISENO.md (spec 012, R-012.14): bloque de 64px o más; marcada, en el acento. */}
      <label
        htmlFor="acepto"
        className="flex min-h-16 cursor-pointer items-start gap-3 rounded-md border-(length:--border-w) border-border bg-muted p-4 text-foreground transition-colors has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground"
      >
        <input
          id="acepto"
          name="acepto"
          type="checkbox"
          value="si"
          // Desmarcada siempre al cargar (R-002.22).
          defaultChecked={false}
          aria-invalid={errorCasilla ? true : undefined}
          aria-describedby={errorCasilla ? "consentimiento-error" : undefined}
          className="mt-1 size-5 shrink-0 accent-primary checked:accent-primary-foreground"
        />
        <span className="prose-measure">
          Leí el aviso y doy mi consentimiento para que mi coach guarde mis datos en este sistema y use la inteligencia
          artificial como dice el aviso.
        </span>
      </label>

      {state.error ? (
        <Alert variant="destructive" id="consentimiento-error" ref={errorRef} tabIndex={-1} className="foco-destino">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Guardando…" : "Dar mi consentimiento"}
        </Button>
        <Link href="/bienvenida/no-por-ahora">No por ahora</Link>
      </div>
    </form>
  );
}
