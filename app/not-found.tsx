// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Página para notFound() y rutas que no existen. Se muestra dentro del layout raíz,
// que no pone <main> ni pie de página: por eso los pone esta página.
// El texto no distingue "no existe" de "no tienes acceso": con RLS, las dos se ven igual.
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <>
      <main id="contenido" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-12">
        <h1 className="text-2xl font-semibold">No encontramos esta página</h1>
        <p className="prose-measure">Puede que la página no exista o que no tengas acceso a ella.</p>
        <p>
          <Link href="/" className="font-medium underline underline-offset-4">
            Ir al inicio
          </Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
