// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Casilla y botón del consentimiento (spec 002, R-002.22, R-002.26). La casilla viene desmarcada
// y el servidor la vuelve a revisar (./actions.ts). El error queda en texto junto a la casilla y
// recibe el foco. "No por ahora" es un enlace a su pantalla: no registra nada.
"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { otorgarConsentimiento, type ConsentimientoState } from "./actions";

const estadoInicial: ConsentimientoState = { error: null, campo: null };

export function FormularioConsentimiento() {
  const [state, formAction, pending] = useActionState(otorgarConsentimiento, estadoInicial);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);

  const errorCasilla = state.error !== null && state.campo === "casilla";

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <label
        htmlFor="acepto"
        className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-3 has-checked:border-2 has-checked:border-primary"
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
          className="mt-1 size-5 shrink-0 accent-primary"
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
