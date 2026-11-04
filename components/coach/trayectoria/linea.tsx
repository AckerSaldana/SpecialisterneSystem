// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Una línea de la trayectoria (spec 008, R-008.22, R-008.26, R-008.29). La insignia usa la misma clase
// en todas las direcciones: sin rojo ni verde y sin decir "mejora" ni "retroceso". Nada aquí es un
// conteo. Server Component: la nota no viaja como prop a un Client Component.
import { Badge } from "@/components/ui/badge";
import { Citas } from "@/components/coach/citas";
import { formatFecha, textoTipoSesion } from "@/components/coach/labels";
import { TituloEnfocable } from "@/components/coach/plan/titulo-enfocable";
import { soloParticipacion } from "@/lib/followup/validate";
import type { TipoFiltro } from "@/lib/trayectoria/filtros";
import type { Linea } from "@/lib/trayectoria/lineas";
import { CorregirLinea, type CitaAnterior } from "./corregir-linea";
import { idBloque, idLinea, textoCambio, textoCorregida, textoDireccion, textosHistorial, VER_HISTORIAL, VER_NOTA } from "./textos";

// Lo que necesita cualquier línea de la pantalla.
export type ContextoLineas = {
  engagementId: string;
  nombre: string;
  // Todas las líneas de ahora, sin filtros.
  porId: Map<string, Linea>;
  anterioresDe: (linea: Linea) => CitaAnterior[];
  notas: Record<string, string>;
  filtroTipo: TipoFiltro;
};

export function NotaDeSesion({ nota }: { nota: string | undefined }) {
  if (nota === undefined) return null;
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium underline-offset-4 hover:underline">{VER_NOTA}</summary>
      <p className="prose-measure mt-2 text-sm whitespace-pre-wrap">{nota}</p>
    </details>
  );
}

export function LineaTrayectoria({ linea, contexto }: { linea: Linea; contexto: ContextoLineas }) {
  const { engagementId, nombre, porId, anterioresDe, notas, filtroTipo } = contexto;
  const cambio = textoCambio(linea, porId);
  const ultima = linea.correcciones.at(-1);

  return (
    // Spec 012 (R-012.31): una barra fina a la izquierda separa cada línea, sin otra tarjeta dentro del dominio.
    <li className="flex flex-col gap-3 border-l-2 border-border pl-5">
      <TituloEnfocable id={idLinea(linea.lineaId)} nivel={3} className="font-semibold">
        {textoTipoSesion(linea.tipoSesion, nombre)}, el {formatFecha(linea.fecha)}.
      </TituloEnfocable>
      <Citas citas={[{ cita: linea.cita }]} />
      <div>
        <Badge variant="outline" className="h-auto">
          {textoDireccion(linea.direccion)}
        </Badge>
      </div>
      {cambio ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="prose-measure">{cambio.texto}</p>
          {cambio.cita ? <Citas citas={[{ cita: cambio.cita }]} /> : null}
          {cambio.donde ? <p className="prose-measure">{cambio.donde}</p> : null}
        </div>
      ) : null}
      {ultima ? <p className="prose-measure text-sm">{textoCorregida(ultima.autor, ultima.fecha)}</p> : null}
      <CorregirLinea
        engagementId={engagementId}
        nombre={nombre}
        lineaId={linea.lineaId}
        cita={linea.cita}
        dominio={linea.dominio}
        direccion={linea.direccion}
        anteriorLineaId={linea.anteriorLineaId}
        soloParticipacion={soloParticipacion([linea.cita])}
        anteriores={anterioresDe(linea)}
        idBloque={idBloque(linea.dominio)}
        filtroTipo={filtroTipo}
      />
      <NotaDeSesion nota={notas[linea.sessionId]} />
      <details>
        <summary className="cursor-pointer text-sm font-medium underline-offset-4 hover:underline">{VER_HISTORIAL}</summary>
        <ul className="prose-measure mt-2 flex flex-col gap-1 text-sm">
          {textosHistorial(linea, nombre).map((texto, i) => (
            <li key={i}>{texto}</li>
          ))}
        </ul>
      </details>
    </li>
  );
}
