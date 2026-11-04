// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /coach/engagements/[id]/desgloses/[breakdownId]: una tarea, con cada paso y todas sus marcas en orden, con su fecha y su
// texto literal, y los ajustes que propuso la IA al repetirla (spec 010, R-010.2, R-010.11, R-010.34, R-010.38). Sin resumen, clasificación ni interpretación de la IA, y sin
// totales (R-010.31, R-010.32). El coach no marca pasos (R-010.26). Una marca revisada sale del panel y aquí sigue, con
// quién y cuándo (R-010.33). Un coach ajeno recibe 404. Sin consentimiento vigente solo dice por qué no se muestra (R-010.45).
// También "Qué cambió respecto a la plantilla" y "Guardar como plantilla", que solo recibe el texto de cada paso (R-010.39, R-010.44).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { estadoConsentimiento } from "@/lib/consent";
import { withRls } from "@/lib/db/rls";
import { engagements, users } from "@/lib/db/schema";
import { leerTareaCoach, type DetalleDelCoach } from "@/lib/desglose/lectura";
import { sinPuntoFinal } from "@/lib/desglose/schema-cliente";
import { textoDatosOcultos, textoSinNotas } from "@/components/coach/alta/consentimiento";
import {
  ajusteSinDecidir,
  DESCARTES,
  ID_ARCHIVADA,
  ID_TITULO_TAREA,
  POR_QUE,
  rutaTareas,
  sinMarcas,
  textoAjuste,
  textoArchivada,
  textoCreada,
  textoCriterio,
  textoMarca,
  textoMotivo,
  textoNota,
  textoPaso,
  textoPasoPropuesto,
  textoQuienLaPidio,
  textoRevisada,
  textoVolverTareas,
  TITULO_AJUSTES,
  TITULO_MARCAS,
  TITULO_PAGINA,
} from "@/components/coach/desglose/textos";
import { GuardarPlantilla } from "@/components/coach/desglose/guardar-plantilla";
import { QueCambio } from "@/components/coach/desglose/que-cambio";
import { YaNoLaUsa } from "@/components/coach/desglose/ya-no-la-usa";
import { ParrafoEnfocable } from "@/components/coach/guia/parrafo-enfocable";
import { formatFecha } from "@/components/coach/labels";
import { TituloEnfocable } from "@/components/coach/plan/titulo-enfocable";

export const metadata: Metadata = { title: TITULO_PAGINA };

// "Se quitaron notas de apoyo" (R-010.20 a R-010.22). Lo que se descartó de un ajuste nadie lo vio y no se dice aquí (R-010.37).
const MOTIVOS_DE_NOTA: readonly string[] = ["apoyo_no_existe", "nota_sin_apoyo", "nota_con_termino"];

type Props = { params: Promise<{ id: string; breakdownId: string }> };

export default async function TareaCoachPage({ params }: Props) {
  const user = await requireRole("coach");
  const { id, breakdownId } = await params;
  // Un id que no es UUID haría fallar la consulta en Postgres; se trata como "no existe".
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(breakdownId).success) notFound();

  const datos = await withRls(user.claims, async (tx) => {
    const [engagement] = await tx
      .select({ id: engagements.id, personaId: engagements.personaId, nombrePila: users.nombrePila })
      .from(engagements)
      .leftJoin(users, eq(users.id, engagements.personaId))
      .where(and(eq(engagements.id, id), eq(engagements.coachId, user.id)))
      .limit(1);
    if (!engagement) return null;

    const consentimiento = await estadoConsentimiento(tx, id);
    // Sin consentimiento vigente, RLS no devuelve filas: no se consulta.
    if (consentimiento.estado !== "vigente") return { engagement, consentimiento, tarea: null };

    const tarea = await leerTareaCoach(tx, id, breakdownId, engagement.personaId);
    return tarea ? { engagement, consentimiento, tarea } : null;
  });
  if (!datos) notFound();
  const { engagement, consentimiento, tarea } = datos;
  const nombre = engagement.nombrePila ?? "Persona sin nombre visible";

  const volver = (
    <p className="text-sm">
      <Link href={rutaTareas(engagement.id)} className="underline underline-offset-4">
        {textoVolverTareas(nombre)}
      </Link>
    </p>
  );

  if (consentimiento.estado !== "vigente" || !tarea) {
    return (
      <div className="flex flex-col gap-4">
        {volver}
        <h1 className="text-4xl leading-tight">{TITULO_PAGINA}</h1>
        <p className="prose-measure font-medium">{consentimiento.estado === "retirado" ? textoDatosOcultos(nombre, consentimiento.fecha) : textoSinNotas(nombre)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        {volver}
        <TituloEnfocable id={ID_TITULO_TAREA} nivel={1} className="prose-measure text-4xl leading-tight">
          {sinPuntoFinal(tarea.tarea)}
        </TituloEnfocable>
        <p className="prose-measure text-muted-foreground">{textoCreada(formatFecha(tarea.creadaEn))}</p>
        <p className="prose-measure text-muted-foreground">{textoQuienLaPidio(tarea.laPidioLaPersona, nombre)}</p>
        {tarea.descartados.some((d) => MOTIVOS_DE_NOTA.includes(d.motivo)) ? <p className="prose-measure">{DESCARTES}</p> : null}
        {tarea.archivadaEn ? (
          <ParrafoEnfocable id={ID_ARCHIVADA} className="prose-measure font-medium">
            {textoArchivada(nombre, formatFecha(tarea.archivadaEn))}
          </ParrafoEnfocable>
        ) : null}
      </header>

      {tarea.plantilla ? <QueCambio comparacion={tarea.plantilla} /> : null}

      {tarea.ajustes.length > 0 ? (
        <section aria-labelledby="ajustes-propuestos" className="flex flex-col gap-3">
          <h2 id="ajustes-propuestos" className="text-2xl">
            {TITULO_AJUSTES}
          </h2>
          <ul className="flex flex-col gap-3">
            {tarea.ajustes.map(({ ajuste, usada }) => (
              <li key={ajuste.id} className="prose-measure flex flex-col gap-1 rounded-lg border border-border p-4">
                <p className="font-medium">{usada === null ? ajusteSinDecidir(nombre) : textoAjuste(usada)}</p>
                <p>{textoPasoPropuesto(ajuste.paso.accion)}</p>
                <p>{textoCriterio(ajuste.paso.criterioTerminado)}</p>
                <p>{textoMotivo(ajuste.motivo)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ol className="flex flex-col gap-4">
        {tarea.pasos.map((p, i) => (
          <PasoDelCoach key={p.paso.id} numero={i + 1} datos={p} nombre={nombre} />
        ))}
      </ol>

      {tarea.archivadaEn ? null : (
        <div>
          <YaNoLaUsa breakdownId={tarea.id} nombre={nombre} />
        </div>
      )}

      <GuardarPlantilla breakdownId={tarea.id} tarea={tarea.tarea} pasos={tarea.pasos.map(({ paso }) => ({ accion: paso.accion, criterioTerminado: paso.criterioTerminado }))} nombre={nombre} />
    </div>
  );
}

function PasoDelCoach({ numero, datos, nombre }: { numero: number; datos: DetalleDelCoach["pasos"][number]; nombre: string }) {
  const { paso, marcas } = datos;
  return (
    // Spec 012 (R-012.32): cada paso en una tarjeta. El título lleva serif por ser h2.
    <li className="flex flex-col gap-3 rounded-lg border-(length:--border-w) border-border bg-card px-6 py-5">
      <h2 className="prose-measure text-xl">{textoPaso(numero, paso.accion)}</h2>
      <p className="prose-measure">{textoCriterio(paso.criterioTerminado)}</p>
      {paso.notaApoyo ? <p className="prose-measure">{textoNota(paso.notaApoyo)}</p> : null}
      {paso.porQue ? (
        <details>
          <summary className="w-fit cursor-pointer font-medium underline-offset-4 hover:underline">{POR_QUE}</summary>
          <p className="prose-measure mt-2 text-sm">{paso.porQue}</p>
        </details>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">{TITULO_MARCAS}</h3>
        {marcas.length === 0 ? (
          <p className="prose-measure text-sm text-muted-foreground">{sinMarcas(nombre)}</p>
        ) : (
          <ol className="flex flex-col gap-2 text-sm">
            {marcas.map((m) => (
              <li key={m.id} className="prose-measure flex flex-col gap-1">
                <p>{textoMarca(m.estado, formatFecha(m.creadaEn))}</p>
                {m.texto ? <p className="whitespace-pre-wrap border-l-4 border-border pl-3">«{m.texto}»</p> : null}
                {m.revisadaEn ? <p className="text-muted-foreground">{textoRevisada(m.revisadaPor ?? "un coach", formatFecha(m.revisadaEn))}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </li>
  );
}
