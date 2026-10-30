// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Lista de citas de la nota del coach. Cada cita es un <blockquote> con la fecha
// de la sesión cuando se conoce. Sin hooks: sirve en Server y Client Components.
// Solo para pantallas del coach: la persona nunca ve citas.

export type CitaVista = { cita: string; fecha?: string };

export function Citas({ citas }: { citas: CitaVista[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {citas.map((c, i) => (
        <li key={i}>
          <figure className="prose-measure">
            <blockquote className="border-l-4 border-border pl-3 italic">“{c.cita}”</blockquote>
            {c.fecha ? (
              <figcaption className="mt-1 pl-4 text-xs text-muted-foreground">Sesión del {c.fecha}</figcaption>
            ) : null}
          </figure>
        </li>
      ))}
    </ul>
  );
}
