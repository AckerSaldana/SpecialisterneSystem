// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Preferencias de presentación: modo de color, fuente y espaciado.
// Se guardan en una cookie (no en la base) para que funcionen con o sin sesión
// y para que el layout las aplique en el <html> desde el servidor, sin parpadeo.
//
// Las opciones son pocas y discretas a propósito: elegir entre 3 a 5 valores
// con nombre es más fácil que mover un slider. Los rangos son los de docs/DISENO.md (R-012.5).
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
export const FUENTES = ["sans", "lexend", "opendyslexic"] as const;
export const TAMANOS = [16, 18, 20, 22, 24] as const; // px
export const INTERLETRADOS = [0, 0.03, 0.06] as const; // em
export const INTERLINEADOS = [1.5, 1.6, 1.8, 2] as const; // sin unidad
export const ANCHOS = [50, 62, 75] as const; // ch (caracteres por línea)

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
  fuente: "sans",
  tamano: 18,
  interletrado: 0,
  interlineado: 1.6,
  ancho: 62,
};

// Textos que ve la persona en /preferencias. Literales y cortos.
export const OPCIONES = {
  modo: [
    { valor: "calma", etiqueta: "Calma", ayuda: "Colores suaves. Sin animaciones ni sombras." },
    { valor: "estandar", etiqueta: "Estándar", ayuda: "Colores con buen contraste." },
    { valor: "alto-contraste", etiqueta: "Alto contraste", ayuda: "Negro sobre blanco. Bordes gruesos." },
  ],
  fuente: [
    { valor: "sans", etiqueta: "Atkinson Hyperlegible", ayuda: "Letras fáciles de distinguir." },
    { valor: "lexend", etiqueta: "Lexend", ayuda: "Letra ancha y separada." },
    { valor: "opendyslexic", etiqueta: "OpenDyslexic", ayuda: "Letra con la base más gruesa." },
  ],
  tamano: [
    { valor: 16, etiqueta: "Chico" },
    { valor: 18, etiqueta: "Normal" },
    { valor: 20, etiqueta: "Grande" },
    { valor: 22, etiqueta: "Más grande" },
    { valor: 24, etiqueta: "Muy grande" },
  ],
  interletrado: [
    { valor: 0, etiqueta: "Normal" },
    { valor: 0.03, etiqueta: "Un poco más" },
    { valor: 0.06, etiqueta: "Mucho más" },
  ],
  interlineado: [
    { valor: 1.5, etiqueta: "Junto" },
    { valor: 1.6, etiqueta: "Normal" },
    { valor: 1.8, etiqueta: "Un poco más" },
    { valor: 2, etiqueta: "Mucho más" },
  ],
  ancho: [
    { valor: 50, etiqueta: "Angosto" },
    { valor: 62, etiqueta: "Medio" },
    { valor: 75, etiqueta: "Ancho" },
  ],
} as const;

// R-012.6: una cookie guardada con la lista anterior (atkinson, inter, 0.05 em, 70 ch...) se traduce al valor más
// cercano de la lista nueva, para no perder lo que la persona eligió. Lo demás no se toca: la validación decide.
const FUENTES_ANTERIORES: Record<string, (typeof FUENTES)[number]> = { atkinson: "sans", inter: "sans" };
const masCercano = (valor: unknown, lista: readonly number[]) =>
  typeof valor === "number" && !lista.includes(valor) ? lista.reduce((a, b) => (Math.abs(b - valor) < Math.abs(a - valor) ? b : a)) : valor;

export function traducirAnterior(crudo: unknown): unknown {
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) return crudo;
  const p = crudo as Record<string, unknown>;
  return {
    ...p,
    ...("fuente" in p ? { fuente: (typeof p.fuente === "string" && FUENTES_ANTERIORES[p.fuente]) || p.fuente } : {}),
    ...("tamano" in p ? { tamano: masCercano(p.tamano, TAMANOS) } : {}),
    ...("interletrado" in p ? { interletrado: masCercano(p.interletrado, INTERLETRADOS) } : {}),
    ...("interlineado" in p ? { interlineado: masCercano(p.interlineado, INTERLINEADOS) } : {}),
    ...("ancho" in p ? { ancho: masCercano(p.ancho, ANCHOS) } : {}),
  };
}

// Convierte el texto de la cookie en preferencias válidas.
// Si la cookie no existe, está rota o trae valores fuera de catálogo, usa los defaults.
export function parsePreferencias(valor: string | undefined): Preferencias {
  if (!valor) return PREFERENCIAS_DEFAULT;
  try {
    const resultado = Preferencias.safeParse(traducirAnterior(JSON.parse(valor)));
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

// Variables CSS que leen app/globals.css y la vista previa, con los nombres de docs/DISENO.md. --tamano-base es su
// --text-base, renombrado porque Tailwind ya usa ese nombre para la clase text-base. Va en rem: en el <html>, 1rem es el tamaño base del navegador,
// así se respeta si la persona ya agrandó la letra en su navegador.
export function variablesCss(p: Preferencias): Record<string, string> {
  return {
    "--tamano-base": `${p.tamano / 16}rem`,
    "--tracking": `${p.interletrado}em`,
    "--leading": String(p.interlineado),
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
