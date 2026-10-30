// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Partes de solo lectura de un punto del plan: dominio, ficha, lo que verá la persona y evidencia.
// Sin hooks: las usan el plan vigente (Server Component) y el borrador (Client Component).
// Solo para el coach: aquí hay citas de sus notas y nombres de funciones ejecutivas (C-09).
import { DOMINIOS_FE, type DominioFE } from "@/lib/profile/schema";
import { esVisiblePersona, type BanderaPlan } from "@/lib/plan/schema";
import { Citas } from "@/components/coach/citas";
import type { FichaOpcion, ItemLectura } from "./tipos";
import {
  SIN_EVIDENCIA,
  SIN_EVIDENCIA_COACH,
  SIN_FICHA,
  TITULO_EVIDENCIA,
  loQueVera,
  mensajeBandera,
  sinTextoPersona,
  textoFicha,
} from "./textos";

type Props = {
  item: ItemLectura;
  nombre: string;
  fichas: FichaOpcion[];
  // sessionId -> fecha ya formateada (formatFecha), para "Sesión del {fecha}".
  fechasSesion: Record<string, string>;
};

// Un dominio que no está en DOMINIOS_FE no se muestra (sanitizePlan ya lo deja nulo, R-003.19).
function etiquetaDominio(id: string | null): string | null {
  return DOMINIOS_FE.find((d) => d.id === (id as DominioFE))?.etiqueta ?? null;
}

export function FichaLinea({ fichaId, fichas }: { fichaId: string | null; fichas: FichaOpcion[] }) {
  if (!fichaId) return <p className="text-sm">{SIN_FICHA}</p>;
  const ficha = fichas.find((f) => f.id === fichaId);
  // Si la ficha ya no se puede leer, se muestra al menos su ID.
  return <p className="text-sm">{ficha ? textoFicha(ficha.id, ficha.titulo) : `Ficha ${fichaId}`}</p>;
}

export function ItemDetalle({ item, nombre, fichas, fechasSesion }: Props) {
  const dominio = etiquetaDominio(item.dominioFe);
  return (
    <div className="flex flex-col gap-3">
      {esVisiblePersona(item.tipo) ? (
        item.textoPersona ? (
          <div className="prose-measure rounded-lg bg-muted p-3">
            <p className="text-sm font-medium">{loQueVera(nombre)}</p>
            <p>{item.textoPersona}</p>
          </div>
        ) : (
          // R-003.48: se puede aprobar, pero no pasa a persona_plans.
          <p className="prose-measure text-sm font-medium">{sinTextoPersona(nombre)}</p>
        )
      ) : null}

      <FichaLinea fichaId={item.fichaId} fichas={fichas} />
      {dominio ? (
        <p className="text-sm">
          <span className="font-medium">Función ejecutiva relacionada: </span>
          {dominio}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{TITULO_EVIDENCIA}</p>
        {item.evidencia.length > 0 ? (
          <Citas citas={item.evidencia.map((e) => ({ cita: e.cita, fecha: fechasSesion[e.sessionId] }))} />
        ) : (
          <p className="text-sm">{item.origen === "coach" ? SIN_EVIDENCIA_COACH : SIN_EVIDENCIA}</p>
        )}
      </div>
    </div>
  );
}

// Avisos de validación de un punto, en texto. Un mismo mensaje no se repite.
export function AvisosItem({ banderas, nombre }: { banderas: BanderaPlan[]; nombre: string }) {
  const mensajes = [...new Set(banderas.map((b) => mensajeBandera(b, nombre)))];
  if (mensajes.length === 0) return null;
  return (
    <ul className="prose-measure flex flex-col gap-1 rounded-lg border-2 border-destructive p-3 text-sm font-medium">
      {mensajes.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}
