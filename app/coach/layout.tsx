// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado por Acker el 29 oct 2026
//
// Layout de todas las pantallas del coach. requireRole verifica la sesión y el rol en el
// servidor (proxy.ts solo hace una revisión optimista). Navegación en la columna izquierda (spec 012, R-012.16).
import type { NavLink } from "@/components/app-header";
import { BarraLateral } from "@/components/coach/barra-lateral";
import { SiteFooter } from "@/components/site-footer";
import { requireRole } from "@/lib/auth";

const links: NavLink[] = [
  { href: "/coach", label: "Mis acompañamientos" },
  // Spec 010 (R-010.41).
  { href: "/coach/plantillas", label: "Plantillas" },
  { href: "/preferencias", label: "Preferencias" },
];

export default async function CoachLayout({ children }: LayoutProps<"/coach">) {
  const user = await requireRole("coach");

  return (
    // data-pantalla="coach": texto de 16px como mínimo (spec 012, R-012.21).
    <div data-pantalla="coach" className="flex flex-1 flex-col md:flex-row">
      <BarraLateral nombrePila={user.nombrePila} inicio="/coach" links={links} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 md:px-10">
          {children}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
