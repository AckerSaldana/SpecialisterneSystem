// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Plan vigente (spec 003, tarea 19): el aprobado con la versión más alta (R-003.33). No se edita
// (R-003.32). Si hay un snapshot más nuevo que el del plan, muestra el aviso de perfil nuevo con
// "Pedir propuesta nueva" (R-003.36). Nada se regenera solo. Sin hooks: es un Server Component
// que monta dos Client Components (el título enfocable y el botón de propuesta).
// Spec 012 (R-012.30): aviso con barra de acento, grupos con su número y puntos en tarjetas con la evidencia plegada.
import { ItemDetalle } from "./item-detalle";
import { PedirPropuesta } from "./pedir-propuesta";
import { TituloEnfocable } from "./titulo-enfocable";
import { SIN_FICHAS, YA_HAY_BORRADOR, avisoPerfilNuevo, encabezadoVigente, notaGrupo } from "./textos";
import { ID_VIGENTE, agruparPorTipo, type FichaOpcion, type ItemLectura } from "./tipos";

export type PlanVigenteDatos = {
  id: string;
  version: number;
  aprobadoEn: string; // ya formateada con formatFecha
  aprobadoPor: string;
  snapshotVersion: number;
  items: ItemLectura[];
};

type Props = {
  engagementId: string;
  nombre: string;
  plan: PlanVigenteDatos;
  snapshotActualVersion: number;
  hayBorrador: boolean;
  hayFichasVerificadas: boolean;
  fichas: FichaOpcion[];
  fechasSesion: Record<string, string>;
};

// El aviso solo depende de las versiones: cerrar una señal no crea snapshot (R-003.36).
export const perfilCambio = (plan: { snapshotVersion: number }, snapshotActualVersion: number) =>
  snapshotActualVersion > plan.snapshotVersion;

export function PlanVigente({
  engagementId,
  nombre,
  plan,
  snapshotActualVersion,
  hayBorrador,
  hayFichasVerificadas,
  fichas,
  fechasSesion,
}: Props) {
  const grupos = agruparPorTipo(plan.items).filter((g) => g.items.length > 0);
  return (
    <section aria-labelledby={ID_VIGENTE} className="flex flex-col gap-6">
      <TituloEnfocable id={ID_VIGENTE} nivel={3} className="font-serif text-2xl">
        {encabezadoVigente(plan.version, plan.aprobadoEn, plan.aprobadoPor)}
      </TituloEnfocable>

      {perfilCambio(plan, snapshotActualVersion) ? (
        <div role="note" className="prose-measure flex flex-col gap-3 rounded-md border-l-4 border-primary bg-accent px-5 py-4">
          <p className="font-medium">{avisoPerfilNuevo(plan.snapshotVersion, snapshotActualVersion)}</p>
          {hayBorrador ? (
            <p>{YA_HAY_BORRADOR}</p>
          ) : (
            <PedirPropuesta
              engagementId={engagementId}
              etiqueta="Pedir propuesta nueva"
              notas={hayFichasVerificadas ? [] : [SIN_FICHAS]}
            />
          )}
        </div>
      ) : null}

      {grupos.map((grupo) => {
        const nota = notaGrupo(grupo.id, nombre);
        return (
          <section key={grupo.id} aria-labelledby={`vigente-${grupo.id}`} className="flex flex-col gap-3">
            <h4 id={`vigente-${grupo.id}`} className="text-xl font-semibold">
              {grupo.grupo} <span className="font-normal text-muted-foreground">({grupo.items.length})</span>
            </h4>
            {nota ? <p className="prose-measure text-muted-foreground">{nota}</p> : null}
            <ul className="flex flex-col gap-3">
              {grupo.items.map((item) => (
                <li key={item.id} className="flex flex-col gap-4 rounded-lg border-(length:--border-w) border-border bg-card px-6 py-5">
                  <p className="prose-measure text-lg leading-snug">{item.descripcion}</p>
                  <ItemDetalle item={item} nombre={nombre} fichas={fichas} fechasSesion={fechasSesion} evidenciaPlegada />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
