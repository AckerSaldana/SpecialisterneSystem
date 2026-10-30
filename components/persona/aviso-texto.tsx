// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Texto del aviso de privacidad en HTML semántico (spec 002, R-002.20, R-002.21, CA-002.18).
// Recibe los bloques de lib/legal/aviso.ts (bloquesDeAviso) y no cambia ni una palabra.
// El título del archivo ("# ...") es el h1 de la página: lo pone la página con tituloDeAviso,
// así hay un solo h1. Cada "## ..." es un h2; las listas son <ul>; lo demás, <p>.
// La primera línea del archivo es la marca "Borrador sin revisión legal" y se muestra primero.
import type { BloqueAviso } from "@/lib/legal/aviso";

export function tituloDeAviso(bloques: BloqueAviso[]): string {
  return bloques.find((b) => b.tipo === "titulo")?.texto ?? "Aviso de privacidad";
}

export function AvisoTexto({ bloques, version }: { bloques: BloqueAviso[]; version: string }) {
  return (
    <article aria-label="Texto del aviso de privacidad" className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Versión del aviso: {version}</p>
      {bloques.map((b, i) => {
        switch (b.tipo) {
          case "titulo":
            return null;
          case "subtitulo":
            return (
              <h2 key={i} className="mt-2 text-xl font-semibold">
                {b.texto}
              </h2>
            );
          case "lista":
            return (
              <ul key={i} className="prose-measure flex list-disc flex-col gap-1 pl-6">
                {b.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          case "parrafo":
            return (
              <p key={i} className="prose-measure">
                {b.texto}
              </p>
            );
        }
      })}
    </article>
  );
}
