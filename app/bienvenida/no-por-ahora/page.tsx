// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// /bienvenida/no-por-ahora: la persona eligió no dar su consentimiento por ahora (spec 002,
// R-002.26, CA-002.21). No se registra ningún evento: esta página solo lee.
import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { puertaPersona } from "@/lib/persona/puerta";

export const metadata: Metadata = { title: "No por ahora" };

export default async function NoPorAhoraPage() {
  // Mismo paso que el aviso: si ya hay consentimiento vigente, la puerta manda a /persona.
  await puertaPersona("aviso");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">No por ahora</h1>
      <p className="prose-measure">
        Está bien. No registramos nada. Mientras no des tu consentimiento, tu coach no puede guardar notas sobre ti en
        este sistema. Si cambias de opinión, entra otra vez y elige «Dar mi consentimiento».
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="lg">
          <Link href="/bienvenida/aviso">Volver al aviso</Link>
        </Button>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="lg">
            Salir
          </Button>
        </form>
      </div>
    </div>
  );
}
