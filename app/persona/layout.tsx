// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente (cambió el 29 oct, spec 002)
//
// Layout de todas las pantallas de la persona participante. La puerta (lib/persona/puerta.ts)
// verifica sesión y rol en el servidor (proxy.ts solo hace una revisión optimista) y además
// manda a la persona al paso que le falta: código vencido, contraseña o aviso (spec 002,
// R-002.18, R-002.19, R-002.39). Cada página vuelve a llamar la puerta, porque un layout no se
// vuelve a ejecutar al navegar entre sus páginas; la lectura se hace una vez por petición.
import { AppHeader, type NavLink } from "@/components/app-header";
import { RUTA_DESGLOSES, TITULO as TITULO_DESGLOSES } from "@/components/persona/desglose/textos";
import { SiteFooter } from "@/components/site-footer";
import { TITULO_GUIA } from "@/lib/guia/schema-cliente";
import { puertaPersona } from "@/lib/persona/puerta";

const links: NavLink[] = [
  { href: "/persona", label: "Mi perfil" },
  { href: RUTA_DESGLOSES, label: TITULO_DESGLOSES },
  { href: "/persona/como-trabajar-conmigo", label: TITULO_GUIA },
  { href: "/preferencias", label: "Preferencias" },
];

export default async function PersonaLayout({ children }: LayoutProps<"/persona">) {
  const { user } = await puertaPersona("persona");

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
