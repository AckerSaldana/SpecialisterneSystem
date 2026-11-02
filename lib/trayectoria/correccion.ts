// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// El coach corrige el dominio o la dirección de una línea (spec 008, R-008.28 a R-008.30, R-008.32).
// Cada corrección es una fila nueva de fe_corrections: la propuesta de la IA sigue en payload y las
// anteriores siguen en la tabla. Solo escribe esa fila: no toca el perfil, el plan, las señales ni
// persona_profiles. No importa lib/auth, así un script la llama con cuentas sintéticas (lib/api/ruta.ts).
import "server-only";
import { and, eq } from "drizzle-orm";
import { CorregirLineaRequest, type CorregirLineaResponse } from "@/lib/api/contracts";
import { conError, type RespuestaRuta, type UsuarioRuta } from "@/lib/api/ruta";
import { exigirConsentimiento } from "@/lib/consent";
import { withRls } from "@/lib/db/rls";
import { engagements, feCorrections } from "@/lib/db/schema";
import { logError } from "@/lib/log";
import { leerTrayectoria } from "@/lib/trayectoria/lectura";
import { revisarCorreccion } from "@/lib/trayectoria/lineas";

// Los de R-008.30 viven en ERRORES_CORRECCION. Estos no tienen texto en la spec; siguen el mismo tono.
const MENSAJES = {
  invalido: "La corrección no es válida. Recarga la página.",
  noEncontrado: "No encontramos este acompañamiento.",
  sinConsentimiento: "La persona no tiene consentimiento vigente. No se guardó la corrección.",
  errorGuardar: "No se pudo guardar. Intenta de nuevo.",
} as const;

export async function corregirLinea(user: UsuarioRuta, engagementId: string, body: unknown): Promise<RespuestaRuta> {
  const parsed = CorregirLineaRequest.safeParse(body);
  if (!parsed.success) return conError(400, MENSAJES.invalido);
  const pedida = parsed.data;

  try {
    return await withRls(user.claims, async (tx): Promise<RespuestaRuta> => {
      const [engagement] = await tx
        .select({ id: engagements.id })
        .from(engagements)
        .where(and(eq(engagements.id, engagementId), eq(engagements.coachId, user.id)))
        .limit(1);
      if (!engagement) return conError(404, MENSAJES.noEncontrado);
      if (!(await exigirConsentimiento(tx, engagementId))) return conError(409, MENSAJES.sinConsentimiento);

      // Las líneas se recalculan aquí: lo que vio el coach pudo cambiar (R-008.30).
      const { lineas } = await leerTrayectoria(tx, engagementId);
      const revision = revisarCorreccion(lineas, pedida);
      if (revision.error !== null) return conError(400, revision.error);

      const [fila] = await tx
        .insert(feCorrections)
        .values({
          engagementId,
          eventId: revision.linea.eventId,
          lineaId: pedida.lineaId,
          dominio: pedida.dominio,
          direccion: pedida.direccion,
          anteriorLineaId: pedida.anteriorLineaId,
          createdBy: user.id,
        })
        .returning({ id: feCorrections.id });
      const respuesta: CorregirLineaResponse = { correccionId: fila.id };
      return { status: 201, cuerpo: respuesta };
    });
  } catch (e) {
    logError("corrección de línea", e);
    return conError(500, MENSAJES.errorGuardar);
  }
}
