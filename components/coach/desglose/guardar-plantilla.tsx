// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// "Guardar como plantilla" (spec 010, R-010.39, R-010.40): el coach revisa puesto, título, tarea y cada paso, y confirma.
// Las notas de apoyo, porQue, origen, minutos y contexto ni siquiera llegan a este componente: la página le pasa solo el
// texto de cada paso. Si el texto no pasa la revisión, el error sale en el diálogo y se queda junto al formulario al
// cerrarlo, para corregir sin tener que recordarlo. Al guardar va a las plantillas, y el foco al párrafo que lo dice.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GuardarPlantillaRequest, MAX_PUESTO, MAX_TITULO_PLANTILLA } from "@/lib/api/contracts";
import { MAX_ACCION, MAX_CRITERIO, MAX_TAREA } from "@/lib/desglose/schema-cliente";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { llamarDesglose } from "@/components/desglose/api";
import { Confirmar } from "@/components/persona/guia/confirmar";
import { avisoPalabrasConMayuscula, ayudaGuardarPlantilla, CAMPOS_PLANTILLA, dialogoGuardarPlantilla, ERROR_PLANTILLA_INCOMPLETA, ERROR_RED, ID_RESULTADO_PLANTILLA, palabrasConMayuscula, rutaPlantillasTras, textoPasoPlantilla } from "./textos";

export type PasoParaPlantilla = { accion: string; criterioTerminado: string };

export function GuardarPlantilla({ breakdownId, tarea: tareaInicial, pasos: pasosIniciales, nombre }: { breakdownId: string; tarea: string; pasos: PasoParaPlantilla[]; nombre: string }) {
  const router = useRouter();
  const [puesto, setPuesto] = useState("");
  const [titulo, setTitulo] = useState("");
  const [tarea, setTarea] = useState(tareaInicial);
  const [pasos, setPasos] = useState(pasosIniciales);
  const [error, setError] = useState<string | null>(null);
  const dialogo = dialogoGuardarPlantilla(nombre);
  // No bloquea: el código no sabe si es un nombre o una herramienta (R-010.40).
  const conMayuscula = palabrasConMayuscula({ puesto, titulo, tarea });

  const cambiarPaso = (indice: number, cambio: Partial<PasoParaPlantilla>) => setPasos((actuales) => actuales.map((p, i) => (i === indice ? { ...p, ...cambio } : p)));

  const fallo = (texto: string) => {
    setError(texto);
    return texto;
  };

  async function guardar(): Promise<string | null> {
    setError(null);
    const cuerpo = GuardarPlantillaRequest.safeParse({ breakdownId, puesto, titulo, tarea, pasos });
    if (!cuerpo.success) return fallo(ERROR_PLANTILLA_INCOMPLETA);
    const r = await llamarDesglose("/api/task-templates", "POST", cuerpo.data, ERROR_RED);
    if (!r.ok) return fallo(r.error);
    router.push(rutaPlantillasTras("guardada"));
    return null;
  }

  return (
    <details className="rounded-lg border border-border p-4">
      <summary className="w-fit cursor-pointer font-medium underline-offset-4 hover:underline">{dialogo.boton}</summary>
      <div className="mt-4 flex flex-col gap-4">
        <p className="prose-measure">{ayudaGuardarPlantilla(nombre)}</p>

        <div className="flex flex-col gap-2">
          <Label htmlFor="plantilla-puesto">{CAMPOS_PLANTILLA.puesto}</Label>
          <Input id="plantilla-puesto" value={puesto} onChange={(e) => setPuesto(e.target.value)} maxLength={MAX_PUESTO} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="plantilla-titulo">{CAMPOS_PLANTILLA.titulo}</Label>
          <Input id="plantilla-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={MAX_TITULO_PLANTILLA} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="plantilla-tarea">{CAMPOS_PLANTILLA.tarea}</Label>
          <Textarea id="plantilla-tarea" value={tarea} onChange={(e) => setTarea(e.target.value)} maxLength={MAX_TAREA} rows={3} />
        </div>

        {pasos.map((paso, i) => (
          <fieldset key={i} className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <legend className="px-1 font-medium">{textoPasoPlantilla(i + 1)}</legend>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`plantilla-accion-${i}`}>{CAMPOS_PLANTILLA.accion}</Label>
              <Textarea id={`plantilla-accion-${i}`} value={paso.accion} onChange={(e) => cambiarPaso(i, { accion: e.target.value })} maxLength={MAX_ACCION} rows={2} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`plantilla-criterio-${i}`}>{CAMPOS_PLANTILLA.criterio}</Label>
              <Textarea id={`plantilla-criterio-${i}`} value={paso.criterioTerminado} onChange={(e) => cambiarPaso(i, { criterioTerminado: e.target.value })} maxLength={MAX_CRITERIO} rows={2} />
            </div>
          </fieldset>
        ))}

        {error ? <p className="prose-measure font-medium text-destructive">{error}</p> : null}
        <div>
          <Confirmar
            boton={dialogo.boton}
            variante="default"
            titulo={dialogo.titulo}
            texto={conMayuscula.length > 0 ? [dialogo.texto, avisoPalabrasConMayuscula(conMayuscula)] : [dialogo.texto]}
            cancelar={dialogo.cancelar}
            confirmar={dialogo.confirmar}
            alConfirmar={guardar}
            idFoco={ID_RESULTADO_PLANTILLA}
          />
        </div>
      </div>
    </details>
  );
}
