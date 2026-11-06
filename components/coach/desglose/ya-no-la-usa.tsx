// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// "Ya no la uso", del lado del coach (spec 010, R-010.29): con confirmación. La quita de la lista de la persona, no se
// borra y aquí se sigue viendo. Al refrescar, el botón ya no existe: el foco va al párrafo que la página pinta en su lugar.
"use client";

import { useRouter } from "next/navigation";
import { llamarDesglose } from "@/components/desglose/api";
import { Confirmar } from "@/components/persona/guia/confirmar";
import { dialogoArchivar, ERROR_RED, ID_ARCHIVADA } from "./textos";

export function YaNoLaUsa({ breakdownId, nombre }: { breakdownId: string; nombre: string }) {
  const router = useRouter();
  const dialogo = dialogoArchivar(nombre);

  async function quitar(): Promise<string | null> {
    const r = await llamarDesglose(`/api/task-breakdowns/${breakdownId}`, "PATCH", { accion: "archivar" }, ERROR_RED);
    if (!r.ok) return r.error;
    router.refresh();
    return null;
  }

  return <Confirmar boton={dialogo.boton} titulo={dialogo.titulo} texto={[dialogo.texto]} cancelar={dialogo.cancelar} confirmar={dialogo.confirmar} alConfirmar={quitar} idFoco={ID_ARCHIVADA} />;
}
