// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Filtros de la pantalla "Función ejecutiva" (spec 008, R-008.24). Funciones puras. Llegan por la URL,
// con un formulario que funciona sin JavaScript. Las fechas son AAAA-MM-DD en Monterrey, así que se
// comparan como texto (R-004.58). El filtro usa la dirección vigente; una línea sin dirección solo
// aparece con "todos".
import { z } from "zod";
import { hoyEnMonterrey } from "@/lib/followup/fecha";
import { DireccionFE } from "@/lib/profile/schema";
import type { BloqueDominio, Linea, Trayectoria } from "@/lib/trayectoria/lineas";

export const TipoFiltro = z.enum(["todos", ...DireccionFE.options]);
export type TipoFiltro = z.infer<typeof TipoFiltro>;

export const Filtros = z.strictObject({
  desde: z.iso.date().nullable(),
  hasta: z.iso.date().nullable(),
  tipo: TipoFiltro,
});
export type Filtros = z.infer<typeof Filtros>;

const valor = (v: string | string[] | undefined) => (typeof v === "string" && v !== "" ? v : null);

// Una fecha inválida, o "desde" después de "hasta", deja las líneas sin filtrar por fecha y la pantalla
// muestra el error (CA-008.22). Un tipo que no existe cuenta como "todos".
export function leerFiltros(params: Record<string, string | string[] | undefined>): { filtros: Filtros; errorFechas: boolean } {
  const tipo = TipoFiltro.safeParse(params.tipo);
  const fecha = z.iso.date().nullable();
  const desde = fecha.safeParse(valor(params.desde));
  const hasta = fecha.safeParse(valor(params.hasta));
  const validas = desde.success && hasta.success && (!desde.data || !hasta.data || desde.data <= hasta.data);
  return {
    filtros: {
      desde: validas ? desde.data : null,
      hasta: validas ? hasta.data : null,
      tipo: tipo.success ? tipo.data : "todos",
    },
    errorFechas: !validas,
  };
}

function pasa(linea: Linea, { desde, hasta, tipo }: Filtros): boolean {
  const dia = hoyEnMonterrey(linea.fecha);
  if (desde && dia < desde) return false;
  if (hasta && dia > hasta) return false;
  return tipo === "todos" || linea.direccion === tipo;
}

// "vacioPorFiltros" separa "Sin líneas con estos filtros." de "Sin observaciones".
export type BloqueFiltrado = BloqueDominio & { vacioPorFiltros: boolean };

export type TrayectoriaFiltrada = Omit<Trayectoria, "bloques"> & { bloques: BloqueFiltrado[] };

// Las citas no mostradas no pasan por aquí: no son líneas (R-008.18).
export function filtrarTrayectoria(trayectoria: Trayectoria, filtros: Filtros): TrayectoriaFiltrada {
  return {
    ...trayectoria,
    bloques: trayectoria.bloques.map((b) => {
      const lineas = b.lineas.filter((l) => pasa(l, filtros));
      return { dominio: b.dominio, lineas, vacioPorFiltros: lineas.length === 0 && b.lineas.length > 0 };
    }),
    sinDominio: trayectoria.sinDominio.filter((l) => pasa(l, filtros)),
  };
}
