// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /persona/aviso: el aviso de privacidad de solo lectura, para el enlace "Leer el aviso de
// privacidad" de la sección "Tus datos y tu consentimiento" (spec 002, R-002.27). Solo se llega
// con consentimiento vigente (la puerta); sin él, el aviso se ve en /bienvenida/aviso.
import type { Metadata } from "next";
import Link from "next/link";
import { AvisoTexto, tituloDeAviso } from "@/components/persona/aviso-texto";
import { AVISO_VERSION, bloquesDeAviso, leerAviso } from "@/lib/legal/aviso";
import { puertaPersona } from "@/lib/persona/puerta";

export const metadata: Metadata = { title: "Aviso de privacidad" };

export default async function AvisoLecturaPage() {
  await puertaPersona("persona");
  const bloques = bloquesDeAviso(await leerAviso());

  return (
    <div className="flex flex-col gap-8">
      <p>
        <Link href="/persona">Volver a tu perfil</Link>
      </p>
      <h1 className="text-2xl font-semibold">{tituloDeAviso(bloques)}</h1>
      <AvisoTexto bloques={bloques} version={AVISO_VERSION} />
    </div>
  );
}
