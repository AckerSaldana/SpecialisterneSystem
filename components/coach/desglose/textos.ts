// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Textos literales del coach en el desglose de tareas (spec 010, "Pantallas y textos"). La persona no descarga este
// archivo. Los que dicen "sin texto en la spec" siguen el mismo tono.
import type { TipoDiferencia } from "@/lib/desglose/diferencia";
import type { ProblemaPaso } from "@/lib/desglose/schema";
import { LIMITE_DIARIO_DESGLOSE, sinPuntoFinal, type EstadoPaso } from "@/lib/desglose/schema-cliente";

export const rutaTareas = (engagementId: string) => `/coach/engagements/${engagementId}/desgloses`;
export const rutaTarea = (engagementId: string, breakdownId: string) => `${rutaTareas(engagementId)}/${breakdownId}`;

// ---------------------------------------------------------------------------
// Ids para el foco
// ---------------------------------------------------------------------------

export const ID_ATORADOS = "lo-que-escribio";
export const ID_TITULO_TAREA = "esta-tarea";
export const ID_ARCHIVADA = "tarea-archivada";

// ---------------------------------------------------------------------------
// Panel "Antes de esta sesión" (R-010.30 a R-010.33). Sin número en ningún lado (R-010.31).
// ---------------------------------------------------------------------------

export const tituloAtorados = (nombre: string) => `Lo que escribió ${nombre} en sus tareas`;
export const ayudaAtorados = (nombre: string) => `Es texto literal de ${nombre}. La IA no lo interpreta y no cuenta como señal.`;
export const textoLoEscribio = (nombre: string, fecha: string) => `Lo escribió ${nombre} el ${fecha}.`;
export const textoSinEscribir = (nombre: string, fecha: string) => `${nombre} marcó este paso con "Me atoré aquí" el ${fecha} y no escribió más.`;
export const textoUbicacion = (tarea: string, paso: { numero: number; accion: string } | null) =>
  paso ? `Tarea: ${sinPuntoFinal(tarea)}. Paso ${paso.numero}: ${sinPuntoFinal(paso.accion)}.` : `Tarea: ${sinPuntoFinal(tarea)}.`;
export const textoHechoDespues = (fecha: string) => `Después lo marcó como hecho el ${fecha}.`;
export const vacioAtorados = (nombre: string) => `No hay nada nuevo de ${nombre} en sus tareas.`;

export const DIALOGO_REVISE = {
  boton: "Ya lo revisé",
  titulo: "¿Ya lo revisaste?",
  texto: "Sale de este panel y sigue en la tarea. Esto no se puede deshacer.",
  confirmar: "Ya lo revisé",
} as const;

// ---------------------------------------------------------------------------
// "Tareas de {nombre}"
// ---------------------------------------------------------------------------

// Título fijo para el <title>: así no hace falta otra consulta.
export const TITULO_PAGINA = "Tareas";
export const tituloTareas = (nombre: string) => `Tareas de ${nombre}`;
export const ayudaFormulario = (nombre: string) => `${nombre} ve estos pasos en cuanto se preparan. No pasan por una revisión previa. No escribas datos que ${nombre} no deba leer.`;

export const LIMITE_ALCANZADO = `Hoy ya pediste ${LIMITE_DIARIO_DESGLOSE} desgloses para este acompañamiento, que es el máximo por día.`;
export const perfilNoListo = (nombre: string) => `Todavía no se puede. El perfil de ${nombre} tiene que estar aprobado primero.`;
export const ERROR_PREPARAR = "No se pudieron preparar los pasos. Lo que escribiste sigue aquí. Puedes intentar otra vez.";
export const retiroDuranteLaLlamada = (nombre: string) => `${nombre} retiró su consentimiento. Los pasos no se guardaron.`;
export const DESCARTES = "Se quitaron notas de apoyo que no pasaron la revisión.";

export const textosFormulario = (nombre: string) =>
  ({
    // Sin texto en la spec: el campo de la persona, dicho para el coach.
    campoTarea: `¿Qué tarea va a hacer ${nombre}?`,
    ayudaTarea: ayudaFormulario(nombre),
    herramienta: "Herramienta (opcional)",
    plazo: "Plazo (opcional)",
    conQuien: "Con quién (opcional)",
    ayudaConQuien: "Escribe el puesto, no el nombre.",
    antesDelBoton: `Lo que escribas aquí llega al modelo de inteligencia artificial. Puedes pedir hasta ${LIMITE_DIARIO_DESGLOSE} desgloses al día para este acompañamiento.`,
    boton: "Preparar los pasos",
    esperando: "Estamos preparando los pasos.",
    errorRed: ERROR_PREPARAR,
  }) as const;

// Sin texto en la spec: lo que falta de la lista y del detalle, con el mismo tono.
export const textoVolverAcompanamiento = (nombre: string) => `Volver al acompañamiento de ${nombre}`;
export const textoVolverTareas = (nombre: string) => `Volver a las tareas de ${nombre}`;
export const TITULO_PEDIR = "Preparar los pasos de una tarea";
export const TITULO_LISTA = "Tareas guardadas";
export const vacioTareas = (nombre: string) => `${nombre} todavía no tiene tareas aquí.`;
export const textoPorDesglose = (tarea: string, fecha: string) => `${sinPuntoFinal(tarea)}. Creada el ${fecha}.`;
export const textoCreada = (fecha: string) => `Creada el ${fecha}.`;
export const textoQuienLaPidio = (laPidioLaPersona: boolean, nombre: string) => (laPidioLaPersona ? `La pidió ${nombre}.` : "La preparaste tú.");
export const textoArchivada = (nombre: string, fecha: string) => `Ya no está en la lista de ${nombre} desde el ${fecha}.`;

export const textoPaso = (n: number, accion: string) => `Paso ${n}: ${accion}`;
export const textoCriterio = (criterio: string) => `Termina cuando: ${criterio}`;
export const textoNota = (nota: string) => `Nota de apoyo: ${nota}`;
export const POR_QUE = "¿Por qué este paso?";
export const TITULO_MARCAS = "Lo que marcó";
export const sinMarcas = (nombre: string) => `${nombre} todavía no marca este paso.`;

const ESTADO_MARCA: Record<EstadoPaso, string> = { hecho: "Hecho", atorado: "Me atoré aquí", pendiente: "Deshizo la marca" };
export const textoMarca = (estado: EstadoPaso, fecha: string) => `${ESTADO_MARCA[estado]}, el ${fecha}.`;
export const textoRevisada = (quien: string, fecha: string) => `La revisó ${quien} el ${fecha}.`;

// R-010.29: el coach también puede quitarla. El diálogo de la persona habla de "tu lista".
export const dialogoArchivar = (nombre: string) =>
  ({
    boton: "Ya no la uso",
    titulo: `¿Quitar esta tarea de la lista de ${nombre}?`,
    texto: `Ya no aparece en la lista de ${nombre} y no se puede deshacer. Tú la sigues viendo.`,
    cancelar: "Cancelar",
    confirmar: "Quitar",
  }) as const;

// R-010.38: lo que propuso la IA al repetir y si {nombre} lo usó. El número de paso no se muestra: al decidir, los pasos cambian.
export const TITULO_AJUSTES = "Ajustes propuestos";
export const textoAjuste = (usada: boolean) => (usada ? "Propuesta de la IA: la usó." : "Propuesta de la IA: no la usó.");
// Sin texto en la spec.
export const ajusteSinDecidir = (nombre: string) => `Propuesta de la IA: ${nombre} todavía no decide.`;
export const textoPasoPropuesto = (accion: string) => `El paso diría: ${accion}`;
export const textoMotivo = (motivo: string) => `Por qué: ${motivo}`;

export const ERROR_RED = "No se guardó el cambio. Revisa tu conexión e intenta de nuevo.";

// ---------------------------------------------------------------------------
// Plantillas (R-010.39 a R-010.44)
// ---------------------------------------------------------------------------

export const RUTA_PLANTILLAS = "/coach/plantillas";
// hecho: guardada o archivada, para decir su resultado en la lista, igual que ?quitada=1 en la persona. No lleva datos.
export const rutaPlantillasTras = (hecho: "guardada" | "archivada") => `${RUTA_PLANTILLAS}?hecho=${hecho}`;
export const ID_RESULTADO_PLANTILLA = "resultado-plantilla";

// Guardar
export const ayudaGuardarPlantilla = (nombre: string) => `Revisa el texto. No debe quedar nada de ${nombre}. Las notas de apoyo no se guardan.`;
export const dialogoGuardarPlantilla = (nombre: string) =>
  ({
    boton: "Guardar como plantilla",
    titulo: "¿Guardar esta plantilla?",
    texto: `Los coaches de tu organización pueden usarla mientras ${nombre} mantenga su consentimiento. Si lo retira, deja de verse para todos y vuelve si lo da otra vez. Ya no se edita; para cambiarla, la archivas y guardas otra.`,
    cancelar: "Cancelar",
    confirmar: "Guardar plantilla",
  }) as const;
// "Acción" y "Termina cuando" no tienen texto en la spec.
export const CAMPOS_PLANTILLA = { puesto: "Puesto", titulo: "Título", tarea: "Tarea", accion: "Acción", criterio: "Termina cuando" } as const;
export const textoPasoPlantilla = (n: number) => `Paso ${n}`;
// Sin texto en la spec.
export const ERROR_PLANTILLA_INCOMPLETA = "Revisa lo que escribiste. Llena el puesto, el título, la tarea y cada paso.";

// R-010.40: la spec solo da el texto de bloqueo por un término. Este es el de un paso que no pasa validarPasos. Sin texto
// en la spec. Los últimos tres no deberían llegar: un término ya se revisó antes, y R-010.14 no corre aquí.
const PROBLEMA_DE_PASO: Record<ProblemaPaso, (n: number) => string> = {
  accion_multiple: (n) => `El paso ${n} tiene más de una acción.`,
  criterio_vago: (n) => `El criterio del paso ${n} no se puede comprobar.`,
  criterio_igual_a_accion: (n) => `El criterio del paso ${n} repite la acción.`,
  urgencia: (n) => `El paso ${n} tiene palabras de urgencia.`,
  entidad_ajena: (n) => `El paso ${n} nombra algo que no dicen el puesto, el título ni la tarea.`,
  texto_no_permitido: (n) => `El paso ${n} tiene un texto que no puede ir en una plantilla.`,
  inicio_no_concreto: (n) => `El paso ${n} no se puede guardar así.`,
  inicio_sin_apoyo: (n) => `El paso ${n} no se puede guardar así.`,
};
export const errorPasoPlantilla = (n: number, problema: ProblemaPaso) => `${PROBLEMA_DE_PASO[problema](n)} Corrígelo para guardar.`;

// R-010.40: una palabra con mayúscula en la tarea que no inicia oración y que no dicen el puesto ni el título. Puede ser el
// nombre de otra persona o una herramienta: el código no lo sabe, así que lo dice y no bloquea. Lo decide el coach.
export function palabrasConMayuscula(plantilla: { puesto: string; titulo: string; tarea: string }): string[] {
  const conocidas = new Set(`${plantilla.puesto} ${plantilla.titulo}`.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const halladas = [...plantilla.tarea.matchAll(/[\p{L}\p{N}]+/gu)].flatMap((m) => {
    if (!/^\p{Lu}/u.test(m[0])) return [];
    const antes = plantilla.tarea.slice(0, m.index).trimEnd();
    const iniciaOracion = antes === "" || /[.!?¿¡…]["'»”)]*$/u.test(antes);
    return iniciaOracion || conocidas.has(m[0].toLowerCase()) ? [] : [m[0]];
  });
  return [...new Set(halladas)];
}
// Sin texto en la spec antes de esta revisión.
export const avisoPalabrasConMayuscula = (palabras: readonly string[]) => `La tarea trae estas palabras con mayúscula: ${palabras.map((p) => `«${p}»`).join(", ")}. Si alguna es el nombre de una persona, quítala: esta plantilla les llega a otras personas.`;

// Lista
export const TITULO_PLANTILLAS = "Plantillas de tu organización";
export const VACIO_PLANTILLAS = "Todavía no hay plantillas.";
export const textoPlantilla = (puesto: string, titulo: string) => `${sinPuntoFinal(puesto)}: ${sinPuntoFinal(titulo)}.`;
export const DIALOGO_ARCHIVAR_PLANTILLA = {
  boton: "Archivar",
  titulo: "¿Archivar esta plantilla?",
  texto: "Ya no se puede aplicar. Los desgloses hechos con ella no cambian. Esto no se puede deshacer.",
  cancelar: "Cancelar",
  confirmar: "Archivar",
} as const;
// Sin texto en la spec.
export const AYUDA_PLANTILLAS = "Se aplican desde las tareas de cada persona. Para guardar una, abre una tarea.";
export const textoTareaPlantilla = (tarea: string) => `Tarea: ${sinPuntoFinal(tarea)}.`;
export const etiquetaArchivarPlantilla = (plantilla: string) => `Archivar ${plantilla}`;
export const PLANTILLA_GUARDADA = "Se guardó la plantilla.";
export const PLANTILLA_ARCHIVADA = "Se archivó la plantilla.";
export const PLANTILLA_YA_ARCHIVADA = "Esta plantilla ya está archivada.";

// Aplicar
export const TITULO_APLICAR = "Aplicar una plantilla";
export const ayudaAplicar = (nombre: string) => `La IA la adapta al perfil de ${nombre} y te muestra qué cambió.`;
// Sin texto en la spec.
export const ELEGIR_PLANTILLA = "Elige una plantilla.";
export const PLANTILLA_NO_DISPONIBLE = "Esta plantilla ya no está disponible. Elige otra.";
export const textosAplicar = (nombre: string) =>
  ({
    campo: TITULO_APLICAR,
    ayuda: ayudaAplicar(nombre),
    elegir: ELEGIR_PLANTILLA,
    herramienta: "Herramienta (opcional)",
    plazo: "Plazo (opcional)",
    conQuien: "Con quién (opcional)",
    ayudaConQuien: "Escribe el puesto, no el nombre.",
    antesDelBoton: `Lo que escribas aquí y la plantilla llegan al modelo de inteligencia artificial. ${nombre} ve los pasos en cuanto se preparan. Cuenta para los ${LIMITE_DIARIO_DESGLOSE} desgloses al día de este acompañamiento.`,
    boton: "Aplicar la plantilla",
    esperando: "Estamos preparando los pasos.",
  }) as const;

// Diferencia (R-010.43, R-010.44)
export const TITULO_DIFERENCIA = "Qué cambió respecto a la plantilla";
const ENTRADA_DIFERENCIA: Record<TipoDiferencia, (a: number | null, b: number | null) => string> = {
  // "Igual: paso {b}." escondería que cambió de número.
  igual: (a, b) => (a === b ? `Igual: paso ${b}.` : `Igual, en otro lugar: era el paso ${a}, ahora es el ${b}.`),
  ajustado: (a, b) => `Ajustado: era el paso ${a}, ahora es el ${b}.`,
  agregado: (_, b) => `Agregado: paso ${b}.`,
  quitado: (a) => `Quitado: era el paso ${a}.`,
};
export const textoEntradaDiferencia = ({ tipo, antes, ahora }: { tipo: TipoDiferencia; antes: number | null; ahora: number | null }) => ENTRADA_DIFERENCIA[tipo](antes, ahora);
export const TRAE_NOTA = "Trae una nota de apoyo.";
export const SIN_DIFERENCIA = "La IA dejó los mismos pasos de la plantilla, sin notas de apoyo.";
export const PLANTILLA_NO_LEGIBLE = "Esta tarea salió de una plantilla que ya no está disponible, así que no se puede mostrar qué cambió.";
// Sin texto en la spec: las dos versiones. El criterio usa textoCriterio.
export const textoPasoAntes = (accion: string) => `En la plantilla decía: ${accion}`;
export const textoPasoAhora = (accion: string) => `Ahora dice: ${accion}`;
