// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// "Pedir un borrador para {nombre}" (spec 009, R-009.2, R-009.13, R-009.47). La respuesta viene vacía: sin
// líneas, conteos ni id, porque el coach no lee borradores (R-009.34). Mientras espera muestra un texto fijo, sin
// contador ni tiempo límite (C-14). Un 409 puede querer decir que ya hay versiones: también se refresca, para que
// el botón se vaya si ya no aplica.
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { llamarApi } from "@/components/coach/plan/api";
import { enfocarDespues } from "@/components/coach/plan/foco";
import { DIALOGO_PEDIR, ERROR_RED, ESPERANDO, idFocoTras409, textoAyuda, textoBoton, textoResultado } from "./textos";

type Props = { engagementId: string; nombre: string };

export function PedirBorradorCoach({ engagementId, nombre }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [esperando, setEsperando] = useState(false);
  const [resultado, setResultado] = useState<{ texto: string; error: boolean } | null>(null);
  const mensajeRef = useRef<HTMLParagraphElement>(null);
  const moverFoco = useRef(false);

  async function pedir() {
    setEsperando(true);
    setResultado(null);
    const r = await llamarApi(`/api/engagements/${engagementId}/shared-guides`, { method: "POST" });
    setEsperando(false);
    if (r.ok) setResultado({ texto: textoResultado(nombre), error: false });
    else {
      setResultado({ texto: r.error ?? ERROR_RED, error: true });
      if (r.status === 409) {
        // Si la página ya no va a pintar este botón, el mensaje se va con él: el foco pasa a lo que aparece en su lugar.
        const destino = r.error ? idFocoTras409(r.error, nombre) : null;
        if (destino) enfocarDespues(destino);
        router.refresh();
      }
    }
    moverFoco.current = true;
    setAbierto(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Dialog
        open={abierto}
        onOpenChange={(a) => {
          if (!esperando) setAbierto(a);
        }}
      >
        <div>
          <DialogTrigger asChild>
            <Button type="button" size="lg" aria-describedby="ayuda-pedir-borrador">
              {textoBoton(nombre)}
            </Button>
          </DialogTrigger>
        </div>
        <DialogContent
          showCloseButton={false}
          onCloseAutoFocus={(e) => {
            // El resultado se lee primero: el foco va a él. Si canceló, Radix lo regresa al botón.
            if (moverFoco.current) {
              moverFoco.current = false;
              e.preventDefault();
              mensajeRef.current?.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{DIALOGO_PEDIR.titulo}</DialogTitle>
            <DialogDescription>{DIALOGO_PEDIR.texto(nombre)}</DialogDescription>
          </DialogHeader>
          <p role="status" className="text-sm font-medium">
            {esperando ? ESPERANDO : ""}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={esperando}>
                {DIALOGO_PEDIR.cancelar}
              </Button>
            </DialogClose>
            <Button disabled={esperando} onClick={pedir}>
              {DIALOGO_PEDIR.confirmar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p id="ayuda-pedir-borrador" className="prose-measure text-sm text-muted-foreground">
        {textoAyuda(nombre)}
      </p>
      <p
        ref={mensajeRef}
        tabIndex={-1}
        role={resultado?.error ? "alert" : "status"}
        className={`foco-destino prose-measure font-medium ${resultado?.error ? "text-destructive" : ""}`}
      >
        {resultado?.texto ?? ""}
      </p>
    </div>
  );
}
