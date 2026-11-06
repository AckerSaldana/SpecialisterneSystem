// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Server Action de /bienvenida/aviso: la persona da su consentimiento (spec 002, R-002.22,
// R-002.23, R-002.25, R-002.37). También es el camino para darlo otra vez después de retirarlo
// (R-002.29): vuelve a leer el aviso vigente y marca la casilla.
// - La casilla se revisa aquí, en el servidor. Sin ella no se registra nada.
// - Inserta en app.consent_events con withRls de la persona: user_id = la persona, tipo
//   'otorgado', version_aviso = AVISO_VERSION. La fecha la pone la base.
// - Si la etapa es 'alta', el trigger private.app_on_consent la pasa a 'evaluacion_inicial'
//   en la misma transacción (R-002.25).
// - Si la verificación no está completa, la política consent_events_insert_persona rechaza el
//   evento (R-002.37) y la persona ve el texto de alta incompleta.
"use server";

import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { AVISO_VERSION } from "@/lib/legal/aviso";
import { logError } from "@/lib/log";
import { INVITACION_VENCIDA, leerEstadoPersona } from "@/lib/persona/puerta";
import { createClient } from "@/lib/supabase/server";
import { insertarEventoConsentimiento } from "@/lib/db/insertar";

export type ConsentimientoState = { error: string | null; campo: "casilla" | null };

const ERROR_CASILLA = "Marca la casilla si estás de acuerdo. Si no lo estás, elige «No por ahora».";
const ERROR_ALTA_INCOMPLETA = "Tu coach todavía no termina tu alta. No registramos nada. Habla con tu coach.";
const ERROR_SERVIDOR = "No pudimos registrar tu consentimiento por un problema del sistema. No registramos nada. Intenta de nuevo.";

// Postgres responde 42501 cuando la fila no pasa el WITH CHECK de una política. Para la persona de
// este acompañamiento, con su propio user_id, la única condición que puede fallar es la del alta
// verificada (R-002.37).
function esRechazoDePolitica(e: unknown): boolean {
  const codigo = (x: unknown) => (x && typeof x === "object" ? (x as { code?: unknown }).code : undefined);
  return codigo(e) === "42501" || codigo((e as { cause?: unknown } | null)?.cause) === "42501";
}

type Resultado = "listo" | "ya_vigente" | "vencida" | "pendiente" | "sin_acompanamiento";

export async function otorgarConsentimiento(
  _prev: ConsentimientoState,
  formData: FormData,
): Promise<ConsentimientoState> {
  const user = await getUserWithRole("persona");
  if (!user) redirect("/login");

  // R-002.22: sin la casilla no se registra nada.
  if (formData.get("acepto") !== "si") return { error: ERROR_CASILLA, campo: "casilla" };

  let resultado: Resultado;
  try {
    resultado = await withRls(user.claims, async (tx): Promise<Resultado> => {
      // La action no pasa por la puerta: revisa lo mismo antes de escribir.
      const estado = await leerEstadoPersona(tx, user.id);
      if (estado.invitacion.estado === "vencida") return "vencida";
      if (estado.invitacion.estado === "pendiente") return "pendiente";
      if (!estado.acompanamiento) return "sin_acompanamiento";
      // Doble envío o pestaña vieja: no se duplica el evento.
      if (estado.consentimiento?.estado === "vigente") return "ya_vigente";

      await insertarEventoConsentimiento(tx, {
        engagementId: estado.acompanamiento.id,
        userId: user.id,
        tipo: "otorgado",
        versionAviso: AVISO_VERSION,
      });
      return "listo";
    });
  } catch (e) {
    if (esRechazoDePolitica(e)) return { error: ERROR_ALTA_INCOMPLETA, campo: null };
    logError("bienvenida/aviso: no se pudo registrar el consentimiento", e);
    return { error: ERROR_SERVIDOR, campo: null };
  }

  if (resultado === "vencida") {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect(INVITACION_VENCIDA);
  }
  if (resultado === "pendiente") redirect("/bienvenida/contrasena");
  if (resultado === "sin_acompanamiento" || resultado === "ya_vigente") redirect("/persona");
  // ?listo=1 solo pide mostrar la confirmación; la fecha la lee /persona de la base.
  redirect("/persona?listo=1");
}
