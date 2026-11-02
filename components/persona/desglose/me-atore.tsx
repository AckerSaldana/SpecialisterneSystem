// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// "Me atoré aquí" (spec 010, R-010.28): un diálogo con un campo opcional y el aviso literal. Nada se guarda hasta
// confirmar, y al cancelar no hay fila. Si falla, el diálogo se queda abierto con el error y con lo que escribió, también si
// la tarea ya no está: la pantalla espera a que lo cierre para refrescar (alCerrar). Si sale bien, el botón ya no va a
// existir: el foco va al título del paso. Si canceló, Radix regresa el foco al botón.
"use client";

import { useRef, useState } from "react";
import { MAX_TEXTO_MARCA } from "@/lib/desglose/schema-cliente";
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
import { Textarea } from "@/components/ui/textarea";
import { BOTONES_PASO, DIALOGO_ATORE, etiquetaBotonPaso } from "./textos";

type Props = {
  numero: number;
  deshabilitado: boolean;
  idFoco: string;
  // Devuelve el error para mostrar, o null si salió bien. Con el campo vacío, texto es null.
  alGuardar: (texto: string | null) => Promise<string | null>;
  // Cuando ella lo cierra, también después de un error.
  alCerrar: () => void;
};

export function MeAtore({ numero, deshabilitado, idFoco, alGuardar, alCerrar }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hecho = useRef(false);
  const idCampo = `me-atore-${numero}`;

  async function guardar() {
    setGuardando(true);
    setError(null);
    const fallo = await alGuardar(texto.trim() || null);
    setGuardando(false);
    if (fallo) {
      setError(fallo);
      return;
    }
    hecho.current = true;
    setTexto("");
    setAbierto(false);
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(a) => {
        if (guardando) return;
        setAbierto(a);
        setError(null);
        if (!a) alCerrar();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={deshabilitado} aria-label={etiquetaBotonPaso(BOTONES_PASO.atorado, numero)}>
          {BOTONES_PASO.atorado}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg"
        onCloseAutoFocus={(e) => {
          if (!hecho.current) return;
          hecho.current = false;
          e.preventDefault();
          document.getElementById(idFoco)?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{DIALOGO_ATORE.titulo}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2">
              <p>{DIALOGO_ATORE.texto}</p>
              <p>{DIALOGO_ATORE.ayudaAhora}</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={idCampo}>{DIALOGO_ATORE.campo}</Label>
          <Textarea id={idCampo} value={texto} onChange={(e) => setTexto(e.target.value)} readOnly={guardando} maxLength={MAX_TEXTO_MARCA} rows={4} aria-describedby={`${idCampo}-ayuda`} />
          <p id={`${idCampo}-ayuda`} className="text-sm text-muted-foreground">
            {DIALOGO_ATORE.ayuda}
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={guardando}>
              {DIALOGO_ATORE.cancelar}
            </Button>
          </DialogClose>
          <Button disabled={guardando} onClick={guardar}>
            {DIALOGO_ATORE.confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
