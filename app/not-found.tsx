// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Página para notFound() y rutas que no existen. Se muestra dentro del layout raíz,
// que no pone <main> ni pie de página: por eso los pone esta página.
// El texto no distingue "no existe" de "no tienes acceso": con RLS, las dos se ven igual.
import type { Metadata } from "next";
import Link from "next/link";
import { DoodleLibreta } from "@/components/Doodle";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <>
      {/* Spec 012 (R-012.44): como Entrar, el nombre arriba y el mensaje en una tarjeta con una sola acción. */}
      <main id="contenido" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12 md:pb-20">
        <p className="text-center font-serif text-3xl leading-tight">Shorenote</p>
        <div className="relative">
          <Card className="gap-6 px-(--card-spacing) text-center">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl leading-tight sm:text-4xl">No encontramos esta página</h1>
              <p className="text-muted-foreground">Puede que la página no exista o que no tengas acceso a ella.</p>
            </div>
            <Button asChild size="lg">
              <Link href="/">Ir al inicio</Link>
            </Button>
          </Card>
          <DoodleLibreta className="pointer-events-none absolute -right-20 -bottom-14 hidden w-24 md:block" />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
