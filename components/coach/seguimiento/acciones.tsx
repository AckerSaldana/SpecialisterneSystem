// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Botones de seguimiento que llaman a una ruta y refrescan la página (spec 004). Cuando el botón
// desaparece al refrescar, el foco va a un título de la sección ("idFoco"): sin eso quedaría en <body>.
"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, ProposeResponse } from "@/lib/api/contracts";
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

async function llamar(url: string, metodo: "POST" | "PATCH", cuerpo?: object): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: cuerpo ? { "Content-Type": "application/json" } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (res.ok) return null;
    const err = ApiError.safeParse(await res.json().catch(() => null));
    return err.success ? err.data.error : "No se pudo guardar el cambio. Intenta de nuevo.";
  } catch {
    return "No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo.";
  }
}

function enfocar(idFoco: string) {
  document.getElementById(idFoco)?.focus();
}

type DialogoProps = {
  boton: string;
  variante?: "outline" | "default";
  titulo: string;
  texto: ReactNode;
  // Sin etiqueta, el diálogo no pide nota. "campoNota" es la llave del body donde va si no está vacía.
  etiquetaNota?: string;
  campoNota?: string;
  confirmar: string;
  url: string;
  metodo: "POST" | "PATCH";
  // Datos y no una función: este componente recibe sus props desde un componente de servidor.
  cuerpo: Record<string, string>;
  idFoco: string;
};

export function AccionConDialogo({ boton, variante = "outline", titulo, texto, etiquetaNota, campoNota, confirmar, url, metodo, cuerpo, idFoco }: DialogoProps) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  async function enviar() {
    setGuardando(true);
    setError(null);
    const limpia = nota.trim();
    const fallo = await llamar(url, metodo, { ...cuerpo, ...(campoNota && limpia ? { [campoNota]: limpia } : {}) });
    setGuardando(false);
    if (fallo) {
      setError(fallo);
      return;
    }
    setListo(true);
    setAbierto(false);
    setNota("");
    router.refresh();
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(a) => {
        if (guardando) return;
        setAbierto(a);
        // El error de un intento anterior no debe aparecer al abrirlo otra vez.
        if (!a) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant={variante}>
          {boton}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={(e) => {
          if (listo) {
            e.preventDefault();
            setListo(false);
            enfocar(idFoco);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{texto}</DialogDescription>
        </DialogHeader>
        {etiquetaNota ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`nota-${url}`}>{etiquetaNota}</Label>
            <Textarea id={`nota-${url}`} value={nota} maxLength={1000} onChange={(e) => setNota(e.target.value)} />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <p role="status" className="text-sm">
          {guardando ? "Guardando." : ""}
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={guardando}>
              Cancelar
            </Button>
          </DialogClose>
          <Button disabled={guardando} onClick={enviar}>
            {confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// "Ya no aplica" en una pregunta, un contexto o un siguiente paso (R-004.23).
export function BotonYaNoAplica({ contextoId, idFoco }: { contextoId: string; idFoco: string }) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function quitar() {
    setGuardando(true);
    setError(null);
    const fallo = await llamar(`/api/followup-context/${contextoId}`, "PATCH");
    setGuardando(false);
    if (fallo) {
      setError(fallo);
      return;
    }
    enfocar(idFoco);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled={guardando} onClick={quitar}>
        Ya no aplica
      </Button>
      {error ? (
        <span role="alert" className="text-sm font-medium text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}

// "Pedir la propuesta" de una sesión sin propuesta (R-004.29, R-004.31).
export function BotonPedirPropuesta({ engagementId, sessionId }: { engagementId: string; sessionId: string }) {
  const router = useRouter();
  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existente, setExistente] = useState<string | null>(null);

  async function pedir() {
    setPidiendo(true);
    setError(null);
    // Con éxito sigue en "pidiendo" hasta que cambie la página: si no, se podría pedir otra vez.
    let navegando = false;
    try {
      const res = await fetch(`/api/engagements/${engagementId}/sessions/${sessionId}/proposal`, { method: "POST" });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const err = ApiError.safeParse(json);
        if (err.success && err.data.eventId) setExistente(err.data.eventId);
        setError(err.success ? err.data.error : "No se pudo generar la propuesta. Intenta de nuevo.");
        return;
      }
      const { eventId } = ProposeResponse.parse(json);
      navegando = true;
      router.push(`/coach/engagements/${engagementId}/proposals/${eventId}`);
    } catch {
      setError("No se pudo generar la propuesta. Revisa tu conexión e intenta de nuevo.");
    } finally {
      if (!navegando) setPidiendo(false);
    }
  }

  return (
    <span className="flex flex-col gap-1">
      <span>
        <Button type="button" size="sm" disabled={pidiendo} onClick={pedir}>
          Pedir la propuesta
        </Button>
      </span>
      <span role="status" aria-live="polite" className="text-sm">
        {pidiendo ? "Generando la propuesta. Puede tardar unos segundos." : ""}
      </span>
      {error ? (
        <span role="alert" className="text-sm font-medium text-destructive">
          {error}
        </span>
      ) : null}
      {existente ? (
        <Link href={`/coach/engagements/${engagementId}/proposals/${existente}`} className="text-sm font-medium underline underline-offset-4">
          Ver la propuesta
        </Link>
      ) : null}
    </span>
  );
}
