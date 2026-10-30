// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Encabezado de las pantallas con sesión (coach y persona).
// Es Client Component solo para saber la ruta activa (usePathname) y marcarla con aria-current.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type NavLink = { href: string; label: string };

type AppHeaderProps = {
  nombrePila: string;
  inicio: string; // a dónde lleva el nombre del producto (el inicio del rol)
  links: NavLink[];
};

// "page" si estamos exactamente en esa ruta; "true" si estamos dentro de esa sección
// (p. ej. /coach/engagements/123 está dentro de "Mis acompañamientos").
function ariaCurrent(pathname: string, href: string): "page" | "true" | undefined {
  if (pathname === href) return "page";
  if (pathname.startsWith(`${href}/`)) return "true";
  return undefined;
}

export function AppHeader({ nombrePila, inicio, links }: AppHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
        <div className="flex flex-col">
          <Link
            href={inicio}
            className="rounded-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Caja MEX
          </Link>
          <span className="text-sm text-muted-foreground">Hola, {nombrePila}</span>
        </div>

        <nav aria-label="Navegación principal">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {links.map((link) => {
              const current = ariaCurrent(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={current}
                    className={cn(
                      "rounded-sm px-1 py-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      // La ruta activa se distingue con subrayado y peso, no solo con color.
                      current ? "font-semibold underline underline-offset-4" : "hover:underline",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <form action={signOut}>
                <Button type="submit" variant="outline">
                  Salir
                </Button>
              </form>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
