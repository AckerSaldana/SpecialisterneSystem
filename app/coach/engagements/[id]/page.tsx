// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// /coach/engagements/[id]: encabezado del acompañamiento, sección "Alta" (solo en etapa alta),
// perfil actual, plan de acompañamiento (spec 003), señales activas e historial de eventos.
// Todo se lee con RLS activa: si el coach no puede ver el engagement, la página responde 404.
// Spec 002: el consentimiento sale de app.consent_events (estadoConsentimiento), no de una columna
// de engagements (R-002.33). Sin consentimiento vigente no hay botón "Nueva sesión" (R-002.32) y,
// si lo retiró, RLS oculta notas, perfil e historial también al coach (decisión b, R-002.30).
// Spec 004: propuestas sin revisar, sesiones sin propuesta, alertas fuertes e historiales.
// Spec 005: aviso y cierre de los "Esto no me representa" (R-005.25 a R-005.27, R-005.34).
// Spec 008: enlace a la pantalla "Función ejecutiva" dentro de "Perfil actual" (R-008.21).
// Spec 009: enlace a "Cómo trabajar conmigo", después del plan.
// Spec 010: enlace a "Tareas de {nombre}", junto a ese (R-010.2).
// Spec 012: encabezado con Tipo y Etapa, línea de tiempo de sesiones y panel "Perfil de {nombre}" (R-012.17 a R-012.20).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ChevronRightIcon } from "lucide-react";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { estadoConsentimiento } from "@/lib/consent";
import { withRls } from "@/lib/db/rls";
import { engagements, invitations, profileEvents, profileSnapshots, sessions, users } from "@/lib/db/schema";
import { ENGAGEMENT_CONFIG } from "@/lib/engagements/config";
import { leerSeguimiento, type DatosSeguimiento } from "@/lib/followup/lectura";
import { TITULO_GUIA } from "@/lib/guia/schema-cliente";
import { leerDatosCierre, type DatosCierre } from "@/lib/persona/cierre-comentario";
import type { Perfil } from "@/lib/profile/schema";
import { DoodlePlanta } from "@/components/Doodle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ProfileView, SenalesView } from "@/components/coach/profile-view";
import { EventTimeline, type EventoVista } from "@/components/coach/event-timeline";
import { LineaTiempo, type SesionLinea } from "@/components/coach/linea-tiempo";
import { MetaAcompanamiento } from "@/components/coach/meta-acompanamiento";
import { PerfilPanel } from "@/components/coach/perfil-panel";
import { EnEstaPagina, PorAtender } from "@/components/coach/por-atender";
import { formatFecha } from "@/components/coach/labels";
import { textoConsentimiento, textoDatosOcultos, textoSinNotas } from "@/components/coach/alta/consentimiento";
import { InvitacionPaso, type EstadoInvitacion } from "@/components/coach/alta/invitacion-paso";
import { PasoDelAlta } from "@/components/coach/alta/paso-del-alta";
import { VerificacionForm } from "@/components/coach/alta/verificacion-form";
import { tituloTareas } from "@/components/coach/desglose/textos";
import { leerPlan, type DatosPlan } from "@/components/coach/plan/datos";
import { SeccionPlan } from "@/components/coach/plan/seccion-plan";
import { AccionesSenal, AlertasFuertes, ComentariosSinRevisar, Historiales, PropuestasPendientes } from "@/components/coach/seguimiento/secciones";

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
      .select({
        id: profileSnapshots.id,
        version: profileSnapshots.version,
        perfil: profileSnapshots.perfil,
        createdAt: profileSnapshots.createdAt,
      })
      .from(profileSnapshots)
      .where(eq(profileSnapshots.engagementId, id))
      .orderBy(desc(profileSnapshots.version))
      .limit(1);

    const listaSesiones = await tx
      .select({ id: sessions.id, tipo: sessions.tipo, realizadaEn: sessions.realizadaEn, observador: sessions.observador, nota: sessions.notaOriginal })
      .from(sessions)
      .where(eq(sessions.engagementId, id))
      .orderBy(desc(sessions.realizadaEn), desc(sessions.createdAt));

    // R-012.18: "Ver detalle" abre la propuesta de la IA de esa sesión (hay a lo más una, profile_events_una_propuesta).
    const propuestas = await tx
      .select({ id: profileEvents.id, sessionId: profileEvents.sessionId })
      .from(profileEvents)
      .where(and(eq(profileEvents.engagementId, id), eq(profileEvents.tipo, "propuesta_ia")));
    const propuestaDe = new Map(propuestas.flatMap((p) => (p.sessionId ? [[p.sessionId, p.id] as const] : [])));
    const lineaSesiones: SesionLinea[] = listaSesiones.map((s) => ({ ...s, propuestaId: propuestaDe.get(s.id) ?? null }));

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
        sesionTipo: sessions.tipo,
        sesionFecha: sessions.realizadaEn,
      })
      .from(profileEvents)
      .leftJoin(sessions, eq(sessions.id, profileEvents.sessionId))
      .leftJoin(aprobador, eq(aprobador.id, profileEvents.decidedBy))
      .leftJoin(creador, eq(creador.id, profileEvents.createdBy))
      .where(eq(profileEvents.engagementId, id))
      .orderBy(desc(profileEvents.createdAt));

    // Spec 003: plan vigente, borrador y fichas, en la misma transacción con consentimiento vigente.
    const plan = await leerPlan(tx, id, snapshot);

    const seguimiento = await leerSeguimiento(tx, id, snapshot?.perfil ?? null);

    const cierre = await leerDatosCierre(tx, id);

    return { engagement, consentimiento, invitacion, historial: { snapshot, listaSesiones, lineaSesiones, eventos, plan, seguimiento, cierre } };
  });

  if (!datos) notFound();
  const { engagement, consentimiento, invitacion, historial } = datos;
  const nombre = engagement.nombrePila ?? "Persona sin nombre visible";
  const urlPagina = `/coach/engagements/${engagement.id}`;
  // R-012.39: qué pasos del alta ya terminaron y cuál sigue: el primero sin terminar. Si el tipo no pide diagnóstico,
  // la verificación no detiene la invitación, así que no es el que sigue aunque no esté hecha.
  const pasosAlta = {
    verificacion: engagement.diagnosticoVerificado,
    invitacion: invitacion?.tipo === "usada",
    consentimiento: consentimiento.estado === "vigente",
    sigue: 0,
  };
  const verificacionNoDetiene = pasosAlta.verificacion || !ENGAGEMENT_CONFIG[engagement.type].requiereDiagnostico;
  pasosAlta.sigue = [verificacionNoDetiene, pasosAlta.invitacion, pasosAlta.consentimiento].indexOf(false) + 1;

  return (
    <div className="flex flex-col gap-8">
      <header className="relative flex flex-col gap-4">
        <p>
          <Link href="/coach" className="underline underline-offset-4">
            Volver a tus acompañamientos
          </Link>
        </p>
        {/* R-012.17: doodle quieto arriba a la derecha; en pantallas angostas no se muestra para no tapar el título. */}
        <DoodlePlanta className="pointer-events-none absolute top-0 right-0 hidden w-36 lg:block" />
        {/* "Acompañamiento" no cabe en 48px a 375px de ancho: en pantallas angostas baja a 30px. */}
        <h1 className="text-3xl leading-tight sm:text-5xl lg:pr-40">Acompañamiento de {nombre}</h1>
        <MetaAcompanamiento tipo={engagement.type} etapa={engagement.stage} />
        {/* R-012.27: consentimiento y verificación en una sola línea apagada. */}
        <dl className="flex flex-wrap gap-x-8 gap-y-1 text-muted-foreground">
          <div className="flex flex-wrap gap-x-2">
            <dt>Consentimiento:</dt>
            <dd>{textoConsentimiento(nombre, consentimiento)}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt>Diagnóstico verificado:</dt>
            <dd>{engagement.diagnosticoVerificado ? "Sí" : "No"}</dd>
          </div>
        </dl>
        {/* Con consentimiento vigente, "+ Nueva sesión" va debajo de la línea de tiempo (R-012.18). */}
        {consentimiento.estado === "vigente" ? null : <p className="prose-measure font-medium">{textoSinNotas(nombre)}</p>}
      </header>

      {/* R-012.26: solo con consentimiento vigente, que es cuando existen esas secciones. */}
      {historial ? <EnEstaPagina /> : null}

      {engagement.stage === "alta" && invitacion ? (
        <>
          <Separator />
          {/* Spec 012 (R-012.39): los tres pasos en tarjetas; el terminado dice "Hecho" y el que sigue lleva la barra de acento. */}
          <section aria-labelledby="alta" className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 id="alta" className="text-3xl">
                Alta
              </h2>
              <p className="prose-measure text-muted-foreground">Para empezar hay tres pasos. Los haces en este orden.</p>
            </div>

            <ol className="flex flex-col gap-4">
              <PasoDelAlta numero={1} id="verificacion" titulo="Verificación del diagnóstico" hecho={pasosAlta.verificacion} sigue={pasosAlta.sigue === 1}>
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
                    <p>
                      <Link href={`${urlPagina}?corregir=verificacion#verificacion`} className="underline underline-offset-4">
                        Corregir la verificación
                      </Link>
                    </p>
                  </>
                ) : (
                  <>
                    <div role="note" className="prose-measure rounded-md border-l-4 border-primary bg-accent px-4 py-3 font-medium">
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
              </PasoDelAlta>

              <PasoDelAlta numero={2} id="invitacion" titulo="Invitación" hecho={pasosAlta.invitacion} sigue={pasosAlta.sigue === 2}>
                <InvitacionPaso engagementId={engagement.id} nombre={nombre} estado={invitacion} />
              </PasoDelAlta>

              <PasoDelAlta numero={3} id="consentimiento" titulo="Consentimiento de la persona" hecho={pasosAlta.consentimiento} sigue={pasosAlta.sigue === 3}>
                <p className="prose-measure">{textoConsentimiento(nombre, consentimiento)}</p>
              </PasoDelAlta>
            </ol>
          </section>
        </>
      ) : null}

      {historial ? (
        <HistorialVisible {...historial} engagementId={engagement.id} nombre={nombre} />
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

      {/* Sin consentimiento vigente, la sección del plan solo dice por qué no se muestra (spec 003). */}
      {historial ? null : (
        <>
          <Separator />
          <SeccionPlan engagementId={engagement.id} nombre={nombre} datos={null} />
        </>
      )}
    </div>
  );
}

type HistorialProps = {
  snapshot: { id: string; version: number; perfil: Perfil; createdAt: Date } | undefined;
  listaSesiones: { id: string; realizadaEn: Date; observador: string | null }[];
  lineaSesiones: SesionLinea[];
  eventos: EventoVista[];
  plan: DatosPlan;
  seguimiento: DatosSeguimiento;
  cierre: DatosCierre;
  engagementId: string;
  nombre: string;
};

// Perfil, plan, señales e historial: solo con consentimiento vigente.
function HistorialVisible({ snapshot, listaSesiones, lineaSesiones, eventos, plan, seguimiento, cierre, engagementId, nombre }: HistorialProps) {
  // sessionId -> fecha formateada, para la evidencia de cada dimensión.
  const fechasSesion: Record<string, string> = {};
  for (const s of listaSesiones) fechasSesion[s.id] = formatFecha(s.realizadaEn);
  // Spec 011 (R-011.11): quién observó, cuando se conoce.
  const observadores = Object.fromEntries(listaSesiones.flatMap((s) => (s.observador ? [[s.id, s.observador]] : [])));

  // Una señal con alerta sin atender no ofrece marcar otra (strong_alerts_una_vigente).
  const conAlerta = new Set(seguimiento.alertas.filter((a) => a.estado !== "atendida").map((a) => a.tipoSenal));

  // R-012.25: los mismos filtros que usan PropuestasPendientes, ComentariosSinRevisar y AlertasFuertes.
  const pendientes = {
    propuestas: seguimiento.pendientes.length,
    sinPropuesta: seguimiento.sinPropuesta.length,
    comentarios: eventos.filter((e) => e.status === "proposed" && e.payload.tipo === "no_me_representa").length,
    alertas: seguimiento.alertas.filter((a) => a.estado !== "atendida").length,
  };

  return (
    <>
      <PorAtender pendientes={pendientes} nombre={nombre} />

      {/* R-012.18 y R-012.19: línea de tiempo con "+ Nueva sesión" y, al lado, el panel del perfil. */}
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="flex flex-col gap-6">
          <LineaTiempo sesiones={lineaSesiones} engagementId={engagementId} nombre={nombre} />
          <div>
            <Button asChild size="lg">
              <Link href={`/coach/engagements/${engagementId}/sessions/new`}>+ Nueva sesión</Link>
            </Button>
          </div>
        </div>
        <PerfilPanel perfil={snapshot?.perfil ?? null} nombre={nombre} fechasSesion={fechasSesion} />
      </div>

      <Separator />

      <PropuestasPendientes datos={seguimiento} engagementId={engagementId} />

      <ComentariosSinRevisar eventos={eventos} cierre={cierre} nombre={nombre} idFoco="historial-eventos" />

      <Separator />

      <section aria-labelledby="perfil-actual" className="flex flex-col gap-4">
        <h2 id="perfil-actual" className="scroll-mt-6 text-3xl">
          Perfil actual
        </h2>
        {/* Spec 008 (R-008.21): solo con consentimiento vigente, como todo HistorialVisible. */}
        <p className="text-sm">
          <Link href={`/coach/engagements/${engagementId}/funcion-ejecutiva`} className="underline underline-offset-4">
            Función ejecutiva
          </Link>
        </p>
        {snapshot ? (
          <>
            <p className="text-sm text-muted-foreground">
              Versión {snapshot.version}, del {formatFecha(snapshot.createdAt)}.
            </p>
            <ProfileView perfil={snapshot.perfil} fechasSesion={fechasSesion} observadores={observadores} />
          </>
        ) : (
          <p className="prose-measure">
            Todavía no hay perfil. Escribe la nota de una sesión y aprueba la propuesta para crear la primera versión.
          </p>
        )}
      </section>

      <Separator />

      {/* Spec 003: la sección del plan va después del perfil. */}
      <SeccionPlan
        engagementId={engagementId}
        nombre={nombre}
        datos={{ plan, snapshotActualVersion: snapshot?.version ?? null, fechasSesion }}
      />

      {/* R-012.27: los dos enlaces de siempre, en el mismo lugar, como filas que se abren completas. */}
      <section aria-labelledby="mas-de" className="flex flex-col gap-3">
        <h2 id="mas-de" className="text-2xl">
          Más de {nombre}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {/* Spec 009: solo con consentimiento vigente, como todo HistorialVisible (R-009.51). */}
          <li>
            <Link
              href={`/coach/engagements/${engagementId}/como-trabajar-conmigo`}
              className="flex items-center justify-between gap-4 rounded-lg border-(length:--border-w) border-border bg-card px-5 py-4 text-foreground no-underline transition-colors hover:border-input"
            >
              <span className="text-lg">{TITULO_GUIA}</span>
              <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
          {/* Spec 010: también solo con consentimiento vigente (R-010.45). */}
          <li>
            <Link
              href={`/coach/engagements/${engagementId}/desgloses`}
              className="flex items-center justify-between gap-4 rounded-lg border-(length:--border-w) border-border bg-card px-5 py-4 text-foreground no-underline transition-colors hover:border-input"
            >
              <span className="text-lg">{tituloTareas(nombre)}</span>
              <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        </ul>
      </section>

      <Separator />

      <section aria-labelledby="senales-activas" className="flex flex-col gap-4">
        <h2 id="senales-activas" tabIndex={-1} className="foco-destino scroll-mt-6 text-3xl">
          Señales activas
        </h2>
        <p className="prose-measure text-sm text-muted-foreground">Solo tú ves esta sección. La persona no la ve.</p>
        <SenalesView
          senales={seguimiento.senales}
          fechasSesion={fechasSesion}
          acciones={(s) => (
            <AccionesSenal tipo={s.tipo} engagementId={engagementId} nombre={nombre} conAlertaVigente={conAlerta.has(s.tipo)} />
          )}
        />
      </section>

      <Separator />

      <AlertasFuertes alertas={seguimiento.alertas} />

      <Separator />

      <section aria-labelledby="historial" className="flex flex-col gap-6">
        <h2 id="historial" className="scroll-mt-6 text-3xl">
          Historial
        </h2>
        <Historiales datos={seguimiento} nombre={nombre} />
        <section aria-labelledby="historial-eventos" className="flex flex-col gap-3">
          <h3 id="historial-eventos" tabIndex={-1} className="foco-destino text-lg font-semibold">
            Propuestas y comentarios
          </h3>
          <EventTimeline eventos={eventos} nombre={nombre} planesPersona={cierre.planesPersona} />
        </section>
      </section>
    </>
  );
}
