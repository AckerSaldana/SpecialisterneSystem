// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// R-010.2: una invitación pendiente o vencida responde 403 en las rutas de la persona, porque la puerta protege
// páginas y no rutas. Importa lib/persona/puerta.ts, que trae lib/auth en tiempo de ejecución: solo lo usan los
// route.ts, nunca lib/desglose/generar.ts.
import "server-only";
import { SIN_ACTIVAR } from "@/components/persona/desglose/textos";
import { conError, type RespuestaRuta, type UsuarioRuta } from "@/lib/api/ruta";
import { withRls } from "@/lib/db/rls";
import { leerEstadoPersona } from "@/lib/persona/puerta";

export async function exigirPersonaActiva(user: UsuarioRuta): Promise<RespuestaRuta | null> {
  const { invitacion } = await withRls(user.claims, (tx) => leerEstadoPersona(tx, user.id));
  return invitacion.estado === "pendiente" || invitacion.estado === "vencida" ? conError(403, SIN_ACTIVAR) : null;
}
