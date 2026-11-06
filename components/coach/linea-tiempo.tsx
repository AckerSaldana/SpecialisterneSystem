// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// "Línea de tiempo de sesiones" (spec 012, R-012.18, R-012.27; docs/panel-coach.jpeg): de la más reciente a la más vieja,
// con el tipo y la fecha, quién observó si se anotó, el principio de la nota del coach y "Ver detalle" hacia su propuesta.
// Las 4 más recientes se ven; las anteriores, dentro de un <details>. Solo la ve el coach (C-09). El extracto es la nota
// tal cual: no hay resumen escrito por la IA. La línea y los puntos son bordes con tokens, sin imágenes.
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { extractoNota, formatFecha, SESIONES_VISIBLES, textoAnteriores, textoTipoSesion } from "@/components/coach/labels";
import type { TipoSesion } from "@/lib/followup/schema";

export type SesionLinea = { id: string; tipo: TipoSesion; realizadaEn: Date; observador: string | null; nota: string; propuestaId: string | null };

function Sesiones({ sesiones, engagementId, nombre }: { sesiones: SesionLinea[]; engagementId: string; nombre: string }) {
  return (
    <ol className="flex flex-col border-l-2 border-border">
      {sesiones.map((s) => (
        <li key={s.id} className="relative flex flex-col gap-2 pb-6 pl-6 last:pb-0">
          <span aria-hidden="true" className="absolute top-2 -left-[7px] size-3 rounded-full border-2 border-primary bg-background" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="text-lg">
              <span className="font-semibold">{textoTipoSesion(s.tipo, nombre)}</span>{" "}
              <span className="text-muted-foreground">({formatFecha(s.realizadaEn)})</span>
            </h3>
            {s.propuestaId ? (
              <Button asChild variant="outline" size="xs">
                <Link href={`/coach/engagements/${engagementId}/proposals/${s.propuestaId}`}>
                  Ver detalle<span className="sr-only">: {textoTipoSesion(s.tipo, nombre)}, {formatFecha(s.realizadaEn)}</span>
                </Link>
              </Button>
            ) : null}
          </div>
          {s.observador ? <p className="text-muted-foreground">Observó: {s.observador}</p> : null}
          <p className="prose-measure">{extractoNota(s.nota)}</p>
        </li>
      ))}
    </ol>
  );
}

export function LineaTiempo({ sesiones, engagementId, nombre }: { sesiones: SesionLinea[]; engagementId: string; nombre: string }) {
  const recientes = sesiones.slice(0, SESIONES_VISIBLES);
  const anteriores = sesiones.slice(SESIONES_VISIBLES);
  return (
    <section aria-labelledby="linea-tiempo" className="flex scroll-mt-6 flex-col gap-6">
      <h2 id="linea-tiempo" className="text-3xl">
        Línea de tiempo de sesiones
      </h2>
      {sesiones.length === 0 ? (
        <p className="prose-measure text-muted-foreground">Todavía no hay sesiones.</p>
      ) : (
        <>
          <Sesiones sesiones={recientes} engagementId={engagementId} nombre={nombre} />
          {anteriores.length > 0 ? (
            <details className="group">
              <summary className="w-fit cursor-pointer underline underline-offset-4">{textoAnteriores(anteriores.length)}</summary>
              <div className="mt-6">
                <Sesiones sesiones={anteriores} engagementId={engagementId} nombre={nombre} />
              </div>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}
