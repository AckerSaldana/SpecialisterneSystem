// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// "Pedir ayuda a una persona", al pie del contenido en toda pantalla de la persona (spec 012, R-012.12; C-14). Es el
// mismo correo del pie de ayuda: el dominio .test no recibe mensajes reales.
export const TEXTO_PEDIR_AYUDA = "Pedir ayuda a una persona";

export function PedirAyuda() {
  return (
    <p className="text-center print:hidden">
      <a href="mailto:ayuda@caja-mex.test" className="text-muted-foreground underline underline-offset-4">
        {TEXTO_PEDIR_AYUDA}
      </a>
    </p>
  );
}
