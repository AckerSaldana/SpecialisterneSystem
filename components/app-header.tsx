// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Encabezado de las pantallas con sesión (coach y persona).
// Es Client Component solo para saber la ruta activa (usePathname) y marcarla con aria-current.
// Spec 012 (R-012.34): el nombre en serif; el activo en peso 600 con una línea de acento debajo, sin fondo.
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
export function ariaCurrent(pathname: string, href: string): "page" | "true" | undefined {
  if (pathname === href) return "page";
  if (pathname.startsWith(`${href}/`)) return "true";
  return undefined;
}

// Cuando un enlace vive dentro de otro (/persona y /persona/como-trabajar-conmigo), solo se marca el más
// específico: dos marcados a la vez no dicen dónde estás.
export function enlaceActivo(pathname: string, links: NavLink[]): string | undefined {
  return links
    .filter((l) => ariaCurrent(pathname, l.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function AppHeader({ nombrePila, inicio, links }: AppHeaderProps) {
  const pathname = usePathname();
  const activo = enlaceActivo(pathname, links);

  return (
    <header className="border-b border-border bg-background print:hidden">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-4">
        <div className="flex flex-col">
          <Link href={inicio} className="font-serif text-2xl text-foreground no-underline">
            Shorenote
          </Link>
          <span className="text-muted-foreground">Hola, {nombrePila}</span>
        </div>

        <nav aria-label="Navegación principal">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {links.map((link) => {
              const current = link.href === activo ? ariaCurrent(pathname, link.href) : undefined;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={current}
                    className={cn(
                      "border-b-2 py-1 text-foreground no-underline",
                      // La ruta activa se distingue con la línea y el peso, no solo con color.
                      current ? "border-primary font-semibold" : "border-transparent hover:border-border",
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
