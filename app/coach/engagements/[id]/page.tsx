// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /coach/engagements/[id]: encabezado del acompañamiento, perfil actual,
// señales activas e historial de eventos. Todo se lee con RLS activa:
// si el coach no puede ver el engagement, la página responde 404.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { engagements, profileEvents, profileSnapshots, sessions, users } from "@/lib/db/schema";
import { ENGAGEMENT_CONFIG, etiquetaEtapa } from "@/lib/engagements/config";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ProfileView, SenalesView } from "@/components/coach/profile-view";
import { EventTimeline } from "@/components/coach/event-timeline";
import { formatFecha } from "@/components/coach/labels";

// Título fijo: así no hace falta otra consulta solo para el <title>.
export const metadata: Metadata = { title: "Acompañamiento" };

export default async function EngagementPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("coach");
  const { id } = await params;
  // Un id que no es UUID haría fallar la consulta en Postgres; se trata como "no existe".
  if (!z.uuid().safeParse(id).success) notFound();

  // Alias para leer dos veces la tabla users: quien aprobó y quien creó cada evento.
  const aprobador = alias(users, "aprobador");
  const creador = alias(users, "creador");

  const datos = await withRls(user.claims, async (tx) => {
    const [engagement] = await tx
      .select({
        id: engagements.id,
        type: engagements.type,
        stage: engagements.stage,
        consentimientoEn: engagements.consentimientoEn,
        diagnosticoVerificado: engagements.diagnosticoVerificado,
        nombrePila: users.nombrePila,
      })
      .from(engagements)
      .leftJoin(users, eq(users.id, engagements.personaId))
      .where(and(eq(engagements.id, id), eq(engagements.coachId, user.id)))
      .limit(1);
    if (!engagement) return null;

    const [snapshot] = await tx
      .select({ version: profileSnapshots.version, perfil: profileSnapshots.perfil, createdAt: profileSnapshots.createdAt })
      .from(profileSnapshots)
      .where(eq(profileSnapshots.engagementId, id))
      .orderBy(desc(profileSnapshots.version))
      .limit(1);

    const listaSesiones = await tx
      .select({ id: sessions.id, realizadaEn: sessions.realizadaEn })
      .from(sessions)
      .where(eq(sessions.engagementId, id));

    const eventos = await tx
      .select({
        id: profileEvents.id,
        status: profileEvents.status,
        payload: profileEvents.payload,
        approvedPayload: profileEvents.approvedPayload,
        decidedAt: profileEvents.decidedAt,
        decididoPor: aprobador.nombrePila,
        creadoPor: creador.nombrePila,
        promptVersion: profileEvents.promptVersion,
        model: profileEvents.model,
        createdAt: profileEvents.createdAt,
      })
      .from(profileEvents)
      .leftJoin(aprobador, eq(aprobador.id, profileEvents.decidedBy))
      .leftJoin(creador, eq(creador.id, profileEvents.createdBy))
      .where(eq(profileEvents.engagementId, id))
      .orderBy(desc(profileEvents.createdAt));

    return { engagement, snapshot, listaSesiones, eventos };
  });

  if (!datos) notFound();
  const { engagement, snapshot, listaSesiones, eventos } = datos;
  const nombre = engagement.nombrePila ?? "Persona sin nombre visible";

  // sessionId -> fecha formateada, para la evidencia de cada dimensión.
  const fechasSesion: Record<string, string> = {};
  for (const s of listaSesiones) fechasSesion[s.id] = formatFecha(s.realizadaEn);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <p className="text-sm">
          <Link href="/coach" className="underline underline-offset-4">
            Volver a tus acompañamientos
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">{nombre}</h1>
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium">Tipo:</dt>
            <dd>{ENGAGEMENT_CONFIG[engagement.type].etiqueta}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium">Etapa:</dt>
            <dd>{etiquetaEtapa(engagement.stage)}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium">Consentimiento:</dt>
            <dd>{engagement.consentimientoEn ? `Sí, desde el ${formatFecha(engagement.consentimientoEn)}` : "Pendiente"}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium">Diagnóstico verificado:</dt>
            <dd>{engagement.diagnosticoVerificado ? "Sí" : "No"}</dd>
          </div>
        </dl>
        <div>
          <Button asChild size="lg">
            <Link href={`/coach/engagements/${engagement.id}/sessions/new`}>Nueva sesión</Link>
          </Button>
        </div>
      </header>

      <Separator />

      <section aria-labelledby="perfil-actual" className="flex flex-col gap-4">
        <h2 id="perfil-actual" className="text-xl font-semibold">
          Perfil actual
        </h2>
        {snapshot ? (
          <>
            <p className="text-sm text-muted-foreground">
              Versión {snapshot.version}, del {formatFecha(snapshot.createdAt)}.
            </p>
            <ProfileView perfil={snapshot.perfil} fechasSesion={fechasSesion} />
          </>
        ) : (
          <p className="prose-measure">
            Todavía no hay perfil. Escribe la nota de una sesión y aprueba la propuesta para crear la primera versión.
          </p>
        )}
      </section>

      <Separator />

      <section aria-labelledby="senales-activas" className="flex flex-col gap-4">
        <h2 id="senales-activas" className="text-xl font-semibold">
          Señales activas
        </h2>
        <p className="prose-measure text-sm text-muted-foreground">Solo tú ves esta sección. La persona no la ve.</p>
        {snapshot ? (
          <SenalesView perfil={snapshot.perfil} fechasSesion={fechasSesion} />
        ) : (
          <p className="text-sm text-muted-foreground">No hay señales activas.</p>
        )}
      </section>

      <Separator />

      <section aria-labelledby="historial" className="flex flex-col gap-4">
        <h2 id="historial" className="text-xl font-semibold">
          Historial
        </h2>
        <EventTimeline eventos={eventos} />
      </section>
    </div>
  );
}
