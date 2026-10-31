// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Log de errores del servidor sin datos personales.
// Nunca se imprime el error completo:
//   - DrizzleQueryError trae "params" (la nota, el perfil, comentarios de la persona).
//   - El error de Postgres trae "detail" con la fila y su "message" puede incluir valores.
//   - Los errores del AI SDK pueden traer el texto del modelo o el cuerpo de la petición.
//   - El message de un error desconocido puede llevar texto de la nota (R-004.47).
// resumirError arma un texto corto solo con la clase y el código. El mismo texto se guarda en
// audit_log.error.
import { AISDKError } from "ai";
import { DrizzleQueryError } from "drizzle-orm";

// Campos de un error de Postgres (paquete postgres) que no traen datos de la fila.
const CAMPOS_POSTGRES = ["code", "constraint_name", "table_name", "column_name"] as const;

// Lee solo los campos seguros de un error de Postgres. Para cualquier otra cosa devuelve [].
function camposPostgres(x: unknown): string[] {
  if (!x || typeof x !== "object") return [];
  const o = x as Record<string, unknown>;
  return CAMPOS_POSTGRES.filter((k) => typeof o[k] === "string" && o[k] !== "").map((k) => `${k}=${String(o[k])}`);
}

const esErrorPostgres = (x: unknown) => x instanceof Error && x.name === "PostgresError";

export function resumirError(e: unknown): string {
  // AI SDK: solo el nombre y, si existe, el código HTTP del proveedor.
  if (AISDKError.isInstance(e)) {
    const statusCode = (e as { statusCode?: unknown }).statusCode;
    return typeof statusCode === "number" ? `${e.name} statusCode=${statusCode}` : e.name;
  }
  // Drizzle: el message incluye "params:", así que se usa solo el nombre más la causa de Postgres.
  if (e instanceof DrizzleQueryError) {
    return ["DrizzleQueryError", ...camposPostgres(e.cause)].join(" ");
  }
  // Postgres sin envolver (p. ej. al hacer commit): sin message, que puede traer valores.
  if (esErrorPostgres(e)) {
    return ["PostgresError", ...camposPostgres(e)].join(" ");
  }
  if (e instanceof Error) {
    // Código de Node o de Postgres, nunca el message. Solo si parece un código y no texto libre.
    const code = (e as { code?: unknown }).code;
    const codigo = typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code) ? [`code=${code}`] : [];
    return [e.name, ...codigo, ...camposPostgres(e.cause)].join(" ");
  }
  return typeof e;
}

export function logError(contexto: string, e: unknown): void {
  console.error(`[${contexto}] ${resumirError(e)}`);
}
