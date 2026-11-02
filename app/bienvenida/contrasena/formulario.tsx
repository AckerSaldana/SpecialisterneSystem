// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Formulario de /bienvenida/contrasena. Client Component por useActionState; la contraseña se
// guarda en el servidor (./actions.ts). El error queda en texto y recibe el foco, como en
// app/login/page.tsx.
"use client";

import { useActionState, useEffect, useRef } from "react";
import { conFalloDeRed, ERROR_SIN_RESPUESTA } from "@/components/formulario-accion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardarContrasena, type ContrasenaState } from "./actions";

const estadoInicial: ContrasenaState = { error: null, campo: null };
const guardar = conFalloDeRed<ContrasenaState>(guardarContrasena, () => ({ error: ERROR_SIN_RESPUESTA, campo: null }));

export function FormularioContrasena() {
  const [state, formAction, pending] = useActionState(guardar, estadoInicial);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);

  const invalido = (campo: "contrasena" | "repetida") =>
    state.error && (state.campo === campo || state.campo === null) ? true : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="contrasena">Contraseña nueva</Label>
        <Input
          id="contrasena"
          name="contrasena"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={invalido("contrasena")}
          aria-describedby={invalido("contrasena") ? "contrasena-error" : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="repetida">Escríbela otra vez</Label>
        <Input
          id="repetida"
          name="repetida"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={invalido("repetida")}
          aria-describedby={invalido("repetida") ? "contrasena-error" : undefined}
        />
      </div>

      {state.error ? (
        <Alert variant="destructive" id="contrasena-error" ref={errorRef} tabIndex={-1} className="foco-destino">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
