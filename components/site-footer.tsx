// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Pie de página con ayuda humana. Va en cada layout de pantalla (no en el layout raíz),
// debajo de <main>. El correo usa el dominio sintético .test: no recibe mensajes reales.
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-muted text-foreground print:hidden">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6">
        <p className="prose-measure">
          ¿Necesitas ayuda? Habla con tu coach o escribe a{" "}
          <a href="mailto:ayuda@caja-mex.test">ayuda@caja-mex.test</a>.
        </p>
        <p>
          <Link href="/preferencias">Preferencias de presentación</Link>: tamaño de letra, fuente y colores.
        </p>
        <p className="text-muted-foreground">Prototipo con datos sintéticos.</p>
      </div>
    </footer>
  );
}
