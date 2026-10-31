// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Panel "Antes de esta sesión" (R-004.22), arriba del campo de la nota: lo que el coach aprobó en
// sesiones anteriores para no perder el hilo. Solo lo ve el coach.
import type { DatosSeguimiento, FilaContexto } from "@/lib/followup/lectura";
import { etiquetaEstadoAvance } from "@/lib/followup/schema";
import { etiquetaSenal } from "@/lib/profile/schema";
import { formatFecha } from "../labels";
import { BotonYaNoAplica } from "./acciones";

const ID_PANEL = "antes-de-esta-sesion";

const sinPunto = (texto: string) => texto.trim().replace(/[.\s]+$/, "");

function ListaGuardada({ titulo, vacio, filas, render }: { titulo: string; vacio: string; filas: FilaContexto[]; render?: (f: FilaContexto) => string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filas.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <span className="prose-measure">{render ? render(f) : f.texto}</span>
              <BotonYaNoAplica contextoId={f.id} idFoco={ID_PANEL} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PanelAntesDeSesion({ datos, nombre }: { datos: DatosSeguimiento; nombre: string }) {
  const { ultimaSesion, guardado, avance, senales } = datos;
  const hayAvance = avance.some((a) => a.ultimo);

  return (
    <section aria-labelledby={ID_PANEL} className="flex flex-col gap-4 rounded-lg border-2 border-border p-4">
      <h2 id={ID_PANEL} tabIndex={-1} className="foco-destino text-xl font-semibold">
        Antes de esta sesión
      </h2>
      {ultimaSesion ? (
        <p>
          Última sesión: {ultimaSesion.tipo === "persona" ? `sesión con ${nombre}` : "sesión con la red de apoyo"}, el{" "}
          {formatFecha(ultimaSesion.realizadaEn)}.
        </p>
      ) : null}

      <ListaGuardada
        titulo="Preguntas que guardaste"
        vacio="No guardaste preguntas."
        filas={guardado.filter((c) => c.tipo === "pregunta")}
      />
      <ListaGuardada
        titulo="Contexto que guardaste"
        vacio="No guardaste contexto."
        filas={guardado.filter((c) => c.tipo === "contexto")}
      />
      <ListaGuardada
        titulo="Siguiente paso"
        vacio="No guardaste un siguiente paso."
        filas={guardado.filter((c) => c.tipo === "siguiente_paso")}
        render={(f) => `${sinPunto(f.texto)}. Sale de: ${sinPunto(f.saleDe ?? "Sin dato")}.`}
      />

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Avance del plan</h3>
        {!hayAvance ? (
          <p className="text-sm text-muted-foreground">Todavía no hay avance registrado.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {avance.map((a) => (
              <li key={a.id} className="prose-measure">
                {a.ultimo
                  ? `${sinPunto(a.descripcion)}: ${etiquetaEstadoAvance(a.ultimo.estado)}, desde el ${formatFecha(a.ultimo.approvedAt)}.`
                  : `${sinPunto(a.descripcion)}: sin avance registrado.`}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Señales activas</h3>
        {senales.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay señales activas.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {senales.map((s) => (
              <li key={s.tipo} className="prose-measure">
                {etiquetaSenal(s.tipo)}: {s.descripcion}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
