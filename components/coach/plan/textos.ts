// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Textos literales de la spec 003, "Pantallas y textos" → "Coach: sección Plan de acompañamiento".
// Están juntos para revisarlos contra la spec de un vistazo. Solo los ve el coach.
import type { BanderaPlan, DescartadoPlan, OrigenItemPlan, TipoItemPlan } from "@/lib/plan/schema";

// Estados antes de la propuesta.
export const SIN_PERFIL = "Primero aprueba el perfil. El plan se arma a partir del perfil aprobado.";
export const sinConsentimiento = (nombre: string) =>
  `${nombre} no ha dado su consentimiento o lo retiró. Sin consentimiento no se envía nada a la IA.`;
// Opción propuesta de 002 (RLS oculta el plan sin consentimiento vigente, R-003.53).
export const SIN_CONSENTIMIENTO_OCULTO = "Mientras no haya consentimiento, el plan no se muestra.";
export const listo = (version: number) =>
  `La IA propone a partir del perfil versión ${version} y de las fichas verificadas. Tú decides qué queda.`;
export const SIN_FICHAS = "No hay fichas verificadas. La propuesta va a salir sin fichas de apoyo.";
export const ESPERANDO = "Armando la propuesta. Esto puede tardar unos segundos.";
export const ERROR_MODELO = "No se pudo generar la propuesta. No se guardó nada. Intenta de nuevo.";
export const YA_HAY_BORRADOR = "Ya hay un borrador de plan. Apruébalo o descártalo antes de pedir otro.";

// Borrador.
export const encabezadoBorrador = (version: number) => `Borrador del plan · basado en el perfil versión ${version}`;
export const TEXTO_FIJO_BORRADOR =
  "La persona no ve nada de esto hasta que apruebes el plan. Cada cambio se guarda en cuanto lo confirmas.";

// Nota debajo de cada grupo que la persona no ve tal cual (R-003.40, R-009.54). Los demás grupos no llevan nota.
export function notaGrupo(tipo: TipoItemPlan, nombre: string): string | null {
  switch (tipo) {
    case "objetivo_equipo":
    case "instruccion":
      return `${nombre} no ve este grupo tal cual. La IA puede usarlo para proponerle líneas de "Cómo trabajar conmigo".`;
    case "ajuste_razonable":
    case "comunicacion_lider":
      return `Borrador interno. La app no lo envía a la empresa. ${nombre} no lo ve tal cual, pero la IA puede usarlo para proponerle líneas de "Cómo trabajar conmigo", y ${nombre} decide si las comparte.`;
    default:
      return null;
  }
}

export const ETIQUETA_ORIGEN: Record<OrigenItemPlan, string> = {
  ia: "Propuesto por la IA",
  ia_editado: "Editado por ti",
  coach: "Escrito por ti",
};

export const textoFicha = (id: string, titulo: string) => `Ficha ${id}: ${titulo}`;
export const SIN_FICHA = "Sin ficha";
export const TITULO_EVIDENCIA = "Evidencia del perfil";
export const SIN_EVIDENCIA_COACH = "Sin evidencia: lo escribiste tú.";
// R-003.25: un ítem de la IA al que el coach le quitó todas las citas.
export const SIN_EVIDENCIA = "Sin evidencia";
export const loQueVera = (nombre: string) => `Lo que verá ${nombre}:`;
export const sinTextoPersona = (nombre: string) => `Este punto no tiene texto para ${nombre}. No lo va a ver.`;
export const siguePunto = (version: number) => `Sigue al punto de la versión ${version}:`;
export const PUNTO_NUEVO = "Es un punto nuevo";

// Diálogo de quitar: título "¿Quitar este punto del plan?" y descripción "Queda registrado en el
// historial." (en item-plan.tsx, partidos en título y descripción del Dialog).

// Diálogos de aprobar y descartar: la pregunta va en el título del Dialog y el resto en su descripción.
export const APROBAR_TITULO = "¿Aprobar este plan?";
export const aprobarTexto = (nombre: string) =>
  `${nombre} va a ver sus objetivos y apoyos. Los objetivos del equipo, los ajustes razonables, las instrucciones y lo del líder no los ve tal cual, pero la IA puede usarlos para proponerle líneas de "Cómo trabajar conmigo". ${nombre} sí lee esas líneas y decide si las comparte. Después de aprobarlo ya no se edita; para cambiarlo pides una propuesta nueva.`;
export const DESCARTAR_TITULO = "¿Descartar este borrador?";
export const DESCARTAR_TEXTO = "Se queda en el historial, pero no se usa.";

// Avisos de la validación. Descartados (los guardó sanitizePlan en propuesta_ia) y banderas
// (se recalculan con código cada vez que se muestra el borrador, R-003.27).
export function mensajeDescartado(motivo: DescartadoPlan["motivo"]): string | null {
  switch (motivo) {
    case "ficha_no_existe":
      return "La IA citó una ficha que no existe. Quitamos ese punto.";
    case "evidencia_no_existe":
      return "La IA citó evidencia que no está en el perfil. Quitamos esa cita.";
    // sin_evidencia siempre viene junto con evidencia_no_existe (el modelo debe citar al menos un ID),
    // y textoPersona_en_tipo_interno no tiene texto en la spec: no se muestran aparte.
    default:
      return null;
  }
}

export function mensajeBandera(b: BanderaPlan, nombre: string): string {
  switch (b.motivo) {
    case "termino_no_permitido":
      return `Revisa esta palabra: «${b.termino}». No usamos ese lenguaje.`;
    case "termino_interno":
      return `Este texto lo verá ${nombre} y nombra una función ejecutiva: «${b.termino}». Escríbelo con palabras de todos los días.`;
    case "cita_en_texto_persona":
      return `Este texto lo verá ${nombre} y copia parte de tus notas: «${b.termino}». Escríbelo con tus palabras.`;
    case "mencion_condicion":
      return `Este punto nombra una condición: «${b.termino}». El plan describe conductas, no condiciones.`;
    case "cita_en_texto_lider":
      return "Este punto copia una cita de tus notas. Tus notas son privadas; escríbelo con tus palabras.";
  }
}

// Plan vigente.
export const encabezadoVigente = (version: number, fecha: string, aprobador: string) =>
  `Plan vigente · versión ${version} · aprobado el ${fecha} por ${aprobador}`;
export const avisoPerfilNuevo = (n: number, m: number) =>
  `El perfil cambió después de aprobar este plan. El plan usa el perfil versión ${n} y el perfil actual es la versión ${m}. Revisa si el plan sigue sirviendo.`;

// Historial.
export const filaVersion = (v: {
  version: number;
  fecha: string;
  aprobador: string;
  perfil: number;
  prompt: string;
  modelo: string;
}) =>
  `Versión ${v.version} · aprobada el ${v.fecha} por ${v.aprobador} · perfil versión ${v.perfil} · prompt ${v.prompt} · modelo ${v.modelo}`;
export const filaDescartado = (fecha: string) => `Descartado el ${fecha}`;
export const RASTRO_SIN_CAMBIOS = "Sin cambios de la IA";
export const RASTRO_EDITADO = "Editado por el coach (ver texto original)";
export const RASTRO_COACH = "Escrito por el coach";
export const rastroSigue = (version: number, descripcion: string) =>
  `Sigue al punto de la versión ${version}: «${descripcion}»`;
export const RASTRO_QUITADOS = "Puntos de la IA que el coach quitó";
