// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// "Ya no la uso" (spec 010, R-010.29): con confirmación. No se borra y su coach la sigue viendo. Al quitarla, esta pantalla
// ya no aplica: va a su lista, y el foco al título de la lista.
"use client";

import { useRouter } from "next/navigation";
import { llamarDesglose } from "@/components/desglose/api";
import { Confirmar } from "@/components/persona/guia/confirmar";
import { DIALOGO_ARCHIVAR, ERROR_RED, ID_TITULO_TAREAS, RUTA_DESGLOSES_TRAS_QUITAR } from "./textos";

export function YaNoLaUso({ breakdownId }: { breakdownId: string }) {
  const router = useRouter();

  async function quitar(): Promise<string | null> {
    const r = await llamarDesglose(`/api/task-breakdowns/${breakdownId}`, "PATCH", { accion: "archivar" }, ERROR_RED);
    if (!r.ok) return r.error;
    router.push(RUTA_DESGLOSES_TRAS_QUITAR);
    return null;
  }

  return (
    <Confirmar
      boton={DIALOGO_ARCHIVAR.boton}
      titulo={DIALOGO_ARCHIVAR.titulo}
      texto={[DIALOGO_ARCHIVAR.texto]}
      cancelar={DIALOGO_ARCHIVAR.cancelar}
      confirmar={DIALOGO_ARCHIVAR.confirmar}
      alConfirmar={quitar}
      idFoco={ID_TITULO_TAREAS}
    />
  );
}
