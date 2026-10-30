// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado por Acker el 29 oct 2026
//
// /coach: lista de acompañamientos (engagements) del coach.
import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { engagements, users } from "@/lib/db/schema";
import { ENGAGEMENT_CONFIG, etiquetaEtapa } from "@/lib/engagements/config";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Tus acompañamientos" };

export default async function CoachHomePage() {
  const user = await requireRole("coach");

  // RLS ya limita a los engagements donde participa; el filtro por coachId deja
  // fuera los casos donde el coach también fuera la persona (no debería pasar).
  const filas = await withRls(user.claims, (tx) =>
    tx
      .select({
        id: engagements.id,
        type: engagements.type,
        stage: engagements.stage,
        nombrePila: users.nombrePila,
      })
      .from(engagements)
      .leftJoin(users, eq(users.id, engagements.personaId))
      .where(eq(engagements.coachId, user.id))
      .orderBy(desc(engagements.createdAt)),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Tus acompañamientos</h1>

      {filas.length === 0 ? (
        <p className="prose-measure">Todavía no tienes acompañamientos asignados.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filas.map((f) => {
            const nombre = f.nombrePila ?? "Persona sin nombre visible";
            return (
              <li key={f.id}>
                <Card>
                  <CardHeader>
                    <h2 className="text-lg font-medium">
                      <Link
                        href={`/coach/engagements/${f.id}`}
                        className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {nombre}
                      </Link>
                    </h2>
                  </CardHeader>
                  <CardContent>
                    <dl className="flex flex-col gap-1 text-sm">
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium">Tipo:</dt>
                        <dd>{ENGAGEMENT_CONFIG[f.type].etiqueta}</dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium">Etapa:</dt>
                        <dd>{etiquetaEtapa(f.stage)}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
