// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Revisión determinista de lo que propuso el modelo (función pura, sin red ni base).
//
// 1. Citas: cada evidencia.cita tiene que aparecer en la nota del coach. Se comparan
//    versiones normalizadas (minúsculas, sin acentos, espacios colapsados, comillas y
//    puntuación de los bordes recortadas). Además la cita normalizada debe tener al menos
//    8 caracteres y empezar y terminar en límite de palabra (no puede haber una letra o un
//    dígito pegado antes o después en la nota): así no pasan fragmentos como "gus" o
//    "usta trabaj". La que no cumple se quita y se anota en "descartados". Un cambio, señal
//    o relación que se queda sin evidencia se quita completo.
//    Las rutas de "descartados" se refieren a la respuesta ORIGINAL del modelo.
//
// 2. Dimensiones duplicadas: si quedan dos cambios para la misma dimensión, se conserva el
//    primero y los demás se anotan en "descartados" con motivo "dimension_duplicada"
//    (ruta del cambio, cita ""). Así applyApproval nunca sobrescribe un cambio con otro.
//
// 3. Banderas: términos no permitidos en resumen, descripcion y preguntas. No quitan nada;
//    solo avisan al coach. Las rutas de "banderas" se refieren al update YA LIMPIO (el que
//    ve el coach).
//    En cambios[i].resumen, que llega a la persona, también busca condiciones, términos clínicos, términos internos,
//    citas copiadas y pedazos de la nota (R-004.59). La ruta de decisión repite esa revisión con el texto final. "citasPrevias"
//    son las de las observaciones previas que recibió el modelo (R-008.6): solo agregan banderas.
import type { Bandera, CambioDimension, Descartado, DimensionId, ProfileUpdate } from "@/lib/profile/schema";
import { buscarTerminos, citaEnNota, MIN_CITA, normalizar, revisarTextoPersona } from "@/lib/profile/terminos";

export { buscarTerminos, citaEnNota, MIN_CITA, normalizar };

// ---------------------------------------------------------------------------
// sanitizeUpdate
// ---------------------------------------------------------------------------

export type ResultadoSanitizado = {
  update: ProfileUpdate;
  descartados: Descartado[];
  banderas: Bandera[];
};

export function sanitizeUpdate(update: ProfileUpdate, nota: string, citasPrevias: string[] = []): ResultadoSanitizado {
  const notaNormal = normalizar(nota);
  const descartados: Descartado[] = [];

  // Deja solo las citas que están en la nota. "ruta" es la ruta del elemento en la respuesta original.
  function filtrarEvidencia<T extends { evidencia: { cita: string }[] }>(item: T, ruta: string): T | null {
    const evidencia = item.evidencia.filter((e, i) => {
      const esta = citaEnNota(normalizar(e.cita), notaNormal);
      if (!esta) descartados.push({ ruta: `${ruta}.evidencia[${i}]`, cita: e.cita, motivo: "cita_no_encontrada" });
      return esta;
    });
    // Sin evidencia, el elemento no se propone.
    return evidencia.length > 0 ? { ...item, evidencia } : null;
  }

  // Aplica filtrarEvidencia a una lista y quita los elementos que quedaron en null.
  function filtrarLista<T extends { evidencia: { cita: string }[] }>(lista: T[], nombre: string): T[] {
    return lista
      .map((item, i) => filtrarEvidencia(item, `${nombre}[${i}]`))
      .filter((item): item is T => item !== null);
  }

  // Cambios: primero se filtran las citas; luego se conserva solo el primero por dimensión.
  const dimensionesVistas = new Set<DimensionId>();
  const cambios: CambioDimension[] = [];
  update.cambios.forEach((c, i) => {
    const conEvidencia = filtrarEvidencia(c, `cambios[${i}]`);
    if (!conEvidencia) return;
    if (dimensionesVistas.has(conEvidencia.dimension)) {
      descartados.push({ ruta: `cambios[${i}]`, cita: "", motivo: "dimension_duplicada" });
      return;
    }
    dimensionesVistas.add(conEvidencia.dimension);
    cambios.push(conEvidencia);
  });

  const limpio: ProfileUpdate = {
    cambios,
    senales: filtrarLista(update.senales, "senales"),
    relacionesConPerfilPrevio: filtrarLista(update.relacionesConPerfilPrevio, "relacionesConPerfilPrevio"),
    preguntasParaSiguienteSesion: [...update.preguntasParaSiguienteSesion],
  };

  // Banderas sobre el texto que escribió el modelo (no sobre las citas, que son del coach).
  const banderas: Bandera[] = [];
  const revisar = (texto: string, ruta: string) => {
    for (const termino of buscarTerminos(texto)) banderas.push({ ruta, termino, motivo: "termino_no_permitido" });
  };
  const citas = [
    ...limpio.cambios.flatMap((c) => c.evidencia),
    ...limpio.senales.flatMap((s) => s.evidencia),
    ...limpio.relacionesConPerfilPrevio.flatMap((r) => r.evidencia),
  ]
    .map((e) => e.cita)
    .concat(citasPrevias);
  limpio.cambios.forEach((c, i) => {
    for (const { termino, motivo } of revisarTextoPersona(c.resumen, citas, [nota])) {
      banderas.push({ ruta: `cambios[${i}].resumen`, termino, motivo });
    }
  });
  limpio.senales.forEach((s, i) => revisar(s.descripcion, `senales[${i}].descripcion`));
  limpio.relacionesConPerfilPrevio.forEach((r, i) => revisar(r.descripcion, `relacionesConPerfilPrevio[${i}].descripcion`));
  limpio.preguntasParaSiguienteSesion.forEach((p, i) => revisar(p, `preguntasParaSiguienteSesion[${i}]`));

  return { update: limpio, descartados, banderas };
}
