// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Formulario de /invitacion. Client Component por useActionState; la revisión del código pasa
// en el servidor (./actions.ts). Mismo manejo de errores que app/login/page.tsx: el error queda
// en texto junto al formulario y recibe el foco.
"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { entrarConCodigo, type InvitacionState } from "./actions";

export function FormularioInvitacion({ errorInicial }: { errorInicial: string | null }) {
  const [state, formAction, pending] = useActionState<InvitacionState, FormData>(entrarConCodigo, {
    error: errorInicial,
    email: "",
  });
  const errorRef = useRef<HTMLDivElement>(null);

  // Corre al cargar (aviso de código vencido) y en cada respuesta de la action.
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);

  const describe = state.error ? "invitacion-error" : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Correo</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={describe}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="codigo">Código de invitación</Label>
        <Input
          id="codigo"
          name="codigo"
          type="text"
          // El navegador no debe guardarlo ni sugerirlo: es de un solo uso.
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={describe ? `codigo-ayuda ${describe}` : "codigo-ayuda"}
        />
        <p id="codigo-ayuda" className="text-sm text-muted-foreground">
          Lo puedes escribir con o sin guiones.
        </p>
      </div>

      {state.error ? (
        <Alert variant="destructive" id="invitacion-error" ref={errorRef} tabIndex={-1} className="foco-destino">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
