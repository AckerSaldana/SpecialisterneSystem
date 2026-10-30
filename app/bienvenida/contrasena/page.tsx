// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /bienvenida/contrasena: la persona entró con su código y crea su contraseña antes de ver
// cualquier otra pantalla (spec 002, R-002.18). La puerta la deja aquí solo si tiene una
// invitación pendiente; si no, la manda al paso que le toca.
import type { Metadata } from "next";
import { puertaPersona } from "@/lib/persona/puerta";
import { FormularioContrasena } from "./formulario";

export const metadata: Metadata = { title: "Crea tu contraseña" };

export default async function ContrasenaPage() {
  const { user } = await puertaPersona("contrasena");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Crea tu contraseña</h1>
        <p className="prose-measure">
          Hola, {user.nombrePila}. Crea una contraseña para entrar las siguientes veces. Después ya no vas a necesitar el
          código.
        </p>
      </div>
      <FormularioContrasena />
    </div>
  );
}
