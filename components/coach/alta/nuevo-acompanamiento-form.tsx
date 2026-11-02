// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Formulario de /coach/engagements/nuevo (spec 002, R-002.1, R-002.35). Radios nativos con
// fieldset y legend, como /preferencias. Cada error se muestra en texto junto a su campo y el
// foco se mueve al primero, como en app/login/page.tsx.
"use client";

import { useActionState, useEffect, useRef } from "react";
import { crearAcompanamiento, type NuevoAcompanamientoState } from "@/app/coach/engagements/nuevo/actions";
import { conFalloDeRed, ERROR_SIN_RESPUESTA } from "@/components/formulario-accion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Tipo = { id: string; etiqueta: string; descripcion: string };

const estadoInicial: NuevoAcompanamientoState = {
  errores: {},
  valores: { type: "", nombrePila: "", email: "" },
};

// Orden en que se busca el primer error para mover el foco.
const ORDEN = ["type", "nombrePila", "email", "general"] as const;

export function NuevoAcompanamientoForm({ tipos }: { tipos: Tipo[] }) {
  // El estado anterior (con el correo) no se manda al servidor: la action solo recibe el FormData.
  // Lo escrito regresa por el estado, igual que con un error del servidor.
  const [state, formAction, pending] = useActionState(
    conFalloDeRed<NuevoAcompanamientoState>(
      (_prev, formData) => crearAcompanamiento(formData),
      (_prev, formData) => ({
        errores: { general: ERROR_SIN_RESPUESTA },
        valores: {
          type: String(formData.get("type") ?? ""),
          nombrePila: String(formData.get("nombrePila") ?? ""),
          email: String(formData.get("email") ?? ""),
        },
      }),
    ),
    estadoInicial,
  );
  const refs = useRef<Partial<Record<(typeof ORDEN)[number], HTMLElement | null>>>({});

  // Cada respuesta de la action es un objeto nuevo: el foco se mueve en cada intento.
  useEffect(() => {
    const primero = ORDEN.find((k) => state.errores[k]);
    if (primero) refs.current[primero]?.focus();
  }, [state]);

  const { errores, valores } = state;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6" noValidate>
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={errores.type ? "error-type" : undefined}
      >
        <legend className="mb-2 text-lg font-semibold">Tipo de acompañamiento</legend>
        {tipos.map((t) => {
          const id = `type-${t.id}`;
          return (
            <label
              key={t.id}
              htmlFor={id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-3 has-checked:border-2 has-checked:border-primary has-checked:bg-accent"
            >
              <input
                id={id}
                type="radio"
                name="type"
                value={t.id}
                defaultChecked={valores.type === t.id}
                className="mt-1 size-5 shrink-0 accent-primary"
              />
              <span className="flex flex-col">
                <span className="font-semibold">{t.etiqueta}</span>
                <span className="text-muted-foreground">{t.descripcion}</span>
              </span>
            </label>
          );
        })}
        {errores.type ? (
          <p
            id="error-type"
            ref={(el) => {
              refs.current.type = el;
            }}
            tabIndex={-1}
            className="foco-destino text-sm font-medium text-destructive"
          >
            {errores.type}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="nombrePila">Nombre de pila de la persona</Label>
        <p id="ayuda-nombrePila" className="text-sm text-muted-foreground">
          Solo el nombre con el que le gusta que le llamen. Sin apellidos.
        </p>
        <Input
          id="nombrePila"
          name="nombrePila"
          type="text"
          autoComplete="off"
          maxLength={60}
          required
          defaultValue={valores.nombrePila}
          aria-invalid={errores.nombrePila ? true : undefined}
          aria-describedby={errores.nombrePila ? "ayuda-nombrePila error-nombrePila" : "ayuda-nombrePila"}
        />
        {errores.nombrePila ? (
          <p
            id="error-nombrePila"
            ref={(el) => {
              refs.current.nombrePila = el;
            }}
            tabIndex={-1}
            className="foco-destino text-sm font-medium text-destructive"
          >
            {errores.nombrePila}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Correo de la persona</Label>
        <p id="ayuda-email" className="text-sm text-muted-foreground">
          En este prototipo usa un correo de prueba que termine en .test.
        </p>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="off"
          required
          defaultValue={valores.email}
          aria-invalid={errores.email ? true : undefined}
          aria-describedby={errores.email ? "ayuda-email error-email" : "ayuda-email"}
        />
        {errores.email ? (
          <p
            id="error-email"
            ref={(el) => {
              refs.current.email = el;
            }}
            tabIndex={-1}
            className="foco-destino text-sm font-medium text-destructive"
          >
            {errores.email}
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

      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {/* El estado se dice en texto, no solo con una animación. */}
          {pending ? "Creando…" : "Crear acompañamiento"}
        </Button>
      </div>
    </form>
  );
}
