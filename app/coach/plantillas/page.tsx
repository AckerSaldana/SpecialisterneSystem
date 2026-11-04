// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /coach/plantillas, "Plantillas de tu organización" (spec 010, R-010.41, R-010.45). Cualquier coach de la organización las
// lee y las archiva, mientras el consentimiento de su origen esté vigente: RLS oculta las demás, sin decir por qué, porque
// aquí no se muestra de qué acompañamiento salió ninguna (R-010.39). Se aplican desde las tareas de cada persona. Una
// plantilla no se edita.
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { leerPlantillas } from "@/lib/desglose/lectura";
import { ArchivarPlantilla } from "@/components/coach/desglose/archivar-plantilla";
import {
  COMO_GUARDAR_PLANTILLA,
  verPasos,
  AYUDA_PLANTILLAS,
  ID_RESULTADO_PLANTILLA,
  PLANTILLA_ARCHIVADA,
  PLANTILLA_GUARDADA,
  textoCriterio,
  textoPaso,
  textoPlantilla,
  textoTareaPlantilla,
  TITULO_PLANTILLAS,
  VACIO_PLANTILLAS,
} from "@/components/coach/desglose/textos";
import { ParrafoEnfocable } from "@/components/coach/guia/parrafo-enfocable";

export const metadata: Metadata = { title: "Plantillas" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PlantillasPage({ searchParams }: Props) {
  const user = await requireRole("coach");
  const { hecho } = await searchParams;
  const resultado = hecho === "guardada" ? PLANTILLA_GUARDADA : hecho === "archivada" ? PLANTILLA_ARCHIVADA : null;

  const plantillas = await withRls(user.claims, (tx) => leerPlantillas(tx));

  // Spec 012 (R-012.33): título en serif, estado vacío que dice cómo se guarda una, y cada plantilla en una tarjeta.
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl leading-tight">{TITULO_PLANTILLAS}</h1>
        {resultado ? (
          <ParrafoEnfocable id={ID_RESULTADO_PLANTILLA} className="prose-measure font-medium">
            {resultado}
          </ParrafoEnfocable>
        ) : null}
        <p className="prose-measure text-muted-foreground">{AYUDA_PLANTILLAS}</p>
      </header>

      {plantillas.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border-(length:--border-w) border-dashed border-input px-6 py-8 text-center">
          <p className="text-lg font-semibold">{VACIO_PLANTILLAS}</p>
          <p className="text-muted-foreground">{COMO_GUARDAR_PLANTILLA}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {plantillas.map((p) => (
            <li key={p.id} className="flex flex-col gap-4 rounded-lg border-(length:--border-w) border-border bg-card px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <h2 className="prose-measure text-2xl">{textoPlantilla(p.puesto, p.titulo)}</h2>
                <ArchivarPlantilla plantillaId={p.id} nombrePlantilla={textoPlantilla(p.puesto, p.titulo)} />
              </div>
              <p className="prose-measure">{textoTareaPlantilla(p.tarea)}</p>
              <details>
                <summary className="w-fit cursor-pointer font-semibold">{verPasos(p.pasos.length)}</summary>
                <ol className="mt-3 flex flex-col gap-3 border-l-2 border-border pl-5">
                  {p.pasos.map((paso, i) => (
                    <li key={paso.id} className="prose-measure flex flex-col gap-1">
                      <p>{textoPaso(i + 1, paso.accion)}</p>
                      <p className="text-muted-foreground">{textoCriterio(paso.criterioTerminado)}</p>
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
