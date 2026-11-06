// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Lee lo que hace falta para escribir una guía, con la única función que lo sabe leer (R-009.10). La persona
// no puede leer plans, plan_items ni profile_snapshots, y así sigue: esta función trae textos del coach y
// citas, y su resultado se queda en el servidor. Ninguna respuesta de ruta, Server Action o página lo
// devuelve. Afuera solo se notan los 409 de R-009.3, que el coach vea o no el botón de pedir (R-009.47) y el
// booleano del aviso de la persona (R-009.46).
import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { InsumosGuia } from "@/lib/guia/schema";

// null si quien llama no es la persona ni el coach de ese acompañamiento, o sin consentimiento vigente.
export async function leerInsumosGuia(tx: Tx, engagementId: string, planVersionBase: number | null = null): Promise<InsumosGuia | null> {
  const [fila] = await tx.execute<{ insumos: unknown }>(
    sql`select private.app_guia_insumos(${engagementId}::uuid, ${planVersionBase}::integer) as insumos`,
  );
  return fila?.insumos == null ? null : InsumosGuia.parse(fila.insumos);
}
