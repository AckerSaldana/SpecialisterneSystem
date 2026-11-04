// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Los pasos de una tarea, en la pantalla de la persona (spec 010, R-010.23, R-010.25 a R-010.28). Recibe PasoDesgloseVista,
// sin origen, y las fechas ya como texto: nada más sale al navegador (R-010.24). Sin citas, señales ni nombres de dominios
// (C-09). Una cosa a la vez: mientras se guarda una marca, los botones esperan. Sin cuenta regresiva, cronómetro ni suma
// de tiempos, y la casilla de tiempo no se guarda (C-14, decisión abierta 8). "¿Por qué este paso?" se abre con teclado y
// con toque, porque es un <details>, y solo existe en pasos con nota (R-010.23).
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EstadoPaso, MarcarPasoRequest, PasoDesgloseVista } from "@/lib/desglose/schema-cliente";
import { Button } from "@/components/ui/button";
import { enfocarDespues } from "@/components/coach/plan/foco";
import { TituloEnfocable } from "@/components/coach/plan/titulo-enfocable";
import { avisar } from "@/components/persona/guia/aviso";
import { llamarDesglose } from "@/components/desglose/api";
import { cn } from "@/lib/utils";
import { MeAtore } from "./me-atore";
import {
  BOTONES_PASO,
  CASILLA_TIEMPO,
  ERROR_RED,
  etiquetaBotonPaso,
  idPaso,
  POR_QUE,
  RESULTADOS_MARCA,
  TERMINASTE,
  textoAtorado,
  textoAtoradoConTexto,
  textoCriterio,
  textoHecho,
  textoNota,
  textoPaso,
  textoRevisado,
  textoTiempo,
} from "./textos";

export type PasoEnPantalla = {
  paso: PasoDesgloseVista;
  estado: EstadoPaso;
  // Solo si su última marca es "hecho".
  hechoEl: string | null;
  // Todos sus "Me atoré aquí", también los de antes de un "Deshacer": su coach los sigue leyendo.
  atorados: { id: number; fecha: string; texto: string | null; revisadoEl: string | null }[];
};

type Props = {
  breakdownId: string;
  pasos: PasoEnPantalla[];
  // R-010.25: apagada al abrir en Calma, encendida en los otros modos. La página lee la preferencia.
  tiempoAlAbrir: boolean;
  // R-010.38: mientras haya ajustes sin decidir no se marcan pasos.
  sePuedeMarcar: boolean;
  // El título de la pantalla: un refresco por un 409 puede dejarla sin estos pasos.
  idFoco: string;
};

export function PasosTarea({ breakdownId, pasos, tiempoAlAbrir, sePuedeMarcar, idFoco }: Props) {
  const router = useRouter();
  const [verTiempo, setVerTiempo] = useState(tiempoAlAbrir);
  const [guardando, setGuardando] = useState(false);
  const [refrescando, iniciar] = useTransition();
  const [error, setError] = useState<{ pasoId: string; texto: string } | null>(null);
  const ocupado = guardando || refrescando;
  const hayTiempos = pasos.some((p) => p.paso.minutos !== null);
  // Un 409 quiere decir que la tarea cambió, y el refresco lo muestra. Con "Me atoré aquí" abierto espera a que lo cierre: la
  // tarea archivada ya no pinta el diálogo, y se llevaría lo que escribió y el error que le dice que no se guardó.
  const pantallaVieja = useRef(false);

  function refrescarSiCambio() {
    if (!pantallaVieja.current) return;
    pantallaVieja.current = false;
    enfocarDespues(idFoco);
    iniciar(() => router.refresh());
  }

  // Devuelve el error para mostrar, o null si salió bien.
  async function marcar(pasoId: string, cuerpo: MarcarPasoRequest): Promise<string | null> {
    setGuardando(true);
    setError(null);
    avisar("");
    const r = await llamarDesglose(`/api/task-breakdowns/${breakdownId}/steps/${pasoId}/events`, "POST", cuerpo, ERROR_RED);
    setGuardando(false);
    if (!r.ok) {
      if (r.status === 409) pantallaVieja.current = true;
      return r.error;
    }
    const terminada = cuerpo.estado === "hecho" && pasos.every((p) => p.paso.id === pasoId || p.estado === "hecho");
    avisar(terminada ? TERMINASTE : RESULTADOS_MARCA[cuerpo.estado]);
    // El botón puede ya no existir después de refrescar: el foco va al título del paso.
    enfocarDespues(idPaso(pasoId));
    iniciar(() => router.refresh());
    return null;
  }

  async function marcarDirecto(pasoId: string, estado: "hecho" | "pendiente") {
    const fallo = await marcar(pasoId, { estado });
    if (fallo) setError({ pasoId, texto: fallo });
    refrescarSiCambio();
  }

  return (
    <div className="flex flex-col gap-4">
      {hayTiempos ? (
        // Spec 012 (R-012.35): la casilla del tiempo como una opción de al menos 48px.
        <label className="flex min-h-12 w-fit cursor-pointer items-center gap-3 rounded-md border-(length:--border-w) border-border bg-card px-4 py-2 has-checked:border-primary has-checked:bg-accent">
          <input type="checkbox" checked={verTiempo} onChange={(e) => setVerTiempo(e.target.checked)} className="size-5 shrink-0 accent-primary" />
          {CASILLA_TIEMPO}
        </label>
      ) : null}

      <ol className="flex flex-col gap-4">
        {pasos.map(({ paso, estado, hechoEl, atorados }, i) => {
          const numero = i + 1;
          return (
            // R-012.35: hecho, fondo apagado; con "Me atoré aquí", barra de acento. El texto lo dice igual.
            <li
              key={paso.id}
              className={cn(
                "flex flex-col gap-3 rounded-lg border-(length:--border-w) border-border px-6 py-5",
                estado === "hecho" ? "bg-muted" : "bg-card",
                atorados.length > 0 && estado !== "hecho" ? "border-l-4 border-l-primary" : "",
              )}
            >
              <TituloEnfocable id={idPaso(paso.id)} nivel={2} className="prose-measure text-2xl leading-snug">
                {textoPaso(numero, paso.accion)}
              </TituloEnfocable>
              <p className="prose-measure">{textoCriterio(paso.criterioTerminado)}</p>
              {paso.notaApoyo ? <p className="prose-measure">{textoNota(paso.notaApoyo)}</p> : null}
              {verTiempo && paso.minutos !== null ? <p className="prose-measure text-muted-foreground">{textoTiempo(paso.minutos)}</p> : null}
              {paso.porQue ? (
                <details>
                  <summary className="w-fit cursor-pointer font-medium underline-offset-4 hover:underline">{POR_QUE.titulo}</summary>
                  <div className="prose-measure mt-2 flex flex-col gap-1 text-sm">
                    <p>{POR_QUE.primeraLinea}</p>
                    <p>{paso.porQue}</p>
                  </div>
                </details>
              ) : null}

              {hechoEl ? <p className="w-fit rounded-full bg-accent px-3 py-0.5 font-medium">{textoHecho(hechoEl)}</p> : null}
              {atorados.map((a) => (
                <div key={a.id} className="prose-measure flex flex-col gap-1 border-l-4 border-primary pl-4">
                  <p className="whitespace-pre-wrap">{a.texto ? textoAtoradoConTexto(a.fecha, a.texto) : textoAtorado(a.fecha)}</p>
                  {a.revisadoEl ? <p className="text-muted-foreground">{textoRevisado(a.revisadoEl)}</p> : null}
                </div>
              ))}

              {sePuedeMarcar ? (
                <div className="flex flex-wrap gap-2">
                  {estado !== "hecho" ? (
                    <Button type="button" disabled={ocupado} onClick={() => marcarDirecto(paso.id, "hecho")} aria-label={etiquetaBotonPaso(BOTONES_PASO.hecho, numero)}>
                      {BOTONES_PASO.hecho}
                    </Button>
                  ) : null}
                  {estado === "pendiente" ? (
                    <MeAtore
                      numero={numero}
                      deshabilitado={ocupado}
                      idFoco={idPaso(paso.id)}
                      alGuardar={(texto) => marcar(paso.id, texto ? { estado: "atorado", texto } : { estado: "atorado" })}
                      alCerrar={refrescarSiCambio}
                    />
                  ) : (
                    <Button type="button" variant="outline" disabled={ocupado} onClick={() => marcarDirecto(paso.id, "pendiente")} aria-label={etiquetaBotonPaso(BOTONES_PASO.deshacer, numero)}>
                      {BOTONES_PASO.deshacer}
                    </Button>
                  )}
                </div>
              ) : null}
              {error?.pasoId === paso.id ? (
                <p role="alert" className="prose-measure font-medium text-destructive">
                  {error.texto}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
