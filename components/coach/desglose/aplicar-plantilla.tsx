// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// "Aplicar una plantilla" (spec 010, R-010.42): el coach elige una plantilla de su organización y puede dar contexto. La IA
// la adapta al perfil de la persona, que ve los pasos en cuanto se guardan. Mientras espera muestra un texto fijo, sin
// contador ni tiempo límite (C-14). Los errores son los textos de la ruta, y lo elegido sigue en el formulario. Al guardar,
// el foco va al título de la tarea nueva (enfocarDespues), donde el coach ve qué cambió.
"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AplicarPlantillaRequest } from "@/lib/api/contracts";
import { DesgloseCreadoResponse, MAX_CAMPO_CONTEXTO } from "@/lib/desglose/schema-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enfocarDespues } from "@/components/coach/plan/foco";
import { CLASE_SELECT } from "@/components/coach/plan/tipos";
import { llamarDesglose } from "@/components/desglose/api";
import { ELEGIR_PLANTILLA, ERROR_PREPARAR, ID_TITULO_TAREA, PLANTILLA_NO_DISPONIBLE, rutaTarea, textosAplicar } from "./textos";

export type PlantillaParaElegir = { id: string; etiqueta: string };

export function AplicarPlantilla({ engagementId, plantillas, nombre }: { engagementId: string; plantillas: PlantillaParaElegir[]; nombre: string }) {
  const router = useRouter();
  const textos = textosAplicar(nombre);
  const [plantillaId, setPlantillaId] = useState("");
  const [herramienta, setHerramienta] = useState("");
  const [plazo, setPlazo] = useState("");
  const [conQuien, setConQuien] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [navegando, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const esperando = enviando || navegando;

  // El error se lee primero: el foco va a él.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function aplicar(e: FormEvent) {
    e.preventDefault();
    if (esperando) return;
    setError(null);
    if (!plantillaId) {
      setError(ELEGIR_PLANTILLA);
      return;
    }
    setEnviando(true);
    // Un campo opcional vacío no se manda: el contrato pide al menos un carácter en cada uno.
    const contexto = {
      ...(herramienta.trim() ? { herramienta: herramienta.trim() } : {}),
      ...(plazo.trim() ? { plazo: plazo.trim() } : {}),
      ...(conQuien.trim() ? { conQuien: conQuien.trim() } : {}),
    };
    const cuerpo = { plantillaId, ...(Object.keys(contexto).length > 0 ? { contexto } : {}) } satisfies AplicarPlantillaRequest;
    const r = await llamarDesglose(`/api/engagements/${engagementId}/task-breakdowns/from-template`, "POST", cuerpo, ERROR_PREPARAR);
    setEnviando(false);
    if (!r.ok) {
      setError(r.error);
      // Otro coach la archivó o se retiró el consentimiento de su origen: el refresco la quita de la lista.
      if ((r.status === 404 || r.status === 409) && r.error === PLANTILLA_NO_DISPONIBLE) {
        setPlantillaId("");
        iniciar(() => router.refresh());
      }
      return;
    }
    const creado = DesgloseCreadoResponse.safeParse(r.json);
    if (!creado.success) {
      setError(ERROR_PREPARAR);
      return;
    }
    enfocarDespues(ID_TITULO_TAREA);
    iniciar(() => router.push(rutaTarea(engagementId, creado.data.breakdownId)));
  }

  return (
    <form onSubmit={aplicar} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="aplicar-plantilla">{textos.campo}</Label>
        <select id="aplicar-plantilla" value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)} disabled={esperando} aria-describedby="aplicar-plantilla-ayuda" className={CLASE_SELECT}>
          <option value="">{textos.elegir}</option>
          {plantillas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.etiqueta}
            </option>
          ))}
        </select>
        <p id="aplicar-plantilla-ayuda" className="prose-measure text-sm text-muted-foreground">
          {textos.ayuda}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="aplicar-herramienta">{textos.herramienta}</Label>
        <Input id="aplicar-herramienta" value={herramienta} onChange={(e) => setHerramienta(e.target.value)} readOnly={esperando} maxLength={MAX_CAMPO_CONTEXTO} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="aplicar-plazo">{textos.plazo}</Label>
        <Input id="aplicar-plazo" value={plazo} onChange={(e) => setPlazo(e.target.value)} readOnly={esperando} maxLength={MAX_CAMPO_CONTEXTO} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="aplicar-con-quien">{textos.conQuien}</Label>
        <Input id="aplicar-con-quien" value={conQuien} onChange={(e) => setConQuien(e.target.value)} readOnly={esperando} maxLength={MAX_CAMPO_CONTEXTO} aria-describedby="aplicar-con-quien-ayuda" />
        <p id="aplicar-con-quien-ayuda" className="prose-measure text-sm text-muted-foreground">
          {textos.ayudaConQuien}
        </p>
      </div>

      <p className="prose-measure">{textos.antesDelBoton}</p>
      <div>
        <Button type="submit" variant="outline" disabled={esperando}>
          {textos.boton}
        </Button>
      </div>
      <p role="status" className="prose-measure font-medium">
        {esperando ? textos.esperando : ""}
      </p>
      {error ? (
        <p ref={errorRef} tabIndex={-1} role="alert" className="foco-destino prose-measure font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
