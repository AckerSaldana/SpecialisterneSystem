// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /persona/desgloses, "Mis tareas": la persona pide los pasos de una tarea y ve las que tiene (spec 010, R-010.1, R-010.11,
// R-010.29). El acompañamiento sale de la puerta (R-002.40), que también garantiza el consentimiento vigente.
// Privacidad: la lista solo manda al navegador la tarea, su fecha y dos frases. Del perfil, la página solo sabe si está
// listo. Sin citas, señales ni nombres de dominios (C-09). Sin avisos ni nada con tiempo (C-14, R-010.54).
import type { Metadata } from "next";
import Link from "next/link";
import { withRls } from "@/lib/db/rls";
import { hayPerfilParaDesglose, leerTareasPersona } from "@/lib/desglose/lectura";
import { puertaPersona } from "@/lib/persona/puerta";
import { formatFecha } from "@/components/coach/labels";
import { TituloEnfocable } from "@/components/coach/plan/titulo-enfocable";
import { FormularioTarea } from "@/components/desglose/formulario-tarea";
import {
  FORMULARIO,
  ID_TITULO_TAREA,
  ID_TITULO_TAREAS,
  INTRO,
  LO_PREPARO_TU_COACH,
  PERFIL_NO_LISTO,
  RUTA_DESGLOSES,
  rutaDesglose,
  SIN_ACOMPANAMIENTO,
  TAREA_QUITADA,
  TERMINASTE,
  textoPorDesglose,
  TITULO,
  TITULO_LISTA,
  TITULO_PEDIR,
  VACIO,
} from "@/components/persona/desglose/textos";

export const metadata: Metadata = { title: TITULO };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MisTareasPage({ searchParams }: Props) {
  const { user, acompanamiento } = await puertaPersona("persona");
  const quitada = (await searchParams).quitada === "1";

  if (!acompanamiento) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{TITULO}</h1>
        <p className="prose-measure">{SIN_ACOMPANAMIENTO}</p>
      </div>
    );
  }

  const { tareas, hayPerfil } = await withRls(user.claims, async (tx) => ({
    tareas: await leerTareasPersona(tx, acompanamiento.id, user.id),
    hayPerfil: await hayPerfilParaDesglose(tx, acompanamiento.id),
  }));

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <TituloEnfocable id={ID_TITULO_TAREAS} nivel={1} className="text-2xl font-semibold">
          {TITULO}
        </TituloEnfocable>
        {quitada ? (
          <p role="status" className="prose-measure font-medium">
            {TAREA_QUITADA}
          </p>
        ) : null}
        <p className="prose-measure">{INTRO}</p>
      </header>

      <section aria-labelledby="pedir-pasos" className="flex flex-col gap-3">
        <h2 id="pedir-pasos" className="text-xl font-semibold">
          {TITULO_PEDIR}
        </h2>
        {hayPerfil ? (
          <FormularioTarea url={`/api/engagements/${acompanamiento.id}/task-breakdowns`} rutaDetalle={RUTA_DESGLOSES} idFoco={ID_TITULO_TAREA} textos={FORMULARIO} />
        ) : (
          <p className="prose-measure">{PERFIL_NO_LISTO}</p>
        )}
      </section>

      <section aria-labelledby="tus-tareas" className="flex flex-col gap-3">
        <h2 id="tus-tareas" className="text-xl font-semibold">
          {TITULO_LISTA}
        </h2>
        {tareas.length === 0 ? (
          <p className="prose-measure">{VACIO}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {tareas.map((t) => (
              <li key={t.id} className="flex flex-col gap-1 rounded-lg border border-border p-3">
                <Link href={rutaDesglose(t.id)} className="prose-measure font-medium underline underline-offset-4">
                  {textoPorDesglose(t.tarea, formatFecha(t.creadaEn))}
                </Link>
                {t.laPreparoSuCoach ? <p className="prose-measure text-sm">{LO_PREPARO_TU_COACH}</p> : null}
                {t.terminada ? <p className="prose-measure text-sm">{TERMINASTE}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
