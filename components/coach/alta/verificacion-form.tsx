// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Paso 1 del alta: formulario de verificación del diagnóstico (spec 002, R-002.6 y R-002.7).
// Solo tiene dos casillas, el campo de cédula, el enlace a la SEP y el aviso destacado.
// No hay campo de archivo, área de texto ni zona para arrastrar documentos (R-002.6, C-02).
"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { guardarVerificacion, type VerificacionState } from "@/app/coach/engagements/[id]/actions";
import { conFalloDeRed, ERROR_SIN_RESPUESTA } from "@/components/formulario-accion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  engagementId: string;
  // Al corregir, la cédula guardada aparece escrita; las casillas se marcan otra vez.
  cedulaGuardada: string | null;
  // Solo al corregir: vuelve al estado guardado sin cambiar nada.
  urlCancelar: string | null;
};

const ORDEN = ["casillas", "cedula", "general"] as const;

// Spec 012 (R-012.39): cada casilla es una opción con borde de al menos 48px.
const CLASE_CASILLA =
  "flex min-h-12 cursor-pointer items-start gap-3 rounded-md border-(length:--border-w) border-border bg-background px-4 py-3 transition-colors has-checked:border-primary has-checked:bg-accent";

// Lo escrito regresa por el estado, igual que con un error del servidor.
const guardar = conFalloDeRed<VerificacionState>(guardarVerificacion, (_previo, datos) => ({
  errores: { general: ERROR_SIN_RESPUESTA },
  valores: {
    cedula: String(datos.get("cedula") ?? ""),
    revisoDocumento: datos.get("revisoDocumento") === "on",
    consultoSep: datos.get("consultoSep") === "on",
  },
}));

export function VerificacionForm({ engagementId, cedulaGuardada, urlCancelar }: Props) {
  const estadoInicial: VerificacionState = {
    errores: {},
    valores: { cedula: cedulaGuardada ?? "", revisoDocumento: false, consultoSep: false },
  };
  const [state, formAction, pending] = useActionState(guardar, estadoInicial);
  const refs = useRef<Partial<Record<(typeof ORDEN)[number], HTMLElement | null>>>({});

  // Como en app/login/page.tsx: cada intento con error mueve el foco al primer error.
  useEffect(() => {
    const primero = ORDEN.find((k) => state.errores[k]);
    if (primero) refs.current[primero]?.focus();
  }, [state]);

  const { errores, valores } = state;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5" noValidate>
      <input type="hidden" name="engagementId" value={engagementId} />

      <fieldset
        className="flex flex-col gap-3"
        aria-describedby={errores.casillas ? "error-casillas" : undefined}
      >
        <legend className="sr-only">Revisión del documento</legend>
        <label htmlFor="revisoDocumento" className={CLASE_CASILLA}>
          <input
            id="revisoDocumento"
            name="revisoDocumento"
            type="checkbox"
            defaultChecked={valores.revisoDocumento}
            className="mt-1 size-5 shrink-0 accent-primary"
          />
          <span>Revisé el documento fuera del sistema.</span>
        </label>

        <p>
          <a
            href="https://cedulaprofesional.sep.gob.mx"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            Consultar la cédula en el sitio de la SEP (se abre en otra pestaña)
          </a>
        </p>

        <label htmlFor="consultoSep" className={CLASE_CASILLA}>
          <input
            id="consultoSep"
            name="consultoSep"
            type="checkbox"
            defaultChecked={valores.consultoSep}
            className="mt-1 size-5 shrink-0 accent-primary"
          />
          <span>Consulté la cédula en el sitio de la SEP y coincide con el documento.</span>
        </label>

        {errores.casillas ? (
          <p
            id="error-casillas"
            ref={(el) => {
              refs.current.casillas = el;
            }}
            tabIndex={-1}
            className="foco-destino text-sm font-medium text-destructive"
          >
            {errores.casillas}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="cedula" className="font-semibold">
          Cédula profesional de quien firma el diagnóstico
        </Label>
        <p id="ayuda-cedula" className="text-sm text-muted-foreground">
          Solo números.
        </p>
        <Input
          id="cedula"
          name="cedula"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={20}
          required
          defaultValue={valores.cedula}
          aria-invalid={errores.cedula ? true : undefined}
          aria-describedby={errores.cedula ? "ayuda-cedula error-cedula" : "ayuda-cedula"}
          className="max-w-xs"
        />
        {errores.cedula ? (
          <p
            id="error-cedula"
            ref={(el) => {
              refs.current.cedula = el;
            }}
            tabIndex={-1}
            className="foco-destino text-sm font-medium text-destructive"
          >
            {errores.cedula}
          </p>
        ) : null}
      </div>

      {errores.general ? (
        <Alert
          variant="destructive"
          ref={(el) => {
            refs.current.general = el;
          }}
          tabIndex={-1}
          className="foco-destino"
        >
          <AlertDescription>{errores.general}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Guardando…" : "Guardar verificación"}
        </Button>
        {urlCancelar ? (
          <Button asChild variant="outline" size="lg">
            <Link href={urlCancelar}>Cancelar</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
