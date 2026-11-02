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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{TITULO_PLANTILLAS}</h1>
        {resultado ? (
          <ParrafoEnfocable id={ID_RESULTADO_PLANTILLA} className="prose-measure font-medium">
            {resultado}
          </ParrafoEnfocable>
        ) : null}
        <p className="prose-measure">{AYUDA_PLANTILLAS}</p>
      </header>

      {plantillas.length === 0 ? (
        <p className="prose-measure">{VACIO_PLANTILLAS}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {plantillas.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <h2 className="prose-measure text-lg font-semibold">{textoPlantilla(p.puesto, p.titulo)}</h2>
              <p className="prose-measure">{textoTareaPlantilla(p.tarea)}</p>
              <ol className="flex flex-col gap-2">
                {p.pasos.map((paso, i) => (
                  <li key={paso.id} className="prose-measure">
                    <p>{textoPaso(i + 1, paso.accion)}</p>
                    <p className="text-sm">{textoCriterio(paso.criterioTerminado)}</p>
                  </li>
                ))}
              </ol>
              <div>
                <ArchivarPlantilla plantillaId={p.id} nombrePlantilla={textoPlantilla(p.puesto, p.titulo)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
