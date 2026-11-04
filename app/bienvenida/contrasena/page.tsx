// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /bienvenida/contrasena: la persona entró con su código y crea su contraseña antes de ver
// cualquier otra pantalla (spec 002, R-002.18). La puerta la deja aquí solo si tiene una
// invitación pendiente; si no, la manda al paso que le toca.
import type { Metadata } from "next";
import { PasoAlta } from "@/components/persona/paso-alta";
import { puertaPersona } from "@/lib/persona/puerta";
import { FormularioContrasena } from "./formulario";

export const metadata: Metadata = { title: "Crea tu contraseña" };

export default async function ContrasenaPage() {
  const { user } = await puertaPersona("contrasena");

  return (
    <PasoAlta paso={2} titulo="Crea tu contraseña">
      <p className="prose-measure text-center">
        Hola, {user.nombrePila}. Crea una contraseña para entrar las siguientes veces. Después ya no vas a necesitar el
        código.
      </p>
      <FormularioContrasena />
    </PasoAlta>
  );
}
