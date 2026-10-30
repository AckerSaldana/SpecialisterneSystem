// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Sección "Tus datos y tu consentimiento" (spec 002, R-002.27 a R-002.29, R-002.35).
// - Vigente (en /persona): la fecha, el enlace al aviso y "Retirar mi consentimiento", que abre un
//   Dialog de confirmación con el texto literal de la spec. Sin confirmar no se envía nada.
// - Retirado (arriba de /bienvenida/aviso, porque sin consentimiento vigente la persona solo
//   puede ver esa pantalla, R-002.19): la fecha del retiro y "Dar mi consentimiento otra vez",
//   que lleva a la casilla del aviso en la misma página.
// Las fechas llegan ya escritas desde el servidor, para que no cambien con la zona del navegador.
"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { retirarConsentimiento, type RetiroState } from "@/app/persona/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

type Props =
  | { estado: "vigente"; fecha: string; hrefAviso: string }
  | { estado: "retirado"; fecha: string; hrefDarOtraVez: string };

const estadoInicial: RetiroState = { error: null };

export function ConsentimientoPersona(props: Props) {
  return (
    <section aria-labelledby="consentimiento-titulo" className="flex flex-col gap-3">
      <h2 id="consentimiento-titulo" className="text-xl font-semibold">
        Tus datos y tu consentimiento
      </h2>
      {props.estado === "vigente" ? (
        <Vigente fecha={props.fecha} hrefAviso={props.hrefAviso} />
      ) : (
        <>
          <p className="prose-measure">
            Retiraste tu consentimiento el {props.fecha}. Tu coach no puede guardar notas nuevas en el sistema.
          </p>
          <Button asChild size="lg" className="w-fit">
            <Link href={props.hrefDarOtraVez}>Dar mi consentimiento otra vez</Link>
          </Button>
        </>
      )}
    </section>
  );
}

function Vigente({ fecha, hrefAviso }: { fecha: string; hrefAviso: string }) {
  const [abierto, setAbierto] = useState(false);
  const [state, formAction, pending] = useActionState(retirarConsentimiento, estadoInicial);
  const errorRef = useRef<HTMLDivElement>(null);

  // Si la action falla, el Dialog sigue abierto y el error recibe el foco.
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);

  return (
    <>
      <p className="prose-measure">Diste tu consentimiento el {fecha}. Puedes retirarlo cuando quieras.</p>
      <p>
        <Link href={hrefAviso}>Leer el aviso de privacidad</Link>
      </p>
      <Dialog
        open={abierto}
        onOpenChange={(v) => {
          // Mientras se envía no se cierra, para no perder el resultado.
          if (!pending) setAbierto(v);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" size="lg" className="w-fit">
            Retirar mi consentimiento
          </Button>
        </DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Retirar mi consentimiento</DialogTitle>
            <DialogDescription className="text-foreground">
              Vas a retirar tu consentimiento. Tu coach ya no podrá guardar notas nuevas ni usar la inteligencia
              artificial con tu información. Lo que ya está guardado deja de mostrarse, también para tu coach, y no se
              borra. Puedes dar tu consentimiento otra vez cuando quieras.
            </DialogDescription>
          </DialogHeader>
          {state.error ? (
            <Alert variant="destructive" ref={errorRef} tabIndex={-1} className="foco-destino">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <p role="status" className="text-sm">
            {pending ? "Guardando…" : ""}
          </p>
          <form action={formAction}>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                Sí, retirar mi consentimiento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
