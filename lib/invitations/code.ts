// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Código de invitación de un solo uso (spec 002, decisión a, R-002.14).
// 8 caracteres de un alfabeto sin caracteres que se confunden (sin 0/O, 1/I/L), generados con
// crypto. Se muestra como "XXXX-XXXX". Nunca va en una URL, en logs ni en tablas (R-002.47).
import { randomInt } from "node:crypto";

// 31 símbolos: dígitos 2-9 y letras mayúsculas sin I, L, O.
export const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const LONGITUD_CODIGO = 8;
export const VIGENCIA_DIAS = 7;

export function generarCodigo(): string {
  let codigo = "";
  for (let i = 0; i < LONGITUD_CODIGO; i++) codigo += ALFABETO[randomInt(ALFABETO.length)];
  return codigo;
}

// Para mostrarlo al coach: "K7MP3QXR" → "K7MP-3QXR".
export function formatearCodigo(codigo: string): string {
  return `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
}

// Lo que escribe la persona: con o sin guion, espacios o minúsculas.
export function normalizarCodigo(entrada: string): string {
  return entrada.replace(/[\s-]/g, "").toUpperCase();
}

export function venceEn(desde: Date = new Date()): Date {
  return new Date(desde.getTime() + VIGENCIA_DIAS * 24 * 60 * 60 * 1000);
}
