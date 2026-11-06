// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Layout de /bienvenida: los pasos de la persona antes de su página (contraseña y aviso).
// requireRole revisa sesión y rol; el paso en el que está la persona lo decide cada página con
// la puerta (lib/persona/puerta.ts), porque un layout no se vuelve a ejecutar al navegar entre
// sus páginas. El encabezado no enlaza a "Mi perfil": mientras no termine estos pasos no puede verlo.
import { AppHeader, type NavLink } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { requireRole } from "@/lib/auth";

const links: NavLink[] = [{ href: "/preferencias", label: "Preferencias" }];

export default async function BienvenidaLayout({ children }: LayoutProps<"/bienvenida">) {
  const user = await requireRole("persona");

  // data-pantalla="persona": texto de al menos 18px (spec 012, R-012.13). "contents" no cambia el acomodo.
  return (
    <div data-pantalla="persona" className="contents">
      <AppHeader nombrePila={user.nombrePila} inicio="/persona" links={links} />
      <main id="contenido" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
