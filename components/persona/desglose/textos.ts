// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Textos literales e ids de las pantallas de la persona en el desglose de tareas (spec 010, "Pantallas y textos"). Corre
// en su navegador: solo importa lib/desglose/schema-cliente, sin lib/profile/schema ni lib/trayectoria (C-09). Los que
// dicen "sin texto en la spec" siguen el mismo tono.
import { LIMITE_DIARIO_DESGLOSE, MAX_PASOS, sinPuntoFinal, type EstadoPaso, type ResultadoRepetir, type TipoAjuste } from "@/lib/desglose/schema-cliente";

export const RUTA_DESGLOSES = "/persona/desgloses";
export const rutaDesglose = (id: string) => `${RUTA_DESGLOSES}/${id}`;
// Sin datos en la URL: solo dice que acaba de quitar una tarea.
export const RUTA_DESGLOSES_TRAS_QUITAR = `${RUTA_DESGLOSES}?quitada=1`;
// Sin datos en la URL: solo dice qué pasó con la copia, para que la pantalla diga su texto. Con ajustes, ya los muestra.
export const rutaTrasRepetir = (id: string, resultado: ResultadoRepetir) => (resultado === "con_ajustes" ? rutaDesglose(id) : `${rutaDesglose(id)}?copia=${resultado}`);

// ---------------------------------------------------------------------------
// Ids para el foco
// ---------------------------------------------------------------------------

export const ID_TITULO_TAREAS = "mis-tareas";
export const ID_TITULO_TAREA = "esta-tarea";
export const idPaso = (pasoId: string) => `paso-${pasoId}`;
// El título de una copia. Lleva el id de su origen para que no exista en la pantalla de donde sale la persona: el foco se queda pendiente hasta que se pinte.
export const idTituloCopia = (origenId: string) => `copia-de-${origenId}`;

// ---------------------------------------------------------------------------
// "Mis tareas"
// ---------------------------------------------------------------------------

export const TITULO = "Mis tareas";
export const INTRO = "Escribe una tarea de tu trabajo. La IA la convierte en pasos, tomando en cuenta tu perfil. Tu coach puede leer tus tareas y sus pasos.";

export const PERFIL_NO_LISTO = "Tu perfil todavía no está listo. Cuando tu coach lo revise contigo, aquí puedes pedir los pasos de una tarea.";
export const LIMITE_ALCANZADO = `Hoy ya pediste ${LIMITE_DIARIO_DESGLOSE} desgloses, que es el máximo por día. Puedes seguir usando los que tienes. Mañana puedes pedir más.`;
export const ERROR_PREPARAR = "No se pudieron preparar los pasos. Lo que escribiste sigue aquí. Puedes intentar otra vez.";
export const RETIRO_DURANTE_LA_LLAMADA = "Retiraste tu consentimiento. Los pasos no se guardaron.";
export const DECIDE_AJUSTES = "Decide los ajustes para empezar a marcar pasos.";

export const FORMULARIO = {
  campoTarea: "¿Qué tarea quieres hacer?",
  ayudaTarea: "Escríbela con tus palabras. No escribas nombres de otras personas ni datos de salud.",
  herramienta: "Herramienta (opcional)",
  plazo: "Plazo (opcional)",
  conQuien: "Con quién (opcional)",
  ayudaConQuien: "Escribe el puesto, no el nombre.",
  antesDelBoton: `Lo que escribas aquí llega al modelo de inteligencia artificial. Puedes pedir hasta ${LIMITE_DIARIO_DESGLOSE} desgloses al día.`,
  boton: "Preparar los pasos",
  esperando: "Estamos preparando los pasos.",
  errorRed: ERROR_PREPARAR,
} as const;

export const VACIO = "Todavía no tienes tareas aquí.";
export const textoPorDesglose = (tarea: string, fecha: string) => `${sinPuntoFinal(tarea)}. Creada el ${fecha}.`;
export const LO_PREPARO_TU_COACH = "Lo preparó tu coach.";
export const TERMINASTE = "Terminaste todos los pasos.";

// Sin texto en la spec.
export const SIN_ACOMPANAMIENTO = "Todavía no tienes un acompañamiento activo. Tu coach te avisa cuando empiece.";
export const TAREA_QUITADA = "Se quitó la tarea de tu lista.";
export const TITULO_PEDIR = "Pedir los pasos de una tarea";
export const TITULO_LISTA = "Tus tareas";
export const VOLVER = `Volver a ${TITULO}`;
export const textoCreada = (fecha: string) => `Creada el ${fecha}.`;

// ---------------------------------------------------------------------------
// Una tarea
// ---------------------------------------------------------------------------

export const AVISO_TU_COACH_LEE = 'Tu coach lee lo que marcas aquí y lo que escribes en "Me atoré aquí".';
export const CASILLA_TIEMPO = "Mostrar tiempo aproximado";
export const textoTiempo = (n: number) => `Tiempo aproximado: ${n} min. Es una estimación de la IA, no un plazo.`;

export const textoPaso = (n: number, accion: string) => `Paso ${n}: ${accion}`;
export const textoCriterio = (criterio: string) => `Terminaste cuando: ${criterio}`;
export const textoNota = (nota: string) => `Te puede ayudar: ${nota}`;

export const POR_QUE = {
  titulo: "¿Por qué este paso?",
  primeraLinea: "La IA lo acomodó así por lo que ya está escrito sobre ti.",
} as const;

export const BOTONES_PASO = { hecho: "Ya lo hice", atorado: "Me atoré aquí", deshacer: "Deshacer" } as const;
// Lo que cada botón le dice a un lector de pantalla: su texto y de qué paso es.
export const etiquetaBotonPaso = (boton: string, n: number) => `${boton}: paso ${n}`;

export const textoHecho = (fecha: string) => `Hecho el ${fecha}.`;
export const textoAtorado = (fecha: string) => `Te atoraste aquí el ${fecha}.`;
export const textoAtoradoConTexto = (fecha: string, texto: string) => `${textoAtorado(fecha)} Escribiste: «${texto}»`;
export const textoRevisado = (fecha: string) => `Tu coach ya lo leyó el ${fecha}.`;

export const DIALOGO_ATORE = {
  titulo: "¿Dónde te atoraste?",
  campo: "Escribe qué pasó (opcional)",
  ayuda: "No escribas nombres de otras personas.",
  texto: "Tu coach lee este paso y lo que escribas, tal como lo escribas, cuando prepare su siguiente sesión. No lo lee en este momento. La IA no lo interpreta. Si repites esta tarea, le llega a la IA para proponerte ajustes. Esto no se puede borrar.",
  ayudaAhora: "Si necesitas ayuda ahora, habla con tu coach o escribe a ayuda@caja-mex.test.",
  cancelar: "Cancelar",
  confirmar: "Guardar",
} as const;

export const DIALOGO_ARCHIVAR = {
  boton: "Ya no la uso",
  titulo: "¿Quitar esta tarea de tu lista?",
  texto: "Ya no aparece en tu lista y no se puede deshacer. Tu coach la sigue viendo.",
  cancelar: "Cancelar",
  confirmar: "Quitar",
} as const;

// Sin texto en la spec: los resultados de cada marca (role="status"), sin tiempo límite (C-14).
export const RESULTADOS_MARCA: Record<EstadoPaso, string> = {
  hecho: "Marcaste este paso como hecho.",
  atorado: "Se guardó. Tu coach lo lee cuando prepare su siguiente sesión.",
  pendiente: "Este paso volvió a quedar sin marcar.",
};

// ---------------------------------------------------------------------------
// Repetir y ajustes (R-010.35 a R-010.38)
// ---------------------------------------------------------------------------

export const DIALOGO_REPETIR = {
  boton: "Repetir esta tarea",
  titulo: "¿Repetir esta tarea?",
  texto: "Se crea una copia con los mismos pasos, sin marcar. Si te atoraste en algún paso, ese paso y lo que escribiste llegan a la IA para proponerte ajustes. Tú decides cuáles usar.",
  cancelar: "Cancelar",
  confirmar: "Repetir",
  // Sin texto en la spec: esa llamada tarda.
  esperando: "Estamos preparando la copia.",
} as const;

export const COPIA_SIN_MARCAS = 'No marcaste ningún paso con "Me atoré aquí", así que la copia quedó igual.';
export const COPIA_SIN_AJUSTES = "La IA no propuso ajustes que se puedan usar, así que la copia quedó igual.";
// Solo estos dos valores: lo demás en la URL no dice nada. Habla de la copia sin marcar: router.refresh() conserva la URL, y
// después de la primera marca ya no sería cierto (R-010.35, R-010.37).
export function avisoDeCopia(copia: unknown, pasos: readonly { estado: EstadoPaso; atorados: readonly unknown[] }[]): string | null {
  if (pasos.some((p) => p.estado !== "pendiente" || p.atorados.length > 0)) return null;
  if (copia === "sin_marcas") return COPIA_SIN_MARCAS;
  return copia === "sin_ajustes" ? COPIA_SIN_AJUSTES : null;
}
export const ERROR_REPETIR = "No se pudieron preparar los ajustes, así que no se creó la copia. Tu tarea sigue igual. Puedes intentar otra vez.";

export const AJUSTES_PROPUESTOS = {
  titulo: "Ajustes propuestos",
  ayuda: "Esto es una propuesta de la IA. Tú decides. Tus pasos no cambian hasta que guardes.",
} as const;
export const textoPropuesta = (tipo: TipoAjuste, n: number) => (tipo === "cambiar" ? `Propuesta: cambiar el paso ${n}.` : `Propuesta: agregar un paso antes del paso ${n}.`);
export const textoMotivo = (motivo: string) => `Por qué: ${motivo}`;
export const CASILLA_AJUSTE = "Usar este ajuste";

export const DIALOGO_ELECCION = {
  boton: "Guardar lo que elegí",
  titulo: "¿Guardar tu elección?",
  texto: "Los ajustes que no elegiste se descartan. Esto no se puede deshacer.",
  cancelar: "Cancelar",
  confirmar: "Guardar",
} as const;
export const errorAjuste = (n: number) => `El ajuste del paso ${n} ya no se puede usar. Quítalo de tu elección y guarda otra vez. Tus pasos no cambiaron.`;
export const DEMASIADOS_PASOS = `Con esos ajustes la tarea tendría más de ${MAX_PASOS} pasos. Quita alguno de tu elección y guarda otra vez. Tus pasos no cambiaron.`;

// Sin texto en la spec.
export const textoPasoPropuesto = (accion: string) => `El paso diría: ${accion}`;
export const ELECCION_GUARDADA = "Se guardó tu elección. Ya puedes marcar tus pasos.";
export const YA_DECIDISTE = "Esta tarea ya no tiene ajustes por decidir.";

// Sin respuesta legible de la ruta (sin red).
export const ERROR_RED = "No se guardó el cambio. Revisa tu conexión e intenta de nuevo.";

// Sin texto en la spec.
export const SIN_CONSENTIMIENTO = "No tienes consentimiento vigente. No se guardó nada y no se envió nada a la IA.";
export const SIN_ACTIVAR = "Antes de esto necesitas terminar de activar tu cuenta.";
export const TAREA_YA_NO_DISPONIBLE = "Esta tarea ya no está en tu lista.";
