// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /coach/engagements/[id]/desgloses, "Tareas de {nombre}": el coach prepara los pasos de una tarea y ve las que hay (spec
// 010, R-010.1, R-010.2, R-010.11). Lo que prepara le llega a la persona sin revisión previa, y lo que escribe pasa la
// revisión de R-010.1 en la ruta. Un coach ajeno recibe 404. Sin consentimiento vigente solo dice por qué no se muestra
// (R-010.45). También lista las archivadas, porque el coach las sigue viendo (R-010.29). No cuenta marcas (C-13). Desde
// aquí se aplica una plantilla de la organización (R-010.42), y al navegador solo baja su id y su nombre.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ChevronRightIcon } from "lucide-react";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { estadoConsentimiento } from "@/lib/consent";
import { withRls } from "@/lib/db/rls";
import { engagements, users } from "@/lib/db/schema";
import { hayPerfilParaDesglose, leerPlantillas, leerTareasCoach, type PlantillaEnLista, type TareaDelCoach } from "@/lib/desglose/lectura";
import { textoDatosOcultos, textoSinNotas } from "@/components/coach/alta/consentimiento";
import { AplicarPlantilla } from "@/components/coach/desglose/aplicar-plantilla";
import {
  ID_TITULO_TAREA,
  perfilNoListo,
  rutaTarea,
  rutaTareas,
  textoArchivada,
  textoPlantilla,
  textoPorDesglose,
  textoQuienLaPidio,
  textosFormulario,
  textoVolverAcompanamiento,
  TITULO_APLICAR,
  TITULO_LISTA,
  TITULO_PAGINA,
  TITULO_PEDIR,
  tituloTareas,
  VACIO_PLANTILLAS,
  vacioTareas,
} from "@/components/coach/desglose/textos";
import { formatFecha } from "@/components/coach/labels";
import { Card } from "@/components/ui/card";
import { FormularioTarea } from "@/components/desglose/formulario-tarea";

export const metadata: Metadata = { title: TITULO_PAGINA };

type Props = { params: Promise<{ id: string }> };

export default async function TareasCoachPage({ params }: Props) {
  const user = await requireRole("coach");
  const { id } = await params;
  // Un id que no es UUID haría fallar la consulta en Postgres; se trata como "no existe".
  if (!z.uuid().safeParse(id).success) notFound();

  const datos = await withRls(user.claims, async (tx) => {
    const [engagement] = await tx
      .select({ id: engagements.id, personaId: engagements.personaId, nombrePila: users.nombrePila })
      .from(engagements)
      .leftJoin(users, eq(users.id, engagements.personaId))
      .where(and(eq(engagements.id, id), eq(engagements.coachId, user.id)))
      .limit(1);
    if (!engagement) return null;

    const consentimiento = await estadoConsentimiento(tx, id);
    // Sin consentimiento vigente, RLS no devuelve filas: no se consultan.
    if (consentimiento.estado !== "vigente") return { engagement, consentimiento, tareas: [] as TareaDelCoach[], hayPerfil: false, plantillas: [] as PlantillaEnLista[] };

    return { engagement, consentimiento, tareas: await leerTareasCoach(tx, id, engagement.personaId), hayPerfil: await hayPerfilParaDesglose(tx, id), plantillas: await leerPlantillas(tx) };
  });
  if (!datos) notFound();
  const { engagement, consentimiento, tareas, hayPerfil, plantillas } = datos;
  const nombre = engagement.nombrePila ?? "Persona sin nombre visible";
  const titulo = tituloTareas(nombre);

  const volver = (
    <p className="text-sm">
      <Link href={`/coach/engagements/${engagement.id}`} className="underline underline-offset-4">
        {textoVolverAcompanamiento(nombre)}
      </Link>
    </p>
  );

  if (consentimiento.estado !== "vigente") {
    return (
      <div className="flex flex-col gap-4">
        {volver}
        <h1 className="text-4xl leading-tight">{titulo}</h1>
        <p className="prose-measure font-medium">{consentimiento.estado === "retirado" ? textoDatosOcultos(nombre, consentimiento.fecha) : textoSinNotas(nombre)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        {volver}
        <h1 className="text-4xl leading-tight">{titulo}</h1>
      </header>

      {/* Spec 012 (R-012.32): preparar a la izquierda; aplicar y la lista a la derecha, en ese orden de lectura. */}
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="px-(--card-spacing)">
      <section aria-labelledby="preparar-pasos" className="flex flex-col gap-4">
        <h2 id="preparar-pasos" className="text-2xl">
          {TITULO_PEDIR}
        </h2>
        {hayPerfil ? (
          <FormularioTarea url={`/api/engagements/${engagement.id}/task-breakdowns`} rutaDetalle={rutaTareas(engagement.id)} idFoco={ID_TITULO_TAREA} textos={textosFormulario(nombre)} />
        ) : (
          <p className="prose-measure">{perfilNoListo(nombre)}</p>
        )}
      </section>
      </Card>

      <div className="flex flex-col gap-8">
      <section aria-labelledby="aplicar-una-plantilla" className="flex flex-col gap-3 rounded-lg border-(length:--border-w) border-border bg-muted px-6 py-5">
        <h2 id="aplicar-una-plantilla" className="text-2xl">
          {TITULO_APLICAR}
        </h2>
        {!hayPerfil ? (
          <p className="prose-measure">{perfilNoListo(nombre)}</p>
        ) : plantillas.length === 0 ? (
          <p className="prose-measure">{VACIO_PLANTILLAS}</p>
        ) : (
          <AplicarPlantilla engagementId={engagement.id} plantillas={plantillas.map((p) => ({ id: p.id, etiqueta: textoPlantilla(p.puesto, p.titulo) }))} nombre={nombre} />
        )}
      </section>

      <section aria-labelledby="tareas-guardadas" className="flex flex-col gap-3">
        <h2 id="tareas-guardadas" className="text-2xl">
          {TITULO_LISTA}
        </h2>
        {tareas.length === 0 ? (
          <p className="prose-measure">{vacioTareas(nombre)}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {tareas.map((t) => (
              <li key={t.id}>
                {/* Toda la fila se abre, como la lista de acompañamientos (R-012.22). */}
                <Link
                  href={rutaTarea(engagement.id, t.id)}
                  className="group flex items-center gap-4 rounded-lg border-(length:--border-w) border-border bg-card px-5 py-4 text-foreground no-underline transition-colors hover:border-input"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="prose-measure font-semibold underline-offset-4 group-hover:underline">{textoPorDesglose(t.tarea, formatFecha(t.creadaEn))}</p>
                    <p className="prose-measure text-muted-foreground">{textoQuienLaPidio(t.laPidioLaPersona, nombre)}</p>
                    {t.archivadaEn ? (
                      <p className="w-fit rounded-full border-(length:--border-w) border-dashed border-input px-3 py-0.5 text-muted-foreground">
                        {textoArchivada(nombre, formatFecha(t.archivadaEn))}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
      </div>
    </div>
  );
}
