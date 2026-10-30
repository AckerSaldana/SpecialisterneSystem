// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Página para errores inesperados en cualquier pantalla (no en el layout raíz: eso lo
// cubre global-error.tsx). Reemplaza también al layout del coach o de la persona,
// así que pone su propio <main> y pie de página.
// No muestra el mensaje técnico del error: no ayuda a quien usa la app y puede tener datos internos.
// En Next 16 la página recibe retry(), que vuelve a pedir y a dibujar la pantalla.
"use client";

import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <>
      {/* Client Component: no puede exportar metadata, así que el título va con <title>. */}
      <title>Algo salió mal · Caja MEX</title>
      <main id="contenido" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-12">
        <h1 className="text-2xl font-semibold">Algo salió mal</h1>
        <p className="prose-measure">
          Intenta de nuevo. Si vuelve a pasar, avisa a tu coach o escribe a{" "}
          <a href="mailto:ayuda@caja-mex.test">ayuda@caja-mex.test</a>.
        </p>
        <div>
          <Button size="lg" onClick={() => retry()}>
            Intentar de nuevo
          </Button>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
