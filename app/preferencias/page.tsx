// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /preferencias: pública, con o sin sesión. Las preferencias viven en una cookie
// de este navegador, no en la cuenta.
import type { Metadata } from "next";
import Link from "next/link";
import { PreferencesForm } from "@/components/preferences-form";
import { SiteFooter } from "@/components/site-footer";
import { OPCIONES, getPreferences } from "@/lib/preferences";

export const metadata: Metadata = {
  title: "Preferencias de presentación",
};

export default async function PreferenciasPage() {
  const preferencias = await getPreferences();

  return (
    <>
      <main id="contenido" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        <p>
          {/* "/" manda a cada quien a su inicio según su rol (o a iniciar sesión). */}
          <Link href="/">Volver</Link>
        </p>
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">Preferencias de presentación</h1>
          <p className="prose-measure">
            Elige cómo quieres ver el texto. Los cambios aplican en todas las pantallas de este navegador después de
            presionar Guardar.
          </p>
        </header>
        <PreferencesForm inicial={preferencias} opciones={OPCIONES} />
      </main>
      <SiteFooter />
    </>
  );
}
