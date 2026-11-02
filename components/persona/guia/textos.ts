// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Textos literales e ids de las pantallas de la persona de "Cómo trabajar conmigo" (spec 009, "Pantallas y
// textos"). Corre en el navegador de la persona: solo importa lib/guia/schema-cliente, sin lib/profile/schema ni
// lib/trayectoria (C-09). Los que dicen "sin texto en la spec" siguen el mismo tono.
import { MAX_LINEAS_INCLUIDAS, MAX_TEXTO_LINEA, TITULO_GUIA, type LineaGuiaVista } from "@/lib/guia/schema-cliente";

export const RUTA_GUIA = "/persona/como-trabajar-conmigo";
export const rutaVistaPrevia = (id: string) => `${RUTA_GUIA}/vista-previa/${id}`;
export const rutaHoja = (id: string) => `${RUTA_GUIA}/hoja/${id}`;

// ---------------------------------------------------------------------------
// Ids para el foco
// ---------------------------------------------------------------------------

export const ID_TITULO_BORRADOR = "tu-borrador";
export const ID_TITULO_VERSIONES = "tus-versiones";
export const ID_TITULO_PEDIR = "pedir-borrador";
export const idLinea = (lineaId: string) => `linea-${lineaId}`;
export const idAgregar = (seccion: string) => `agregar-${seccion}`;
export const idVersion = (guiaId: string) => `version-${guiaId}`;

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export const TITULO = TITULO_GUIA;
export const INTRO = "Es una hoja para tu líder directo. Dice qué te ayuda a hacer bien tu trabajo. No habla de tu salud ni de un diagnóstico. Tú decides qué dice y si la compartes.";
export const SIN_BORRADOR =
  "Para escribir el borrador, la IA lee tu perfil y tu plan, también los puntos de tu plan que solo ve tu coach. No lee las notas de tu coach. Tú lo lees primero. Tu coach no ve el borrador.";
export const LEER_AVISO = "Leer el aviso de privacidad";
export const PEDIR = "Pedir un borrador";
export const ESPERANDO = "Escribiendo tu borrador. Esto puede tardar unos segundos.";
// Sin texto en la spec: el mismo de /persona.
export const SIN_ACOMPANAMIENTO = "Todavía no tienes un acompañamiento activo. Tu coach te avisa cuando empiece.";

// ---------------------------------------------------------------------------
// Borrador
// ---------------------------------------------------------------------------

// Sin texto en la spec: es el destino del foco al llegar un borrador.
export const TITULO_BORRADOR = "Tu borrador";
export const textoOrigen = (pedidoPorMi: boolean, fecha: string) => (pedidoPorMi ? `Lo pediste tú el ${fecha}.` : `Lo pidió tu coach el ${fecha}. Tu coach no puede leerlo.`);
export const textoDescartes = (n: number) =>
  n === 1
    ? "La IA escribió 1 línea más que quitamos porque no cumplía las reglas de esta hoja."
    : `La IA escribió ${n} líneas más que quitamos porque no cumplían las reglas de esta hoja.`;
export const INSUMOS_CAMBIARON = "Tu perfil o tu plan cambiaron después de este borrador. Puedes seguir con él, o descartarlo y pedir otro.";

export const CAMPO_NOMBRE = "Nombre que se muestra en la hoja";

export const BOTONES_LINEA = {
  incluir: "Incluir",
  editar: "Editar",
  quitar: "Quitar",
  volverAIncluir: "Volver a incluir",
  volverAlTextoIa: "Volver al texto de la IA",
  // Sin texto en la spec: el botón que abre el diálogo de borrar.
  borrar: "Borrar",
} as const;

// Lo que cada botón le dice a un lector de pantalla: su texto y de qué línea es.
export const etiquetaBoton = (boton: string, texto: string) => `${boton}: ${texto}`;

export const ESTADO_LINEA: Record<LineaGuiaVista["estado"], string> = {
  pendiente: "",
  incluida: "Incluida.",
  editada: "La editaste.",
  quitada: "La quitaste.",
  propia: "La escribiste tú.",
};

export const SECCION_VACIA = "La IA no propuso nada aquí. Puedes escribir una línea tuya.";
export const AGREGAR = "Agregar una línea mía";
export const AYUDA_AGREGAR = `Hasta ${MAX_TEXTO_LINEA} caracteres.`;

// Sin texto en la spec: el formulario de una línea y sus resultados.
export const FORMULARIO_LINEA = {
  etiquetaNueva: "Tu línea",
  etiquetaEditar: "Tu texto para esta línea",
  guardar: "Guardar línea",
  cancelar: "Cancelar",
  vacia: "Escribe algo o cancela.",
  // Una cosa a la vez: mientras hay un formulario abierto, lo demás espera.
  unaALaVez: "Cuando guardes o canceles, los demás botones vuelven a funcionar.",
} as const;

export const BORRAR_LINEA = {
  titulo: "¿Borrar esta línea?",
  texto: "Se borra y no se puede recuperar.",
  cancelar: "Cancelar",
  confirmar: "Borrar línea",
} as const;

// También son los mensajes de los 400 de "Listo" y del tope (R-009.20, R-009.28): lib/guia/acciones.ts los usa.
export const TEXTO_TOPE = `Esta hoja tiene lugar para ${MAX_LINEAS_INCLUIDAS} líneas. Quita una para agregar otra.`;
export const textoFaltaDecidir = (n: number) => `Falta decidir ${n} ${n === 1 ? "línea" : "líneas"}.`;
export const TEXTO_SIN_LINEAS = "Incluye o escribe al menos una línea.";

export const VER_VISTA_PREVIA = "Ver cómo la recibiría tu líder";
export const LISTO = "Listo para compartir";
export const DESCARTAR = "Descartar este borrador";

// Sin texto en la spec: "Listo" congela el nombre guardado, no el que está en el campo.
export const NOMBRE_SIN_GUARDAR = "Guarda el nombre o déjalo como estaba antes de marcarla como lista.";
export const GUARDAR_NOMBRE = "Guardar nombre";
export const NOMBRE_VACIO = "Escribe el nombre que quieres que se muestre.";

type LineaParaDecidir = Pick<LineaGuiaVista, "estado" | "cambio">;

const EN_LA_HOJA: readonly string[] = ["incluida", "editada", "propia"];

export const lineasSinDecidir = (lineas: LineaParaDecidir[]) => lineas.filter((l) => l.estado === "pendiente" || l.cambio?.decision === "pendiente").length;
export const lineasEnLaHoja = (lineas: LineaParaDecidir[]) => lineas.filter((l) => EN_LA_HOJA.includes(l.estado)).length;

// R-009.28: por qué todavía no se puede marcar lista, o null si ya se puede. La ruta repite estas revisiones.
export function razonNoLista(lineas: LineaParaDecidir[]): string | null {
  const faltan = lineasSinDecidir(lineas);
  if (faltan > 0) return textoFaltaDecidir(faltan);
  const enLaHoja = lineasEnLaHoja(lineas);
  if (enLaHoja === 0) return TEXTO_SIN_LINEAS;
  return enLaHoja > MAX_LINEAS_INCLUIDAS ? TEXTO_TOPE : null;
}

export const DIALOGO_LISTO = {
  titulo: "¿Marcar como lista para compartir?",
  texto: (n: number) =>
    `Se crea la versión ${n}. Tu coach la va a poder leer, junto con lo que cambiaste de la propuesta de la IA, incluido el texto de las líneas de la IA que quitaste. No ve las líneas tuyas que borraste. La app no se la manda a nadie: tú decides si la compartes con tu líder y cómo.`,
  anteriores: "Las versiones anteriores siguen visibles para tu coach hasta que las retires.",
  cancelar: "Cancelar",
  confirmar: "Sí, está lista",
};

export const DIALOGO_DESCARTAR = {
  titulo: "¿Descartar este borrador?",
  texto: "Ya no vas a poder verlo. Tu coach nunca lo vio.",
  cancelar: "Cancelar",
  confirmar: "Descartar",
} as const;

// ---------------------------------------------------------------------------
// Versiones
// ---------------------------------------------------------------------------

// Sin texto en la spec: el título de la lista.
export const TITULO_VERSIONES = "Tus versiones";
export const textoVersionLista = (n: number, fecha: string) => `Versión ${n}, lista desde el ${fecha}.`;
export const textoVersionRetirada = (n: number, fecha: string) => `Versión ${n}, retirada el ${fecha}.`;
export const VER_E_IMPRIMIR = "Ver e imprimir";
export const RETIRAR = "Retirar";
export const HACER_CAMBIOS = "Hacer cambios";
export const AYUDA_HACER_CAMBIOS = "Crea un borrador a partir de tu última versión. No usa la IA.";

export const DIALOGO_RETIRAR = {
  titulo: (n: number) => `¿Retirar la versión ${n}?`,
  texto: "Tu coach deja de verla. No recibe ningún aviso, pero puede notar que ya no está. Esto no se puede deshacer. Si ya la imprimiste o se la mandaste a alguien, esas copias no se pueden recuperar.",
  otraLista: (m: number) => `La versión ${m} sigue lista y tu coach la sigue viendo. Si tampoco quieres que la vea, retírala también.`,
  cancelar: "Cancelar",
  confirmar: "Retirar versión",
};

// Sin texto en la spec: los resultados de cada acción (R-009.59, role="status").
export const RESULTADOS = {
  pedido: "Ya está tu borrador. Lo puedes revisar línea por línea.",
  agregada: "Se agregó tu línea.",
  borrada: "Se borró la línea.",
  nombre: "Se guardó el nombre.",
  lista: (n: number) => `La versión ${n} ya está lista.`,
  descartado: "Se descartó el borrador.",
  // Sin texto en la spec: el resultado de "Dejar todo como estaba".
  dejado: "Tu hoja sigue como estaba.",
  retirada: (n: number) => `Se retiró la versión ${n}.`,
  copiada: "Se creó un borrador a partir de tu última versión.",
};

// Sin respuesta legible de la ruta (sin red).
export const ERROR_RED = "No se guardó el cambio. Revisa tu conexión e intenta de nuevo.";
export const ERROR_RED_PEDIR = "No se pudo pedir el borrador. Revisa tu conexión e intenta de nuevo.";

// También son mensajes de los 409 al pedir: lib/guia/generar.ts los usa.
export const YA_HAY_BORRADOR = "Ya tienes un borrador abierto. Termínalo o descártalo para pedir otro.";
// Sin texto en la spec (R-009.18): apareció una versión mientras respondía el modelo.
export const HOJA_CAMBIO = "Tu hoja cambió mientras se escribía el borrador. El borrador no se guardó. Revisa tu última versión y vuelve a pedirlo si lo necesitas.";

// Con estos 409, lo que pidió ya no está en pantalla después de refrescar: el botón se va, y con él su mensaje. Devuelve
// a dónde va el foco, o null si el botón se queda y el mensaje se puede mostrar junto a él (R-009.59).
export function idFocoTras409(error: string): string | null {
  if (error === YA_HAY_BORRADOR) return ID_TITULO_BORRADOR;
  if (error === HOJA_CAMBIO) return ID_TITULO_VERSIONES;
  return null;
}

// ---------------------------------------------------------------------------
// Regeneración (R-009.46 a R-009.50)
// ---------------------------------------------------------------------------

export const AVISO_CAMBIOS = "Tu perfil o tu plan cambiaron. Tu hoja sigue igual. Si quieres, la IA puede proponer cambios y tú decides cada uno.";
export const VER_QUE_CAMBIARIA = "Ver qué cambiaría";
// También es el mensaje del 409: lib/guia/generar.ts lo usa.
export const SIN_CAMBIOS = "Tu perfil y tu plan no traen nada nuevo para esta hoja.";

export const CAMBIO_LINEA = {
  nueva: "La IA propone agregar:",
  antesQuitada: "Antes quitaste una línea sobre esto. Tú decides.",
  ahoraDice: "Ahora dice:",
  tuTexto: "Tu texto:",
  iaPropone: "La IA propone:",
  sale: "Esta línea viene de algo que ya no está en tu perfil o tu plan. La IA propone quitarla:",
  aceptar: "Aceptar",
  rechazar: "Rechazar",
} as const;

export const DEJAR_COMO_ESTABA = "Dejar todo como estaba";
export const DIALOGO_DEJAR = {
  titulo: "¿Dejar todo como estaba?",
  texto: "Se descarta esta propuesta. Tu última versión no cambia.",
  cancelar: "Cancelar",
  confirmar: "Dejar como estaba",
} as const;

// ---------------------------------------------------------------------------
// Vista previa
// ---------------------------------------------------------------------------

export const VISTA_PREVIA = {
  titulo: "Vista previa",
  arriba: "Así la recibiría tu líder. Las líneas que no has decidido y las que quitaste no aparecen.",
  alImprimir: "Esta es una vista previa. Para imprimir, primero márcala como lista.",
  volver: "Volver al borrador",
};

// ---------------------------------------------------------------------------
// Hoja para el líder: solo en pantalla, fuera de la hoja
// ---------------------------------------------------------------------------

export const HOJA = {
  imprimir: "Imprimir o guardar como PDF",
  ayuda: 'En la ventana de impresión, elige "Guardar como PDF" si quieres un archivo. Si no quieres que salga la dirección de la página, quita "Encabezados y pies de página".',
  aviso: "La app no le manda esta hoja a nadie. Tú decides con quién la compartes. Si después retiras esta versión, las copias que ya compartiste no se pueden recuperar.",
  // Sin texto en la spec.
  volver: `Volver a ${TITULO_GUIA}`,
};
