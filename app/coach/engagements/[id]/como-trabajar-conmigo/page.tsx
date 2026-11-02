// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /coach/engagements/[id]/como-trabajar-conmigo: lo que el coach ve de la hoja (spec 009, R-009.34 a R-009.38,
// R-009.47). Solo las versiones listas, con su historial y su fecha, sin el número: la numeración es global y
// delataría un retiro (R-009.35). Solo lee: sin botón de imprimir, exportar ni enviar (R-009.37). Los borradores no
// le llegan porque lo impide la política, no esta página (R-009.34).
// De private.app_guia_insumos solo se usa hayVersiones, para mostrar o no el botón: nada más de ese resultado
// llega a la pantalla (R-009.10). Sin consentimiento vigente solo dice por qué no se muestra (R-009.51).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { estadoConsentimiento } from "@/lib/consent";
import { withRls } from "@/lib/db/rls";
import { engagements, users } from "@/lib/db/schema";
import { leerInsumosGuia } from "@/lib/guia/insumos";
import { leerVersionesCoach, type VersionCoach } from "@/lib/guia/lectura";
import { formatFecha } from "@/components/coach/labels";
import { textoDatosOcultos, textoSinNotas } from "@/components/coach/alta/consentimiento";
import { ParrafoEnfocable } from "@/components/coach/guia/parrafo-enfocable";
import { PedirBorradorCoach } from "@/components/coach/guia/pedir-borrador";
import {
  ID_HAY_VERSIONES,
  ID_SIN_CONSENTIMIENTO,
  SIN_VERSIONES,
  textoAgrego,
  textoCambio,
  textoHayVersiones,
  textoIntro,
  textoLista,
  textoQuito,
  textoSinCambios,
  textoTituloHistorial,
  textoVolver,
  TITULO,
  VIGENTE,
} from "@/components/coach/guia/textos";
import { HojaLider } from "@/components/guia/hoja-lider";

export const metadata: Metadata = { title: TITULO };

type Props = { params: Promise<{ id: string }> };

export default async function ComoTrabajarConmigoCoachPage({ params }: Props) {
  const user = await requireRole("coach");
  const { id } = await params;
  // Un id que no es UUID haría fallar la consulta en Postgres; se trata como "no existe".
  if (!z.uuid().safeParse(id).success) notFound();

  const datos = await withRls(user.claims, async (tx) => {
    const [engagement] = await tx
      .select({ id: engagements.id, nombrePila: users.nombrePila })
      .from(engagements)
      .leftJoin(users, eq(users.id, engagements.personaId))
      .where(and(eq(engagements.id, id), eq(engagements.coachId, user.id)))
      .limit(1);
    if (!engagement) return null;

    const consentimiento = await estadoConsentimiento(tx, id);
    // Sin consentimiento vigente, RLS no devuelve filas: no se consultan.
    if (consentimiento.estado !== "vigente") return { engagement, consentimiento, versiones: [], hayVersiones: true };

    const insumos = await leerInsumosGuia(tx, id);
    return { engagement, consentimiento, versiones: await leerVersionesCoach(tx, id), hayVersiones: insumos?.hayVersiones ?? true };
  });

  if (!datos) notFound();
  const { engagement, consentimiento, versiones, hayVersiones } = datos;
  const nombre = engagement.nombrePila ?? "Persona sin nombre visible";

  const encabezado = (
    <p className="text-sm">
      <Link href={`/coach/engagements/${engagement.id}`} className="underline underline-offset-4">
        {textoVolver(nombre)}
      </Link>
    </p>
  );

  if (consentimiento.estado !== "vigente") {
    return (
      <div className="flex flex-col gap-4">
        {encabezado}
        <h1 className="text-2xl font-semibold">{TITULO}</h1>
        <ParrafoEnfocable id={ID_SIN_CONSENTIMIENTO} className="prose-measure font-medium">
          {consentimiento.estado === "retirado" ? textoDatosOcultos(nombre, consentimiento.fecha) : textoSinNotas(nombre)}
        </ParrafoEnfocable>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        {encabezado}
        <h1 className="text-2xl font-semibold">{TITULO}</h1>
        <p className="prose-measure">{textoIntro(nombre)}</p>
      </header>

      {hayVersiones ? (
        <ParrafoEnfocable id={ID_HAY_VERSIONES} className="prose-measure">
          {textoHayVersiones(nombre)}
        </ParrafoEnfocable>
      ) : (
        <PedirBorradorCoach engagementId={engagement.id} nombre={nombre} />
      )}

      {versiones.length === 0 ? (
        <p className="prose-measure">{SIN_VERSIONES}</p>
      ) : (
        versiones.map((v, i) => <VersionDelCoach key={v.id} version={v} vigente={i === 0} nombre={nombre} />)
      )}
    </div>
  );
}

function VersionDelCoach({ version, vigente, nombre }: { version: VersionCoach; vigente: boolean; nombre: string }) {
  const { documento, cambios, listaEn } = version;
  const fecha = formatFecha(listaEn);
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h2 className="text-xl font-semibold">
        {textoLista(fecha)}
        {vigente ? ` ${VIGENTE}` : ""}
      </h2>
      <HojaLider documento={documento} nivel="dentro" />
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">{textoTituloHistorial(nombre)}</h3>
        <ul className="prose-measure flex flex-col gap-1">
          {cambios.quitadas.map((texto, i) => (
            <li key={`q${i}`}>{textoQuito(texto)}</li>
          ))}
          {cambios.editadas.map((e, i) => (
            <li key={`e${i}`}>{textoCambio(e.textoIa, e.texto)}</li>
          ))}
          {cambios.agregadas.map((texto, i) => (
            <li key={`a${i}`}>{textoAgrego(texto)}</li>
          ))}
          <li>{textoSinCambios(cambios.sinCambios)}</li>
        </ul>
      </section>
    </section>
  );
}
