// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Revisión determinista de lo que escribió el modelo para una guía (spec 009). Función pura, sin red ni
// base. Ningún coach revisa estas líneas antes que la persona, así que lo que no pasa se descarta (D-070):
//   1. Orígenes (R-009.6): se quitan los O-nn que no están en el índice; sin ninguno válido, la línea se va.
//   2. Largo (R-009.5) y texto (R-009.11, con revisarLineaIa).
//   3. Hablar poco (R-009.60, C-13): en cuesta_y_pido no es algo que cueste, tampoco con la forma "Me cuesta (...);
//      pido (...)" que el prompt le pide al modelo. En las demás secciones no aplica.
//   4. Repetidas, y las que sobran por sección (R-009.5). Van al final, para contar solo líneas que sí pasan.
// De lo descartado solo quedan conteos por motivo, nunca el texto: la persona lee toda su fila y un
// descarte podría traer una cita de las notas (R-009.12).
import { soloParticipacion } from "@/lib/followup/validate";
import {
  MAX_LINEAS_IA_POR_SECCION,
  MAX_TEXTO_LINEA,
  LineaGuia,
  type DescartesGuia,
  type GuiaPropuesta,
  type MotivoDescarte,
  type OrigenLinea,
  type SeccionGuia,
} from "@/lib/guia/schema";
import { revisarLineaIa } from "@/lib/guia/terminos";
import { normalizar } from "@/lib/profile/terminos";

export type ResultadoGuia = { lineas: LineaGuia[]; descartes: DescartesGuia };

// Lo que no reconoce FRASES_PARTICIPACION, porque en seguimiento son citas de una nota y aquí es la voz de ella: que le
// cueste o le dé pena hablar. Es una lista propia para no cambiar las banderas de seguimiento (R-009.60, C-13). Se busca
// sobre el texto normalizado, con hasta tres palabras en medio: "me cuesta mucho trabajo participar".
const LE_CUESTA = String.raw`(?:cuesta|cuestan|(?:da|dan)(?: \w+){0,3} (?:pena|verguenza|miedo|nervios)|(?:es|resulta) dificil)`;
const PARTICIPAR = String.raw`(?:hablar|participar|intervenir|opinar|expresarme|expresar|comentar|tomar la palabra|levantar la mano|dar mi opinion)`;
const FRASES_LE_CUESTA_PARTICIPAR: readonly RegExp[] = [
  new RegExp(String.raw`\b${LE_CUESTA}(?: \w+){0,3} ${PARTICIPAR}\b`),
  new RegExp(String.raw`\b${PARTICIPAR}(?: \w+){0,4} me ${LE_CUESTA}\b`),
];

// R-009.60: lo que se descarta en cuesta_y_pido. No aplica a las demás secciones ni a lo que escribe la persona.
export function soloParticipacionGuia(texto: string): boolean {
  const normal = normalizar(texto);
  return soloParticipacion([texto]) || FRASES_LE_CUESTA_PARTICIPAR.some((p) => p.test(normal));
}

export function sanitizeGuia(
  propuesta: GuiaPropuesta,
  {
    indice,
    citas,
    nuevoId = () => crypto.randomUUID(),
  }: { indice: ReadonlyMap<string, OrigenLinea>; citas: string[]; nuevoId?: () => string },
): ResultadoGuia {
  const descartes: DescartesGuia = {};
  const descartar = (motivo: MotivoDescarte) => {
    descartes[motivo] = (descartes[motivo] ?? 0) + 1;
  };

  const lineas: LineaGuia[] = [];
  const vistas = new Set<string>();
  const porSeccion = new Map<SeccionGuia, number>();

  for (const propuestaLinea of propuesta.lineas) {
    const texto = propuestaLinea.texto.trim();

    if (propuestaLinea.origenes.length === 0) {
      descartar("sin_origen");
      continue;
    }
    // El mismo O-nn dos veces no es un error, solo se junta.
    const validos = [...new Set(propuestaLinea.origenes.map((r) => r.trim()))].flatMap((r) => indice.get(r) ?? []);
    if (validos.length === 0) {
      descartar("origen_no_existe");
      continue;
    }

    if (texto.length > MAX_TEXTO_LINEA) {
      descartar("texto_largo");
      continue;
    }
    if (texto === "" || revisarLineaIa(texto, citas).length > 0) {
      descartar("texto_no_permitido");
      continue;
    }
    if (propuestaLinea.seccion === "cuesta_y_pido" && soloParticipacionGuia(texto)) {
      descartar("solo_participacion");
      continue;
    }

    const normal = normalizar(texto);
    if (vistas.has(normal)) {
      descartar("repetida");
      continue;
    }
    const enSeccion = porSeccion.get(propuestaLinea.seccion) ?? 0;
    if (enSeccion >= MAX_LINEAS_IA_POR_SECCION) {
      descartar("sobra_en_seccion");
      continue;
    }
    vistas.add(normal);
    porSeccion.set(propuestaLinea.seccion, enSeccion + 1);

    lineas.push(
      LineaGuia.parse({
        id: nuevoId(),
        seccion: propuestaLinea.seccion,
        texto,
        // R-009.20: toda línea de la IA empieza sin decidir.
        estado: "pendiente",
        textoIa: texto,
        origenes: validos,
        orden: enSeccion,
        lineaAnteriorId: null,
        cambio: null,
      }),
    );
  }

  return { lineas, descartes };
}
