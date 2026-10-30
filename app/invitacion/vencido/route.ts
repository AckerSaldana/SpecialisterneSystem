// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// GET /invitacion/vencido: cierra la sesión de una persona cuyo código venció (R-002.39) y la
// manda a /invitacion con el aviso de código vencido. Existe porque la puerta
// (lib/persona/puerta.ts) corre en Server Components, que no pueden borrar cookies; un Route
// Handler sí puede. La URL no lleva datos (R-002.47).
// Solo cierra la sesión si de verdad hay un código vencido, así un enlace a esta ruta desde otro
// sitio no saca a nadie que esté bien.
import { redirect } from "next/navigation";
import { getSessionUser, HOME_BY_ROLE } from "@/lib/auth";
import { withRls } from "@/lib/db/rls";
import { logError } from "@/lib/log";
import { INVITACION_VENCIDA, leerInvitacion } from "@/lib/persona/puerta";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  let destino = INVITACION_VENCIDA;
  try {
    const user = await getSessionUser();
    if (user) {
      const vencida =
        user.role === "persona" &&
        (await withRls(user.claims, (tx) => leerInvitacion(tx, user.id))).estado === "vencida";
      if (vencida) {
        const supabase = await createClient();
        await supabase.auth.signOut();
      } else {
        destino = HOME_BY_ROLE[user.role];
      }
    }
  } catch (e) {
    // Mensaje fijo: nada de la sesión ni del código.
    // Sin poder revisar, no se afirma que venció: se manda a /login, que vuelve a pasar por la puerta.
    logError("invitacion/vencido: no se pudo revisar la invitación", e);
    destino = "/login";
  }
  // redirect() va fuera del try (lanza una excepción especial de Next).
  redirect(destino);
}
