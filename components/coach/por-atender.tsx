// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// "Por atender" y "En esta página" (spec 012, R-012.25, R-012.26). Solo apuntan a secciones que ya existen en la página
// del acompañamiento: no deciden ni cambian nada. El estado va en texto, con su número (C-14).

export type Pendientes = { propuestas: number; sinPropuesta: number; comentarios: number; alertas: number };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// Una línea por tipo con algo pendiente, en el orden en que aparecen las secciones en la página.
export function itemsPorAtender(p: Pendientes, nombre: string): { texto: string; href: string }[] {
  return [
    p.propuestas > 0 ? { texto: `${plural(p.propuestas, "propuesta", "propuestas")} de la IA sin revisar`, href: "#pendientes" } : null,
    p.sinPropuesta > 0 ? { texto: `${plural(p.sinPropuesta, "sesión", "sesiones")} sin propuesta`, href: "#pendientes" } : null,
    p.comentarios > 0 ? { texto: `${plural(p.comentarios, "comentario", "comentarios")} de ${nombre} sin revisar`, href: "#comentarios-sin-revisar" } : null,
    p.alertas > 0 ? { texto: `${plural(p.alertas, "alerta fuerte", "alertas fuertes")} sin atender`, href: "#alertas-fuertes" } : null,
  ].filter((x): x is { texto: string; href: string } => x !== null);
}

export function PorAtender({ pendientes, nombre }: { pendientes: Pendientes; nombre: string }) {
  const items = itemsPorAtender(pendientes, nombre);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="por-atender" className="flex flex-col gap-3 rounded-lg border-(length:--border-w) border-border bg-accent px-6 py-5">
      <h2 id="por-atender" className="text-2xl">
        Por atender
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.texto}>
            <a href={i.href}>{i.texto}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const SECCIONES_PAGINA = [
  { href: "#linea-tiempo", texto: "Sesiones" },
  { href: "#perfil-actual", texto: "Perfil" },
  { href: "#plan-de-acompanamiento", texto: "Plan" },
  { href: "#senales-activas", texto: "Señales" },
  { href: "#historial", texto: "Historial" },
] as const;

export function EnEstaPagina() {
  return (
    <nav aria-label="En esta página" className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-y border-border py-3">
      <span className="text-muted-foreground">En esta página:</span>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {SECCIONES_PAGINA.map((s) => (
          <li key={s.href}>
            <a href={s.href}>{s.texto}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
