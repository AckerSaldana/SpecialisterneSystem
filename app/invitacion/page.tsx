// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /invitacion: pública. La persona entra por primera vez con su correo y el código de su coach
// (spec 002, R-002.17). El formulario manda el código por POST a la Server Action; el código
// nunca va en la URL (R-002.47). ?vencido=1 solo dice que hay que mostrar el aviso de código
// vencido (lo pone la puerta de la persona, R-002.39); no lleva ningún dato.
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { ERROR_VENCIDO } from "@/lib/persona/puerta";
import { FormularioInvitacion } from "./formulario";

export const metadata: Metadata = { title: "Entrar por primera vez" };

export default async function InvitacionPage({ searchParams }: PageProps<"/invitacion">) {
  const { vencido } = await searchParams;

  return (
    <>
      <main id="contenido" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Entrar por primera vez</h1>
          <p className="text-muted-foreground">
            Usa el correo que le diste a tu coach y el código que te dio. Esto es un prototipo. Todos los datos son de
            prueba y no corresponden a personas reales.
          </p>
        </div>
        <FormularioInvitacion errorInicial={vencido === "1" ? ERROR_VENCIDO : null} />
      </main>
      <SiteFooter />
    </>
  );
}
