// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado por Acker el 29 oct 2026
//
// Pantalla de inicio de sesión. Es Client Component porque useActionState necesita el
// navegador; la verificación de la contraseña ocurre en el servidor (./actions.ts).
// El título de la pestaña lo pone ./layout.tsx.
"use client";

import { useActionState, useEffect, useRef } from "react";
import { DoodleLibreta } from "@/components/Doodle";
import { conFalloDeRed, ERROR_SIN_RESPUESTA } from "@/components/formulario-accion";
import { SiteFooter } from "@/components/site-footer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginState } from "./actions";

const estadoInicial: LoginState = { error: null, email: "" };
const entrar = conFalloDeRed<LoginState>(login, (_previo, datos) => ({ error: ERROR_SIN_RESPUESTA, email: String(datos.get("email") ?? "").trim() }));

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(entrar, estadoInicial);
  const errorRef = useRef<HTMLDivElement>(null);

  // Cada respuesta de la action es un objeto nuevo, así que esto corre en cada intento,
  // aunque el mensaje sea el mismo que la vez anterior. Mover el foco hace que el lector
  // de pantalla lo lea de nuevo.
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);

  return (
    <>
      {/* Spec 012 (R-012.38): el nombre arriba y el formulario en una tarjeta, como los pasos del alta. */}
      <main id="contenido" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12 md:pb-20">
        <p className="text-center font-serif text-3xl leading-tight">Shorenote</p>
        <div className="relative">
          <Card className="gap-6 px-(--card-spacing)">
            <div className="flex flex-col gap-2 text-center">
              <h1 className="text-4xl leading-tight">Entrar</h1>
              <p className="text-muted-foreground">
                Esto es un prototipo. Todos los datos son de prueba y no corresponden a personas reales.
              </p>
            </div>

            <form action={formAction} className="flex flex-col gap-5" noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="font-semibold">Correo</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  defaultValue={state.email}
                  aria-invalid={state.error ? true : undefined}
                  aria-describedby={state.error ? "login-error" : undefined}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="font-semibold">Contraseña</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  aria-invalid={state.error ? true : undefined}
                  aria-describedby={state.error ? "login-error" : undefined}
                />
              </div>

              {/* El error queda visible junto al formulario hasta el siguiente intento. */}
              {state.error ? (
                <Alert variant="destructive" id="login-error" ref={errorRef} tabIndex={-1} className="foco-destino">
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" size="lg" disabled={pending}>
                {/* El estado se dice en texto, no solo con una animación. */}
                {pending ? "Entrando…" : "Entrar"}
              </Button>
            </form>
          </Card>
          <DoodleLibreta className="pointer-events-none absolute -right-20 -bottom-14 hidden w-24 md:block" />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
