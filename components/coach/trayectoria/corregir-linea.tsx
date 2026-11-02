// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Diálogo "Corregir esta línea" (spec 008, R-008.28 a R-008.31). Llama a la ruta y refresca la página.
// Las reglas y sus textos de error los decide el servidor, con las líneas de ese momento (R-008.30).
// Elegir apoyo en una cita sobre hablar poco avisa y no bloquea (R-008.31).
//
// Al guardar, la línea puede cambiar de bloque o quedar fuera de los filtros, y su botón ya no existir:
// el foco va a la línea o, si ya no se ve, al título de su bloque (R-008.27). El resultado va en una
// sola región role="status" de la página, porque la de la línea se perdería con ella.
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CorregirLineaRequest } from "@/lib/api/contracts";
import { DIRECCIONES_FE, DOMINIOS_FE, type DireccionFE, type DominioFE } from "@/lib/profile/schema";
import type { TipoFiltro } from "@/lib/trayectoria/filtros";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Citas } from "@/components/coach/citas";
import { enfocarDespues } from "@/components/coach/plan/foco";
import { CLASE_SELECT, recortar } from "@/components/coach/plan/tipos";
import { llamar } from "@/components/coach/seguimiento/acciones";
import { idLinea, TEXTOS_CORREGIR as T } from "./textos";

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

let avisar: ((texto: string) => void) | null = null;

// Se queda hasta la siguiente corrección: sin tiempo límite (C-14). Sticky para que se lea desde la línea.
export function AvisoCorreccion() {
  const [texto, setTexto] = useState("");

  useEffect(() => {
    avisar = setTexto;
    return () => {
      avisar = null;
    };
  }, []);

  return (
    <div role="status" className="sticky top-2 z-10 empty:-mb-8">
      {texto ? <p className="prose-measure rounded-lg border-2 border-primary bg-background p-3 font-medium">{texto}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diálogo
// ---------------------------------------------------------------------------

// "fecha" ya viene con formato: formatFecha se llama una sola vez, en el servidor.
export type CitaAnterior = { lineaId: string; dominio: DominioFE; cita: string; fecha: string };

type Props = {
  engagementId: string;
  nombre: string;
  lineaId: string;
  cita: string;
  dominio: DominioFE | null;
  direccion: DireccionFE | null;
  anteriorLineaId: string | null;
  // soloParticipacion([cita]), calculado en el servidor (R-008.31).
  soloParticipacion: boolean;
  // Las anteriores a esta línea en el orden de R-008.22, de todos los dominios.
  anteriores: CitaAnterior[];
  idBloque: string;
  filtroTipo: TipoFiltro;
};

export function CorregirLinea({ engagementId, nombre, lineaId, cita, dominio, direccion, anteriorLineaId, soloParticipacion, anteriores, idBloque, filtroTipo }: Props) {
  const router = useRouter();
  const base = useId();
  const [abierto, setAbierto] = useState(false);
  const [dominioElegido, setDominioElegido] = useState(dominio);
  const [direccionElegida, setDireccionElegida] = useState(direccion);
  const [anteriorElegida, setAnteriorElegida] = useState(anteriorLineaId);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardada = useRef(false);

  const delDominio = anteriores.filter((a) => a.dominio === dominioElegido);
  const conParticipacion = direccionElegida === "apoyo" && soloParticipacion;

  function cambiarAbierto(a: boolean) {
    if (guardando) return;
    setAbierto(a);
    setError(null);
    // Siempre abre con lo vigente: un intento anterior no debe aparecer y la línea pudo cambiar.
    if (a) {
      avisar?.("");
      setDominioElegido(dominio);
      setDireccionElegida(direccion);
      setAnteriorElegida(anteriorLineaId);
    }
  }

  function cambiarDominio(valor: string) {
    const nuevo = valor === "" ? null : (valor as DominioFE);
    setDominioElegido(nuevo);
    setAnteriorElegida(null);
    if (!nuevo) setDireccionElegida(null);
  }

  function cambiarDireccion(valor: string) {
    const nueva = valor === "" ? null : (valor as DireccionFE);
    setDireccionElegida(nueva);
    if (nueva !== "cambio") setAnteriorElegida(null);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const cuerpo: CorregirLineaRequest = { lineaId, dominio: dominioElegido, direccion: direccionElegida, anteriorLineaId: anteriorElegida };
    const fallo = await llamar(`/api/engagements/${engagementId}/funcion-ejecutiva/correcciones`, "POST", cuerpo);
    setGuardando(false);
    if (fallo) {
      setError(fallo);
      return;
    }
    guardada.current = true;
    avisar?.(T.guardada);
    // Las fechas no cambian: solo el filtro de tipo la puede sacar de la vista.
    enfocarDespues(filtroTipo === "todos" || filtroTipo === direccionElegida ? idLinea(lineaId) : idBloque);
    setAbierto(false);
    router.refresh();
  }

  return (
    <Dialog open={abierto} onOpenChange={cambiarAbierto}>
      <div>
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="outline" aria-label={`${T.boton}: ${recortar(cita, 60)}`}>
            {T.boton}
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        onCloseAutoFocus={(e) => {
          // Si se guardó, el foco lo toma el destino de enfocarDespues. Si canceló, Radix lo regresa al botón.
          if (guardada.current) e.preventDefault();
          guardada.current = false;
        }}
      >
        <DialogHeader>
          <DialogTitle>{T.titulo}</DialogTitle>
          <DialogDescription>{T.ayuda(nombre)}</DialogDescription>
        </DialogHeader>

        <Citas citas={[{ cita }]} />

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${base}-dominio`}>{T.dominio}</Label>
          <select
            id={`${base}-dominio`}
            value={dominioElegido ?? ""}
            onChange={(e) => cambiarDominio(e.target.value)}
            disabled={guardando}
            className={CLASE_SELECT}
          >
            {DOMINIOS_FE.map((d) => (
              <option key={d.id} value={d.id}>
                {d.etiqueta}
              </option>
            ))}
            <option value="">Ninguno</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${base}-direccion`}>{T.direccion}</Label>
          <select
            id={`${base}-direccion`}
            value={direccionElegida ?? ""}
            onChange={(e) => cambiarDireccion(e.target.value)}
            disabled={guardando || !dominioElegido}
            aria-describedby={dominioElegido ? undefined : `${base}-sin-dominio`}
            className={CLASE_SELECT}
          >
            {DIRECCIONES_FE.map((d) => (
              <option key={d.id} value={d.id}>
                {d.etiqueta}
              </option>
            ))}
            <option value="">Sin dirección</option>
          </select>
          {dominioElegido ? null : (
            <p id={`${base}-sin-dominio`} className="prose-measure text-sm text-muted-foreground">
              {T.sinDominio}
            </p>
          )}
        </div>

        {direccionElegida === "cambio" ? (
          delDominio.length > 0 ? (
            <fieldset className="flex flex-col gap-2" disabled={guardando}>
              <legend className="mb-2 text-sm font-medium">{T.anterior}</legend>
              <RadioGroup value={anteriorElegida ?? ""} onValueChange={setAnteriorElegida} className="flex flex-col gap-2">
                {delDominio.map((a, i) => (
                  <div key={a.lineaId} className="flex items-start gap-2">
                    <RadioGroupItem value={a.lineaId} id={`${base}-anterior-${i}`} className="mt-0.5" />
                    <Label htmlFor={`${base}-anterior-${i}`} className="block leading-normal font-normal">
                      {a.fecha}: “{a.cita}”
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>
          ) : (
            <p className="prose-measure text-sm">{T.sinAnteriores}</p>
          )
        ) : null}

        {conParticipacion ? (
          <p role="note" className="prose-measure rounded-lg border-2 border-primary bg-accent p-3 font-medium">
            {T.participacion(nombre)}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <p role="status" className="text-sm">
          {guardando ? T.guardando : ""}
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={guardando}>
              {T.cancelar}
            </Button>
          </DialogClose>
          <Button disabled={guardando} onClick={guardar}>
            {T.guardar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
