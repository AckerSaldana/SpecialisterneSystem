// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// "Qué cambió respecto a la plantilla" (spec 010, R-010.43, R-010.44). Lo calcula el código, no el modelo. Solo la ve el
// coach: la persona no ve la plantilla ni la diferencia. Si la plantilla ya no se puede leer, lo dice y el desglose sigue
// igual. Se pinta en el servidor.
import type { EntradaDiferencia } from "@/lib/desglose/diferencia";
import type { ComparacionPlantilla } from "@/lib/desglose/lectura";
import { PLANTILLA_NO_LEGIBLE, SIN_DIFERENCIA, textoCriterio, textoEntradaDiferencia, textoPasoAhora, textoPasoAntes, TITULO_DIFERENCIA, TRAE_NOTA } from "./textos";

export function QueCambio({ comparacion }: { comparacion: ComparacionPlantilla }) {
  return (
    <section aria-labelledby="que-cambio" className="flex flex-col gap-3">
      <h2 id="que-cambio" className="text-xl font-semibold">
        {TITULO_DIFERENCIA}
      </h2>
      {!comparacion.disponible ? (
        <p className="prose-measure">{PLANTILLA_NO_LEGIBLE}</p>
      ) : comparacion.quedoIgual ? (
        <p className="prose-measure">{SIN_DIFERENCIA}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comparacion.diferencia.map((d) => (
            <Entrada key={`${d.antes ?? "n"}-${d.ahora ?? "n"}`} entrada={d} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Entrada({ entrada }: { entrada: EntradaDiferencia }) {
  // Con las dos versiones cuando aplica: si es igual, dicen lo mismo.
  const conVersiones = entrada.tipo !== "igual";
  return (
    <li className="prose-measure flex flex-col gap-1 rounded-lg border border-border p-4">
      <p className="font-medium">{textoEntradaDiferencia(entrada)}</p>
      {conVersiones && entrada.pasoAntes ? (
        <>
          <p>{textoPasoAntes(entrada.pasoAntes.accion)}</p>
          <p className="text-sm">{textoCriterio(entrada.pasoAntes.criterioTerminado)}</p>
        </>
      ) : null}
      {conVersiones && entrada.pasoAhora ? (
        <>
          <p>{textoPasoAhora(entrada.pasoAhora.accion)}</p>
          <p className="text-sm">{textoCriterio(entrada.pasoAhora.criterioTerminado)}</p>
        </>
      ) : null}
      {entrada.conNota ? <p className="text-sm">{TRAE_NOTA}</p> : null}
    </li>
  );
}
