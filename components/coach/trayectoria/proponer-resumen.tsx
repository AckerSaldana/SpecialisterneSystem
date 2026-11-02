// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Botón para pedir la propuesta de resumen de un dominio (spec 008, R-008.33). Mientras espera muestra
// un texto fijo, sin contador ni tiempo límite (C-14). Un 409 quiere decir que la página ya no está al
// día (hay otra propuesta, el bloque quedó vacío o se retiró el consentimiento): también se refresca.
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PedirResumenRequest } from "@/lib/api/contracts";
import type { DominioFE } from "@/lib/profile/schema";
import { Button } from "@/components/ui/button";
import { llamarApi } from "@/components/coach/plan/api";
import { enfocarDespues } from "@/components/coach/plan/foco";
import { TEXTOS_RESUMEN as T } from "./textos";

type Props = {
  engagementId: string;
  dominio: DominioFE;
  etiqueta: string;
  // El título de esta sección: el botón desaparece cuando llega la propuesta (R-008.27).
  idFoco: string;
};

export function ProponerResumen({ engagementId, dominio, etiqueta, idFoco }: Props) {
  const router = useRouter();
  const [esperando, setEsperando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // El error se lee primero: el foco va a él.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function pedir() {
    setEsperando(true);
    setError(null);
    const cuerpo: PedirResumenRequest = { dominio };
    const r = await llamarApi(`/api/engagements/${engagementId}/funcion-ejecutiva/resumenes`, { method: "POST", body: cuerpo });
    if (!r.ok) {
      setError(r.error ?? T.errorModelo);
      setEsperando(false);
      if (r.status === 409) {
        enfocarDespues(idFoco);
        router.refresh();
      }
      return;
    }
    // "esperando" se queda en true: al refrescar, la propuesta reemplaza este botón.
    enfocarDespues(idFoco);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" size="sm" onClick={pedir} disabled={esperando}>
          {etiqueta}
        </Button>
      </div>
      <p role="status" className="prose-measure text-sm font-medium">
        {esperando ? T.generando : ""}
      </p>
      {error ? (
        <p ref={errorRef} tabIndex={-1} role="alert" className="foco-destino prose-measure text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
