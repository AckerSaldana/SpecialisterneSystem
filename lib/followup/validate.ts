// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Revisión determinista de lo que propuso el modelo en una sesión de seguimiento (función pura,
// sin red ni base). Reutiliza sanitizeUpdate para cambios, señales, relaciones y preguntas, y le
// agrega:
//   - Avance (R-004.7, R-004.8, R-004.54): el itemRef tiene que estar en el índice; las citas, en
//     la nota; un segundo avance para el mismo punto se quita.
//   - Contexto (R-004.20): citas en la nota, igual que los demás.
//   - Siguiente paso (R-004.24): exactamente un destino, un ítem del índice o una ficha verificada.
//   - Bandera de participación (R-004.33): una señal o un avance "Necesita ajuste" cuya única
//     evidencia es que la persona habla o participa poco. No bloquea; avisa al coach.
// Igual que en sanitizeUpdate, las rutas de "descartados" son sobre la respuesta ORIGINAL del modelo
// y las de "banderas", sobre la propuesta YA LIMPIA. "citasPrevias" (R-008.6) solo agrega banderas.
import type { AvancePropuesto, EntradaIndicePlan, FollowupUpdate, NotaContextoPropuesta, SiguientePasoPropuesto } from "@/lib/followup/schema";
import type { Bandera, Descartado } from "@/lib/profile/schema";
import { buscarTerminos, citaEnNota, normalizar } from "@/lib/profile/terminos";
import { sanitizeUpdate } from "@/lib/profile/validate";

// Lista fija de frases sobre hablar o participar poco (R-004.33). Se buscan sobre el texto
// normalizado: sin acentos y en minúsculas.
export const FRASES_PARTICIPACION: readonly RegExp[] = [
  /\b(casi )?no (hablo|habla|hablaba|participo|participa|participaba|dijo nada|dice nada|opino|opina|comento|comenta|intervino|interviene)\b/,
  /\b(habla|hablo|hablaba|hablar|participa|participo|participaba|participar|interviene|intervino) (muy |tan )?poco\b/,
  /\bpoc[oa] (expresiv[oa]|participativ[oa]|comunicativ[oa]|habladora?|participacion)\b/,
  /\b(callad[oa]|reservad[oa]|silencios[oa])\b/,
  /\bsin (hablar|participar|decir nada|opinar)\b/,
  /\bno (levanta|levanto) la mano\b/,
];

// true si hay evidencia y toda es sobre hablar o participar poco.
export function soloParticipacion(citas: string[]): boolean {
  return citas.length > 0 && citas.every((c) => FRASES_PARTICIPACION.some((p) => p.test(normalizar(c))));
}

export type ResultadoSeguimiento = {
  update: FollowupUpdate;
  descartados: Descartado[];
  banderas: Bandera[];
};

export function sanitizeFollowup(
  update: FollowupUpdate,
  nota: string,
  {
    indicePlan,
    fichasVerificadas,
    citasPrevias = [],
  }: { indicePlan: EntradaIndicePlan[]; fichasVerificadas: string[]; citasPrevias?: string[] },
): ResultadoSeguimiento {
  const base = sanitizeUpdate(
    {
      cambios: update.cambios,
      senales: update.senales,
      relacionesConPerfilPrevio: update.relacionesConPerfilPrevio,
      preguntasParaSiguienteSesion: update.preguntasParaSiguienteSesion,
    },
    nota,
    citasPrevias,
  );
  const descartados = [...base.descartados];
  const notaNormal = normalizar(nota);
  const refs = new Set(indicePlan.map((e) => e.ref));
  const fichas = new Set(fichasVerificadas);

  // Deja solo las citas que están en la nota; sin citas, el elemento no se propone.
  function conEvidencia<T extends { evidencia: { cita: string }[] }>(item: T, ruta: string): T | null {
    const evidencia = item.evidencia.filter((e, i) => {
      const esta = citaEnNota(normalizar(e.cita), notaNormal);
      if (!esta) descartados.push({ ruta: `${ruta}.evidencia[${i}]`, cita: e.cita, motivo: "cita_no_encontrada" });
      return esta;
    });
    return evidencia.length > 0 ? { ...item, evidencia } : null;
  }

  const refsVistas = new Set<string>();
  const avance: AvancePropuesto[] = [];
  update.avance.forEach((a, i) => {
    const ruta = `avance[${i}]`;
    if (!refs.has(a.itemRef)) {
      descartados.push({ ruta, cita: "", motivo: "item_no_existe" });
      return;
    }
    const limpio = conEvidencia(a, ruta);
    if (!limpio) return;
    if (refsVistas.has(a.itemRef)) {
      descartados.push({ ruta, cita: "", motivo: "avance_duplicado" });
      return;
    }
    refsVistas.add(a.itemRef);
    avance.push(limpio);
  });

  const contexto = update.contexto
    .map((c, i) => conEvidencia(c, `contexto[${i}]`))
    .filter((c): c is NotaContextoPropuesta => c !== null);

  let siguientePaso: SiguientePasoPropuesto | null = null;
  if (update.siguientePaso) {
    const paso = update.siguientePaso;
    const ruta = "siguientePaso";
    if ((paso.itemRef === null) === (paso.fichaId === null)) {
      descartados.push({ ruta, cita: "", motivo: "siguiente_paso_sin_destino" });
    } else if (paso.itemRef !== null && !refs.has(paso.itemRef)) {
      descartados.push({ ruta, cita: "", motivo: "item_no_existe" });
    } else if (paso.fichaId !== null && !fichas.has(paso.fichaId)) {
      descartados.push({ ruta, cita: "", motivo: "ficha_no_valida" });
    } else {
      siguientePaso = conEvidencia(paso, ruta);
    }
  }

  const limpio: FollowupUpdate = { ...base.update, avance, contexto, siguientePaso };

  const banderas = [...base.banderas];
  const revisar = (texto: string, ruta: string) => {
    for (const termino of buscarTerminos(texto)) banderas.push({ ruta, termino, motivo: "termino_no_permitido" });
  };
  avance.forEach((a, i) => revisar(a.resumen, `avance[${i}].resumen`));
  contexto.forEach((c, i) => revisar(c.texto, `contexto[${i}].texto`));
  if (siguientePaso) revisar(siguientePaso.texto, "siguientePaso.texto");

  limpio.senales.forEach((s, i) => {
    if (soloParticipacion(s.evidencia.map((e) => e.cita))) {
      banderas.push({ ruta: `senales[${i}]`, termino: "", motivo: "solo_participacion" });
    }
  });
  avance.forEach((a, i) => {
    if (a.estado === "necesita_ajuste" && soloParticipacion(a.evidencia.map((e) => e.cita))) {
      banderas.push({ ruta: `avance[${i}]`, termino: "", motivo: "solo_participacion" });
    }
  });

  return { update: limpio, descartados, banderas };
}
