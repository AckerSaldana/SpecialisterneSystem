// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Server Action de /persona: retirar el consentimiento (spec 002, R-002.27, R-002.28).
// Inserta un evento 'retirado' con la versión del aviso vigente; la fecha la pone la base. Nada se
// borra: lo guardado deja de mostrarse a los dos roles mientras no haya consentimiento vigente
// (decisión b, R-002.30). Retirar siempre se puede, aunque el alta no esté verificada (R-002.37).
// Dar el consentimiento otra vez (R-002.29) usa la action del aviso
// (app/bienvenida/aviso/actions.ts): la persona vuelve a ver el aviso vigente y marca la casilla.
"use server";

import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { AVISO_VERSION } from "@/lib/legal/aviso";
import { logError } from "@/lib/log";
import { leerEstadoPersona } from "@/lib/persona/puerta";
import { insertarEventoConsentimiento } from "@/lib/db/insertar";

export type RetiroState = { error: string | null };

const ERROR_SERVIDOR =
  "No pudimos retirar tu consentimiento por un problema del sistema. Sigue vigente. Intenta de nuevo en unos minutos.";

// Se usa con useActionState; no necesita el estado anterior ni el formulario (no hay campos).
export async function retirarConsentimiento(): Promise<RetiroState> {
  const user = await getUserWithRole("persona");
  if (!user) redirect("/login");

  try {
    await withRls(user.claims, async (tx) => {
      const estado = await leerEstadoPersona(tx, user.id);
      // Solo se retira un consentimiento vigente; si ya estaba retirado, no se duplica el evento.
      if (!estado.acompanamiento || estado.consentimiento?.estado !== "vigente") return;
      await insertarEventoConsentimiento(tx, {
        engagementId: estado.acompanamiento.id,
        userId: user.id,
        tipo: "retirado",
        versionAviso: AVISO_VERSION,
      });
    });
  } catch (e) {
    logError("persona: no se pudo retirar el consentimiento", e);
    return { error: ERROR_SERVIDOR };
  }

  // Sin consentimiento vigente, la única pantalla privada es la del aviso (R-002.19). Ahí arriba
  // se ve "Retiraste tu consentimiento el {fecha}" y "Dar mi consentimiento otra vez".
  redirect("/bienvenida/aviso");
}
