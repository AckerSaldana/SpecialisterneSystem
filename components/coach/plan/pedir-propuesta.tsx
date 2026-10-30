// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Botón para pedir la propuesta de plan a la IA: POST /api/engagements/[id]/plans (sin body).
// Mientras espera muestra un texto fijo, sin contador ni barra de tiempo (C-14). Si la ruta
// responde 400 o 409 (sin perfil, sin consentimiento, ya hay borrador) se muestra su texto; si el
// modelo falla, el texto de error de la spec. Al terminar, router.refresh() trae el borrador.
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProposePlanResponse } from "@/lib/api/contracts";
import { Button } from "@/components/ui/button";
import { llamarApi } from "./api";
import { enfocarDespues } from "./foco";
import { ERROR_MODELO, ESPERANDO } from "./textos";
import { ID_BORRADOR } from "./tipos";

type Props = {
  engagementId: string;
  etiqueta: "Pedir propuesta de plan" | "Pedir propuesta nueva";
  // Textos que van debajo del botón (p. ej. de qué versión del perfil parte la propuesta).
  notas: string[];
};

export function PedirPropuesta({ engagementId, etiqueta, notas }: Props) {
  const router = useRouter();
  const [esperando, setEsperando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const idNotas = `notas-propuesta-${etiqueta === "Pedir propuesta nueva" ? "nueva" : "plan"}`;

  // El error se lee primero: el foco va a él.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function pedir() {
    setEsperando(true);
    setError(null);
    const r = await llamarApi(`/api/engagements/${engagementId}/plans`, { method: "POST" });
    if (!r.ok) {
      setError(r.error && (r.status === 400 || r.status === 409) ? r.error : ERROR_MODELO);
      setEsperando(false);
      return;
    }
    if (!ProposePlanResponse.safeParse(r.json).success) {
      setError(ERROR_MODELO);
      setEsperando(false);
      return;
    }
    // "esperando" se queda en true: al refrescar, el borrador reemplaza este botón.
    enfocarDespues(ID_BORRADOR);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button size="lg" onClick={pedir} disabled={esperando} aria-describedby={notas.length > 0 ? idNotas : undefined}>
          {etiqueta}
        </Button>
      </div>
      {notas.length > 0 ? (
        <div id={idNotas} className="flex flex-col gap-1">
          {notas.map((n) => (
            <p key={n} className="prose-measure text-sm">
              {n}
            </p>
          ))}
        </div>
      ) : null}
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
