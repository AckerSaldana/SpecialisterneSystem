// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Rastro de una versión del plan en el historial (spec 003, R-003.35, tarea 19): por cada punto,
// si es de la IA sin cambios, editado (con el texto original de la IA) o escrito por el coach, a qué
// punto de la versión anterior sigue, y la lista de puntos de la IA que el coach quitó.
// Todo sale de rastroPlan (lib/plan/trail.ts), que lo calcula desde propuesta_ia y plan_items.
// Sin hooks: Server Component.
import { etiquetaTipoPlan, esVisiblePersona } from "@/lib/plan/schema";
import type { Rastro } from "@/lib/plan/trail";
import {
  RASTRO_COACH,
  RASTRO_EDITADO,
  RASTRO_QUITADOS,
  RASTRO_SIN_CAMBIOS,
  loQueVera,
  rastroSigue,
} from "./textos";
import { agruparPorTipo, recortar } from "./tipos";

type Props = {
  rastro: Rastro;
  nombre: string;
  // id de un ítem de cualquier versión aprobada → su versión y descripción, para "Sigue al punto".
  anteriores: Map<string, { version: number; descripcion: string }>;
  // Nivel de los títulos de cada grupo, uno debajo del título de la versión (en el historial, h3).
  nivel: 3 | 4;
};

// Los grupos van en <div> y no en <section aria-label>: cada versión repite los mismos grupos, y
// tantas regiones con el mismo nombre estorban al navegar por regiones. El título basta.
export function RastroVersion({ rastro, nombre, anteriores, nivel }: Props) {
  const Titulo = nivel === 3 ? "h3" : "h4";
  // agruparPorTipo ordena por "orden"; el rastro ya viene en el orden de plan_items.
  const grupos = agruparPorTipo(rastro.items.map((it, orden) => ({ ...it, orden }))).filter((g) => g.items.length > 0);
  return (
    <div className="flex flex-col gap-6">
      {grupos.map((grupo) => (
        <div key={grupo.id} className="flex flex-col gap-3">
          <Titulo className="text-lg font-semibold">{grupo.grupo}</Titulo>
          <ul className="flex flex-col gap-3">
            {grupo.items.map((item) => {
              const anterior = item.origenItemId ? anteriores.get(item.origenItemId) : undefined;
              return (
                <li key={item.id} className="flex flex-col gap-2 rounded-md border-(length:--border-w) border-border bg-background px-4 py-3 text-sm">
                  <p className="prose-measure text-base">{item.descripcion}</p>
                  {esVisiblePersona(item.tipo) && item.textoPersona ? (
                    <p className="prose-measure">
                      <span className="font-medium">{loQueVera(nombre)} </span>
                      {item.textoPersona}
                    </p>
                  ) : null}
                  {item.estado === "editado" ? (
                    <details>
                      <summary className="w-fit cursor-pointer font-medium underline-offset-4 hover:underline">
                        {RASTRO_EDITADO}
                      </summary>
                      {item.original ? (
                        <div className="mt-2 flex flex-col gap-2 rounded-md bg-muted px-4 py-3">
                          <p className="prose-measure">{item.original.descripcion}</p>
                          {esVisiblePersona(item.tipo) && item.original.textoPersona ? (
                            <p className="prose-measure">
                              <span className="font-medium">{loQueVera(nombre)} </span>
                              {item.original.textoPersona}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </details>
                  ) : (
                    <p className="font-medium">{item.estado === "coach" ? RASTRO_COACH : RASTRO_SIN_CAMBIOS}</p>
                  )}
                  {anterior ? <p className="prose-measure">{rastroSigue(anterior.version, recortar(anterior.descripcion, 200))}</p> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {rastro.quitados.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Titulo className="text-lg font-semibold">{RASTRO_QUITADOS}</Titulo>
          <ul className="flex flex-col gap-2 text-sm">
            {rastro.quitados.map((q) => (
              <li key={q.ref} className="prose-measure rounded-md border-(length:--border-w) border-dashed border-border px-4 py-3">
                <span className="font-medium">{etiquetaTipoPlan(q.tipo)}: </span>
                {q.descripcion}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
