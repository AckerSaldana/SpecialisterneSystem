// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Resumen al pie de un bloque con líneas (spec 008, R-008.37, R-008.38). Una propuesta se ve marcada y no
// es parte del registro del coach hasta que la aprueba. Recibe el bloque completo, sin filtros: el
// resumen toma todo el bloque. Un bloque sin líneas no pinta esto (R-008.23). Server Component: las
// citas no viajan como props a un Client Component.
import { Citas } from "@/components/coach/citas";
import { formatFecha } from "@/components/coach/labels";
import { TituloEnfocable } from "@/components/coach/plan/titulo-enfocable";
import { AccionConDialogo } from "@/components/coach/seguimiento/acciones";
import type { DominioFE } from "@/lib/profile/schema";
import type { ResumenLeido } from "@/lib/trayectoria/lectura";
import type { Linea } from "@/lib/trayectoria/lineas";
import { TEXTO_BLOQUE_CAMBIO, vigenciaResumen } from "@/lib/trayectoria/validate";
import { ProponerResumen } from "./proponer-resumen";
import { idResumen, TEXTOS_RESUMEN as T } from "./textos";

type Props = {
  engagementId: string;
  nombre: string;
  dominio: DominioFE;
  lineas: Linea[];
  propuesta: ResumenLeido | null;
  vigente: ResumenLeido | null;
};

function CitasDelResumen({ resumen, lineas }: { resumen: ResumenLeido; lineas: Linea[] }) {
  const usadas = lineas.filter((l) => resumen.lineaIds.includes(l.lineaId));
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium underline-offset-4 hover:underline">{T.verCitas}</summary>
      <div className="mt-2">
        <Citas citas={usadas.map((l) => ({ cita: l.cita, fecha: formatFecha(l.fecha) }))} />
      </div>
    </details>
  );
}

export function ResumenDominio({ engagementId, nombre, dominio, lineas, propuesta, vigente }: Props) {
  const idFoco = idResumen(dominio);
  const bloque = lineas.map((l) => l.lineaId);
  const decision = (resumen: ResumenLeido) => ({
    url: `/api/engagements/${engagementId}/funcion-ejecutiva/resumenes/${resumen.id}/decision`,
    metodo: "POST" as const,
    idFoco,
  });
  const descartar = (resumen: ResumenLeido) => (
    <AccionConDialogo
      boton={T.descartar}
      titulo={T.tituloDescartar}
      texto={T.textoDescartar}
      confirmar={T.descartar}
      cuerpo={{ accion: "descartar" }}
      {...decision(resumen)}
    />
  );

  const vigenciaVigente = vigente ? vigenciaResumen(vigente, bloque) : null;
  const vigenciaPropuesta = propuesta ? vigenciaResumen(propuesta, bloque) : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4">
      <TituloEnfocable id={idFoco} nivel={3} className="text-base font-semibold">
        {T.titulo}
      </TituloEnfocable>

      {vigente && vigenciaVigente ? (
        vigenciaVigente.lineaCambio ? (
          <p className="prose-measure font-medium">{T.aprobadoCambio(formatFecha(vigente.decidedAt ?? vigente.createdAt))}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="prose-measure">{vigente.texto}</p>
            <p className="prose-measure text-sm">{T.aprobado(vigente.decididoPor ?? "el coach", formatFecha(vigente.decidedAt ?? vigente.createdAt))}</p>
            <CitasDelResumen resumen={vigente} lineas={lineas} />
            {vigenciaVigente.citasNuevas ? <p className="prose-measure text-sm font-medium">{T.citasNuevas}</p> : null}
          </div>
        )
      ) : null}

      {propuesta ? (
        <div className="flex flex-col gap-3 rounded-lg border-2 border-dashed border-border bg-background p-3">
          {vigenciaPropuesta?.lineaCambio ? (
            <>
              <p className="prose-measure font-medium">{TEXTO_BLOQUE_CAMBIO}</p>
              <div>{descartar(propuesta)}</div>
            </>
          ) : (
            <>
              <p className="prose-measure font-medium">{T.marcaPropuesta}</p>
              <p className="prose-measure">{propuesta.texto}</p>
              <CitasDelResumen resumen={propuesta} lineas={lineas} />
              {vigenciaPropuesta?.citasNuevas ? <p className="prose-measure text-sm font-medium">{T.citasNuevas}</p> : null}
              <div className="flex flex-wrap gap-2">
                <AccionConDialogo
                  boton={T.aprobar}
                  variante="default"
                  titulo={T.tituloAprobar}
                  texto={T.textoAprobar(nombre)}
                  confirmar={T.aprobar}
                  cuerpo={{ accion: "aprobar" }}
                  {...decision(propuesta)}
                />
                {descartar(propuesta)}
              </div>
            </>
          )}
        </div>
      ) : (
        <ProponerResumen engagementId={engagementId} dominio={dominio} etiqueta={vigente ? T.proponerOtro : T.proponer} idFoco={idFoco} />
      )}

      <p className="prose-measure text-sm text-muted-foreground">{T.ayuda(nombre)}</p>
    </div>
  );
}
