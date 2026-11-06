// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Navegación del coach en una columna izquierda de 260px (spec 012, R-012.16, R-012.24; docs/panel-coach.jpeg): el nombre
// del producto en serif, ítems en sans, el activo en peso 600 con una marca de 2px en el acento a su izquierda (sin fondo)
// y aria-current. "Salir" va al pie de la columna. En pantallas angostas todo va arriba, a lo ancho.
// Client Component solo para saber la ruta activa, con las mismas reglas que AppHeader.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { ariaCurrent, enlaceActivo, type NavLink } from "@/components/app-header";
import { cn } from "@/lib/utils";

// 1.125rem: 20px con letra de 18 (DISENO.md). La marca del activo vive en el margen de la columna, así no le quita ancho
// al texto: "Mis acompañamientos" en negrita cabe en una línea de 260px.
const ITEM = "relative block text-lg leading-snug text-foreground no-underline underline-offset-4 hover:underline";
const MARCA = "before:absolute before:top-0 before:-left-2.5 before:h-full before:w-0.5 before:rounded-full before:bg-primary";

export function BarraLateral({ nombrePila, inicio, links }: { nombrePila: string; inicio: string; links: NavLink[] }) {
  const pathname = usePathname();
  const activo = enlaceActivo(pathname, links);

  return (
    <aside className="flex w-full shrink-0 flex-col gap-8 border-b border-border px-6 py-6 md:sticky md:top-0 md:h-dvh md:w-[260px] md:border-r md:border-b-0 md:px-4 md:py-10 print:hidden">
      <div className="flex flex-col gap-1">
        <Link href={inicio} className="font-serif text-3xl text-foreground no-underline">
          Shorenote
        </Link>
        <span className="text-muted-foreground">Hola, {nombrePila}</span>
      </div>

      <nav aria-label="Navegación principal">
        <ul className="flex flex-wrap gap-x-6 gap-y-5 md:flex-col">
          {links.map((link) => {
            const current = link.href === activo ? ariaCurrent(pathname, link.href) : undefined;
            return (
              <li key={link.href}>
                <Link href={link.href} aria-current={current} className={cn(ITEM, current ? cn("font-semibold", MARCA) : "font-normal")}>
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form action={signOut} className="md:mt-auto md:border-t md:border-border md:pt-6">
        <button type="submit" className={cn(ITEM, "cursor-pointer text-muted-foreground")}>
          Salir
        </button>
      </form>
    </aside>
  );
}
