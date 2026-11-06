// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// /coach/engagements/nuevo: el coach crea un acompañamiento (spec 002, R-002.1, tarea 9).
// Solo pide tipo, nombre de pila y correo. El layout de /coach ya verifica el rol; aquí se
// repite requireRole porque la página no debe depender de que el layout corra primero.
import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { ENGAGEMENT_CONFIG, type EngagementType } from "@/lib/engagements/config";
import { NuevoAcompanamientoForm } from "@/components/coach/alta/nuevo-acompanamiento-form";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Nuevo acompañamiento" };

const TEXTO_DESPUES_DE_CREAR =
  "Después de crearlo, en su página verificas el diagnóstico, generas el código de invitación y esperas su consentimiento.";

export default async function NuevoAcompanamientoPage() {
  await requireRole("coach");

  const tipos = (Object.keys(ENGAGEMENT_CONFIG) as EngagementType[]).map((id) => ({
    id,
    etiqueta: ENGAGEMENT_CONFIG[id].etiqueta,
    descripcion: ENGAGEMENT_CONFIG[id].descripcion,
  }));

  // Spec 012 (R-012.36): título en serif, qué sigue después de crearlo y el formulario en una tarjeta.
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p>
          <Link href="/coach" className="underline underline-offset-4">
            Volver a tus acompañamientos
          </Link>
        </p>
        {/* "acompañamiento" no cabe en 36px a 375px de ancho: en pantallas angostas baja a 30px. */}
        <h1 className="text-3xl leading-tight sm:text-4xl">Nuevo acompañamiento</h1>
        <p className="prose-measure text-muted-foreground">{TEXTO_DESPUES_DE_CREAR}</p>
      </header>
      <Card className="max-w-3xl px-(--card-spacing)">
        <NuevoAcompanamientoForm tipos={tipos} />
      </Card>
    </div>
  );
}
