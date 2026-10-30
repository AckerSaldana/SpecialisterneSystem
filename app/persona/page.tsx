// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado por Acker el 29 oct 2026
//
// /persona: el perfil de la persona en lenguaje claro y sus recursos aprobados.
// Privacidad: aquí NO se muestran citas (vienen de las notas privadas del coach),
// ni señales de riesgo, ni nombres de funciones ejecutivas. La página lee
// persona_profiles, que solo trae resumen y tipo por dimensión.
import type { Metadata } from "next";
import { asc, desc, eq, and } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { catalogUnits, engagements, personaProfiles, recommendations } from "@/lib/db/schema";
import { DIMENSIONES, etiquetaDimension, type TipoHallazgo } from "@/lib/profile/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NotMeButton } from "@/components/persona/not-me-button";

// Encabezados en segunda persona, uno por tipo de hallazgo.
const GRUPOS: { tipo: TipoHallazgo; titulo: string }[] = [
  { tipo: "fortaleza", titulo: "Lo que te funciona" },
  { tipo: "area_de_apoyo", titulo: "Dónde te puede servir apoyo" },
  { tipo: "contexto", titulo: "Tu forma de trabajar" },
];

const FORMATO = {
  lectura: "Lectura",
  video: "Video",
  audio: "Audio",
  ejercicio: "Ejercicio",
  interactivo: "Interactivo",
} as const;

const ESFUERZO = { baja: "bajo", media: "medio", alta: "alto" } as const;

export const metadata: Metadata = { title: "Tu perfil" };

export default async function PersonaPage() {
  const user = await requireRole("persona");

  const datos = await withRls(user.claims, async (tx) => {
    // Si hubiera más de un acompañamiento, se usa el más reciente
    // (el endpoint de feedback usa la misma regla).
    const [engagement] = await tx
      .select({ id: engagements.id })
      .from(engagements)
      .where(eq(engagements.personaId, user.id))
      .orderBy(desc(engagements.createdAt))
      .limit(1);
    if (!engagement) return null;

    // persona_profiles: la versión sin citas ni señales. RLS no deja leer profile_snapshots.
    const [snapshot] = await tx
      .select({ perfil: personaProfiles.contenido })
      .from(personaProfiles)
      .where(eq(personaProfiles.engagementId, engagement.id))
      .orderBy(desc(personaProfiles.version))
      .limit(1);

    // RLS ya limita a las recomendaciones aprobadas; el filtro lo deja explícito.
    const recursos = await tx
      .select({
        id: recommendations.id,
        titulo: catalogUnits.titulo,
        formato: catalogUnits.formato,
        duracionMin: catalogUnits.duracionMin,
        cargaCognitiva: catalogUnits.cargaCognitiva,
        url: catalogUnits.url,
      })
      .from(recommendations)
      .innerJoin(catalogUnits, eq(catalogUnits.id, recommendations.catalogUnitId))
      .where(and(eq(recommendations.engagementId, engagement.id), eq(recommendations.status, "aprobada")))
      .orderBy(asc(recommendations.createdAt));

    return { snapshot, recursos };
  });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Tu perfil</h1>
        <p className="prose-measure">Hola, {user.nombrePila}.</p>
      </header>

      {!datos ? (
        <p className="prose-measure">Todavía no tienes un acompañamiento activo. Tu coach te avisa cuando empiece.</p>
      ) : !datos.snapshot ? (
        <p className="prose-measure">Tu perfil todavía no está listo. Tu coach lo revisa contigo antes de publicarlo.</p>
      ) : (
        <>
          <p className="prose-measure">
            Esto es lo que tu coach y tú han visto hasta ahora. Si algo no te representa, usa el botón de esa parte.
          </p>

          {GRUPOS.map((grupo) => {
            const perfil = datos.snapshot!.perfil;
            // Dimensiones de este tipo, en el orden del catálogo.
            const dims = DIMENSIONES.filter((d) => perfil.dimensiones[d.id]?.tipo === grupo.tipo);
            return (
              <section key={grupo.tipo} aria-labelledby={`grupo-${grupo.tipo}`} className="flex flex-col gap-3">
                <h2 id={`grupo-${grupo.tipo}`} className="text-xl font-semibold">
                  {grupo.titulo}
                </h2>
                {dims.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Todavía no hay nada en esta parte.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {dims.map((d) => (
                      <li key={d.id}>
                        <Card>
                          <CardHeader>
                            <h3 className="font-medium">{etiquetaDimension(d.id)}</h3>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-3">
                            <p className="prose-measure">{perfil.dimensiones[d.id]!.resumen}</p>
                            <NotMeButton dimension={d.id} sobre={etiquetaDimension(d.id)} />
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          <section aria-labelledby="perfil-general" className="flex flex-col gap-3">
            <h2 id="perfil-general" className="text-xl font-semibold">
              Tu perfil en general
            </h2>
            <NotMeButton dimension={null} sobre="tu perfil en general" textoBoton="Algo de mi perfil no me representa" />
          </section>
        </>
      )}

      {datos ? (
        <section aria-labelledby="recursos" className="flex flex-col gap-3">
          <h2 id="recursos" className="text-xl font-semibold">
            Recursos
          </h2>
          {datos.recursos.length === 0 ? (
            <p className="prose-measure">Todavía no hay recursos. Tu coach los agrega cuando tu plan esté listo.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {datos.recursos.map((r) => (
                <li key={r.id}>
                  <Card>
                    <CardHeader>
                      <h3 className="font-medium">{r.titulo}</h3>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <dl className="flex flex-col gap-1 text-sm">
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-medium">Formato:</dt>
                          <dd>{FORMATO[r.formato]}</dd>
                        </div>
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-medium">Duración:</dt>
                          <dd>{r.duracionMin} minutos</dd>
                        </div>
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-medium">Esfuerzo de concentración:</dt>
                          <dd>{ESFUERZO[r.cargaCognitiva]}</dd>
                        </div>
                      </dl>
                      {r.url ? (
                        <p className="text-sm">
                          <a href={r.url} className="font-medium underline underline-offset-4">
                            Abrir el recurso<span className="sr-only">: {r.titulo}</span>
                          </a>
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
