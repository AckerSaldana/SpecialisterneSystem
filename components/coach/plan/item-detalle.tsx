// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Partes de solo lectura de un punto del plan: dominio, ficha, lo que verá la persona y evidencia.
// Sin hooks: las usan el plan vigente (Server Component) y el borrador (Client Component).
// Solo para el coach: aquí hay citas de sus notas y nombres de funciones ejecutivas (C-09).
// Spec 012 (R-012.30): "Lo que verá" resaltado, ficha y función ejecutiva como datos, y la evidencia plegable.
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
  // En el plan vigente, que ya no se edita, la evidencia va plegada; en el borrador, abierta para revisarla.
  evidenciaPlegada?: boolean;
};

// Un dominio que no está en DOMINIOS_FE no se muestra (sanitizePlan ya lo deja nulo, R-003.19).
function etiquetaDominio(id: string | null): string | null {
  return DOMINIOS_FE.find((d) => d.id === (id as DominioFE))?.etiqueta ?? null;
}

export function FichaLinea({ fichaId, fichas }: { fichaId: string | null; fichas: FichaOpcion[] }) {
  if (!fichaId) return <p className="text-muted-foreground">{SIN_FICHA}</p>;
  const ficha = fichas.find((f) => f.id === fichaId);
  // Si la ficha ya no se puede leer, se muestra al menos su ID.
  return <p className="text-muted-foreground">{ficha ? textoFicha(ficha.id, ficha.titulo) : `Ficha ${fichaId}`}</p>;
}

export function ItemDetalle({ item, nombre, fichas, fechasSesion, evidenciaPlegada = false }: Props) {
  const dominio = etiquetaDominio(item.dominioFe);
  return (
    <div className="flex flex-col gap-3">
      {esVisiblePersona(item.tipo) ? (
        item.textoPersona ? (
          <div className="prose-measure rounded-md border-l-4 border-primary bg-accent px-4 py-3">
            <p className="font-semibold">{loQueVera(nombre)}</p>
            <p>{item.textoPersona}</p>
          </div>
        ) : (
          // R-003.48: se puede aprobar, pero no pasa a persona_plans.
          <p className="prose-measure text-sm font-medium">{sinTextoPersona(nombre)}</p>
        )
      ) : null}

      <div className="flex flex-col gap-1">
        <FichaLinea fichaId={item.fichaId} fichas={fichas} />
        {dominio ? (
          <p className="text-muted-foreground">
            <span>Función ejecutiva relacionada: </span>
            {dominio}
          </p>
        ) : null}
      </div>

      {item.evidencia.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{TITULO_EVIDENCIA}</p>
          <p>{item.origen === "coach" ? SIN_EVIDENCIA_COACH : SIN_EVIDENCIA}</p>
        </div>
      ) : evidenciaPlegada ? (
        <details>
          <summary className="w-fit cursor-pointer font-semibold">
            {TITULO_EVIDENCIA} ({item.evidencia.length})
          </summary>
          <div className="mt-2">
            <Citas citas={item.evidencia.map((e) => ({ cita: e.cita, fecha: fechasSesion[e.sessionId] }))} />
          </div>
        </details>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{TITULO_EVIDENCIA}</p>
          <Citas citas={item.evidencia.map((e) => ({ cita: e.cita, fecha: fechasSesion[e.sessionId] }))} />
        </div>
      )}
    </div>
  );
}

// Avisos de validación de un punto, en texto. Un mismo mensaje no se repite.
export function AvisosItem({ banderas, nombre }: { banderas: BanderaPlan[]; nombre: string }) {
  const mensajes = [...new Set(banderas.map((b) => mensajeBandera(b, nombre)))];
  if (mensajes.length === 0) return null;
  return (
    <ul className="prose-measure flex flex-col gap-1 rounded-md border-l-4 border-destructive bg-card px-4 py-3 font-medium text-destructive">
      {mensajes.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}
