// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Repetir una tarea con ajustes propuestos (spec 010, R-010.35 a R-010.38). Funciones puras, sin red ni base. Corren solo
// en el servidor: traen lib/desglose/validate.ts y este archivo no llega al JavaScript de la persona (C-09).
//   - copiarPasos (R-010.35): los mismos pasos con id nuevos. Las notas y su porQue, como estaban.
//   - entradaDeAjustes (R-010.36): lo que recibe el modelo, con S-nn en lugar de UUID y solo las marcas de ese desglose.
//   - limpiarAjustes (R-010.37): quita lo que no se sostiene y arma lo que se guarda. Un descarte no provoca reintento y de
//     él solo queda la ruta y el motivo, porque la persona lee toda su fila.
//   - aplicarAjustes (R-010.38): arma los pasos finales. Solo valida los pasos nuevos o cambiados, nunca los copiados, que
//     no guardan apoyoRef y pueden tener origen nulo. Así, aceptar cero ajustes no puede fallar y nadie queda sin salida.
import "server-only";
import type { Apoyo } from "@/lib/desglose/adaptaciones";
import { AjusteGuardado, MAX_PASOS, type AjustePropuesto, type ContextoDesglose, type DescartadoDesglose, type PasoDesglose } from "@/lib/desglose/schema";
import { buscarLlavesInternas, buscarUrgencia, limpiarPasos, revisarTextoDesglose, validarPasos } from "@/lib/desglose/validate";
import type { EntradaAjustesModelo } from "@/lib/prompts";

// La excepción de R-010.15 y R-010.16: la tarea y el contexto del pedido.
export const textosDelPedido = (tarea: string, contexto: ContextoDesglose | null): string[] => [tarea, ...Object.values(contexto ?? {})];

const nuevoUuid = () => crypto.randomUUID();

// R-010.35.
export function copiarPasos(pasos: readonly PasoDesglose[], nuevoId: () => string = nuevoUuid): PasoDesglose[] {
  return pasos.map((p) => ({ ...p, id: nuevoId() }));
}

const refDePaso = (i: number) => `S-${String(i + 1).padStart(2, "0")}`;

// El S-nn de cada paso de la copia, en orden: refs[0] es el paso 1.
export type RefDePaso = { ref: string; pasoId: string };

// R-010.36. `pasos` es la copia, en el mismo orden que el origen, porque el ajuste se guarda con el id de la copia. Las
// marcas vienen del origen: una marca de otro desglose no coincide con ningún paso y no entra.
export function entradaDeAjustes(
  origen: { tareaOriginal: string; contexto: ContextoDesglose | null; pasos: readonly PasoDesglose[] },
  pasos: readonly PasoDesglose[],
  marcas: readonly { pasoId: string; texto: string | null }[],
  apoyos: readonly Apoyo[],
): { entrada: EntradaAjustesModelo; refs: RefDePaso[]; conAtoro: ReadonlySet<string> } {
  const refPorOrigen = new Map(origen.pasos.map((p, i) => [p.id, refDePaso(i)]));
  const delOrigen = marcas.flatMap((m) => {
    const pasoRef = refPorOrigen.get(m.pasoId);
    return pasoRef ? [{ pasoRef, texto: m.texto }] : [];
  });
  return {
    entrada: {
      tarea: origen.tareaOriginal,
      contexto: origen.contexto,
      pasos: origen.pasos.map((p, i) => ({ ref: refDePaso(i), accion: p.accion, criterioTerminado: p.criterioTerminado })),
      marcas: delOrigen,
      apoyos,
    },
    refs: pasos.map((p, i) => ({ ref: refDePaso(i), pasoId: p.id })),
    conAtoro: new Set(delOrigen.map((m) => m.pasoRef)),
  };
}

export type OpcionesLimpiarAjustes = {
  refs: readonly RefDePaso[];
  // Los S-nn con marca "Me atoré aquí".
  conAtoro: ReadonlySet<string>;
  apoyos: readonly Apoyo[];
  // tarea_original y contexto del origen, si los escribió la persona; nunca las marcas.
  textoPersona: readonly string[];
  // El mensaje que recibió el modelo, para R-010.17.
  entradaModelo: string;
  // tarea_original y contexto del origen, sin importar quién los escribió, para R-010.24.
  pedido?: readonly string[];
  // Los A-nn con iniciar, solo si perfilMarcaIniciacion da verdadero. R-010.14 corre aquí porque apoyoRef no se guarda.
  exigirInicio?: ReadonlySet<string>;
  nuevoId?: () => string;
};

export type ResultadoAjustes = { ajustes: AjusteGuardado[]; descartados: DescartadoDesglose[] };

export function limpiarAjustes(propuestos: readonly AjustePropuesto[], { refs, conAtoro, apoyos, textoPersona, entradaModelo, pedido, exigirInicio, nuevoId = nuevoUuid }: OpcionesLimpiarAjustes): ResultadoAjustes {
  const indice = new Map(refs.map((r) => [r.ref, r.pasoId]));
  const primero = refs[0]?.ref;
  const vistos = new Set<string>();
  const ajustes: AjusteGuardado[] = [];
  const descartados: DescartadoDesglose[] = [];

  propuestos.forEach((ajuste, i) => {
    const ruta = `ajustes[${i}]`;
    const pasoRef = ajuste.pasoRef.trim();
    const pasoId = indice.get(pasoRef);
    if (pasoId === undefined || !conAtoro.has(pasoRef)) {
      descartados.push({ ruta, motivo: "ajuste_sin_atoro" });
      return;
    }
    if (vistos.has(pasoRef)) {
      descartados.push({ ruta, motivo: "ajuste_duplicado" });
      return;
    }
    vistos.add(pasoRef);

    // R-010.14 solo aplica a un ajuste que cambia el paso 1: cambiarlo o agregar uno antes.
    const problemas = validarPasos([ajuste.paso], { textoPersona, entradaModelo, pedido, exigirInicio: pasoRef === primero ? exigirInicio : undefined });
    // El motivo no tiene la excepción: la persona lo lee y nada de ahí lo escribió ella, aunque repita lo que marcó.
    const motivoNoSirve = revisarTextoDesglose(ajuste.motivo).length > 0 || buscarUrgencia(ajuste.motivo).length > 0 || buscarLlavesInternas(ajuste.motivo).length > 0;
    if (problemas.length > 0 || motivoNoSirve) {
      descartados.push({ ruta, motivo: "ajuste_no_valido" });
      return;
    }

    // R-010.20 a R-010.22: una nota que no se sostiene se quita y el paso se queda.
    const limpio = limpiarPasos([ajuste.paso], { apoyos, nuevoId });
    for (const d of limpio.descartados) descartados.push({ ruta: `${ruta}.paso.notaApoyo`, motivo: d.motivo });
    ajustes.push(AjusteGuardado.parse({ id: nuevoId(), tipo: ajuste.tipo, pasoId, paso: limpio.pasos[0], motivo: ajuste.motivo.trim() }));
  });

  return { ajustes, descartados };
}

export type ResultadoAplicar =
  | { estado: "listo"; pasos: PasoDesglose[]; aceptados: string[] }
  // Un id que no es de esta tarea.
  | { estado: "no_existe" }
  // numero: el paso de la copia al que se refiere el ajuste, para el texto literal.
  | { estado: "no_valido"; numero: number }
  // Quedarían más de MAX_PASOS: tampoco se podría guardar como plantilla. La persona quita alguno de su elección.
  | { estado: "demasiados" };

// R-010.38. R-010.14 y R-010.17 ya corrieron en limpiarAjustes, con el apoyoRef del ajuste y la entrada que recibió el
// modelo: aquí no se repiten. Cada paso tiene a lo sumo un ajuste (ajuste_duplicado).
export function aplicarAjustes(pasos: readonly PasoDesglose[], ajustes: readonly AjusteGuardado[], aceptados: readonly string[], { textoPersona }: { textoPersona: readonly string[] }): ResultadoAplicar {
  const elegidos = new Set(aceptados);
  const usados = ajustes.filter((a) => elegidos.has(a.id));
  if (usados.length !== elegidos.size) return { estado: "no_existe" };

  for (const ajuste of usados) {
    const indice = pasos.findIndex((p) => p.id === ajuste.pasoId);
    if (indice < 0) return { estado: "no_existe" };
    if (validarPasos([ajuste.paso], { textoPersona }).length > 0) return { estado: "no_valido", numero: indice + 1 };
  }

  const finales = pasos.flatMap((paso) => {
    const ajuste = usados.find((a) => a.pasoId === paso.id);
    if (!ajuste) return [paso];
    return ajuste.tipo === "cambiar" ? [ajuste.paso] : [ajuste.paso, paso];
  });
  // Elegir cero nunca falla: esto solo cuenta con ajustes elegidos, y la copia tiene los mismos pasos que su origen.
  if (usados.length > 0 && finales.length > MAX_PASOS) return { estado: "demasiados" };
  return { estado: "listo", pasos: finales, aceptados: usados.map((a) => a.id) };
}
