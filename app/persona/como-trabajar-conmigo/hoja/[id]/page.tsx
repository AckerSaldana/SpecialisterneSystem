// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /persona/como-trabajar-conmigo/hoja/[id]: la hoja de una versión lista (spec 009, R-009.41 a R-009.45). Solo
// lee documento y estado. Con otro estado, o sin fila visible, responde 404. Pasa por la puerta de la persona:
// no hay enlace público, token ni cuenta para el líder. title.absolute: el archivo no dice "Caja MEX" (R-009.44).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { withRls } from "@/lib/db/rls";
import { leerHoja } from "@/lib/guia/lectura";
import { TITULO_GUIA } from "@/lib/guia/schema-cliente";
import { puertaPersona } from "@/lib/persona/puerta";
import { HojaLider } from "@/components/guia/hoja-lider";
import { BotonImprimir } from "@/components/persona/guia/boton-imprimir";
import { HOJA, RUTA_GUIA } from "@/components/persona/guia/textos";

export const metadata: Metadata = { title: { absolute: TITULO_GUIA } };

type Props = { params: Promise<{ id: string }> };

export default async function HojaPage({ params }: Props) {
  const { user } = await puertaPersona("persona");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const documento = await withRls(user.claims, (tx) => leerHoja(tx, id));
  if (!documento) notFound();

  return (
    <div className="flex flex-col gap-8">
      <HojaLider documento={documento} />

      {/* Solo en pantalla, fuera de la hoja. */}
      <div className="flex flex-col gap-3 print:hidden">
        <BotonImprimir />
        <p className="prose-measure">{HOJA.ayuda}</p>
        <p className="prose-measure">{HOJA.aviso}</p>
        <p>
          <Link href={RUTA_GUIA}>{HOJA.volver}</Link>
        </p>
      </div>
    </div>
  );
}
