// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// /persona: el perfil de la persona en lenguaje claro, su plan (spec 005, R-005.6), sus recursos
// aprobados y la sección "Tus datos y tu consentimiento" (spec 002, R-002.27).
// El acompañamiento sale de la puerta (miAcompanamiento, R-002.40): esta página no selecciona
// columnas de app.engagements. La puerta también garantiza que hay consentimiento vigente.
// Privacidad: aquí NO se muestran citas (vienen de las notas privadas del coach),
// ni señales de riesgo, ni nombres de funciones ejecutivas. La página lee
// persona_profiles, que solo trae resumen y tipo por dimensión, persona_plans y sus propios
// comentarios (R-005.1, R-005.2). No lee plans, plan_items, decided_by ni las columnas resuelto_*.
import type { Metadata } from "next";
import { asc, desc, eq, and } from "drizzle-orm";
import { withRls } from "@/lib/db/rls";
import { catalogUnits, personaProfiles, recommendations } from "@/lib/db/schema";
import { estadosDeComentarios, vistaEstado } from "@/lib/persona/comentarios";
import { dimensionesDeGrupo } from "@/lib/persona/dimensiones";
import { leerPlanYComentarios } from "@/lib/persona/feedback";
import { puertaPersona } from "@/lib/persona/puerta";
import { formatFecha } from "@/components/coach/labels";
import { ConsentimientoPersona } from "@/components/persona/consentimiento";
import type { TipoHallazgo } from "@/lib/profile/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NotMeButton } from "@/components/persona/not-me-button";
import { TuPlan } from "@/components/persona/tu-plan";

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

export default async function PersonaPage({ searchParams }: PageProps<"/persona">) {
  const { user, acompanamiento: engagement, consentimiento } = await puertaPersona("persona");
  // ?listo=1 lo pone la action del aviso al registrar el consentimiento. No lleva datos: la
  // fecha se lee de la base.
  const { listo } = await searchParams;

  const datos = !engagement
    ? null
    : await withRls(user.claims, async (tx) => {
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

        return { snapshot, recursos, ...(await leerPlanYComentarios(tx, engagement.id)) };
      });
  const estados = datos ? estadosDeComentarios(datos.comentarios, datos.plan?.contenido ?? null) : null;
  const vigente = consentimiento?.estado === "vigente" ? consentimiento : null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-5xl leading-tight">Tu perfil</h1>
        <p className="prose-measure text-muted-foreground">Hola, {user.nombrePila}.</p>
      </header>

      {listo === "1" && vigente ? (
        <p role="status" className="prose-measure rounded-lg border border-primary p-3 font-medium">
          Listo. Registramos tu consentimiento el {formatFecha(vigente.fecha)}.
        </p>
      ) : null}

      {!datos ? (
        <p className="prose-measure">Todavía no tienes un acompañamiento activo. Tu coach te avisa cuando empiece.</p>
      ) : !datos.snapshot ? (
        <p className="prose-measure">Tu perfil todavía no está listo. Tu coach lo prepara contigo.</p>
      ) : (
        <>
          <p className="prose-measure">
            Esto es lo que tu coach y tú han visto hasta ahora. Si algo no te representa, usa el botón de esa parte.
          </p>

          {GRUPOS.map((grupo) => {
            const perfil = datos.snapshot!.perfil;
            // Dimensiones visibles de este tipo, en el orden de la constante (R-005.4).
            const dims = dimensionesDeGrupo(perfil, grupo.tipo);
            return (
              <section key={grupo.tipo} aria-labelledby={`grupo-${grupo.tipo}`} className="flex flex-col gap-3">
                <h2 id={`grupo-${grupo.tipo}`} className="text-2xl">
                  {grupo.titulo}
                </h2>
                {dims.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Todavía no hay nada en esta parte.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {dims.map((d) => (
                      <li key={d.id}>
                        {/* Spec 012 (R-012.34): el nombre de la parte como etiqueta apagada; el texto, en grande. */}
                        <Card>
                          <CardHeader>
                            <h3 className="font-semibold text-muted-foreground">{d.etiqueta}</h3>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-4">
                            <p className="prose-measure text-xl leading-snug">{perfil.dimensiones[d.id]!.resumen}</p>
                            <NotMeButton
                              dimension={d.id}
                              sobre={d.etiqueta}
                              estado={vistaEstado(estados?.dimensiones[d.id], formatFecha)}
                            />
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
            <h2 id="perfil-general" className="text-2xl">
              Tu perfil en general
            </h2>
            <NotMeButton
              sobre="tu perfil en general"
              textoBoton="Algo de mi perfil no me representa"
              estado={vistaEstado(estados?.perfilGeneral, formatFecha)}
            />
          </section>
        </>
      )}

      {datos && estados ? <TuPlan plan={datos.plan} estados={estados} /> : null}

      {/* R-005.48: mientras recursos quede fuera de esta fase, sin recursos aprobados no hay sección. */}
      {datos && datos.recursos.length > 0 ? (
        <section aria-labelledby="recursos" className="flex flex-col gap-3">
          <h2 id="recursos" className="text-2xl">
            Recursos
          </h2>
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
        </section>
      ) : null}

      {vigente ? (
        <ConsentimientoPersona estado="vigente" fecha={formatFecha(vigente.fecha)} hrefAviso="/persona/aviso" />
      ) : null}
    </div>
  );
}
