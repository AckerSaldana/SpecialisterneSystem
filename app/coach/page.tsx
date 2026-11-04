// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado por Acker el 29 oct 2026
//
// /coach: lista de acompañamientos (engagements) del coach.
// Spec 012 (R-012.22): cada persona es una fila que se abre completa, con Tipo y Etapa, su última sesión y cuántas
// propuestas de la IA esperan revisión. Las sesiones y propuestas se leen con la RLS del coach: sin consentimiento
// vigente no devuelve filas, y la fila solo dice "Todavía no hay sesiones".
import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, inArray, max } from "drizzle-orm";
import { ChevronRightIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { engagements, profileEvents, sessions, users } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { formatFecha, textoCuantas, textoPorRevisar } from "@/components/coach/labels";
import { MetaAcompanamiento } from "@/components/coach/meta-acompanamiento";

export const metadata: Metadata = { title: "Tus acompañamientos" };

export default async function CoachHomePage() {
  const user = await requireRole("coach");

  // RLS ya limita a los engagements donde participa; el filtro por coachId deja
  // fuera los casos donde el coach también fuera la persona (no debería pasar).
  const { filas, ultimas, pendientes } = await withRls(user.claims, async (tx) => {
    const filas = await tx
      .select({
        id: engagements.id,
        type: engagements.type,
        stage: engagements.stage,
        nombrePila: users.nombrePila,
      })
      .from(engagements)
      .leftJoin(users, eq(users.id, engagements.personaId))
      .where(eq(engagements.coachId, user.id))
      .orderBy(desc(engagements.createdAt));
    const ids = filas.map((f) => f.id);
    if (ids.length === 0) return { filas, ultimas: new Map<string, Date>(), pendientes: new Map<string, number>() };

    const sesiones = await tx
      .select({ engagementId: sessions.engagementId, ultima: max(sessions.realizadaEn) })
      .from(sessions)
      .where(inArray(sessions.engagementId, ids))
      .groupBy(sessions.engagementId);
    const propuestas = await tx
      .select({ engagementId: profileEvents.engagementId, n: count() })
      .from(profileEvents)
      .where(and(inArray(profileEvents.engagementId, ids), eq(profileEvents.tipo, "propuesta_ia"), eq(profileEvents.status, "proposed")))
      .groupBy(profileEvents.engagementId);
    return {
      filas,
      ultimas: new Map(sesiones.flatMap((s) => (s.ultima ? [[s.engagementId, s.ultima] as const] : []))),
      pendientes: new Map(propuestas.map((p) => [p.engagementId, p.n] as const)),
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl leading-tight">Tus acompañamientos</h1>
          {filas.length > 0 ? <p className="text-muted-foreground">{textoCuantas(filas.length)}</p> : null}
        </div>
        {/* Spec 002 (R-002.1): el coach arranca el alta. */}
        <Button asChild size="lg">
          <Link href="/coach/engagements/nuevo">Nuevo acompañamiento</Link>
        </Button>
      </header>

      {filas.length === 0 ? (
        <p className="prose-measure">Todavía no tienes acompañamientos asignados.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filas.map((f) => {
            const nombre = f.nombrePila ?? "Persona sin nombre visible";
            const ultima = ultimas.get(f.id);
            const porRevisar = pendientes.get(f.id) ?? 0;
            return (
              <li key={f.id}>
                {/* Toda la fila es el enlace: un objetivo grande, y el lector de pantalla lee nombre, tipo, etapa y estado juntos. */}
                <Link
                  href={`/coach/engagements/${f.id}`}
                  className="group flex items-center gap-6 rounded-lg border-(length:--border-w) border-border bg-card px-6 py-5 text-foreground no-underline transition-colors hover:border-input"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <h2 className="text-2xl leading-tight underline-offset-4 group-hover:underline">{nombre}</h2>
                    <MetaAcompanamiento tipo={f.type} etapa={f.stage} />
                    <p className="text-muted-foreground">
                      {ultima ? `Última sesión: ${formatFecha(ultima)}` : "Todavía no hay sesiones"}
                    </p>
                  </div>
                  {porRevisar > 0 ? (
                    <span className="hidden shrink-0 rounded-full bg-accent px-3 py-1 sm:inline">{textoPorRevisar(porRevisar)}</span>
                  ) : null}
                  <ChevronRightIcon aria-hidden="true" className="size-6 shrink-0 text-muted-foreground" />
                </Link>
                {/* En pantallas angostas la etiqueta va debajo, para no apretar el nombre. */}
                {porRevisar > 0 ? <p className="mt-2 px-6 sm:hidden">{textoPorRevisar(porRevisar)}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
