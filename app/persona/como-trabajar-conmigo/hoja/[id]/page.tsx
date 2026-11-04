// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /persona/como-trabajar-conmigo/hoja/[id]: la hoja de una versión lista (spec 009, R-009.41 a R-009.45). Solo
// lee documento y estado. Con otro estado, o sin fila visible, responde 404. Pasa por la puerta de la persona:
// no hay enlace público, token ni cuenta para el líder. title.absolute: el archivo no dice el nombre del producto (R-009.44).
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
import { HOJA, PANEL_HOJA, RUTA_GUIA } from "@/components/persona/guia/textos";

export const metadata: Metadata = { title: { absolute: TITULO_GUIA } };

type Props = { params: Promise<{ id: string }> };

export default async function HojaPage({ params }: Props) {
  const { user } = await puertaPersona("persona");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const documento = await withRls(user.claims, (tx) => leerHoja(tx, id));
  if (!documento) notFound();

  return (
    <div className="flex flex-col gap-6">
      {/* Solo en pantalla, fuera de la hoja. */}
      <p className="print:hidden">
        <Link href={RUTA_GUIA} className="underline underline-offset-4">
          {HOJA.volver}
        </Link>
      </p>

      {/* Spec 012 (R-012.43): en pantalla, la hoja en un panel de papel. Al imprimir el panel no deja rastro. */}
      <div className={PANEL_HOJA}>
        <HojaLider documento={documento} />
      </div>

      <div className="flex flex-col gap-4 print:hidden">
        <BotonImprimir />
        <p className="prose-measure text-muted-foreground">{HOJA.ayuda}</p>
        <p role="note" className="prose-measure rounded-md border-l-4 border-primary bg-accent px-4 py-3 font-medium">
          {HOJA.aviso}
        </p>
      </div>
    </div>
  );
}
