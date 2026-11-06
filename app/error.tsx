// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Página para errores inesperados en cualquier pantalla (no en el layout raíz: eso lo
// cubre global-error.tsx). Reemplaza también al layout del coach o de la persona,
// así que pone su propio <main> y pie de página.
// No muestra el mensaje técnico del error: no ayuda a quien usa la app y puede tener datos internos.
// En Next 16 la página recibe retry(), que vuelve a pedir y a dibujar la pantalla.
"use client";

import { DoodleLibreta } from "@/components/Doodle";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <>
      {/* Client Component: no puede exportar metadata, así que el título va con <title>. */}
      <title>Algo salió mal · Shorenote</title>
      {/* Spec 012 (R-012.44): como Entrar, el nombre arriba y el mensaje en una tarjeta con una sola acción. */}
      <main id="contenido" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12 md:pb-20">
        <p className="text-center font-serif text-3xl leading-tight">Shorenote</p>
        <div className="relative">
          <Card className="gap-6 px-(--card-spacing) text-center">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl leading-tight sm:text-4xl">Algo salió mal</h1>
              <p className="text-muted-foreground">
                Intenta de nuevo. Si vuelve a pasar, avisa a tu coach o escribe a{" "}
                <a href="mailto:ayuda@caja-mex.test" className="text-foreground underline underline-offset-4">
                  ayuda@caja-mex.test
                </a>
                .
              </p>
            </div>
            <Button size="lg" onClick={() => retry()}>
              Intentar de nuevo
            </Button>
          </Card>
          <DoodleLibreta className="pointer-events-none absolute -right-20 -bottom-14 hidden w-24 md:block" />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
