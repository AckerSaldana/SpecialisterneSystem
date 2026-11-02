// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// "Archivar" una plantilla (spec 010, R-010.41): con confirmación. Ya no se puede aplicar y no se puede deshacer. Al
// archivarla, sale de la lista y el foco va al párrafo que dice que se archivó.
"use client";

import { useRouter } from "next/navigation";
import { llamarDesglose } from "@/components/desglose/api";
import { Confirmar } from "@/components/persona/guia/confirmar";
import { DIALOGO_ARCHIVAR_PLANTILLA, ERROR_RED, etiquetaArchivarPlantilla, ID_RESULTADO_PLANTILLA, rutaPlantillasTras } from "./textos";

export function ArchivarPlantilla({ plantillaId, nombrePlantilla }: { plantillaId: string; nombrePlantilla: string }) {
  const router = useRouter();

  async function archivar(): Promise<string | null> {
    const r = await llamarDesglose(`/api/task-templates/${plantillaId}`, "PATCH", { accion: "archivar" }, ERROR_RED);
    if (!r.ok) return r.error;
    // refresh: si ya estaba en esta misma dirección, push no vuelve a leer la lista.
    router.push(rutaPlantillasTras("archivada"));
    router.refresh();
    return null;
  }

  return (
    <Confirmar
      boton={DIALOGO_ARCHIVAR_PLANTILLA.boton}
      etiquetaBoton={etiquetaArchivarPlantilla(nombrePlantilla)}
      titulo={DIALOGO_ARCHIVAR_PLANTILLA.titulo}
      texto={[DIALOGO_ARCHIVAR_PLANTILLA.texto]}
      cancelar={DIALOGO_ARCHIVAR_PLANTILLA.cancelar}
      confirmar={DIALOGO_ARCHIVAR_PLANTILLA.confirmar}
      alConfirmar={archivar}
      idFoco={ID_RESULTADO_PLANTILLA}
    />
  );
}
