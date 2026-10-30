// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// fetch a las rutas del plan (frente de rutas, spec 003 tareas 15 a 17) desde el navegador.
// Las rutas responden { error } con un texto literal de la spec cuando algo no se puede hacer
// (400 y 409). Ese texto se muestra tal cual. Si no llega un error legible (500, sin red), la UI
// usa su propio texto de respaldo. Si el error es de un punto del plan, llega también "ruta" con
// el id de ese punto (R-003.30).
import { ApiError } from "@/lib/api/contracts";

export type Resultado =
  | { ok: true; json: unknown }
  | { ok: false; error: string | null; ruta: string | null; status: number };

export async function llamarApi(url: string, init: { method: string; body?: unknown }): Promise<Resultado> {
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, json };
    const err = ApiError.safeParse(json);
    return {
      ok: false,
      error: err.success ? err.data.error : null,
      ruta: err.success ? (err.data.ruta ?? null) : null,
      status: res.status,
    };
  } catch {
    return { ok: false, error: null, ruta: null, status: 0 };
  }
}

export const ERROR_GUARDAR = "No se guardó el cambio. Revisa tu conexión e intenta de nuevo.";
