// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /coach/engagements/[id]/proposals/[eventId]: revisión de una propuesta de la IA, armada con lo
// guardado en profile_events, sin llamar otra vez al modelo (R-004.26). Con el consentimiento
// retirado RLS oculta el evento y la página responde 404 (R-004.48).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { engagements, users } from "@/lib/db/schema";
import { leerVistaPropuesta } from "@/lib/followup/lectura";
import { formatFecha, textoTipoSesion } from "@/components/coach/labels";
import { ProposalReview } from "@/components/coach/proposal-review";

export const metadata: Metadata = { title: "Revisar propuesta" };

type Props = { params: Promise<{ id: string; eventId: string }> };

export default async function ProposalPage({ params }: Props) {
  const user = await requireRole("coach");
  const { id, eventId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(eventId).success) notFound();

  const datos = await withRls(user.claims, async (tx) => {
    const [engagement] = await tx
      .select({ id: engagements.id, nombrePila: users.nombrePila })
      .from(engagements)
      .leftJoin(users, eq(users.id, engagements.personaId))
      .where(and(eq(engagements.id, id), eq(engagements.coachId, user.id)))
      .limit(1);
    if (!engagement) return null;
    const vista = await leerVistaPropuesta(tx, id, eventId);
    return vista ? { nombre: engagement.nombrePila ?? "Persona sin nombre visible", vista } : null;
  });
  if (!datos) notFound();
  const { nombre, vista } = datos;
  const urlPerfil = `/coach/engagements/${id}`;

  return (
    <div className="flex flex-col gap-8">
      {/* Spec 012 (R-012.29): título en serif y la sesión como metadato. */}
      <header className="flex flex-col gap-3">
        <p>
          <Link href={urlPerfil} className="underline underline-offset-4">
            Volver al perfil de {nombre}
          </Link>
        </p>
        <h1 className="text-4xl leading-tight">Propuesta de la sesión</h1>
        {vista.sesion ? (
          <p className="text-muted-foreground">
            {textoTipoSesion(vista.sesion.tipo, nombre)}, el {formatFecha(vista.sesion.fecha)}.
            {vista.sesion.observador ? ` Observó: ${vista.sesion.observador}.` : ""}
          </p>
        ) : null}
      </header>
      {vista.status === "proposed" ? (
        <ProposalReview vista={vista} nombre={nombre} />
      ) : (
        <p className="prose-measure">
          Esta propuesta ya fue revisada. Su decisión está en el{" "}
          <Link href={`${urlPerfil}#historial`} className="font-medium underline underline-offset-4">
            historial
          </Link>
          .
        </p>
      )}
    </div>
  );
}
