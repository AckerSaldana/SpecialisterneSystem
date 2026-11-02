// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Dos cosas de los formularios con useActionState. Solo vive en el navegador (lo importan Client Components).
//   - conFalloDeRed: si la Server Action se rechaza (sin red, o una excepción en el servidor), useActionState lanza el error y
//     app/error.tsx reemplaza toda la pantalla, con lo escrito. Así queda un error junto al formulario, como en los formularios
//     con fetch (components/desglose/api.ts). Un redirect() también llega como rechazo y sigue su camino.
//   - enviarSinReiniciar: con action sola, React reinicia el formulario al terminar, y lo que no regresa en el estado vuelve a
//     su valor por defecto. Antes de hidratar sigue usando action, por eso se queda en el <form>.
import { startTransition, type FormEvent } from "react";
import { unstable_rethrow } from "next/navigation";

export const ERROR_SIN_RESPUESTA = "No recibimos respuesta del sistema. Revisa tu conexión e intenta de nuevo.";

export function conFalloDeRed<S>(accion: (previo: S, datos: FormData) => Promise<S>, alFallar: (previo: S, datos: FormData) => S) {
  return async (previo: S, datos: FormData): Promise<S> => {
    try {
      return await accion(previo, datos);
    } catch (e) {
      unstable_rethrow(e);
      return alFallar(previo, datos);
    }
  };
}

export function enviarSinReiniciar(enviar: (datos: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    startTransition(() => enviar(datos));
  };
}
