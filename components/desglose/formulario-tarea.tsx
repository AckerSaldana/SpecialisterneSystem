// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Pedir los pasos de una tarea (spec 010, R-010.1, R-010.3, R-010.18). Lo usan la persona y el coach, cada quien con sus
// textos, que llegan como datos desde su página. Mientras espera muestra un texto fijo, sin contador ni tiempo límite
// (C-14). Los errores son los textos de la ruta, y lo escrito sigue en el formulario. Al guardar, el foco va al título de
// la tarea nueva (enfocarDespues). Corre en el navegador de la persona: sin lib/profile/schema (C-09).
"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DesgloseCreadoResponse, MAX_CAMPO_CONTEXTO, MAX_TAREA, PedirDesgloseRequest } from "@/lib/desglose/schema-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { enfocarDespues } from "@/components/coach/plan/foco";
import { llamarDesglose } from "./api";

export type TextosFormulario = {
  campoTarea: string;
  ayudaTarea: string;
  herramienta: string;
  plazo: string;
  conQuien: string;
  ayudaConQuien: string;
  antesDelBoton: string;
  boton: string;
  esperando: string;
  errorRed: string;
};

type Props = {
  // POST /api/engagements/[id]/task-breakdowns
  url: string;
  // A dónde ir con el id de la tarea nueva: {rutaDetalle}/{id}.
  rutaDetalle: string;
  idFoco: string;
  textos: TextosFormulario;
};

export function FormularioTarea({ url, rutaDetalle, idFoco, textos }: Props) {
  const router = useRouter();
  const [tarea, setTarea] = useState("");
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

  async function pedir(e: FormEvent) {
    e.preventDefault();
    if (esperando) return;
    setEnviando(true);
    setError(null);
    // Un campo opcional vacío no se manda: el contrato pide al menos un carácter en cada uno.
    const contexto = {
      ...(herramienta.trim() ? { herramienta: herramienta.trim() } : {}),
      ...(plazo.trim() ? { plazo: plazo.trim() } : {}),
      ...(conQuien.trim() ? { conQuien: conQuien.trim() } : {}),
    };
    const cuerpo = { tarea, ...(Object.keys(contexto).length > 0 ? { contexto } : {}) } satisfies PedirDesgloseRequest;
    const r = await llamarDesglose(url, "POST", cuerpo, textos.errorRed);
    setEnviando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const creado = DesgloseCreadoResponse.safeParse(r.json);
    if (!creado.success) {
      setError(textos.errorRed);
      return;
    }
    enfocarDespues(idFoco);
    iniciar(() => router.push(`${rutaDetalle}/${creado.data.breakdownId}`));
  }

  return (
    <form onSubmit={pedir} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="tarea">{textos.campoTarea}</Label>
        <Textarea id="tarea" value={tarea} onChange={(e) => setTarea(e.target.value)} readOnly={esperando} maxLength={MAX_TAREA} rows={3} aria-describedby="tarea-ayuda" />
        <p id="tarea-ayuda" className="prose-measure text-sm text-muted-foreground">
          {textos.ayudaTarea}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tarea-herramienta">{textos.herramienta}</Label>
        <Input id="tarea-herramienta" value={herramienta} onChange={(e) => setHerramienta(e.target.value)} readOnly={esperando} maxLength={MAX_CAMPO_CONTEXTO} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tarea-plazo">{textos.plazo}</Label>
        <Input id="tarea-plazo" value={plazo} onChange={(e) => setPlazo(e.target.value)} readOnly={esperando} maxLength={MAX_CAMPO_CONTEXTO} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tarea-con-quien">{textos.conQuien}</Label>
        <Input id="tarea-con-quien" value={conQuien} onChange={(e) => setConQuien(e.target.value)} readOnly={esperando} maxLength={MAX_CAMPO_CONTEXTO} aria-describedby="tarea-con-quien-ayuda" />
        <p id="tarea-con-quien-ayuda" className="prose-measure text-sm text-muted-foreground">
          {textos.ayudaConQuien}
        </p>
      </div>

      <p className="prose-measure">{textos.antesDelBoton}</p>
      <div>
        <Button type="submit" size="lg" disabled={esperando}>
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
