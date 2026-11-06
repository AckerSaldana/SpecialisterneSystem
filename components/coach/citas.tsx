// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Lista de citas de la nota del coach. Cada cita es un <blockquote> con la fecha
// de la sesión cuando se conoce. Sin hooks: sirve en Server y Client Components.
// Solo para pantallas del coach: la persona nunca ve citas.

// "detalle" es texto del sistema sobre la cita, como su etiqueta en la revisión de una propuesta (R-008.10).
export type CitaVista = { cita: string; fecha?: string; detalle?: string };

export function Citas({ citas }: { citas: CitaVista[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {citas.map((c, i) => (
        <li key={i}>
          <figure className="prose-measure">
            <blockquote className="border-l-4 border-border pl-3 italic">“{c.cita}”</blockquote>
            {c.fecha || c.detalle ? (
              <figcaption className="mt-1 flex flex-col gap-1 pl-4">
                {c.detalle ? <span className="text-sm">{c.detalle}</span> : null}
                {c.fecha ? <span className="text-xs text-muted-foreground">Sesión del {c.fecha}</span> : null}
              </figcaption>
            ) : null}
          </figure>
        </li>
      ))}
    </ul>
  );
}
