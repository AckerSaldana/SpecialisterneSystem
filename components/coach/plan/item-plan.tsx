// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Un punto del borrador del plan (spec 003, tarea 18). Se ve con su origen, texto, lo que verá la
// persona, ficha, evidencia, a qué punto del plan vigente sigue y sus avisos. "Editar" abre el
// formulario y "Guardar cambio" manda PATCH /api/plan-items/[id] solo con lo que cambió (R-003.22).
// Las citas solo se quitan (R-003.24). "Quitar" pide confirmación y manda DELETE.
// Después de cada acción exitosa, router.refresh() vuelve a leer el borrador con sus banderas.
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ItemPlanRespuesta, type ItemPlanEditar, type ItemPlanVista } from "@/lib/api/contracts";
import { esVisiblePersona } from "@/lib/plan/schema";
import { Badge } from "@/components/ui/badge";
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
import { ERROR_GUARDAR, llamarApi } from "./api";
import { CamposItem, type ValoresItem } from "./campos-item";
import { enfocarDespues, useFocoPendiente } from "./foco";
import { AvisosItem, ItemDetalle } from "./item-detalle";
import { ETIQUETA_ORIGEN, PUNTO_NUEVO, TITULO_EVIDENCIA, mensajeBandera, siguePunto } from "./textos";
import { idEditar, idGrupo, recortar, type FichaOpcion, type PuntoVigente } from "./tipos";

type Props = {
  item: ItemPlanVista;
  nombre: string;
  fichas: FichaOpcion[];
  fechasSesion: Record<string, string>;
  // Plan vigente con los puntos del mismo tipo que este ítem puede seguir (sin los que ya
  // siguen otros ítems del borrador). null en la primera versión del plan.
  vigente: { version: number; puntos: PuntoVigente[] } | null;
  // Para mostrar el punto al que sigue aunque ya no esté en la lista de opciones.
  todosLosPuntos: PuntoVigente[];
};

const ERROR_SIN_TEXTO = "Escribe el punto.";

// Texto de estado después de guardar: cuántos avisos distintos tiene el punto (como AvisosItem).
function estadoGuardado(mensajes: string[]): string {
  const n = new Set(mensajes).size;
  if (n === 0) return "Cambio guardado.";
  return n === 1
    ? "Cambio guardado. Este punto tiene 1 aviso: revísalo debajo del punto."
    : `Cambio guardado. Este punto tiene ${n} avisos: revísalos debajo del punto.`;
}

function valoresIniciales(item: ItemPlanVista): ValoresItem {
  return {
    descripcion: item.descripcion,
    textoPersona: item.textoPersona ?? "",
    fichaId: item.fichaId ?? "",
    origenItemId: item.origenItemId ?? "",
  };
}

export function ItemPlan({ item, nombre, fichas, fechasSesion, vigente, todosLosPuntos }: Props) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState<ValoresItem>(() => valoresIniciales(item));
  const [quitarCitas, setQuitarCitas] = useState<number[]>([]);
  const [errorDescripcion, setErrorDescripcion] = useState<string | null>(null);
  // Cuántas veces se intentó guardar sin texto. El foco va al campo después de pintar el error,
  // así el lector de pantalla lee el campo ya con su aria-describedby.
  const [intentoVacio, setIntentoVacio] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // "Cambio guardado." y cuántos avisos tiene el punto ahora (R-003.27), para anunciarlo.
  const [estado, setEstado] = useState("");
  const [dialogoQuitar, setDialogoQuitar] = useState(false);
  const editarRef = useRef<HTMLButtonElement>(null);
  const quitarRef = useRef<HTMLButtonElement>(null);
  // Cómo terminó el diálogo de quitar, para decidir a dónde va el foco al cerrarlo.
  const resultadoQuitar = useRef<"ok" | "error" | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const prefijo = `item-${item.id}`;

  useFocoPendiente(idEditar(item.id), editarRef);

  // Un error nuevo se lee primero: el foco va a él.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function abrirEdicion() {
    setValores(valoresIniciales(item));
    setQuitarCitas([]);
    setErrorDescripcion(null);
    setError(null);
    setEstado("");
    setEditando(true);
  }

  // Al abrir el formulario, el foco va al primer campo.
  useEffect(() => {
    if (editando) document.getElementById(`${prefijo}-descripcion`)?.focus();
  }, [editando, prefijo]);

  // Después de pintar "Escribe el punto.", el foco vuelve al campo vacío.
  useEffect(() => {
    if (intentoVacio > 0) document.getElementById(`${prefijo}-descripcion`)?.focus();
  }, [intentoVacio, prefijo]);

  function cancelar() {
    setEditando(false);
    setError(null);
    setErrorDescripcion(null);
    // El botón "Editar" vuelve a existir en la siguiente pintada.
    enfocarDespues(idEditar(item.id));
  }

  // Solo se envía lo que cambió. Así el servidor no marca como editado un punto que no se tocó.
  // Se compara contra el original también recortado: si el modelo dejó espacios al inicio o al
  // final, quitarlos no cuenta como edición.
  function armarCambios(): ItemPlanEditar {
    const cambios: ItemPlanEditar = {};
    const descripcion = valores.descripcion.trim();
    if (descripcion !== item.descripcion.trim()) cambios.descripcion = descripcion;
    if (esVisiblePersona(item.tipo)) {
      const texto = valores.textoPersona.trim() || null;
      if (texto !== (item.textoPersona?.trim() || null)) cambios.textoPersona = texto;
    }
    if (valores.fichaId !== (item.fichaId ?? "")) cambios.fichaId = valores.fichaId || null;
    if (quitarCitas.length > 0) cambios.quitarEvidencia = quitarCitas;
    if (vigente && valores.origenItemId !== (item.origenItemId ?? "")) {
      cambios.origenItemId = valores.origenItemId || null;
    }
    return cambios;
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (valores.descripcion.trim() === "") {
      setErrorDescripcion(ERROR_SIN_TEXTO);
      setIntentoVacio((n) => n + 1);
      return;
    }
    setErrorDescripcion(null);
    const cambios = armarCambios();
    if (Object.keys(cambios).length === 0) {
      cancelar();
      return;
    }
    setGuardando(true);
    const r = await llamarApi(`/api/plan-items/${item.id}`, { method: "PATCH", body: cambios });
    setGuardando(false);
    const respuesta = r.ok ? ItemPlanRespuesta.safeParse(r.json) : null;
    if (!respuesta?.success) {
      setError((!r.ok && r.error) || ERROR_GUARDAR);
      return;
    }
    // Las banderas vienen recalculadas en la respuesta (R-003.27): se anuncian junto con el cambio.
    setEstado(estadoGuardado(respuesta.data.item.banderas.map((b) => mensajeBandera(b, nombre))));
    setEditando(false);
    enfocarDespues(idEditar(item.id));
    router.refresh();
  }

  async function quitar() {
    setGuardando(true);
    setError(null);
    setEstado("");
    const r = await llamarApi(`/api/plan-items/${item.id}`, { method: "DELETE" });
    setGuardando(false);
    resultadoQuitar.current = r.ok ? "ok" : "error";
    setDialogoQuitar(false);
    if (!r.ok) {
      setError(r.error || ERROR_GUARDAR);
      return;
    }
    // El punto desaparece: el foco va al título de su grupo.
    enfocarDespues(idGrupo(item.tipo));
    router.refresh();
  }

  // Radix devolvería el foco a "Quitar". Si hubo error, va al error; si se quitó, el punto ya no
  // existe y el foco lo toma el título del grupo (enfocarDespues); si canceló, vuelve a "Quitar".
  function alCerrarQuitar(e: Event) {
    e.preventDefault();
    if (resultadoQuitar.current === "error") errorRef.current?.focus();
    else if (resultadoQuitar.current === null) quitarRef.current?.focus();
    resultadoQuitar.current = null;
  }

  // Inicio del punto para el nombre accesible de "Editar" y "Quitar".
  const inicio = recortar(item.descripcion.trim(), 60);

  // A qué punto del plan vigente sigue este ítem, en texto.
  const puntoAnterior = item.origenItemId ? todosLosPuntos.find((p) => p.id === item.origenItemId) : null;

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <Badge variant="outline" className="h-auto">
          {ETIQUETA_ORIGEN[item.origen]}
        </Badge>
      </div>

      {editando ? (
        <form onSubmit={guardar} noValidate className="flex flex-col gap-4">
          <CamposItem
            prefijo={prefijo}
            tipo={item.tipo}
            nombre={nombre}
            valores={valores}
            cambiar={(v) => setValores((prev) => ({ ...prev, ...v }))}
            fichas={fichas}
            fichaActual={item.fichaId}
            vigente={vigente}
            errorDescripcion={errorDescripcion}
            disabled={guardando}
          />

          {item.evidencia.length > 0 ? (
            <fieldset className="flex flex-col gap-2" disabled={guardando}>
              <legend className="mb-2 text-sm font-medium">{TITULO_EVIDENCIA}</legend>
              <ul className="flex flex-col gap-3">
                {item.evidencia.map((ev, i) => {
                  const idCita = `${prefijo}-cita-${i}`;
                  const fecha = fechasSesion[ev.sessionId];
                  return (
                    <li key={i} className="flex flex-col gap-1">
                      <blockquote id={idCita} className="prose-measure border-l-4 border-border pl-3 italic">
                        “{ev.cita}”
                      </blockquote>
                      {fecha ? <p className="pl-4 text-xs text-muted-foreground">Sesión del {fecha}</p> : null}
                      <label className="flex items-center gap-2 pl-4 text-sm">
                        <input
                          type="checkbox"
                          checked={quitarCitas.includes(i)}
                          onChange={(e) =>
                            setQuitarCitas((prev) => (e.target.checked ? [...prev, i] : prev.filter((x) => x !== i)))
                          }
                          aria-describedby={idCita}
                          className="size-5 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        />
                        Quitar esta cita
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : null}

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
            <Button type="button" variant="outline" disabled={guardando} onClick={cancelar}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="prose-measure">{item.descripcion}</p>
          <ItemDetalle item={item} nombre={nombre} fichas={fichas} fechasSesion={fechasSesion} />
          {vigente ? (
            <p className="prose-measure text-sm">
              <span className="font-medium">{siguePunto(vigente.version)} </span>
              {puntoAnterior ? `«${recortar(puntoAnterior.descripcion, 200)}»` : PUNTO_NUEVO}
            </p>
          ) : null}
          <AvisosItem banderas={item.banderas} nombre={nombre} />
          {error ? (
            <p ref={errorRef} tabIndex={-1} role="alert" className="foco-destino prose-measure font-medium text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {/* El id lo usa el borrador para llevar el foco a este punto si bloquea la aprobación.
                El aria-label distingue cada "Editar" y "Quitar" por el inicio del punto. */}
            <Button
              ref={editarRef}
              id={idEditar(item.id)}
              variant="outline"
              onClick={abrirEdicion}
              aria-label={`Editar: ${inicio}`}
              className="foco-destino"
            >
              Editar
            </Button>
            <Button ref={quitarRef} variant="outline" onClick={() => setDialogoQuitar(true)} aria-label={`Quitar: ${inicio}`}>
              Quitar
            </Button>
          </div>
        </>
      )}

      {/* Fuera del formulario: sigue en pantalla cuando se cierra y anuncia el resultado. */}
      <p role="status" className="text-sm">
        {estado}
      </p>

      <Dialog open={dialogoQuitar} onOpenChange={(abierto) => !guardando && setDialogoQuitar(abierto)}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={alCerrarQuitar}>
          <DialogHeader>
            <DialogTitle>¿Quitar este punto del plan?</DialogTitle>
            <DialogDescription className="flex flex-col gap-2">
              <span className="prose-measure font-medium text-foreground">«{recortar(item.descripcion.trim(), 200)}»</span>
              <span>Queda registrado en el historial.</span>
            </DialogDescription>
          </DialogHeader>
          <p role="status" className="text-sm">
            {guardando ? "Quitando el punto." : ""}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={guardando}>
                Cancelar
              </Button>
            </DialogClose>
            <Button variant="destructive" disabled={guardando} onClick={quitar}>
              Sí, quitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
