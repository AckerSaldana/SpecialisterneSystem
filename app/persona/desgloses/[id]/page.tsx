// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// /persona/desgloses/[id]: una tarea y sus pasos, con sus marcas, y repetirla con ajustes (spec 010, R-010.11, R-010.23,
// R-010.25 a R-010.29, R-010.35 a R-010.38). La
// pantalla avisa desde arriba que su coach lee lo que marca (D-071). El acompañamiento sale de la puerta (R-002.40), y una
// tarea de otro acompañamiento es un 404.
// Privacidad: al navegador solo baja PasoDesgloseVista, sin origen (R-010.24), y de quien revisó solo la fecha. No lee
// task_templates (R-010.44). Sin citas, señales ni nombres de dominios (C-09).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { withRls } from "@/lib/db/rls";
import { leerTareaPersona } from "@/lib/desglose/lectura";
import { sinPuntoFinal } from "@/lib/desglose/schema-cliente";
import { puertaPersona } from "@/lib/persona/puerta";
import { getPreferences } from "@/lib/preferences";
import { formatFecha } from "@/components/coach/labels";
import { TituloEnfocable } from "@/components/coach/plan/titulo-enfocable";
import { AjustesPropuestos } from "@/components/persona/desglose/ajustes";
import { PasosTarea } from "@/components/persona/desglose/pasos";
import { RepetirTarea } from "@/components/persona/desglose/repetir";
import {
  AVISO_TU_COACH_LEE,
  avisoDeCopia,
  DECIDE_AJUSTES,
  ID_TITULO_TAREA,
  idTituloCopia,
  LO_PREPARO_TU_COACH,
  RUTA_DESGLOSES,
  TAREA_YA_NO_DISPONIBLE,
  TERMINASTE,
  textoCreada,
  TITULO,
  VOLVER,
} from "@/components/persona/desglose/textos";
import { YaNoLaUso } from "@/components/persona/desglose/ya-no-la-uso";
import { AvisoGuia } from "@/components/persona/guia/aviso";

export const metadata: Metadata = { title: TITULO };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function TareaPage({ params, searchParams }: Props) {
  const { user, acompanamiento } = await puertaPersona("persona");
  const { id } = await params;
  const { copia } = await searchParams;
  // Un id que no es UUID haría fallar la consulta en Postgres; se trata como "no existe".
  if (!acompanamiento || !z.uuid().safeParse(id).success) notFound();

  const tarea = await withRls(user.claims, (tx) => leerTareaPersona(tx, acompanamiento.id, id, user.id));
  if (!tarea) notFound();

  const volver = (
    <p className="text-sm">
      <Link href={RUTA_DESGLOSES} className="underline underline-offset-4">
        {VOLVER}
      </Link>
    </p>
  );

  // El mismo id en las dos ramas: un 409 refresca la pantalla y el foco pendiente tiene que encontrar el título en cualquiera.
  const idTitulo = tarea.origenId ? idTituloCopia(tarea.origenId) : ID_TITULO_TAREA;

  if (tarea.archivada) {
    return (
      <div className="flex flex-col gap-4">
        {volver}
        <TituloEnfocable id={idTitulo} nivel={1} className="prose-measure text-4xl leading-tight">
          {sinPuntoFinal(tarea.tarea)}
        </TituloEnfocable>
        <p className="prose-measure">{TAREA_YA_NO_DISPONIBLE}</p>
      </div>
    );
  }

  // R-010.25: la casilla abre apagada en Calma. La elección no se guarda en Preferencias.
  const { modo } = await getPreferences();
  const avisoCopia = avisoDeCopia(copia, tarea.pasos);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        {volver}
        <TituloEnfocable id={idTitulo} nivel={1} className="prose-measure text-4xl leading-tight">
          {sinPuntoFinal(tarea.tarea)}
        </TituloEnfocable>
        <p className="prose-measure text-muted-foreground">{textoCreada(formatFecha(tarea.creadaEn))}</p>
        {tarea.laPreparoSuCoach ? <p className="prose-measure text-muted-foreground">{LO_PREPARO_TU_COACH}</p> : null}
        {avisoCopia ? (
          <p role="status" className="prose-measure font-medium">
            {avisoCopia}
          </p>
        ) : null}
        {tarea.terminada ? <p className="prose-measure font-medium">{TERMINASTE}</p> : null}
        <p role="note" className="prose-measure rounded-md border-l-4 border-primary bg-accent px-4 py-3 font-medium">
          {AVISO_TU_COACH_LEE}
        </p>
      </header>

      <AvisoGuia />

      {tarea.ajustesSinDecidir ? (
        <>
          <p className="prose-measure font-medium">{DECIDE_AJUSTES}</p>
          <AjustesPropuestos breakdownId={tarea.id} ajustes={tarea.ajustes} idFoco={idTitulo} />
        </>
      ) : null}

      <PasosTarea
        breakdownId={tarea.id}
        tiempoAlAbrir={modo !== "calma"}
        sePuedeMarcar={!tarea.ajustesSinDecidir}
        idFoco={idTitulo}
        pasos={tarea.pasos.map((p) => ({
          paso: p.paso,
          estado: p.estado,
          hechoEl: p.hechoEn ? formatFecha(p.hechoEn) : null,
          atorados: p.atorados.map((a) => ({ id: a.id, fecha: formatFecha(a.creadoEn), texto: a.texto, revisadoEl: a.revisadoEn ? formatFecha(a.revisadoEn) : null })),
        }))}
      />

      {/* R-012.35: al final, separados por una línea. */}
      <div className="flex flex-wrap gap-3 border-t border-border pt-6">
        {tarea.ajustesSinDecidir ? null : <RepetirTarea breakdownId={tarea.id} />}
        <YaNoLaUso breakdownId={tarea.id} />
      </div>
    </div>
  );
}
