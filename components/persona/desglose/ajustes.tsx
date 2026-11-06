// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// "Ajustes propuestos" (spec 010, R-010.38): cada ajuste se muestra como propuesta, sin seleccionar, y sus pasos no cambian
// hasta que guarde su elección, una sola vez y con confirmación. Guardar sin elegir ninguno también vale, y es lo que la
// deja marcar pasos. Si un ajuste elegido ya no sirve, el diálogo se queda abierto con el texto que nombra el paso, y ese
// texto también se queda junto al botón: las casillas están debajo del diálogo, y para quitarlo de su elección tiene que
// cerrarlo sin tener que recordarlo. Recibe AjusteVista, sin origen ni apoyoRef (R-010.24).
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AjusteVista } from "@/lib/desglose/schema-cliente";
import { enfocarDespues } from "@/components/coach/plan/foco";
import { llamarDesglose } from "@/components/desglose/api";
import { avisar } from "@/components/persona/guia/aviso";
import { Confirmar } from "@/components/persona/guia/confirmar";
import {
  AJUSTES_PROPUESTOS,
  CASILLA_AJUSTE,
  DIALOGO_ELECCION,
  ELECCION_GUARDADA,
  ERROR_RED,
  POR_QUE,
  textoCriterio,
  textoMotivo,
  textoNota,
  textoPasoPropuesto,
  textoPropuesta,
} from "./textos";

export type AjusteEnPantalla = { ajuste: AjusteVista; numero: number };

type Props = {
  breakdownId: string;
  ajustes: AjusteEnPantalla[];
  // El título de la pantalla: el botón y esta sección dejan de existir al guardar.
  idFoco: string;
};

const idDelAjuste = (id: string) => `ajuste-${id}`;

export function AjustesPropuestos({ breakdownId, ajustes, idFoco }: Props) {
  const router = useRouter();
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(new Set());
  const [refrescando, iniciar] = useTransition();
  const [ultimoError, setUltimoError] = useState<string | null>(null);
  // Un 409 quiere decir que la tarea cambió. Refrescar con el diálogo abierto se lo quitaría de enfrente con su error.
  const pantallaVieja = useRef(false);

  function cambiar(id: string, usar: boolean) {
    const nuevos = new Set(elegidos);
    if (usar) nuevos.add(id);
    else nuevos.delete(id);
    setElegidos(nuevos);
  }

  async function guardar(): Promise<string | null> {
    avisar("");
    setUltimoError(null);
    const r = await llamarDesglose(`/api/task-breakdowns/${breakdownId}/ajustes`, "POST", { aceptados: [...elegidos] }, ERROR_RED);
    if (!r.ok) {
      if (r.status === 409) pantallaVieja.current = true;
      setUltimoError(r.error);
      return r.error;
    }
    avisar(ELECCION_GUARDADA);
    iniciar(() => router.refresh());
    return null;
  }

  // Esta sección puede ya no existir después de refrescar: el foco va al título de la pantalla.
  function alCerrar() {
    if (!pantallaVieja.current) return;
    pantallaVieja.current = false;
    enfocarDespues(idFoco);
    iniciar(() => router.refresh());
  }

  return (
    <section aria-labelledby="ajustes-propuestos" className="flex flex-col gap-3">
      <h2 id="ajustes-propuestos" className="text-xl font-semibold">
        {AJUSTES_PROPUESTOS.titulo}
      </h2>
      <p className="prose-measure">{AJUSTES_PROPUESTOS.ayuda}</p>

      <ul className="flex flex-col gap-4">
        {ajustes.map(({ ajuste, numero }) => (
          <li key={ajuste.id} className="flex flex-col gap-2 rounded-lg border-2 border-primary p-4">
            <h3 id={idDelAjuste(ajuste.id)} className="prose-measure font-semibold">
              {textoPropuesta(ajuste.tipo, numero)}
            </h3>
            <p className="prose-measure">{textoPasoPropuesto(ajuste.paso.accion)}</p>
            <p className="prose-measure">{textoCriterio(ajuste.paso.criterioTerminado)}</p>
            {ajuste.paso.notaApoyo ? <p className="prose-measure">{textoNota(ajuste.paso.notaApoyo)}</p> : null}
            {ajuste.paso.porQue ? (
              <details>
                <summary className="w-fit cursor-pointer font-medium underline-offset-4 hover:underline">{POR_QUE.titulo}</summary>
                <div className="prose-measure mt-2 flex flex-col gap-1 text-sm">
                  <p>{POR_QUE.primeraLinea}</p>
                  <p>{ajuste.paso.porQue}</p>
                </div>
              </details>
            ) : null}
            <p className="prose-measure">{textoMotivo(ajuste.motivo)}</p>
            <label className="flex w-fit cursor-pointer items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={elegidos.has(ajuste.id)}
                disabled={refrescando}
                onChange={(e) => cambiar(ajuste.id, e.target.checked)}
                aria-describedby={idDelAjuste(ajuste.id)}
                className="size-5 shrink-0 accent-primary"
              />
              {CASILLA_AJUSTE}
            </label>
          </li>
        ))}
      </ul>

      {ultimoError ? (
        <p role="alert" className="prose-measure font-medium text-destructive">
          {ultimoError}
        </p>
      ) : null}
      <div>
        <Confirmar
          boton={DIALOGO_ELECCION.boton}
          variante="default"
          deshabilitado={refrescando}
          titulo={DIALOGO_ELECCION.titulo}
          texto={[DIALOGO_ELECCION.texto]}
          cancelar={DIALOGO_ELECCION.cancelar}
          confirmar={DIALOGO_ELECCION.confirmar}
          alConfirmar={guardar}
          idFoco={idFoco}
          alCerrar={alCerrar}
        />
      </div>
    </section>
  );
}
