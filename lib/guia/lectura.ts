// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Lo que leen las pantallas de "Cómo trabajar conmigo" (spec 009). Todo con RLS: la persona lee sus filas y el
// coach solo las listas (R-009.34). Las columnas se eligen a propósito, porque RLS filtra filas, no columnas:
//   - la hoja solo selecciona documento y estado (R-009.42);
//   - el coach no selecciona version: solo ordena por ella (R-009.35);
//   - a la persona las líneas le llegan como GuiaVista, sin orígenes (R-009.33).
// No importa lib/auth, así scripts/guia-check.ts la prueba con cuentas sintéticas (lib/api/ruta.ts).
import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/lib/db/rls";
import { personaProfiles, sharedGuides } from "@/lib/db/schema";
import { hayAlgoQueProponer } from "@/lib/guia/comparar";
import { armarDocumento, cambiosDeGuia, type CambiosDeGuia } from "@/lib/guia/documento";
import { leerInsumosGuia } from "@/lib/guia/insumos";
import { DescartesGuia, DocumentoGuia, LineaGuia, vistaDeGuia, type GuiaVista } from "@/lib/guia/schema";
import { PerfilPersona } from "@/lib/profile/schema";

const LineasGuardadas = z.array(LineaGuia);

// R-009.46: ¿hay algo que la regeneración pueda proponer sobre estas líneas? Se compara por contenido, perfil y plan, con
// la misma cuenta de la regeneración. Aprobar solo una señal crea una versión del perfil con el mismo contenido, y
// avisar eso delataría la señal (C-09). Un plan nuevo con los mismos textos tampoco avisa: no habría nada que pedir.
// Los insumos traen textos del coach y citas: de aquí solo sale este booleano (R-009.10). Una a la vez: es la misma
// transacción y la misma conexión.
async function cambiaronDesde(
  tx: Tx,
  engagementId: string,
  guia: { generadaDesdeSnapshotId: string; planVersion: number; lineas: unknown; revisadaSinCambios: string | null },
): Promise<boolean> {
  const insumos = await leerInsumosGuia(tx, engagementId, guia.planVersion);
  if (!insumos) return false;
  const [base] = await tx
    .select({ contenido: personaProfiles.contenido })
    .from(personaProfiles)
    .where(eq(personaProfiles.snapshotId, guia.generadaDesdeSnapshotId))
    .limit(1);
  return hayAlgoQueProponer({
    base: LineasGuardadas.parse(guia.lineas),
    insumos,
    perfilBase: base ? PerfilPersona.parse(base.contenido) : null,
    revisadaSinCambios: guia.revisadaSinCambios,
  });
}

export type BorradorPersona = {
  guia: GuiaVista;
  // Solo cuál de los dos textos de origen se muestra: el id de quien lo pidió no sale de aquí.
  pedidoPorMi: boolean;
  creadoEn: Date;
  insumosCambiaron: boolean;
};

export type VersionPersona = {
  id: string;
  version: number;
  estado: "lista" | "retirada";
  // Desde cuándo está lista o cuándo se retiró, según el estado.
  fecha: Date;
};

export type GuiasPersona = {
  borrador: BorradorPersona | null;
  versiones: VersionPersona[];
  // R-009.46: sin borrador abierto, si la regeneración tiene algo que proponer sobre su versión más alta.
  avisoCambios: boolean;
};

// /persona/como-trabajar-conmigo. Un borrador descartado no existe para ella (R-009.31).
export async function leerGuiasPersona(tx: Tx, engagementId: string, userId: string): Promise<GuiasPersona> {
  const [abierto] = await tx
    .select({
      id: sharedGuides.id,
      version: sharedGuides.version,
      nombreAMostrar: sharedGuides.nombreAMostrar,
      lineas: sharedGuides.lineas,
      descartes: sharedGuides.descartes,
      generadaPor: sharedGuides.generadaPor,
      generadaDesdeSnapshotId: sharedGuides.generadaDesdeSnapshotId,
      planVersion: sharedGuides.planVersion,
      revisadaSinCambios: sharedGuides.revisadaSinCambios,
      createdAt: sharedGuides.createdAt,
    })
    .from(sharedGuides)
    .where(and(eq(sharedGuides.engagementId, engagementId), eq(sharedGuides.estado, "borrador")))
    .limit(1);

  const filas = await tx
    .select({
      id: sharedGuides.id,
      version: sharedGuides.version,
      estado: sharedGuides.estado,
      aprobadaEn: sharedGuides.aprobadaPorPersonaEn,
      retiradaEn: sharedGuides.retiradaEn,
      generadaDesdeSnapshotId: sharedGuides.generadaDesdeSnapshotId,
      planVersion: sharedGuides.planVersion,
      lineas: sharedGuides.lineas,
      revisadaSinCambios: sharedGuides.revisadaSinCambios,
    })
    .from(sharedGuides)
    .where(and(eq(sharedGuides.engagementId, engagementId), inArray(sharedGuides.estado, ["lista", "retirada"]), isNotNull(sharedGuides.version)))
    .orderBy(desc(sharedGuides.version));

  const versiones = filas.flatMap((f): VersionPersona[] => {
    const fecha = f.estado === "retirada" ? f.retiradaEn : f.aprobadaEn;
    if (f.version === null || fecha === null || (f.estado !== "lista" && f.estado !== "retirada")) return [];
    return [{ id: f.id, version: f.version, estado: f.estado, fecha }];
  });

  if (!abierto) return { borrador: null, versiones, avisoCambios: filas[0] ? await cambiaronDesde(tx, engagementId, filas[0]) : false };

  return {
    borrador: {
      guia: vistaDeGuia({
        id: abierto.id,
        estado: "borrador",
        version: abierto.version,
        nombreAMostrar: abierto.nombreAMostrar,
        lineas: LineasGuardadas.parse(abierto.lineas),
        descartes: DescartesGuia.parse(abierto.descartes),
      }),
      pedidoPorMi: abierto.generadaPor === userId,
      creadoEn: abierto.createdAt,
      insumosCambiaron: await cambiaronDesde(tx, engagementId, abierto),
    },
    versiones,
    // Con un borrador abierto no se puede pedir otro: ese borrador trae su propio texto.
    avisoCambios: false,
  };
}

// La vista previa: solo de un borrador, con la misma función que "Listo" (R-009.27). Null si no hay.
export async function leerVistaPrevia(tx: Tx, engagementId: string, guiaId: string): Promise<DocumentoGuia | null> {
  const [fila] = await tx
    .select({ estado: sharedGuides.estado, nombreAMostrar: sharedGuides.nombreAMostrar, lineas: sharedGuides.lineas })
    .from(sharedGuides)
    .where(and(eq(sharedGuides.id, guiaId), eq(sharedGuides.engagementId, engagementId)))
    .limit(1);
  if (fila?.estado !== "borrador") return null;
  return armarDocumento(LineasGuardadas.parse(fila.lineas), fila.nombreAMostrar);
}

// La hoja para el líder. Solo documento y estado, y solo de una versión lista (R-009.42, R-009.45).
export async function leerHoja(tx: Tx, guiaId: string): Promise<DocumentoGuia | null> {
  const [fila] = await tx.select({ documento: sharedGuides.documento, estado: sharedGuides.estado }).from(sharedGuides).where(eq(sharedGuides.id, guiaId)).limit(1);
  if (fila?.estado !== "lista") return null;
  return DocumentoGuia.parse(fila.documento);
}

export type VersionCoach = {
  id: string;
  documento: DocumentoGuia;
  cambios: CambiosDeGuia;
  listaEn: Date;
};

// Lo que ve el coach: versiones listas, de la más alta a la más baja, sin el número (R-009.35). RLS ya deja
// fuera borradores, retiradas y descartadas (R-009.34); el filtro lo deja explícito.
export async function leerVersionesCoach(tx: Tx, engagementId: string): Promise<VersionCoach[]> {
  const filas = await tx
    .select({
      id: sharedGuides.id,
      documento: sharedGuides.documento,
      lineas: sharedGuides.lineas,
      listaEn: sharedGuides.aprobadaPorPersonaEn,
    })
    .from(sharedGuides)
    .where(and(eq(sharedGuides.engagementId, engagementId), eq(sharedGuides.estado, "lista")))
    .orderBy(desc(sharedGuides.version));

  return filas.flatMap((f): VersionCoach[] =>
    f.listaEn === null
      ? []
      : [{ id: f.id, documento: DocumentoGuia.parse(f.documento), cambios: cambiosDeGuia(LineasGuardadas.parse(f.lineas)), listaEn: f.listaEn }],
  );
}
