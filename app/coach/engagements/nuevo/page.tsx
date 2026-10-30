// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /coach/engagements/nuevo: el coach crea un acompañamiento (spec 002, R-002.1, tarea 9).
// Solo pide tipo, nombre de pila y correo. El layout de /coach ya verifica el rol; aquí se
// repite requireRole porque la página no debe depender de que el layout corra primero.
import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { ENGAGEMENT_CONFIG, type EngagementType } from "@/lib/engagements/config";
import { NuevoAcompanamientoForm } from "@/components/coach/alta/nuevo-acompanamiento-form";

export const metadata: Metadata = { title: "Nuevo acompañamiento" };

export default async function NuevoAcompanamientoPage() {
  await requireRole("coach");

  const tipos = (Object.keys(ENGAGEMENT_CONFIG) as EngagementType[]).map((id) => ({
    id,
    etiqueta: ENGAGEMENT_CONFIG[id].etiqueta,
    descripcion: ENGAGEMENT_CONFIG[id].descripcion,
  }));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm">
        <Link href="/coach" className="underline underline-offset-4">
          Volver a tus acompañamientos
        </Link>
      </p>
      <h1 className="text-2xl font-semibold">Nuevo acompañamiento</h1>
      <NuevoAcompanamientoForm tipos={tipos} />
    </div>
  );
}
