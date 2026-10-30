// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /coach/engagements/[id]/sessions/new: valida que el coach pueda ver el
// engagement y muestra el formulario de la nota (cliente).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { engagements, users } from "@/lib/db/schema";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SessionComposer } from "@/components/coach/session-composer";

export const metadata: Metadata = { title: "Nueva sesión" };

export default async function NewSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("coach");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [engagement] = await withRls(user.claims, (tx) =>
    tx
      .select({
        id: engagements.id,
        consentimientoEn: engagements.consentimientoEn,
        nombrePila: users.nombrePila,
      })
      .from(engagements)
      .leftJoin(users, eq(users.id, engagements.personaId))
      .where(and(eq(engagements.id, id), eq(engagements.coachId, user.id)))
      .limit(1),
  );
  if (!engagement) notFound();

  const nombre = engagement.nombrePila ?? "Persona sin nombre visible";
  const urlPerfil = `/coach/engagements/${engagement.id}`;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm">
        <Link href={urlPerfil} className="underline underline-offset-4">
          Volver al perfil de {nombre}
        </Link>
      </p>
      <h1 className="text-2xl font-semibold">Nueva sesión con {nombre}</h1>

      {/* Sin consentimiento registrado no se procesan notas con la IA. */}
      {engagement.consentimientoEn ? (
        <SessionComposer engagementId={engagement.id} />
      ) : (
        <Alert>
          <AlertTitle>Falta el consentimiento</AlertTitle>
          <AlertDescription>
            <p>
              {nombre} todavía no tiene consentimiento registrado. Regístralo antes de escribir notas de sesión.
            </p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
