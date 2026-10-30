// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado por Acker el 29 oct 2026
//
// Layout del segmento /login. Existe solo para dar el título: la página es Client Component
// y no puede exportar metadata. Con metadata, el título usa el template del layout raíz.
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginLayout({ children }: LayoutProps<"/login">) {
  return children;
}
