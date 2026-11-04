// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /coach/engagements/[id]/sessions/new: valida que el coach pueda ver el
// engagement y muestra el formulario de la nota (cliente).
// Spec 002 (R-002.31, R-002.32): sin consentimiento vigente (exigirConsentimiento, el mismo
// chequeo que la política de sessions) no hay formulario, solo el texto que explica por qué.
// El coach no puede registrar el consentimiento por la persona (R-002.24).
// Spec 004: antes del campo de la nota va el panel "Antes de esta sesión" (R-004.22). En seguimiento,
// el formulario pide además el tipo y la fecha (R-004.1).
// Spec 012 (R-012.28): título en serif con la línea que dice qué pasa después, panel y formulario en tarjetas.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { estadoConsentimiento, exigirConsentimiento } from "@/lib/consent";
import { withRls } from "@/lib/db/rls";
import { engagements, users } from "@/lib/db/schema";
import { hoyEnMonterrey } from "@/lib/followup/fecha";
import { leerSeguimiento, leerUltimoSnapshot } from "@/lib/followup/lectura";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SessionComposer } from "@/components/coach/session-composer";
import { PanelAntesDeSesion } from "@/components/coach/seguimiento/panel-antes";
import { textoNuevaSesionSinConsentimiento } from "@/components/coach/alta/consentimiento";

export const metadata: Metadata = { title: "Nueva sesión" };

// R-012.28: qué pasa después de enviar, para que el coach sepa que todavía decide.
const TEXTO_DESPUES = "Después de pedir la propuesta la revisas: nada cambia en el perfil hasta que apruebes.";

export default async function NewSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("coach");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const datos = await withRls(user.claims, async (tx) => {
    const [engagement] = await tx
      .select({ id: engagements.id, stage: engagements.stage, nombrePila: users.nombrePila })
      .from(engagements)
      .leftJoin(users, eq(users.id, engagements.personaId))
      .where(and(eq(engagements.id, id), eq(engagements.coachId, user.id)))
      .limit(1);
    if (!engagement) return null;
    const vigente = await exigirConsentimiento(tx, id);
    // Solo hace falta el detalle (retirado y su fecha) cuando no hay consentimiento vigente.
    const consentimiento = vigente ? null : await estadoConsentimiento(tx, id);
    // Sin consentimiento vigente RLS no devuelve filas de seguimiento: no se consultan.
    const seguimiento = vigente ? await leerSeguimiento(tx, id, (await leerUltimoSnapshot(tx, id))?.perfil ?? null) : null;
    return { engagement, vigente, consentimiento, seguimiento };
  });
  if (!datos) notFound();
  const { engagement, vigente, consentimiento, seguimiento } = datos;

  const nombre = engagement.nombrePila ?? "Persona sin nombre visible";
  const urlPerfil = `/coach/engagements/${engagement.id}`;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p>
          <Link href={urlPerfil} className="underline underline-offset-4">
            Volver al perfil de {nombre}
          </Link>
        </p>
        <h1 className="text-4xl leading-tight">Nueva sesión con {nombre}</h1>
        {vigente ? <p className="prose-measure text-muted-foreground">{TEXTO_DESPUES}</p> : null}
        {/* El panel puede ser largo: con esto se llega a la nota sin recorrerlo. En pantallas muy anchas van lado a lado. */}
        {vigente && seguimiento?.ultimaSesion ? (
          <p className="xl:hidden">
            <a href="#nota">Ir a la nota de la sesión</a>
          </p>
        ) : null}
      </header>

      {/* Sin consentimiento vigente no se guardan notas ni se envían a la IA (C-10). */}
      {vigente ? (
        // El panel va antes que el formulario (R-004.22): arriba, o a la izquierda en pantallas muy anchas, con la nota fija a la vista.
        <div className={seguimiento?.ultimaSesion ? "grid items-start gap-8 xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]" : "flex flex-col"}>
          {/* Sin sesiones anteriores no hay nada que recordar. */}
          {seguimiento?.ultimaSesion ? <PanelAntesDeSesion datos={seguimiento} nombre={nombre} /> : null}
          <div className="xl:sticky xl:top-6">
            <SessionComposer
              engagementId={engagement.id}
              nombre={nombre}
              seguimiento={engagement.stage === "seguimiento"}
              sinPlan={seguimiento?.hayPlanVigente === false}
              hoy={hoyEnMonterrey()}
            />
          </div>
        </div>
      ) : (
        <Alert>
          <AlertTitle>Falta el consentimiento</AlertTitle>
          <AlertDescription>
            <p>{textoNuevaSesionSinConsentimiento(nombre, consentimiento ?? { estado: "sin_eventos" })}</p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
