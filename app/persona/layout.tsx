// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado por Acker el 29 oct 2026
//
// Layout de todas las pantallas de la persona participante. requireRole verifica la sesión
// y el rol en el servidor (proxy.ts solo hace una revisión optimista).
import { AppHeader, type NavLink } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { requireRole } from "@/lib/auth";

const links: NavLink[] = [
  { href: "/persona", label: "Mi perfil" },
  { href: "/preferencias", label: "Preferencias" },
];

export default async function PersonaLayout({ children }: LayoutProps<"/persona">) {
  const user = await requireRole("persona");

  return (
    <>
      <AppHeader nombrePila={user.nombrePila} inicio="/persona" links={links} />
      <main id="contenido" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
