// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Formulario de /preferencias. Radios nativos (fieldset + legend) con pocas opciones.
// La vista previa cambia al elegir; nada se guarda hasta presionar "Guardar".
//
// Solo importa tipos de lib/preferences (ese archivo es de servidor).
// Las opciones llegan por props desde la página.
"use client";

import { useActionState, useState } from "react";
import type { CSSProperties } from "react";
import { guardarPreferencias, type EstadoGuardado } from "@/app/preferencias/actions";
import { Button } from "@/components/ui/button";
import type { OPCIONES, Preferencias } from "@/lib/preferences";

type Campo = keyof Preferencias;
type Opciones = typeof OPCIONES;

const GRUPOS: { campo: Campo; titulo: string }[] = [
  { campo: "modo", titulo: "Colores" },
  { campo: "fuente", titulo: "Fuente" },
  { campo: "tamano", titulo: "Tamaño de letra" },
  { campo: "interletrado", titulo: "Espacio entre letras" },
  { campo: "interlineado", titulo: "Espacio entre líneas" },
  { campo: "ancho", titulo: "Ancho del texto" },
];

const ESTADO_INICIAL: EstadoGuardado = { estado: "sin-enviar" };

function sonIguales(a: Preferencias, b: Preferencias) {
  return GRUPOS.every(({ campo }) => a[campo] === b[campo]);
}

export function PreferencesForm({ inicial, opciones }: { inicial: Preferencias; opciones: Opciones }) {
  const [estado, enviar, guardando] = useActionState(guardarPreferencias, ESTADO_INICIAL);
  const [borrador, setBorrador] = useState<Preferencias>(inicial);

  // Lo último que quedó guardado en la cookie (y que ya aplica el layout).
  const guardadas = estado.estado === "guardado" ? estado.preferencias : inicial;
  const hayCambios = !sonIguales(borrador, guardadas);

  function elegir(campo: Campo, valorTexto: string) {
    // Los radios devuelven texto; los campos numéricos se guardan como número.
    const valor = typeof inicial[campo] === "number" ? Number(valorTexto) : valorTexto;
    setBorrador((previo) => ({ ...previo, [campo]: valor }) as Preferencias);
  }

  // Estado en texto, siempre visible debajo del botón.
  let mensaje = "Estas son tus preferencias actuales.";
  if (guardando) mensaje = "Guardando…";
  else if (estado.estado === "error") mensaje = estado.mensaje;
  else if (hayCambios) mensaje = "Hay cambios sin guardar.";
  else if (estado.estado === "guardado") mensaje = "Guardado. Así se verá en todas las pantallas.";

  // Vista previa. 1rem aquí ya es el tamaño guardado, por eso se escala con la proporción
  // entre lo elegido y lo guardado para mostrar el tamaño exacto.
  const estiloVistaPrevia = {
    "--letter-spacing": `${borrador.interletrado}em`,
    "--line-height": String(borrador.interlineado),
    "--measure": `${borrador.ancho}ch`,
    fontSize: `${borrador.tamano / guardadas.tamano}rem`,
    lineHeight: "var(--line-height)",
  } as CSSProperties;

  return (
    <form action={enviar} className="flex flex-col gap-8">
      <div className="grid gap-6 md:grid-cols-2">
        {GRUPOS.map(({ campo, titulo }) => (
          <fieldset key={campo} className="flex flex-col gap-2">
            <legend className="mb-2 text-lg font-bold">{titulo}</legend>
            {opciones[campo].map((opcion) => {
              const id = `${campo}-${opcion.valor}`;
              const ayuda = "ayuda" in opcion ? opcion.ayuda : null;
              return (
                <label
                  key={id}
                  htmlFor={id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-3 has-checked:border-2 has-checked:border-primary has-checked:bg-accent"
                >
                  <input
                    id={id}
                    type="radio"
                    name={campo}
                    value={String(opcion.valor)}
                    checked={borrador[campo] === opcion.valor}
                    onChange={(e) => elegir(campo, e.target.value)}
                    className="mt-1 size-5 shrink-0 accent-primary"
                  />
                  <span className="flex flex-col">
                    <span className="font-bold">{opcion.etiqueta}</span>
                    {ayuda && <span className="text-muted-foreground">{ayuda}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>

      <section aria-labelledby="vista-previa-titulo" className="flex flex-col gap-2">
        <h2 id="vista-previa-titulo" className="text-xl font-bold">
          Vista previa
        </h2>
        <div
          data-mode={borrador.modo}
          data-font={borrador.fuente}
          style={estiloVistaPrevia}
          className="rounded-lg border-2 border-border bg-background p-4 font-sans text-foreground"
        >
          <p className="prose-measure font-bold">Notas de la sesión del martes</p>
          <p className="prose-measure">
            Prefiero recibir las instrucciones por escrito y con un ejemplo. Me ayuda saber cuánto tiempo dura cada
            reunión antes de empezar.
          </p>
          <p className="prose-measure text-muted-foreground">Actualizado por tu coach.</p>
        </div>
      </section>

      <div className="flex flex-col items-start gap-3">
        <Button type="submit" size="lg" disabled={guardando} className="h-11 px-6 text-base">
          Guardar
        </Button>
        <p role="status" aria-live="polite" className="font-bold">
          {mensaje}
        </p>
      </div>
    </form>
  );
}
