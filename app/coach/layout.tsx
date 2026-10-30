// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado por Acker el 29 oct 2026
//
// Layout de todas las pantallas del coach. requireRole verifica la sesión y el rol en el
// servidor (proxy.ts solo hace una revisión optimista).
import { AppHeader, type NavLink } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { requireRole } from "@/lib/auth";

const links: NavLink[] = [
  { href: "/coach", label: "Mis acompañamientos" },
  { href: "/preferencias", label: "Preferencias" },
];

export default async function CoachLayout({ children }: LayoutProps<"/coach">) {
  const user = await requireRole("coach");

  return (
    <>
      <AppHeader nombrePila={user.nombrePila} inicio="/coach" links={links} />
      <main id="contenido" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
