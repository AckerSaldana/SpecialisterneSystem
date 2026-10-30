// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// "Agregar ..." al final de cada grupo del borrador (spec 003, tarea 18). El coach escribe un punto
// propio: nace con origen "coach", sin evidencia y sin propuesta_ref (R-003.23, R-003.25).
// POST /api/plans/[id]/items con ItemPlanCrear y, si sale bien, router.refresh().
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ItemPlanCrear, ItemPlanRespuesta } from "@/lib/api/contracts";
import { esVisiblePersona, type TipoItemPlan } from "@/lib/plan/schema";
import { Button } from "@/components/ui/button";
import { ERROR_GUARDAR, llamarApi } from "./api";
import { CamposItem, type ValoresItem } from "./campos-item";
import { enfocarDespues, useFocoPendiente } from "./foco";
import { idAgregar, type FichaOpcion, type PuntoVigente } from "./tipos";

type Props = {
  planId: string;
  tipo: TipoItemPlan;
  etiqueta: string; // "Agregar objetivo", "Agregar apoyo", ... (TIPOS_ITEM_PLAN)
  nombre: string;
  fichas: FichaOpcion[];
  vigente: { version: number; puntos: PuntoVigente[] } | null;
};

const VACIO: ValoresItem = { descripcion: "", textoPersona: "", fichaId: "", origenItemId: "" };

export function AgregarItem({ planId, tipo, etiqueta, nombre, fichas, vigente }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<ValoresItem>(VACIO);
  const [errorDescripcion, setErrorDescripcion] = useState<string | null>(null);
  // Cuántas veces se intentó guardar sin texto. El foco va al campo después de pintar el error,
  // así el lector de pantalla lee el campo ya con su aria-describedby.
  const [intentoVacio, setIntentoVacio] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const botonRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const prefijo = `nuevo-${tipo}`;

  useFocoPendiente(idAgregar(tipo), botonRef);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  // Al abrir el formulario, el foco va al primer campo.
  useEffect(() => {
    if (abierto) document.getElementById(`${prefijo}-descripcion`)?.focus();
  }, [abierto, prefijo]);

  // Después de pintar "Escribe el punto.", el foco vuelve al campo vacío.
  useEffect(() => {
    if (intentoVacio > 0) document.getElementById(`${prefijo}-descripcion`)?.focus();
  }, [intentoVacio, prefijo]);

  function cerrar() {
    setAbierto(false);
    setValores(VACIO);
    setError(null);
    setErrorDescripcion(null);
    enfocarDespues(idAgregar(tipo));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const body = ItemPlanCrear.safeParse({
      tipo,
      descripcion: valores.descripcion,
      // Solo objetivo y apoyo_fe llevan texto para la persona (R-003.11).
      textoPersona: esVisiblePersona(tipo) ? valores.textoPersona.trim() || null : null,
      fichaId: valores.fichaId || null,
      origenItemId: vigente ? valores.origenItemId || null : null,
    });
    if (!body.success) {
      // El único error posible con los límites del formulario es el texto vacío ("Escribe el punto.").
      setErrorDescripcion(body.error.issues[0]?.message ?? "Escribe el punto.");
      setIntentoVacio((n) => n + 1);
      return;
    }
    setErrorDescripcion(null);
    setGuardando(true);
    const r = await llamarApi(`/api/plans/${planId}/items`, { method: "POST", body: body.data });
    setGuardando(false);
    if (!r.ok || !ItemPlanRespuesta.safeParse(r.json).success) {
      setError((!r.ok && r.error) || ERROR_GUARDAR);
      return;
    }
    cerrar();
    router.refresh();
  }

  if (!abierto) {
    return (
      <div>
        <Button ref={botonRef} variant="outline" onClick={() => setAbierto(true)} className="foco-destino">
          {etiqueta}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={guardar} noValidate aria-label={etiqueta} className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
      <p className="font-medium">{etiqueta}</p>
      <CamposItem
        prefijo={prefijo}
        tipo={tipo}
        nombre={nombre}
        valores={valores}
        cambiar={(v) => setValores((prev) => ({ ...prev, ...v }))}
        fichas={fichas}
        fichaActual={null}
        vigente={vigente}
        errorDescripcion={errorDescripcion}
        disabled={guardando}
      />
      <p role="status" className="text-sm">
        {guardando ? "Guardando el cambio." : ""}
      </p>
      {error ? (
        <p ref={errorRef} tabIndex={-1} role="alert" className="foco-destino prose-measure font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={guardando}>
          Guardar cambio
        </Button>
        <Button type="button" variant="outline" disabled={guardando} onClick={cerrar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
