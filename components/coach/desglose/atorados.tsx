// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// "Lo que escribió {nombre} en sus tareas", dentro de "Antes de esta sesión" (spec 010, R-010.30 a R-010.33). El texto va
// literal, con la etiqueta de quién lo escribió, sin resumen, clasificación ni interpretación de la IA. Va aparte de las
// señales: sin total, encabezado con número, insignia ni color de alerta, y no genera riesgo (C-05, C-13, R-010.31). Al
// marcar "Ya lo revisé", la fila se va: el foco va al título de esta sección.
import type { FilaAtorado } from "@/lib/desglose/lectura";
import { formatFecha } from "../labels";
import { AccionConDialogo } from "../seguimiento/acciones";
import { ayudaAtorados, DIALOGO_REVISE, ID_ATORADOS, textoHechoDespues, textoLoEscribio, textoSinEscribir, textoUbicacion, tituloAtorados, vacioAtorados } from "./textos";

export function SeccionAtorados({ atorados, nombre }: { atorados: FilaAtorado[]; nombre: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 id={ID_ATORADOS} tabIndex={-1} className="foco-destino font-medium">
        {tituloAtorados(nombre)}
      </h3>
      <p className="prose-measure text-sm text-muted-foreground">{ayudaAtorados(nombre)}</p>
      {atorados.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vacioAtorados(nombre)}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {atorados.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
              {a.texto ? (
                <>
                  <p className="prose-measure font-medium">{textoLoEscribio(nombre, formatFecha(a.creadoEn))}</p>
                  <p className="prose-measure whitespace-pre-wrap border-l-4 border-border pl-3">«{a.texto}»</p>
                </>
              ) : (
                <p className="prose-measure font-medium">{textoSinEscribir(nombre, formatFecha(a.creadoEn))}</p>
              )}
              <p className="prose-measure">{textoUbicacion(a.tarea, a.paso)}</p>
              {a.hechoDespuesEn ? <p className="prose-measure">{textoHechoDespues(formatFecha(a.hechoDespuesEn))}</p> : null}
              <div>
                <AccionConDialogo
                  boton={DIALOGO_REVISE.boton}
                  titulo={DIALOGO_REVISE.titulo}
                  texto={DIALOGO_REVISE.texto}
                  confirmar={DIALOGO_REVISE.confirmar}
                  url={`/api/task-step-events/${a.id}`}
                  metodo="PATCH"
                  cuerpo={{ accion: "revisar" }}
                  idFoco={ID_ATORADOS}
                  refrescarSiCambio
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
