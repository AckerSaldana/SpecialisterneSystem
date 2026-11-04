// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /bienvenida/aviso: aviso de privacidad y consentimiento (spec 002, R-002.19 a R-002.23,
// R-002.25, R-002.26). Es la única pantalla privada que la persona puede ver sin consentimiento
// vigente. Muestra el archivo versionado de legal/ tal cual (leerAviso + bloquesDeAviso) con su
// versión AVISO_VERSION, y abajo la casilla desmarcada.
// Si la persona retiró su consentimiento, arriba ve "Retiraste tu consentimiento el {fecha}" con
// "Dar mi consentimiento otra vez", que la lleva a la casilla de esta misma página (R-002.29).
import type { Metadata } from "next";
import { formatFecha } from "@/components/coach/labels";
import { AvisoTexto, tituloDeAviso } from "@/components/persona/aviso-texto";
import { ConsentimientoPersona } from "@/components/persona/consentimiento";
import { PasoAlta } from "@/components/persona/paso-alta";
import { AVISO_VERSION, bloquesDeAviso, leerAviso } from "@/lib/legal/aviso";
import { puertaPersona } from "@/lib/persona/puerta";
import { FormularioConsentimiento } from "./formulario";

export const metadata: Metadata = { title: "Aviso de privacidad" };

export default async function AvisoPage() {
  const { user, consentimiento } = await puertaPersona("aviso");
  const bloques = bloquesDeAviso(await leerAviso());

  return (
    <PasoAlta paso={3} titulo={tituloDeAviso(bloques)} ancho="amplio">
      <p className="prose-measure">
        Hola, {user.nombrePila}. Antes de empezar, lee qué datos guarda este sistema y quién los ve. Puedes tomarte el
        tiempo que necesites.
      </p>

      {consentimiento?.estado === "retirado" ? (
        <ConsentimientoPersona
          estado="retirado"
          fecha={formatFecha(consentimiento.fecha)}
          hrefDarOtraVez="#dar-consentimiento"
        />
      ) : null}

      <AvisoTexto bloques={bloques} version={AVISO_VERSION} />

      <section
        id="dar-consentimiento"
        aria-labelledby="dar-consentimiento-titulo"
        className="flex scroll-mt-4 flex-col gap-4 border-t border-border pt-6"
      >
        <h2 id="dar-consentimiento-titulo" className="text-2xl">
          ¿Das tu consentimiento?
        </h2>
        <FormularioConsentimiento />
      </section>
    </PasoAlta>
  );
}
