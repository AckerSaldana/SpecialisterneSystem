// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Diálogo de confirmación de las acciones que no se pueden deshacer (R-009.59). Sin confirmar no se envía nada.
// Si la acción falla, el diálogo se queda abierto con el error. Si sale bien, el botón puede ya no existir: el
// foco va a "idFoco", o espera a que ese elemento aparezca después de refrescar, igual que en
// components/persona/not-me-button.tsx y components/coach/trayectoria/corregir-linea.tsx. Si canceló, Radix
// regresa el foco al botón.
"use client";

import { useRef, useState, type ReactNode } from "react";
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
import { enfocarDespues } from "@/components/coach/plan/foco";

type Props = {
  boton: string;
  // El texto del botón más de qué se trata, para un lector de pantalla.
  etiquetaBoton?: string;
  describedBy?: string;
  variante?: "default" | "outline";
  deshabilitado?: boolean;
  titulo: string;
  // Cada párrafo del texto literal.
  texto: ReactNode[];
  cancelar: string;
  confirmar: string;
  // Lo que dice mientras espera una acción que tarda, como una llamada al modelo.
  esperando?: string;
  // Devuelve el error para mostrar, o null si salió bien.
  alConfirmar: () => Promise<string | null>;
  idFoco: string;
  // Cuando ella lo cierra, también después de un error: quien llama espera a este momento para refrescar una pantalla vieja.
  alCerrar?: () => void;
};

export function Confirmar({ boton, etiquetaBoton, describedBy, variante = "outline", deshabilitado = false, titulo, texto, cancelar, confirmar, esperando, alConfirmar, idFoco, alCerrar }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hecho = useRef(false);

  async function confirmarAccion() {
    setEnviando(true);
    setError(null);
    const fallo = await alConfirmar();
    setEnviando(false);
    if (fallo) {
      setError(fallo);
      return;
    }
    hecho.current = true;
    setAbierto(false);
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(a) => {
        if (enviando) return;
        setAbierto(a);
        setError(null);
        if (!a) alCerrar?.();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={variante} disabled={deshabilitado} aria-label={etiquetaBoton} aria-describedby={describedBy}>
          {boton}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg"
        onCloseAutoFocus={(e) => {
          if (!hecho.current) return;
          hecho.current = false;
          e.preventDefault();
          // Si todavía no existe, lo toma en cuanto se vuelva a pintar (useFocoPendiente).
          const destino = document.getElementById(idFoco);
          if (destino) destino.focus();
          else enfocarDespues(idFoco);
        }}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2">
              {texto.map((parrafo, i) => (
                <p key={i}>{parrafo}</p>
              ))}
            </div>
          </DialogDescription>
        </DialogHeader>
        {enviando && esperando ? (
          <p role="status" className="text-sm font-medium">
            {esperando}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={enviando}>
              {cancelar}
            </Button>
          </DialogClose>
          <Button disabled={enviando} onClick={confirmarAccion}>
            {confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
