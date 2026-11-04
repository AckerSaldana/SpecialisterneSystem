// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /coach/engagements/[id]/plan/historial (spec 003, tarea 19; R-003.33, R-003.34, R-003.35).
// Una fila por versión aprobada y por borrador descartado (sin número de versión). Dentro de cada
// una, el rastro de qué propuso la IA y qué cambió el coach, calculado con rastroPlan desde
// propuesta_ia y plan_items. El borrador abierto no sale aquí: está en la página del acompañamiento.
// Todo se lee con RLS activa; sin consentimiento vigente RLS no devuelve planes (R-003.53).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { estadoConsentimiento } from "@/lib/consent";
import { withRls } from "@/lib/db/rls";
import { engagements, planItems, plans, profileSnapshots, users } from "@/lib/db/schema";
import { rastroPlan } from "@/lib/plan/trail";
import { formatFecha } from "@/components/coach/labels";
import { RastroVersion } from "@/components/coach/plan/rastro-version";
import {
  SIN_CONSENTIMIENTO_OCULTO,
  filaDescartado,
  filaVersion,
  sinConsentimiento,
} from "@/components/coach/plan/textos";

export const metadata: Metadata = { title: "Historial del plan" };

const VER_RASTRO = "Ver qué propuso la IA y qué cambió el coach";

export default async function HistorialPlanPage({ params }: PageProps<"/coach/engagements/[id]/plan/historial">) {
  const user = await requireRole("coach");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const aprobador = alias(users, "aprobador_plan");

  const datos = await withRls(user.claims, async (tx) => {
    const [engagement] = await tx
      .select({ id: engagements.id, nombrePila: users.nombrePila })
      .from(engagements)
      .leftJoin(users, eq(users.id, engagements.personaId))
      .where(and(eq(engagements.id, id), eq(engagements.coachId, user.id)))
      .limit(1);
    if (!engagement) return null;

    const consentimiento = await estadoConsentimiento(tx, id);
    if (consentimiento.estado !== "vigente") return { engagement, planes: null };

    const lista = await tx
      .select({
        id: plans.id,
        status: plans.status,
        version: plans.version,
        approvedAt: plans.approvedAt,
        aprobadoPor: aprobador.nombrePila,
        snapshotVersion: profileSnapshots.version,
        propuestaIa: plans.propuestaIa,
        promptVersion: plans.promptVersion,
        model: plans.model,
        createdAt: plans.createdAt,
      })
      .from(plans)
      .innerJoin(profileSnapshots, eq(profileSnapshots.id, plans.profileSnapshotId))
      .leftJoin(aprobador, eq(aprobador.id, plans.approvedBy))
      .where(eq(plans.engagementId, id))
      .orderBy(desc(plans.createdAt));

    const cerrados = lista.filter((p) => p.status !== "borrador");
    const items =
      cerrados.length === 0
        ? []
        : await tx
            .select({
              id: planItems.id,
              planId: planItems.planId,
              tipo: planItems.tipo,
              descripcion: planItems.descripcion,
              textoPersona: planItems.textoPersona,
              origen: planItems.origen,
              propuestaRef: planItems.propuestaRef,
              origenItemId: planItems.origenItemId,
            })
            .from(planItems)
            .where(
              inArray(
                planItems.planId,
                cerrados.map((p) => p.id),
              ),
            )
            .orderBy(asc(planItems.orden), asc(planItems.createdAt));

    return { engagement, planes: { cerrados, items } };
  });

  if (!datos) notFound();
  const { engagement, planes } = datos;
  const nombre = engagement.nombrePila ?? "Persona sin nombre visible";

  // Ítems de versiones aprobadas: id → versión y descripción, para "Sigue al punto de la versión {v}".
  const anteriores = new Map<string, { version: number; descripcion: string }>();
  if (planes) {
    const versionDe = new Map(planes.cerrados.map((p) => [p.id, p.version]));
    for (const it of planes.items) {
      const v = versionDe.get(it.planId);
      if (v != null) anteriores.set(it.id, { version: v, descripcion: it.descripcion });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p>
          <Link href={`/coach/engagements/${engagement.id}`} className="underline underline-offset-4">
            Volver al acompañamiento de {nombre}
          </Link>
        </p>
        {/* Spec 012 (R-012.40): título en serif; en pantallas angostas baja a 30px para que quepa. */}
        <h1 className="text-3xl leading-tight sm:text-4xl">Historial del plan de {nombre}</h1>
      </header>

      {!planes ? (
        <div className="flex flex-col gap-2">
          <p className="prose-measure">{sinConsentimiento(nombre)}</p>
          <p className="prose-measure">{SIN_CONSENTIMIENTO_OCULTO}</p>
        </div>
      ) : planes.cerrados.length === 0 ? (
        <p className="prose-measure">Todavía no hay versiones aprobadas ni borradores descartados.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {planes.cerrados.map((p) => {
            const rastro = rastroPlan(
              p.propuestaIa,
              planes.items.filter((it) => it.planId === p.id),
            );
            // Un descartado no tiene fecha de decisión propia en la tabla: se usa approved_at si la
            // ruta de decisión la llenó, y si no, la fecha en que se creó el borrador.
            const fila =
              p.status === "aprobado" && p.version !== null
                ? filaVersion({
                    version: p.version,
                    fecha: p.approvedAt ? formatFecha(p.approvedAt) : "día registrado",
                    aprobador: p.aprobadoPor ?? "un coach",
                    perfil: p.snapshotVersion,
                    prompt: p.promptVersion ?? "sin IA",
                    modelo: p.model ?? "sin IA",
                  })
                : filaDescartado(formatFecha(p.approvedAt ?? p.createdAt));
            // R-012.40: el texto de la fila no cambia; a la vista, "Versión {v}" arriba y el resto debajo. El
            // separador oculto hace que el lector de pantalla lea la fila igual que antes.
            const [cabeza, ...detalle] = fila.split(" · ");
            return (
              // Un h2 por versión (debajo del h1 de la página) y los grupos del rastro en h3. El
              // <summary> repite el mismo texto en cada versión; aria-describedby le suma la fila.
              <li key={p.id} className="flex flex-col gap-4 rounded-lg border-(length:--border-w) border-border bg-card px-6 py-5">
                <h2 id={`version-${p.id}`} className="flex flex-col gap-1">
                  <span className="text-2xl leading-tight">{cabeza}</span>
                  {detalle.length > 0 ? (
                    <span className="font-sans text-base font-normal text-muted-foreground">
                      <span className="sr-only"> · </span>
                      {detalle.join(" · ")}
                    </span>
                  ) : null}
                </h2>
                <details>
                  <summary
                    aria-describedby={`version-${p.id}`}
                    className="w-fit cursor-pointer font-medium underline-offset-4 hover:underline"
                  >
                    {VER_RASTRO}
                  </summary>
                  <div className="mt-4">
                    <RastroVersion rastro={rastro} nombre={nombre} anteriores={anteriores} nivel={3} />
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
