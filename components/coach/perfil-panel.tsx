// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Panel lateral "Perfil de {nombre}" (spec 012, R-012.19; docs/panel-coach.jpeg): tres secciones con su resumen y una
// cita de la nota en itálica, seguida de "Nota de sesión, {fecha}". Es un resumen para el coach: el perfil completo
// sigue en la columna principal. Solo lo ve el coach: lleva citas (C-09).
import { Card } from "@/components/ui/card";
import { DIMENSIONES, type DimensionId, type DimensionPerfil, type Perfil } from "@/lib/profile/schema";

export const MAX_FORTALEZAS_PANEL = 3;

type Entrada = { id: DimensionId; dim: DimensionPerfil };

// Las tres secciones, en el orden de DIMENSIONES.
export function seccionesDelPanel(perfil: Perfil): { titulo: string; entradas: Entrada[] }[] {
  const presentes = DIMENSIONES.flatMap((d) => {
    const dim = perfil.dimensiones[d.id];
    return dim ? [{ id: d.id, seccion: d.seccion, dim }] : [];
  });
  return [
    { titulo: "Cómo aprende mejor", entradas: presentes.filter((d) => d.id === "forma_aprender") },
    { titulo: "Entorno de trabajo", entradas: presentes.filter((d) => d.seccion === "ambiente_trabajo") },
    { titulo: "Fortalezas", entradas: presentes.filter((d) => d.dim.tipo === "fortaleza").slice(0, MAX_FORTALEZAS_PANEL) },
  ];
}

export function PerfilPanel({ perfil, nombre, fechasSesion }: { perfil: Perfil | null; nombre: string; fechasSesion: Record<string, string> }) {
  return (
    <aside aria-labelledby="perfil-panel">
    <Card className="gap-6 px-(--card-spacing)">
      <h2 id="perfil-panel" className="text-3xl">
        Perfil de {nombre}
      </h2>
      {perfil ? (
        <>
          {seccionesDelPanel(perfil).map((s) => (
            <section key={s.titulo} className="flex flex-col gap-2">
              <h3 className="text-xl font-semibold">{s.titulo}</h3>
              {s.entradas.length === 0 ? (
                <p className="text-muted-foreground">Todavía no hay nada aquí.</p>
              ) : (
                s.entradas.map(({ id, dim }) => {
                  const [primera] = dim.evidencia;
                  const fecha = fechasSesion[primera.sessionId];
                  return (
                    <figure key={id} className="flex flex-col gap-1">
                      <p>{dim.resumen}</p>
                      <figcaption>
                        <q className="italic">{primera.cita}</q>
                        {fecha ? <span className="text-muted-foreground"> — Nota de sesión, {fecha}.</span> : null}
                      </figcaption>
                    </figure>
                  );
                })
              )}
            </section>
          ))}
          <p>
            <a href="#perfil-actual">Ver el perfil completo</a>
          </p>
        </>
      ) : (
        <p className="text-muted-foreground">Todavía no hay perfil.</p>
      )}
    </Card>
    </aside>
  );
}
