// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Preferencias de presentación: modo de color, fuente y espaciado.
// Se guardan en una cookie (no en la base) para que funcionen con o sin sesión
// y para que el layout las aplique en el <html> desde el servidor, sin parpadeo.
//
// Las opciones son pocas y discretas a propósito: elegir entre 3 o 4 valores
// con nombre es más fácil que mover un slider.
//
// Importa next/headers, así que solo lo importan archivos del servidor.
// Los componentes de cliente usan "import type" (se borra al compilar) y reciben
// las opciones por props desde la página.
import "server-only";
import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { z } from "zod";

export const COOKIE_PREFERENCIAS = "caja-mex-preferencias";

// Un año, en segundos.
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const MODOS = ["calma", "estandar", "alto-contraste"] as const;
export const FUENTES = ["atkinson", "inter", "lexend", "opendyslexic"] as const;
export const TAMANOS = [16, 18, 20, 22] as const; // px
export const INTERLETRADOS = [0, 0.05, 0.1] as const; // em
export const INTERLINEADOS = [1.5, 1.75, 2] as const; // sin unidad
export const ANCHOS = [60, 70, 80] as const; // ch (caracteres por línea)

// Une valores literales en un esquema Zod. Con números no hay z.enum, por eso la unión.
const literales = <T extends readonly [number, ...number[]]>(valores: T) =>
  z.union(valores.map((v) => z.literal(v)) as unknown as [z.ZodLiteral<T[number]>, ...z.ZodLiteral<T[number]>[]]);

export const Preferencias = z.strictObject({
  modo: z.enum(MODOS),
  fuente: z.enum(FUENTES),
  tamano: literales(TAMANOS),
  interletrado: literales(INTERLETRADOS),
  interlineado: literales(INTERLINEADOS),
  ancho: literales(ANCHOS),
});
export type Preferencias = z.infer<typeof Preferencias>;

export const PREFERENCIAS_DEFAULT: Preferencias = {
  modo: "estandar",
  fuente: "atkinson",
  tamano: 18,
  interletrado: 0,
  interlineado: 1.5,
  ancho: 70,
};

// Textos que ve la persona en /preferencias. Literales y cortos.
export const OPCIONES = {
  modo: [
    { valor: "calma", etiqueta: "Calma", ayuda: "Colores suaves. Sin animaciones ni sombras." },
    { valor: "estandar", etiqueta: "Estándar", ayuda: "Colores con buen contraste." },
    { valor: "alto-contraste", etiqueta: "Alto contraste", ayuda: "Negro sobre blanco. Bordes gruesos." },
  ],
  fuente: [
    { valor: "atkinson", etiqueta: "Atkinson Hyperlegible", ayuda: "Letras fáciles de distinguir." },
    { valor: "inter", etiqueta: "Inter", ayuda: "Letra común en pantallas." },
    { valor: "lexend", etiqueta: "Lexend", ayuda: "Letra ancha y separada." },
    { valor: "opendyslexic", etiqueta: "OpenDyslexic", ayuda: "Letra con la base más gruesa." },
  ],
  tamano: [
    { valor: 16, etiqueta: "Normal" },
    { valor: 18, etiqueta: "Mediano" },
    { valor: 20, etiqueta: "Grande" },
    { valor: 22, etiqueta: "Muy grande" },
  ],
  interletrado: [
    { valor: 0, etiqueta: "Normal" },
    { valor: 0.05, etiqueta: "Un poco más" },
    { valor: 0.1, etiqueta: "Mucho más" },
  ],
  interlineado: [
    { valor: 1.5, etiqueta: "Normal" },
    { valor: 1.75, etiqueta: "Un poco más" },
    { valor: 2, etiqueta: "Mucho más" },
  ],
  ancho: [
    { valor: 60, etiqueta: "Angosto" },
    { valor: 70, etiqueta: "Medio" },
    { valor: 80, etiqueta: "Ancho" },
  ],
} as const;

// Convierte el texto de la cookie en preferencias válidas.
// Si la cookie no existe, está rota o trae valores fuera de catálogo, usa los defaults.
export function parsePreferencias(valor: string | undefined): Preferencias {
  if (!valor) return PREFERENCIAS_DEFAULT;
  try {
    const resultado = Preferencias.safeParse(JSON.parse(valor));
    return resultado.success ? resultado.data : PREFERENCIAS_DEFAULT;
  } catch {
    return PREFERENCIAS_DEFAULT;
  }
}

// Lee la cookie en Server Components, layouts y Server Actions.
export async function getPreferences(): Promise<Preferencias> {
  const cookieStore = await cookies();
  return parsePreferencias(cookieStore.get(COOKIE_PREFERENCIAS)?.value);
}

// Variables CSS que leen app/globals.css y la vista previa.
// --text-size va en rem: en el <html>, 1rem es el tamaño base del navegador,
// así se respeta si la persona ya agrandó la letra en su navegador.
export function variablesCss(p: Preferencias): Record<string, string> {
  return {
    "--text-size": `${p.tamano / 16}rem`,
    "--letter-spacing": `${p.interletrado}em`,
    "--line-height": String(p.interlineado),
    "--measure": `${p.ancho}ch`,
  };
}

// Atributos para el <html> del layout raíz.
export function atributosHtml(p: Preferencias) {
  return {
    "data-mode": p.modo,
    "data-font": p.fuente,
    style: variablesCss(p) as CSSProperties,
  };
}
