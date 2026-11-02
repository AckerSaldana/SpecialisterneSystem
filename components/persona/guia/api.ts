// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// fetch a las rutas de "Cómo trabajar conmigo" desde el navegador de la persona. Las rutas responden { error }
// con un texto literal de la spec, y ese texto se muestra tal cual: el bloqueo de R-009.24 corre solo en el
// servidor y el navegador muestra el mensaje del 400. Solo contracts-cliente y schema-cliente: este archivo llega
// al navegador de la persona y no puede traer los valores de lib/profile/schema (C-09).
import { z } from "zod";
import { ApiError } from "@/lib/api/contracts-cliente";
import { GuiaVista } from "@/lib/guia/schema-cliente";
import { ERROR_RED } from "./textos";

export type ResultadoGuia = { ok: true; guia: GuiaVista } | { ok: false; error: string; status: number };

const RespuestaGuia = z.object({ guia: GuiaVista });

export async function llamarGuia(url: string, metodo: "POST" | "PATCH" | "DELETE", cuerpo?: object): Promise<ResultadoGuia> {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: cuerpo ? { "Content-Type": "application/json" } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const leida = RespuestaGuia.safeParse(json);
      return leida.success ? { ok: true, guia: leida.data.guia } : { ok: false, error: ERROR_RED, status: res.status };
    }
    const err = ApiError.safeParse(json);
    return { ok: false, error: err.success ? err.data.error : ERROR_RED, status: res.status };
  } catch {
    return { ok: false, error: ERROR_RED, status: 0 };
  }
}
