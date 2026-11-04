// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Concordancia entre observadores (spec 011, R-007.36). Funciones puras, sin red ni base, sobre las salidas
// ya limpias de cada observación. Si una descripción elige una versión o le da más peso a un cargo no lo
// revisa el código: lo juzga quien lee la tabla de relaciones (R-011.17).
import { normalizar } from "@/lib/profile/terminos";
import type { DimensionId, Perfil, ProfileUpdate } from "@/lib/profile/schema";

export type SalidaObservacion = {
  observador: string;
  nota: string;
  update: Pick<ProfileUpdate, "cambios" | "senales" | "relacionesConPerfilPrevio">;
};

export type FraseEsperada = { observador: string; fragmento: string };
export type ContradiccionEsperada = { dimension: DimensionId; nueva: FraseEsperada; previa: FraseEsperada };
export type CoincidenciaEsperada = { dimension: DimensionId; observadores: string[] };

// Una cita puede tomar otra parte de la misma oración que el fragmento, y eso sigue siendo la misma frase: se acepta
// si se encima con la oración donde está el fragmento, dentro de la nota de su observador.
function citaEnLaFrase(cita: string, fragmento: string, nota: string): boolean {
  const n = normalizar(nota);
  const c = normalizar(cita);
  const f = normalizar(fragmento);
  const inicioCita = n.indexOf(c);
  const inicioFragmento = n.indexOf(f);
  if (inicioCita < 0 || inicioFragmento < 0) return false;
  let inicio = 0;
  for (const fin of n.matchAll(/[.!?](?:\s|$)/g)) {
    const corte = fin.index + fin[0].length;
    if (corte > inicioFragmento) {
      return inicioCita < Math.max(corte, inicioFragmento + f.length) && inicioCita + c.length > inicio;
    }
    inicio = corte;
  }
  return inicioCita + c.length > inicio;
}

// R-007.36, CA-007.18: "retroalimentacion: 2 de 3 (fortaleza 2)".
export function conteoPorDimension(salidas: SalidaObservacion[]): string[] {
  const porDimension = new Map<string, Map<string, number>>();
  for (const { update } of salidas) {
    for (const { dimension, tipo } of update.cambios) {
      const tipos = porDimension.get(dimension) ?? new Map<string, number>();
      tipos.set(tipo, (tipos.get(tipo) ?? 0) + 1);
      porDimension.set(dimension, tipos);
    }
  }
  return [...porDimension.entries()].map(([dimension, tipos]) => {
    const total = [...tipos.values()].reduce((n, v) => n + v, 0);
    const detalle = [...tipos.entries()].map(([tipo, n]) => `${tipo} ${n}`).join(", ");
    return `${dimension}: ${total} de ${salidas.length} (${detalle})`;
  });
}

// R-011.15: crítica si falta la relación o una de sus dos frases. Otra dimensión es advertencia.
export function revisarContradicciones(esperadas: ContradiccionEsperada[], salidas: SalidaObservacion[]): { criticos: string[]; advertencias: string[] } {
  const criticos: string[] = [];
  const advertencias: string[] = [];
  for (const { dimension, nueva, previa } of esperadas) {
    const salidaNueva = salidas.find((s) => s.observador === nueva.observador);
    const notaPrevia = salidas.find((s) => s.observador === previa.observador)?.nota ?? "";
    const relaciones = (salidaNueva?.update.relacionesConPerfilPrevio ?? []).filter((r) => r.tipo === "contradiccion");
    const conNueva = relaciones.filter((r) => r.evidencia.some((e) => citaEnLaFrase(e.cita, nueva.fragmento, salidaNueva?.nota ?? "")));
    const conLasDos = conNueva.filter((r) => r.citaPrevia != null && citaEnLaFrase(r.citaPrevia, previa.fragmento, notaPrevia));
    if (conLasDos.length === 0) {
      const motivo = conNueva.length ? `sin la frase anterior "${previa.fragmento}"` : `sin la frase "${nueva.fragmento}"`;
      criticos.push(`Contradicción esperada en ${dimension} (${previa.observador} y ${nueva.observador}): no salió con las dos frases, ${motivo}.`);
    } else if (!conLasDos.some((r) => r.dimension === dimension)) {
      advertencias.push(`Contradicción esperada en ${dimension}: salió en ${conLasDos.map((r) => r.dimension).join(", ")}.`);
    }
  }
  return { criticos, advertencias };
}

// R-011.16: cada observador de una coincidencia tiene que tener una cita en esa dimensión del perfil final.
export function revisarCoincidencias(esperadas: CoincidenciaEsperada[], perfil: Perfil, sesionDe: (observador: string) => string | undefined): string[] {
  const advertencias: string[] = [];
  for (const { dimension, observadores } of esperadas) {
    const sesiones = new Set((perfil.dimensiones[dimension]?.evidencia ?? []).map((e) => e.sessionId));
    const faltan = observadores.filter((o) => !sesiones.has(sesionDe(o) ?? ""));
    if (faltan.length) advertencias.push(`Coincidencia en ${dimension}: falta la cita de ${faltan.join(", ")}.`);
  }
  return advertencias;
}

export const coincidenciasCompletas = (esperadas: CoincidenciaEsperada[], advertencias: string[]) =>
  esperadas.length - advertencias.filter((a) => a.startsWith("Coincidencia en ")).length;

// R-011.17: quién observó cada frase, el tipo, la dimensión, las dos frases y la descripción.
export function filasRelaciones(caso: string, corrida: number, salidas: SalidaObservacion[], observadorDeSesion: (sesion: string) => string): string[][] {
  return salidas.flatMap(({ observador, update }) =>
    update.relacionesConPerfilPrevio.map((r) => [
      caso,
      String(corrida),
      observador,
      r.sesionPrevia ? observadorDeSesion(r.sesionPrevia) : "-",
      r.tipo,
      r.dimension,
      r.evidencia.map((e) => e.cita).join(" / "),
      r.citaPrevia ?? "(sin confirmar)",
      r.descripcion,
    ]),
  );
}

// R-011.17: el resumen que leería la persona en cada dimensión con contradicción. Si elige una versión lo juzga quien lee.
export function filasResumenes(caso: string, corrida: number, salidas: SalidaObservacion[]): string[][] {
  return salidas.flatMap(({ observador, update }) => {
    const dimensiones = new Set(update.relacionesConPerfilPrevio.filter((r) => r.tipo === "contradiccion").map((r) => r.dimension));
    return update.cambios.filter((c) => dimensiones.has(c.dimension)).map((c) => [caso, String(corrida), observador, c.dimension, c.resumen]);
  });
}

// R-011.17: las señales con sus citas, porque un caso puede permitir una señal solo si cita algo concreto.
export function filasSenales(caso: string, corrida: number, salidas: SalidaObservacion[]): string[][] {
  return salidas.flatMap(({ observador, update }) =>
    update.senales.map((s) => [caso, String(corrida), observador, s.tipo, s.descripcion, s.evidencia.map((e) => e.cita).join(" / ")]),
  );
}
