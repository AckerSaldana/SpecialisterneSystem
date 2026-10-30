// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Server Action del formulario de /preferencias. Valida con Zod y guarda la cookie.
// Al poner una cookie dentro de una Server Action, Next vuelve a renderizar la ruta
// en la misma respuesta: el layout lee la cookie nueva y el <html> cambia solo.
"use server";

import { cookies } from "next/headers";
import { COOKIE_MAX_AGE, COOKIE_PREFERENCIAS, Preferencias } from "@/lib/preferences";

export type EstadoGuardado =
  | { estado: "sin-enviar" }
  | { estado: "guardado"; preferencias: Preferencias }
  | { estado: "error"; mensaje: string };

export async function guardarPreferencias(_previo: EstadoGuardado, formData: FormData): Promise<EstadoGuardado> {
  // Los radios llegan como texto; los valores numéricos se convierten antes de validar.
  const resultado = Preferencias.safeParse({
    modo: formData.get("modo"),
    fuente: formData.get("fuente"),
    tamano: Number(formData.get("tamano")),
    interletrado: Number(formData.get("interletrado")),
    interlineado: Number(formData.get("interlineado")),
    ancho: Number(formData.get("ancho")),
  });

  if (!resultado.success) {
    return { estado: "error", mensaje: "No se guardó. Elige una opción en cada grupo y vuelve a intentar." };
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_PREFERENCIAS, JSON.stringify(resultado.data), {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return { estado: "guardado", preferencias: resultado.data };
}
