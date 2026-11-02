// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// "Pedir un borrador" (spec 009, R-009.2). Mientras espera muestra un texto fijo, sin contador ni tiempo límite
// (C-14). Los errores son los textos de la ruta. Al llegar el borrador, el botón ya no existe: el foco va a su
// título (TituloEnfocable). Un 409 puede querer decir que su coach ya pidió uno: se refresca para que aparezca, y el
// mensaje va a la región de la página, porque este botón se va con el refresco (R-009.59).
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enfocarDespues } from "@/components/coach/plan/foco";
import { llamarGuia } from "./api";
import { avisar } from "./aviso";
import { ERROR_RED_PEDIR, ERROR_RED, ESPERANDO, ID_TITULO_BORRADOR, idFocoTras409, PEDIR, RESULTADOS } from "./textos";

export function PedirBorrador() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [refrescando, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const esperando = enviando || refrescando;

  // El error se lee primero: el foco va a él.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function pedir() {
    setEnviando(true);
    setError(null);
    avisar("");
    const r = await llamarGuia("/api/persona/shared-guides", "POST");
    setEnviando(false);
    if (!r.ok) {
      const destino = r.status === 409 ? idFocoTras409(r.error) : null;
      if (destino) {
        avisar(r.error);
        enfocarDespues(destino);
      } else {
        setError(r.error === ERROR_RED ? ERROR_RED_PEDIR : r.error);
      }
      if (r.status === 409) iniciar(() => router.refresh());
      return;
    }
    avisar(RESULTADOS.pedido);
    enfocarDespues(ID_TITULO_BORRADOR);
    iniciar(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" size="lg" onClick={pedir} disabled={esperando}>
          {PEDIR}
        </Button>
      </div>
      <p role="status" className="prose-measure font-medium">
        {esperando ? ESPERANDO : ""}
      </p>
      {error ? (
        <p ref={errorRef} tabIndex={-1} role="alert" className="foco-destino prose-measure font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
