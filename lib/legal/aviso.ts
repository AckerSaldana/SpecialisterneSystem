// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Aviso de privacidad versionado (spec 002, R-002.21). La versión es la fecha del archivo en
// legal/. Un cambio de texto crea un archivo nuevo y cambia AVISO_VERSION; el anterior se queda
// porque hay consentimientos que apuntan a él.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const AVISO_VERSION = "2026-10-31";
const ARCHIVO = `${AVISO_VERSION}_aviso-privacidad.md`;

// Bloques simples para mostrar el aviso sin una librería de markdown: el archivo solo usa
// párrafos, títulos (# y ##) y listas con "- ".
export type BloqueAviso =
  | { tipo: "titulo"; texto: string }
  | { tipo: "subtitulo"; texto: string }
  | { tipo: "parrafo"; texto: string }
  | { tipo: "lista"; items: string[] };

export async function leerAviso(): Promise<string> {
  const texto = await readFile(path.join(process.cwd(), "legal", ARCHIVO), "utf8");
  // La primera línea es el comentario de atribución; no se muestra.
  return texto.replace(/^<!--[\s\S]*?-->\s*/, "");
}

export function bloquesDeAviso(texto: string): BloqueAviso[] {
  const bloques: BloqueAviso[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim();
    if (!l) continue;
    if (l.startsWith("## ")) bloques.push({ tipo: "subtitulo", texto: l.slice(3) });
    else if (l.startsWith("# ")) bloques.push({ tipo: "titulo", texto: l.slice(2) });
    else if (l.startsWith("- ")) {
      const anterior = bloques.at(-1);
      if (anterior?.tipo === "lista") anterior.items.push(l.slice(2));
      else bloques.push({ tipo: "lista", items: [l.slice(2)] });
    } else bloques.push({ tipo: "parrafo", texto: l });
  }
  return bloques;
}
