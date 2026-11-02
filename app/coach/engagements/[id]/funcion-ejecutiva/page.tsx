// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /coach/engagements/[id]/funcion-ejecutiva: las conductas que anotó el coach, por dominio (spec 008,
// R-008.21 a R-008.27). Siempre los 9 dominios en el orden de DOMINIOS_FE, sin puntajes, totales ni
// comparaciones (C-01). La persona no ve esta pantalla (C-09). Todo se lee con RLS activa: si el coach
// no puede ver el engagement, la página responde 404. Sin consentimiento vigente solo muestra el texto
// que ya existe (R-008.42). Los filtros van en la URL y no cambian lo que se ofrece al corregir ni lo
// que usa el resumen de cada bloque (R-008.34).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { estadoConsentimiento } from "@/lib/consent";
import { withRls } from "@/lib/db/rls";
import { engagements, users } from "@/lib/db/schema";
import { etiquetaDominioFE } from "@/lib/profile/schema";
import { filtrarTrayectoria, leerFiltros } from "@/lib/trayectoria/filtros";
import { leerResumenes, leerTrayectoria } from "@/lib/trayectoria/lectura";
import { armarTrayectoria, compararLineas, type Linea } from "@/lib/trayectoria/lineas";
import { resumenesDeDominio } from "@/lib/trayectoria/validate";
import { formatFecha } from "@/components/coach/labels";
import { textoDatosOcultos, textoSinNotas } from "@/components/coach/alta/consentimiento";
import { BloqueDominio } from "@/components/coach/trayectoria/bloque-dominio";
import { AvisoCorreccion, type CitaAnterior } from "@/components/coach/trayectoria/corregir-linea";
import { FiltrosTrayectoria } from "@/components/coach/trayectoria/filtros";
import { NotaDeSesion, type ContextoLineas } from "@/components/coach/trayectoria/linea";
import { ResumenDominio } from "@/components/coach/trayectoria/resumen-dominio";
import {
  AYUDA_SIN_DOMINIO,
  idBloque,
  textoIntro,
  textoNoMostrada,
  textoVolver,
  TITULO_NO_MOSTRADAS,
  TITULO_PANTALLA,
  TITULO_SIN_DOMINIO,
  VACIO_BLOQUE,
  VACIO_POR_FILTROS,
  VACIO_SIN_DOMINIO,
} from "@/components/coach/trayectoria/textos";

export const metadata: Metadata = { title: TITULO_PANTALLA };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const crudo = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Una sola lista de objetos: cada línea filtra la misma, sin importar en qué bloque esté (R-008.30).
function citasAnteriores(lineas: Linea[]): (linea: Linea) => CitaAnterior[] {
  const conDominio = lineas.flatMap((l) =>
    l.dominio ? [{ linea: l, opcion: { lineaId: l.lineaId, dominio: l.dominio, cita: l.cita, fecha: formatFecha(l.fecha) } }] : [],
  );
  return (linea) => conDominio.filter((c) => compararLineas(c.linea, linea) < 0).map((c) => c.opcion);
}

export default async function FuncionEjecutivaPage({ params, searchParams }: Props) {
  const user = await requireRole("coach");
  const { id } = await params;
  // Un id que no es UUID haría fallar la consulta en Postgres; se trata como "no existe".
  if (!z.uuid().safeParse(id).success) notFound();
  const parametros = await searchParams;
  const { filtros, errorFechas } = leerFiltros(parametros);

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
    if (consentimiento.estado !== "vigente") return { engagement, consentimiento, leida: null, resumenes: [] };
    return { engagement, consentimiento, leida: await leerTrayectoria(tx, id), resumenes: await leerResumenes(tx, id) };
  });

  if (!datos) notFound();
  const { engagement, consentimiento, leida, resumenes } = datos;
  const nombre = engagement.nombrePila ?? "Persona sin nombre visible";
  const urlAcompanamiento = `/coach/engagements/${engagement.id}`;

  const encabezado = (
    <p className="text-sm">
      <Link href={`${urlAcompanamiento}#perfil-actual`} className="underline underline-offset-4">
        {textoVolver(nombre)}
      </Link>
    </p>
  );

  if (!leida) {
    return (
      <div className="flex flex-col gap-4">
        {encabezado}
        <h1 className="text-2xl font-semibold">{TITULO_PANTALLA}</h1>
        <p className="prose-measure font-medium">
          {consentimiento.estado === "retirado" ? textoDatosOcultos(nombre, consentimiento.fecha) : textoSinNotas(nombre)}
        </p>
      </div>
    );
  }

  const completa = armarTrayectoria(leida.lineas, leida.noMostradas);
  const filtrada = filtrarTrayectoria(completa, filtros);
  const contexto: ContextoLineas = {
    engagementId: engagement.id,
    nombre,
    porId: new Map(leida.lineas.map((l) => [l.lineaId, l])),
    anterioresDe: citasAnteriores(leida.lineas),
    notas: leida.notas,
    filtroTipo: filtros.tipo,
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        {encabezado}
        <h1 className="text-2xl font-semibold">{TITULO_PANTALLA}</h1>
        <p className="prose-measure">{textoIntro(nombre)}</p>
      </header>

      <FiltrosTrayectoria
        url={`${urlAcompanamiento}/funcion-ejecutiva`}
        desde={crudo(parametros.desde)}
        hasta={crudo(parametros.hasta)}
        tipo={filtros.tipo}
        errorFechas={errorFechas}
      />

      <div className="flex flex-col gap-8">
        <AvisoCorreccion />

        {filtrada.bloques.map((b, i) => {
          // El resumen toma todo el bloque, sin filtros. Sin líneas no se interpreta (R-008.23, R-008.34).
          const entero = completa.bloques[i].lineas;
          return (
            <BloqueDominio
              key={b.dominio}
              id={idBloque(b.dominio)}
              titulo={etiquetaDominioFE(b.dominio)}
              lineas={b.lineas}
              vacio={b.vacioPorFiltros ? VACIO_POR_FILTROS : VACIO_BLOQUE}
              contexto={contexto}
              pie={
                entero.length > 0 ? (
                  <ResumenDominio engagementId={engagement.id} nombre={nombre} dominio={b.dominio} lineas={entero} {...resumenesDeDominio(resumenes, b.dominio)} />
                ) : null
              }
            />
          );
        })}

        <BloqueDominio
          id={idBloque(null)}
          titulo={TITULO_SIN_DOMINIO}
          ayuda={AYUDA_SIN_DOMINIO}
          lineas={filtrada.sinDominio}
          vacio={completa.sinDominio.length > 0 ? VACIO_POR_FILTROS : VACIO_SIN_DOMINIO}
          contexto={contexto}
        />

        {filtrada.noMostradas.length > 0 ? (
          <section aria-labelledby="citas-no-mostradas" className="flex flex-col gap-3">
            <h2 id="citas-no-mostradas" className="text-xl font-semibold">
              {TITULO_NO_MOSTRADAS}
            </h2>
            <ul className="flex flex-col gap-3">
              {filtrada.noMostradas.map((c, i) => (
                <li key={i} className="flex flex-col gap-2">
                  <p className="prose-measure">{textoNoMostrada(c.fecha)}</p>
                  <NotaDeSesion nota={leida.notas[c.sessionId]} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
