// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Borrador del plan (spec 003, tarea 18): encabezado, avisos de lo que quitó la validación, los
// seis grupos en orden con sus puntos y "Agregar ...", y al final "Aprobar plan" y "Descartar
// borrador", cada uno con su Dialog de confirmación (C-14). La decisión va a
// POST /api/plans/[id]/decision; los errores de aprobación llegan con su texto literal y se
// muestran tal cual, con el foco movido al punto que hay que corregir (si llega "ruta") o al error.
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlanDecisionResponse, type ItemPlanVista, type PlanDecisionRequest } from "@/lib/api/contracts";
import type { DescartadoPlan } from "@/lib/plan/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { llamarApi } from "./api";
import { AgregarItem } from "./agregar-item";
import { enfocarDespues } from "./foco";
import { ItemPlan } from "./item-plan";
import { TituloEnfocable } from "./titulo-enfocable";
import {
  APROBAR_TITULO,
  DESCARTAR_TEXTO,
  DESCARTAR_TITULO,
  TEXTO_FIJO_BORRADOR,
  aprobarTexto,
  encabezadoBorrador,
  mensajeDescartado,
  notaGrupo,
} from "./textos";
import {
  ID_BORRADOR,
  ID_SECCION,
  ID_VIGENTE,
  agruparPorTipo,
  idEditar,
  idGrupo,
  type FichaOpcion,
  type PuntoVigente,
} from "./tipos";

type Props = {
  planId: string;
  nombre: string;
  snapshotVersion: number;
  items: ItemPlanVista[];
  descartados: DescartadoPlan[];
  fichas: FichaOpcion[];
  fechasSesion: Record<string, string>;
  // Plan vigente (aprobado con la versión más alta) para "Sigue al punto". null si no hay.
  vigente: { version: number; puntos: PuntoVigente[] } | null;
};

const ERROR_DECISION = "No se guardó la decisión. Revisa tu conexión e intenta de nuevo.";

// Si el error es de un punto (R-003.30), el foco va a ese punto: su botón "Editar" o, si ya se
// está editando, su texto. El error sigue anunciándose (role="alert"). Si no, va al error.
function enfocarError(ruta: string | null, respaldo: HTMLElement | null) {
  const punto = ruta
    ? (document.getElementById(idEditar(ruta)) ?? document.getElementById(`item-${ruta}-descripcion`))
    : null;
  (punto ?? respaldo)?.focus();
}

export function BorradorPlan({ planId, nombre, snapshotVersion, items, descartados, fichas, fechasSesion, vigente }: Props) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<"aprobar" | "descartar" | null>(null);
  const [guardando, setGuardando] = useState(false);
  // El error de la decisión guarda la firma de los puntos que había cuando llegó. Si el coach
  // edita, agrega o quita un punto, router.refresh() trae puntos nuevos y el error deja de
  // mostrarse: ya no describe el borrador que está en pantalla.
  const [errorDecision, setErrorDecision] = useState<{ texto: string; ruta: string | null; firma: string } | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  // Punto que bloqueó la aprobación (su id), para llevar el foco a él al cerrar el Dialog.
  const rutaError = useRef<string | null>(null);
  // Cómo terminó el último Dialog, para decidir a dónde va el foco al cerrarlo.
  const resultado = useRef<"ok" | "error" | null>(null);

  const firma = JSON.stringify(items);
  const error = errorDecision && errorDecision.firma === firma ? errorDecision.texto : null;

  useEffect(() => {
    if (errorDecision) enfocarError(errorDecision.ruta, errorRef.current);
  }, [errorDecision]);

  // Lo que quitó sanitizePlan al guardar la propuesta. Cada aviso aparece una vez.
  const avisosDescartados = [
    ...new Set(descartados.map((d) => mensajeDescartado(d.motivo)).filter((m): m is string => m !== null)),
  ];

  async function decidir(body: PlanDecisionRequest) {
    setGuardando(true);
    setErrorDecision(null);
    const r = await llamarApi(`/api/plans/${planId}/decision`, { method: "POST", body });
    setGuardando(false);
    const ok = r.ok && PlanDecisionResponse.safeParse(r.json).success;
    resultado.current = ok ? "ok" : "error";
    setDialogo(null);
    if (!ok) {
      rutaError.current = r.ok ? null : r.ruta;
      setErrorDecision({ texto: (!r.ok && r.error) || ERROR_DECISION, ruta: rutaError.current, firma });
      return;
    }
    // Aprobado: el foco va al plan vigente nuevo. Descartado: al título de la sección.
    enfocarDespues(body.accion === "aprobar" ? ID_VIGENTE : ID_SECCION);
    router.refresh();
  }

  function cambiarDialogo(abierto: boolean) {
    if (!abierto && !guardando) setDialogo(null);
  }

  // Si hubo error, el foco va al punto que lo causó o al error; si salió bien, lo toma el destino
  // de enfocarDespues. Si el coach volvió al borrador, Radix regresa el foco al botón que abrió el Dialog.
  function alCerrarDialogo(e: Event) {
    if (resultado.current !== null) {
      e.preventDefault();
      if (resultado.current === "error") enfocarError(rutaError.current, errorRef.current);
    }
    resultado.current = null;
  }

  return (
    <section aria-labelledby={ID_BORRADOR} className="flex flex-col gap-6 rounded-xl border-2 border-dashed p-4">
      <div className="flex flex-col gap-2">
        <TituloEnfocable id={ID_BORRADOR} nivel={3} className="text-lg font-semibold">
          {encabezadoBorrador(snapshotVersion)}
        </TituloEnfocable>
        <p className="prose-measure">{TEXTO_FIJO_BORRADOR}</p>
      </div>

      {avisosDescartados.length > 0 ? (
        <ul role="note" className="prose-measure flex flex-col gap-1 rounded-lg border-2 border-primary bg-accent p-4 font-medium">
          {avisosDescartados.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}

      {agruparPorTipo(items).map((grupo) => {
        const nota = notaGrupo(grupo.id, nombre);
        // Puntos del plan vigente del mismo tipo. Uno que ya sigue otro ítem del borrador no se
        // ofrece a los demás (índice único plan_items_origen_unico, R-003.51).
        const puntosTipo = vigente ? vigente.puntos.filter((p) => p.tipo === grupo.id) : [];
        const usados = (itemId: string | null) =>
          new Set(items.filter((i) => i.id !== itemId && i.origenItemId).map((i) => i.origenItemId as string));
        const vigenteGrupo = (itemId: string | null) =>
          vigente ? { version: vigente.version, puntos: puntosTipo.filter((p) => !usados(itemId).has(p.id)) } : null;
        return (
          <section key={grupo.id} aria-labelledby={idGrupo(grupo.id)} className="flex flex-col gap-3">
            <TituloEnfocable id={idGrupo(grupo.id)} nivel={4} className="font-semibold">
              {grupo.grupo}
            </TituloEnfocable>
            {nota ? <p className="prose-measure text-sm text-muted-foreground">{nota}</p> : null}
            {grupo.items.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {grupo.items.map((item) => (
                  <ItemPlan
                    key={item.id}
                    item={item}
                    nombre={nombre}
                    fichas={fichas}
                    fechasSesion={fechasSesion}
                    vigente={vigenteGrupo(item.id)}
                    todosLosPuntos={puntosTipo}
                  />
                ))}
              </ul>
            ) : null}
            <AgregarItem
              planId={planId}
              tipo={grupo.id}
              etiqueta={grupo.agregar}
              nombre={nombre}
              fichas={fichas}
              vigente={vigenteGrupo(null)}
            />
          </section>
        );
      })}

      <div className="flex flex-col gap-3">
        {error ? (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="foco-destino prose-measure rounded-lg border-2 border-destructive p-4 font-medium text-destructive"
          >
            {error}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={() => setDialogo("aprobar")}>
            Aprobar plan
          </Button>
          <Button size="lg" variant="outline" onClick={() => setDialogo("descartar")}>
            Descartar borrador
          </Button>
        </div>
      </div>

      <Dialog open={dialogo === "aprobar"} onOpenChange={cambiarDialogo}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={alCerrarDialogo} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{APROBAR_TITULO}</DialogTitle>
            <DialogDescription>{aprobarTexto(nombre)}</DialogDescription>
          </DialogHeader>
          <p role="status" className="text-sm">
            {guardando ? "Guardando la decisión." : ""}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={guardando}>
                Volver al borrador
              </Button>
            </DialogClose>
            <Button disabled={guardando} onClick={() => decidir({ accion: "aprobar" })}>
              Sí, aprobar plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo === "descartar"} onOpenChange={cambiarDialogo}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={alCerrarDialogo}>
          <DialogHeader>
            <DialogTitle>{DESCARTAR_TITULO}</DialogTitle>
            <DialogDescription>{DESCARTAR_TEXTO}</DialogDescription>
          </DialogHeader>
          <p role="status" className="text-sm">
            {guardando ? "Guardando la decisión." : ""}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={guardando}>
                Volver al borrador
              </Button>
            </DialogClose>
            <Button variant="destructive" disabled={guardando} onClick={() => decidir({ accion: "descartar" })}>
              Sí, descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
