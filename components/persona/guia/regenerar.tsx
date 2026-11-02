// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// El aviso de que su perfil o su plan cambiaron y el botón para ver qué cambiaría (spec 009, R-009.46, R-009.47).
// La página lo muestra cuando ella entra: no aparece solo, y nada se genera sin que lo pida (C-14). Mientras
// espera muestra un texto fijo, sin contador ni tiempo límite. "No hay nada que cambiar" no es un error: se lee
// como resultado. Los demás errores son los textos de la ruta.
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enfocarDespues } from "@/components/coach/plan/foco";
import { llamarGuia } from "./api";
import { avisar } from "./aviso";
import { AVISO_CAMBIOS, ERROR_RED, ERROR_RED_PEDIR, ESPERANDO, ID_TITULO_BORRADOR, idFocoTras409, RESULTADOS, SIN_CAMBIOS, VER_QUE_CAMBIARIA } from "./textos";

export function AvisoCambios() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [refrescando, iniciar] = useTransition();
  const [sinCambios, setSinCambios] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const esperando = enviando || refrescando;

  // El error se lee primero: el foco va a él.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function pedir() {
    setEnviando(true);
    setSinCambios(false);
    setError(null);
    avisar("");
    const r = await llamarGuia("/api/persona/shared-guides", "POST");
    setEnviando(false);
    if (!r.ok) {
      const destino = r.status === 409 ? idFocoTras409(r.error) : null;
      if (r.error === SIN_CAMBIOS) setSinCambios(true);
      else if (destino) {
        // Este aviso se va con el refresco: el mensaje va a la región de la página (R-009.59).
        avisar(r.error);
        enfocarDespues(destino);
      } else setError(r.error === ERROR_RED ? ERROR_RED_PEDIR : r.error);
      if (destino) iniciar(() => router.refresh());
      return;
    }
    avisar(RESULTADOS.pedido);
    enfocarDespues(ID_TITULO_BORRADOR);
    iniciar(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-primary bg-accent p-4">
      <p className="prose-measure font-medium">{AVISO_CAMBIOS}</p>
      <div>
        <Button type="button" onClick={pedir} disabled={esperando}>
          {VER_QUE_CAMBIARIA}
        </Button>
      </div>
      <p role="status" className="prose-measure font-medium">
        {esperando ? ESPERANDO : sinCambios ? SIN_CAMBIOS : ""}
      </p>
      {error ? (
        <p ref={errorRef} tabIndex={-1} role="alert" className="foco-destino prose-measure font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
