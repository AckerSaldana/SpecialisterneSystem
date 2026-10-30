// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /coach/engagements/[id]: encabezado del acompañamiento, sección "Alta" (solo en etapa alta),
// perfil actual, señales activas e historial de eventos. Todo se lee con RLS activa:
// si el coach no puede ver el engagement, la página responde 404.
// Spec 002: el consentimiento sale de app.consent_events (estadoConsentimiento), no de una columna
// de engagements (R-002.33). Sin consentimiento vigente no hay botón "Nueva sesión" (R-002.32) y,
// si lo retiró, RLS oculta notas, perfil e historial también al coach (decisión b, R-002.30).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { estadoConsentimiento } from "@/lib/consent";
import { withRls } from "@/lib/db/rls";
import { engagements, invitations, profileEvents, profileSnapshots, sessions, users } from "@/lib/db/schema";
import { ENGAGEMENT_CONFIG, etiquetaEtapa } from "@/lib/engagements/config";
import type { Perfil } from "@/lib/profile/schema";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ProfileView, SenalesView } from "@/components/coach/profile-view";
import { EventTimeline, type EventoVista } from "@/components/coach/event-timeline";
import { formatFecha } from "@/components/coach/labels";
import { textoConsentimiento, textoDatosOcultos, textoSinNotas } from "@/components/coach/alta/consentimiento";
import { InvitacionPaso, type EstadoInvitacion } from "@/components/coach/alta/invitacion-paso";
import { VerificacionForm } from "@/components/coach/alta/verificacion-form";

// Título fijo: así no hace falta otra consulta solo para el <title>.
export const metadata: Metadata = { title: "Acompañamiento" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EngagementPage({ params, searchParams }: Props) {
  const user = await requireRole("coach");
  const { id } = await params;
  // Un id que no es UUID haría fallar la consulta en Postgres; se trata como "no existe".
  if (!z.uuid().safeParse(id).success) notFound();
  // "Corregir la verificación" vuelve al formulario del paso 1 con ?corregir=verificacion.
  const corrigiendo = (await searchParams).corregir === "verificacion";

  // Alias para leer varias veces la tabla users: la persona, quien verificó, quien aprobó y quien creó cada evento.
  const verificador = alias(users, "verificador");
  const aprobador = alias(users, "aprobador");
  const creador = alias(users, "creador");

  const datos = await withRls(user.claims, async (tx) => {
    const [engagement] = await tx
      .select({
        id: engagements.id,
        type: engagements.type,
        stage: engagements.stage,
        diagnosticoVerificado: engagements.diagnosticoVerificado,
        cedulaProfesional: engagements.cedulaProfesional,
        diagnosticoVerificadoEn: engagements.diagnosticoVerificadoEn,
        verificadoPor: verificador.nombrePila,
        nombrePila: users.nombrePila,
      })
      .from(engagements)
      .leftJoin(users, eq(users.id, engagements.personaId))
      .leftJoin(verificador, eq(verificador.id, engagements.diagnosticoVerificadoPor))
      .where(and(eq(engagements.id, id), eq(engagements.coachId, user.id)))
      .limit(1);
    if (!engagement) return null;

    const consentimiento = await estadoConsentimiento(tx, id);

    // Paso 2 del alta: estado de la invitación. La tabla no tiene el código (R-002.47).
    let invitacion: EstadoInvitacion | null = null;
    if (engagement.stage === "alta") {
      const lista = await tx
        .select({
          usadaEn: invitations.usadaEn,
          reemplazadaEn: invitations.reemplazadaEn,
          expiraEn: invitations.expiraEn,
          // El vencimiento se compara con la hora de la base, igual que las políticas.
          vencida: sql<boolean>`${invitations.expiraEn} <= now()`,
        })
        .from(invitations)
        .where(eq(invitations.engagementId, id))
        .orderBy(desc(invitations.createdAt));
      const usada = lista.find((i) => i.usadaEn !== null);
      const pendiente = lista.find((i) => i.usadaEn === null && i.reemplazadaEn === null);
      if (usada?.usadaEn) invitacion = { tipo: "usada", fecha: formatFecha(usada.usadaEn) };
      else if (ENGAGEMENT_CONFIG[engagement.type].requiereDiagnostico && !engagement.diagnosticoVerificado)
        invitacion = { tipo: "sin_verificacion" };
      else if (pendiente)
        invitacion = { tipo: pendiente.vencida ? "vencida" : "pendiente", vence: formatFecha(pendiente.expiraEn) };
      else invitacion = { tipo: "ninguna" };
    }

    // Sin consentimiento vigente, RLS no devuelve filas de sesiones, perfil ni eventos: no se consultan.
    if (consentimiento.estado !== "vigente") {
      return { engagement, consentimiento, invitacion, historial: null };
    }

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

    return { engagement, consentimiento, invitacion, historial: { snapshot, listaSesiones, eventos } };
  });

  if (!datos) notFound();
  const { engagement, consentimiento, invitacion, historial } = datos;
  const nombre = engagement.nombrePila ?? "Persona sin nombre visible";
  const urlPagina = `/coach/engagements/${engagement.id}`;

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
            <dd>{textoConsentimiento(nombre, consentimiento)}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium">Diagnóstico verificado:</dt>
            <dd>{engagement.diagnosticoVerificado ? "Sí" : "No"}</dd>
          </div>
        </dl>
        <div>
          {consentimiento.estado === "vigente" ? (
            <Button asChild size="lg">
              <Link href={`${urlPagina}/sessions/new`}>Nueva sesión</Link>
            </Button>
          ) : (
            <p className="prose-measure font-medium">{textoSinNotas(nombre)}</p>
          )}
        </div>
      </header>

      {engagement.stage === "alta" && invitacion ? (
        <>
          <Separator />
          <section aria-labelledby="alta" className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 id="alta" className="text-xl font-semibold">
                Alta
              </h2>
              <p className="prose-measure">Para empezar hay tres pasos. Los haces en este orden.</p>
            </div>

            <section aria-labelledby="verificacion" className="flex flex-col gap-4">
              <h3 id="verificacion" className="text-lg font-semibold">
                1. Verificación del diagnóstico
              </h3>
              {engagement.diagnosticoVerificado && !corrigiendo ? (
                <>
                  <p className="prose-measure">
                    Diagnóstico verificado por {engagement.verificadoPor ?? "un coach"} el{" "}
                    {engagement.diagnosticoVerificadoEn ? formatFecha(engagement.diagnosticoVerificadoEn) : "día registrado"}.
                    Cédula: {engagement.cedulaProfesional}.
                  </p>
                  <p className="prose-measure text-sm text-muted-foreground">
                    Solo tú ves este dato. La persona no lo ve en su pantalla y la empresa nunca lo recibe.
                  </p>
                  <p className="text-sm">
                    <Link href={`${urlPagina}?corregir=verificacion#verificacion`} className="underline underline-offset-4">
                      Corregir la verificación
                    </Link>
                  </p>
                </>
              ) : (
                <>
                  <div role="note" className="prose-measure rounded-lg border-2 border-primary bg-accent p-4 font-medium">
                    No subas ni copies el documento. Revísalo fuera del sistema. Aquí solo registras que lo revisaste y la
                    cédula del profesional.
                  </div>
                  <VerificacionForm
                    engagementId={engagement.id}
                    cedulaGuardada={engagement.cedulaProfesional}
                    urlCancelar={engagement.diagnosticoVerificado ? `${urlPagina}#verificacion` : null}
                  />
                  <p className="prose-measure text-sm text-muted-foreground">
                    Solo tú ves este dato. La persona no lo ve en su pantalla y la empresa nunca lo recibe.
                  </p>
                </>
              )}
            </section>

            <section aria-labelledby="invitacion" className="flex flex-col gap-4">
              <h3 id="invitacion" className="text-lg font-semibold">
                2. Invitación
              </h3>
              <InvitacionPaso engagementId={engagement.id} nombre={nombre} estado={invitacion} />
            </section>

            <section aria-labelledby="consentimiento" className="flex flex-col gap-4">
              <h3 id="consentimiento" className="text-lg font-semibold">
                3. Consentimiento de la persona
              </h3>
              <p className="prose-measure">{textoConsentimiento(nombre, consentimiento)}</p>
            </section>
          </section>
        </>
      ) : null}

      {historial ? (
        <HistorialVisible {...historial} />
      ) : consentimiento.estado === "retirado" ? (
        <>
          <Separator />
          <section aria-labelledby="datos-ocultos" className="flex flex-col gap-4">
            <h2 id="datos-ocultos" className="text-xl font-semibold">
              Perfil e historial
            </h2>
            <p className="prose-measure">{textoDatosOcultos(nombre, consentimiento.fecha)}</p>
          </section>
        </>
      ) : null}
    </div>
  );
}

type HistorialProps = {
  snapshot: { version: number; perfil: Perfil; createdAt: Date } | undefined;
  listaSesiones: { id: string; realizadaEn: Date }[];
  eventos: EventoVista[];
};

// Perfil, señales e historial: solo con consentimiento vigente.
function HistorialVisible({ snapshot, listaSesiones, eventos }: HistorialProps) {
  // sessionId -> fecha formateada, para la evidencia de cada dimensión.
  const fechasSesion: Record<string, string> = {};
  for (const s of listaSesiones) fechasSesion[s.id] = formatFecha(s.realizadaEn);

  return (
    <>
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
    </>
  );
}
