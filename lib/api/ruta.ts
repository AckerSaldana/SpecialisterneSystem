// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Forma de las funciones de lib/ que hacen el trabajo de una ruta (spec 004, "Pruebas de ruta"):
// cada route.ts autentica, valida el id, lee el body y delega. Esas funciones no importan lib/auth,
// así scripts/followup-check.ts las llama con cuentas sintéticas y un modelo simulado.
import type { ApiError } from "@/lib/api/contracts";
import type { RlsClaims } from "@/lib/db/rls";

export type UsuarioRuta = { id: string; claims: RlsClaims };

export type RespuestaRuta = { status: number; cuerpo: unknown };

export const conError = (status: number, error: string, extra: Omit<ApiError, "error"> = {}): RespuestaRuta => ({
  status,
  cuerpo: { error, ...extra } satisfies ApiError,
});

export const responder = ({ status, cuerpo }: RespuestaRuta) => Response.json(cuerpo, { status });
