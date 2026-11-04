// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /persona/como-trabajar-conmigo/vista-previa/[id]: lo que recibiría el líder con las decisiones de ahora (spec
// 009, R-009.27). Mismo componente y misma función armarDocumento que la hoja final. No se puede imprimir: en la
// impresión solo sale el aviso, porque nada existe para compartir hasta que ella lo marca como listo.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { withRls } from "@/lib/db/rls";
import { leerVistaPrevia } from "@/lib/guia/lectura";
import { puertaPersona } from "@/lib/persona/puerta";
import { HojaLider } from "@/components/guia/hoja-lider";
import { PANEL_HOJA, RUTA_GUIA, VISTA_PREVIA } from "@/components/persona/guia/textos";

export const metadata: Metadata = { title: VISTA_PREVIA.titulo };

type Props = { params: Promise<{ id: string }> };

export default async function VistaPreviaPage({ params }: Props) {
  const { user, acompanamiento } = await puertaPersona("persona");
  const { id } = await params;
  if (!acompanamiento || !z.uuid().safeParse(id).success) notFound();

  const documento = await withRls(user.claims, (tx) => leerVistaPrevia(tx, acompanamiento.id, id));
  if (!documento) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 print:hidden">
        <p>
          <Link href={RUTA_GUIA} className="underline underline-offset-4">
            {VISTA_PREVIA.volver}
          </Link>
        </p>
        <p role="note" className="prose-measure rounded-md border-l-4 border-primary bg-accent px-4 py-3 font-medium">
          {VISTA_PREVIA.arriba}
        </p>
      </div>

      {/* Spec 012 (R-012.43): el mismo panel de papel que la hoja final. */}
      <div className={PANEL_HOJA}>
        <div className="print:hidden">
          <HojaLider documento={documento} />
        </div>
      </div>

      <p className="hidden print:block">{VISTA_PREVIA.alImprimir}</p>
    </div>
  );
}
