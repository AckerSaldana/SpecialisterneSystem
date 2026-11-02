// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// La hoja para el líder y el historial del coach (spec 009, R-009.27, R-009.29, R-009.36, R-009.42).
// Funciones puras, sin red ni base. Importa solo de schema-cliente, sin lib/profile/schema (C-09).
//
// armarDocumento es la única que arma la hoja: la vista previa y "Listo" usan la misma, así que la persona
// ve exactamente lo que recibiría el líder. Una línea quitada no puede llegar a la hoja porque no se copia.
import { DocumentoGuia, SECCIONES_GUIA, type LineaGuiaVista } from "@/lib/guia/schema-cliente";

// Lo que hace falta de una línea. LineaGuia y LineaGuiaVista lo cumplen.
type LineaParaDocumento = Pick<LineaGuiaVista, "seccion" | "texto" | "estado" | "orden" | "cambio">;
type LineaParaHistorial = Pick<LineaGuiaVista, "seccion" | "texto" | "estado" | "textoIa" | "orden">;

const ESTADOS_EN_LA_HOJA: readonly string[] = ["incluida", "editada", "propia"];

const porOrden = <L extends { orden: number }>(a: L, b: L) => a.orden - b.orden;

export function armarDocumento(lineas: LineaParaDocumento[], nombre: string): DocumentoGuia {
  const entran = lineas.filter((l) => ESTADOS_EN_LA_HOJA.includes(l.estado) && l.cambio?.decision !== "pendiente");
  return DocumentoGuia.parse({
    nombre: nombre.trim(),
    // R-009.41: solo las secciones con líneas.
    secciones: SECCIONES_GUIA.flatMap(({ id }) => {
      const deSeccion = entran.filter((l) => l.seccion === id).sort(porOrden);
      return deSeccion.length ? [{ id, lineas: deSeccion.map((l) => l.texto) }] : [];
    }),
  });
}

export type CambiosDeGuia = {
  quitadas: string[];
  editadas: { textoIa: string; texto: string }[];
  agregadas: string[];
  sinCambios: number;
};

// R-009.36: el resultado final contra la propuesta de la IA. Se calcula con código. Las líneas propias
// borradas y las ediciones intermedias no están porque no se guardan (R-009.21, R-009.23).
export function cambiosDeGuia(lineas: LineaParaHistorial[]): CambiosDeGuia {
  const cambios: CambiosDeGuia = { quitadas: [], editadas: [], agregadas: [], sinCambios: 0 };
  for (const { id } of SECCIONES_GUIA) {
    for (const l of lineas.filter((x) => x.seccion === id).sort(porOrden)) {
      if (l.estado === "quitada") cambios.quitadas.push(l.textoIa ?? l.texto);
      else if (l.estado === "editada") cambios.editadas.push({ textoIa: l.textoIa ?? l.texto, texto: l.texto });
      else if (l.estado === "propia") cambios.agregadas.push(l.texto);
      else if (l.estado === "incluida") cambios.sinCambios += 1;
    }
  }
  return cambios;
}
