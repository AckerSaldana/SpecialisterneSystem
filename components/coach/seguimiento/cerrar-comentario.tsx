// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Cierre de un "Esto no me representa" por el coach (spec 005, R-005.26, R-005.27, R-005.34). Llama a
// POST /api/profile-events/[id]/cierre y refresca la página. "Hubo cambios" solo se puede elegir si
// hay una propuesta o una versión del plan aprobada después del comentario. Al cerrar, el botón
// desaparece: el foco va a un título de la página ("idFoco"), igual que en acciones.tsx.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CerrarComentarioRequest } from "@/lib/api/contracts";
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
import { enfocar, llamar } from "./acciones";

const TEXTOS = {
  perfil: {
    conCambios: "Hubo cambios al perfil",
    sinCambios: "Sin cambios al perfil",
    deshabilitada: "Para marcar cambios, primero aprueba una propuesta con esos cambios.",
    pregunta: "¿Qué propuesta resolvió este comentario?",
  },
  plan: {
    conCambios: "Hubo cambios al plan",
    sinCambios: "Sin cambios al plan",
    deshabilitada: "Para marcar cambios, primero aprueba una versión nueva del plan.",
    pregunta: "¿Qué versión del plan resolvió este comentario?",
  },
} as const;

type Props = {
  eventId: string;
  nombre: string;
  origen: "perfil" | "plan";
  // Lo que puede resolver este comentario, ya filtrado por el servidor (R-005.27, R-005.34).
  opciones: { id: string; texto: string }[];
  idFoco: string;
};

export function CerrarComentario({ eventId, nombre, origen, opciones, idFoco }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [resultado, setResultado] = useState<"con_cambios" | "sin_cambios" | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const textos = TEXTOS[origen];
  const sinOpciones = opciones.length === 0;
  const completo = resultado === "sin_cambios" || (resultado === "con_cambios" && elegida !== null);
  const idDeshabilitada = `cierre-${eventId}-explicacion`;

  async function confirmar() {
    if (!resultado) return;
    setGuardando(true);
    setError(null);
    const cuerpo = CerrarComentarioRequest.parse(
      resultado === "sin_cambios"
        ? { resultado }
        : { resultado, ...(origen === "perfil" ? { resueltoPorEvento: elegida } : { resueltoPorPlan: elegida }) },
    );
    const fallo = await llamar(`/api/profile-events/${eventId}/cierre`, "POST", cuerpo);
    setGuardando(false);
    if (fallo) {
      setError(fallo);
      return;
    }
    setListo(true);
    setAbierto(false);
    router.refresh();
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(a) => {
        if (guardando) return;
        setAbierto(a);
        // Lo elegido y el error de un intento anterior no deben aparecer al abrirlo otra vez.
        if (!a) {
          setError(null);
          setResultado(null);
          setElegida(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Marcar como revisado con {nombre}
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
          <DialogTitle>¿Marcar este comentario como revisado?</DialogTitle>
          <DialogDescription>{nombre} verá el resultado la próxima vez que entre.</DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={resultado ?? ""}
          onValueChange={(v) => setResultado(v as "con_cambios" | "sin_cambios")}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem
              value="con_cambios"
              id={`cierre-${eventId}-con`}
              disabled={sinOpciones}
              aria-describedby={sinOpciones ? idDeshabilitada : undefined}
            />
            <Label htmlFor={`cierre-${eventId}-con`}>{textos.conCambios}</Label>
          </div>
          {sinOpciones ? (
            <p id={idDeshabilitada} className="prose-measure text-sm text-muted-foreground">
              {textos.deshabilitada}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <RadioGroupItem value="sin_cambios" id={`cierre-${eventId}-sin`} />
            <Label htmlFor={`cierre-${eventId}-sin`}>{textos.sinCambios}</Label>
          </div>
        </RadioGroup>

        {resultado === "con_cambios" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{textos.pregunta}</legend>
            <RadioGroup value={elegida ?? ""} onValueChange={setElegida} className="flex flex-col gap-2">
              {opciones.map((o) => (
                <div key={o.id} className="flex items-center gap-2">
                  <RadioGroupItem value={o.id} id={`cierre-${eventId}-${o.id}`} />
                  <Label htmlFor={`cierre-${eventId}-${o.id}`}>{o.texto}</Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
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
          <Button disabled={guardando || !completo} onClick={confirmar}>
            Sí, marcar como revisado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
