// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// "Repetir esta tarea" (spec 010, R-010.35, R-010.36): con confirmación. Si el modelo falla, el diálogo se queda abierto
// con el error, no se creó nada y su tarea sigue igual. Si sale bien va a la copia, y el foco al título de la copia: su id
// no existe en esta pantalla, así que Confirmar lo deja pendiente hasta que se pinte.
"use client";

import { useRouter } from "next/navigation";
import { RepetirDesgloseResponse } from "@/lib/desglose/schema-cliente";
import { llamarDesglose } from "@/components/desglose/api";
import { Confirmar } from "@/components/persona/guia/confirmar";
import { DIALOGO_REPETIR, ERROR_RED, idTituloCopia, rutaTrasRepetir } from "./textos";

export function RepetirTarea({ breakdownId }: { breakdownId: string }) {
  const router = useRouter();

  async function repetir(): Promise<string | null> {
    const r = await llamarDesglose(`/api/task-breakdowns/${breakdownId}/duplicate`, "POST", {}, ERROR_RED);
    if (!r.ok) return r.error;
    const copia = RepetirDesgloseResponse.safeParse(r.json);
    if (!copia.success) return ERROR_RED;
    router.push(rutaTrasRepetir(copia.data.breakdownId, copia.data.resultado));
    return null;
  }

  return (
    <Confirmar
      boton={DIALOGO_REPETIR.boton}
      titulo={DIALOGO_REPETIR.titulo}
      texto={[DIALOGO_REPETIR.texto]}
      cancelar={DIALOGO_REPETIR.cancelar}
      confirmar={DIALOGO_REPETIR.confirmar}
      esperando={DIALOGO_REPETIR.esperando}
      alConfirmar={repetir}
      idFoco={idTituloCopia(breakdownId)}
    />
  );
}
