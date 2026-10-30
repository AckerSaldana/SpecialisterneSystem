// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Campos del formulario de un punto del borrador: texto para el coach, lo que verá la persona
// (solo objetivo y apoyo_fe, R-003.11), ficha y "Sigue al punto de la versión {v}:" (R-003.50).
// Los usan editar (item-plan.tsx) y agregar (agregar-item.tsx). Controlados por el padre.
"use client";

import { esVisiblePersona, type TipoItemPlan } from "@/lib/plan/schema";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CLASE_SELECT, recortar, type FichaOpcion, type PuntoVigente } from "./tipos";
import { PUNTO_NUEVO, SIN_FICHA, loQueVera, siguePunto, textoFicha } from "./textos";

export type ValoresItem = {
  descripcion: string;
  textoPersona: string;
  fichaId: string; // "" = sin ficha
  origenItemId: string; // "" = es un punto nuevo
};

type Props = {
  prefijo: string; // para los id de los campos; único en la página
  tipo: TipoItemPlan;
  nombre: string;
  valores: ValoresItem;
  cambiar: (v: Partial<ValoresItem>) => void;
  fichas: FichaOpcion[];
  // Ficha que ya tenía el punto. Si dejó de estar verificada sigue en la lista para no perderla
  // sin querer; solo se envía si el coach la cambia.
  fichaActual: string | null;
  vigente: { version: number; puntos: PuntoVigente[] } | null;
  errorDescripcion: string | null;
  disabled: boolean;
};

export function CamposItem({
  prefijo,
  tipo,
  nombre,
  valores,
  cambiar,
  fichas,
  fichaActual,
  vigente,
  errorDescripcion,
  disabled,
}: Props) {
  const opcionesFicha = fichas.filter((f) => f.verificada || f.id === fichaActual);
  const idError = `${prefijo}-descripcion-error`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefijo}-descripcion`}>Texto del punto</Label>
        <Textarea
          id={`${prefijo}-descripcion`}
          value={valores.descripcion}
          onChange={(e) => cambiar({ descripcion: e.target.value })}
          maxLength={800}
          rows={4}
          disabled={disabled}
          aria-invalid={errorDescripcion ? true : undefined}
          aria-describedby={errorDescripcion ? idError : undefined}
          className="max-w-prose"
        />
        {/* Sin role="alert" a propósito: el padre mueve el foco al campo después de pintar el
            error y el lector lo lee por aria-describedby; un alert lo leería dos veces. */}
        {errorDescripcion ? (
          <p id={idError} className="text-sm font-medium text-destructive">
            {errorDescripcion}
          </p>
        ) : null}
      </div>

      {esVisiblePersona(tipo) ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefijo}-texto-persona`}>{loQueVera(nombre)}</Label>
          <Textarea
            id={`${prefijo}-texto-persona`}
            value={valores.textoPersona}
            onChange={(e) => cambiar({ textoPersona: e.target.value })}
            maxLength={400}
            rows={3}
            disabled={disabled}
            className="max-w-prose"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefijo}-ficha`}>Ficha</Label>
        <select
          id={`${prefijo}-ficha`}
          value={valores.fichaId}
          onChange={(e) => cambiar({ fichaId: e.target.value })}
          disabled={disabled}
          className={CLASE_SELECT}
        >
          <option value="">{SIN_FICHA}</option>
          {opcionesFicha.map((f) => (
            <option key={f.id} value={f.id}>
              {textoFicha(f.id, f.titulo)}
            </option>
          ))}
        </select>
      </div>

      {vigente ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefijo}-sigue`}>{siguePunto(vigente.version)}</Label>
          <select
            id={`${prefijo}-sigue`}
            value={valores.origenItemId}
            onChange={(e) => cambiar({ origenItemId: e.target.value })}
            disabled={disabled}
            className={CLASE_SELECT}
          >
            <option value="">{PUNTO_NUEVO}</option>
            {vigente.puntos.map((p) => (
              <option key={p.id} value={p.id}>
                «{recortar(p.descripcion)}»
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
