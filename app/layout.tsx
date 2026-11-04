// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Layout raíz. Lee las preferencias de presentación (cookie) en el servidor y las
// pone en <html> antes de enviar la página, así no hay parpadeo de estilos.
// El pie de ayuda (<SiteFooter />) lo pone cada layout de pantalla, no este.
import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Lexend, Source_Serif_4 } from "next/font/google";
import "@fontsource/opendyslexic/400.css";
import "@fontsource/opendyslexic/700.css";
import "./globals.css";
import { atributosHtml, getPreferences } from "@/lib/preferences";

// R-012.4. Atkinson es la fuente de cuerpo y Source Serif 4 la de títulos: las dos se precargan. Lexend y
// OpenDyslexic se descargan solo si se eligen, porque solo [data-font] las nombra en globals.css.
const atkinson = Atkinson_Hyperlegible({
  weight: ["400", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-atkinson",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  weight: ["500"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-source-serif",
  display: "swap",
});

const lexend = Lexend({
  subsets: ["latin", "latin-ext"],
  variable: "--font-lexend",
  display: "swap",
  preload: false,
});

// Cada página pone su propio título; el template agrega el nombre del sitio.
// Un título distinto por página permite que el anunciador de rutas de Next lea la navegación.
export const metadata: Metadata = {
  // Nombre del producto: D-091 (spec 012, R-012.23).
  title: { default: "Shorenote", template: "%s · Shorenote" },
  description: "Coaching para proyectos de inclusión laboral. La IA ordena las notas; el coach decide.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const preferencias = await getPreferences();

  return (
    <html
      lang="es"
      className={`${atkinson.variable} ${sourceSerif.variable} ${lexend.variable} h-full antialiased`}
      {...atributosHtml(preferencias)}
    >
      <body className="flex min-h-full flex-col">
        {/* Primer elemento enfocable: salta la navegación y va al contenido. */}
        <a href="#contenido" className="skip-link">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
