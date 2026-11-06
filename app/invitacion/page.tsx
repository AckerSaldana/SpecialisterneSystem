// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// /invitacion: pública. La persona entra por primera vez con su correo y el código de su coach
// (spec 002, R-002.17). El formulario manda el código por POST a la Server Action; el código
// nunca va en la URL (R-002.47). ?vencido=1 solo dice que hay que mostrar el aviso de código
// vencido (lo pone la puerta de la persona, R-002.39); no lleva ningún dato.
import type { Metadata } from "next";
import { PasoAlta } from "@/components/persona/paso-alta";
import { SiteFooter } from "@/components/site-footer";
import { ERROR_VENCIDO } from "@/lib/persona/puerta";
import { FormularioInvitacion } from "./formulario";

export const metadata: Metadata = { title: "Entrar por primera vez" };

export default async function InvitacionPage({ searchParams }: PageProps<"/invitacion">) {
  const { vencido } = await searchParams;

  // Paso 1 de 3 del alta (spec 012, R-012.11). Sin encabezado: todavía no hay sesión.
  return (
    <div data-pantalla="persona" className="contents">
      <main id="contenido" className="flex w-full flex-1 flex-col justify-center px-4 py-12">
        <PasoAlta paso={1} titulo="Entrar por primera vez">
          <p className="prose-measure text-center">
            Usa el correo que le diste a tu coach y el código que te dio. Esto es un prototipo. Todos los datos son de
            prueba y no corresponden a personas reales.
          </p>
          <FormularioInvitacion errorInicial={vencido === "1" ? ERROR_VENCIDO : null} />
        </PasoAlta>
      </main>
      <SiteFooter />
    </div>
  );
}
