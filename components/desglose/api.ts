// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// fetch a las rutas del desglose de tareas (spec 010) desde el navegador, de la persona y del coach. Las rutas responden
// { error } con un texto literal de la spec, y ese texto se muestra tal cual. Solo contracts-cliente: este archivo llega
// al navegador de la persona y no puede traer los valores de lib/profile/schema (C-09).
import { ApiError } from "@/lib/api/contracts-cliente";

export type ResultadoDesglose = { ok: true; json: unknown } | { ok: false; error: string; status: number };

// errorRed: el texto de quien llama, para cuando no llega un error legible (500, sin red).
export async function llamarDesglose(url: string, metodo: "POST" | "PATCH", cuerpo: object, errorRed: string): Promise<ResultadoDesglose> {
  try {
    const res = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, json };
    const err = ApiError.safeParse(json);
    return { ok: false, error: err.success ? err.data.error : errorRed, status: res.status };
  } catch {
    return { ok: false, error: errorRed, status: 0 };
  }
}
