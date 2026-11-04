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
import { conFalloDeRed, enviarSinReiniciar, ERROR_SIN_RESPUESTA } from "@/components/formulario-accion";
import { Button } from "@/components/ui/button";
import type { OPCIONES, Preferencias } from "@/lib/preferences";
import { cn } from "@/lib/utils";

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
const guardar = conFalloDeRed<EstadoGuardado>(guardarPreferencias, () => ({ estado: "error", mensaje: ERROR_SIN_RESPUESTA }));

function sonIguales(a: Preferencias, b: Preferencias) {
  return GRUPOS.every(({ campo }) => a[campo] === b[campo]);
}

export function PreferencesForm({ inicial, opciones }: { inicial: Preferencias; opciones: Opciones }) {
  const [estado, enviar, guardando] = useActionState(guardar, ESTADO_INICIAL);
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
    <form
      action={enviar}
      // Con action sola, React reinicia el formulario al terminar y cada radio regresa a como se montó,
      // aunque lo guardado sea otra opción.
      onSubmit={enviarSinReiniciar(enviar)}
      // Spec 012 (R-012.37): en pantallas anchas la vista previa queda a la vista mientras se eligen las opciones.
      className="grid gap-10 lg:grid-cols-2 lg:items-start"
    >
      <div className="flex flex-col gap-8">
        {GRUPOS.map(({ campo, titulo }) => {
          // Las opciones con descripción van apiladas; las de una palabra, en fila.
          const enFila = !opciones[campo].some((opcion) => "ayuda" in opcion);
          return (
            <fieldset key={campo} className="flex flex-col gap-3">
              <legend className="mb-3 text-lg font-semibold">{titulo}</legend>
              <div className={enFila ? "flex flex-wrap gap-2" : "flex flex-col gap-2"}>
                {opciones[campo].map((opcion) => {
                  const id = `${campo}-${opcion.valor}`;
                  const ayuda = "ayuda" in opcion ? opcion.ayuda : null;
                  return (
                    <label
                      key={id}
                      htmlFor={id}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-md border-(length:--border-w) border-border bg-card transition-colors has-checked:border-primary has-checked:bg-accent",
                        enFila ? "min-h-12 items-center px-4" : "items-start px-4 py-3",
                      )}
                    >
                      <input
                        id={id}
                        type="radio"
                        name={campo}
                        value={String(opcion.valor)}
                        checked={borrador[campo] === opcion.valor}
                        onChange={(e) => elegir(campo, e.target.value)}
                        className={cn("size-5 shrink-0 accent-primary", enFila ? "" : "mt-1")}
                      />
                      <span className="flex flex-col">
                        <span className="font-semibold">{opcion.etiqueta}</span>
                        {ayuda && <span className="text-muted-foreground">{ayuda}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-col gap-6 lg:sticky lg:top-8">
        <section aria-labelledby="vista-previa-titulo" className="flex flex-col gap-3">
          <h2 id="vista-previa-titulo" className="text-2xl leading-tight">
            Vista previa
          </h2>
          <div
            data-mode={borrador.modo}
            data-font={borrador.fuente}
            style={estiloVistaPrevia}
            className="flex flex-col gap-2 rounded-lg border-(length:--border-w) border-border bg-background px-6 py-5 font-sans text-foreground"
          >
            <p className="prose-measure font-semibold">Notas de la sesión del martes</p>
            <p className="prose-measure">
              Prefiero recibir las instrucciones por escrito y con un ejemplo. Me ayuda saber cuánto tiempo dura cada
              reunión antes de empezar.
            </p>
            <p className="prose-measure text-muted-foreground">Actualizado por tu coach.</p>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button type="submit" size="lg" disabled={guardando}>
            Guardar
          </Button>
          <p role="status" aria-live="polite" className={hayCambios || estado.estado === "error" ? "font-semibold" : "text-muted-foreground"}>
            {mensaje}
          </p>
        </div>
      </div>
    </form>
  );
}
