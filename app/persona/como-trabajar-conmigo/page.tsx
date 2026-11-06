// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// /persona/como-trabajar-conmigo: la hoja que la persona escribe para su líder (spec 009, R-009.1, R-009.20 a
// R-009.33, R-009.38 a R-009.40, R-009.59). El acompañamiento sale de la puerta (R-002.40), que también garantiza
// el consentimiento vigente y manda al aviso si no lo hay (R-009.52).
// Privacidad: la página solo manda al navegador GuiaVista, sin orígenes (R-009.33), y no lee plans, plan_items ni
// profile_snapshots (R-009.10): de los insumos, lib/guia/lectura.ts solo le pasa un booleano. Sin citas, señales ni
// nombres de dominios (C-09).
// Con versiones, si la regeneración tiene algo que proponer, ve un aviso al entrar y ella decide si la pide
// (R-009.46, R-009.47). Nada aparece solo ni se genera por su cuenta (C-14).
import type { Metadata } from "next";
import Link from "next/link";
import { withRls } from "@/lib/db/rls";
import { leerGuiasPersona } from "@/lib/guia/lectura";
import { puertaPersona } from "@/lib/persona/puerta";
import { formatFecha } from "@/components/coach/labels";
import { TituloEnfocable } from "@/components/coach/plan/titulo-enfocable";
import { AvisoGuia } from "@/components/persona/guia/aviso";
import { BorradorGuia } from "@/components/persona/guia/borrador";
import { PedirBorrador } from "@/components/persona/guia/pedir-borrador";
import { AvisoCambios } from "@/components/persona/guia/regenerar";
import { ID_TITULO_PEDIR, INTRO, LEER_AVISO, PEDIR, SIN_ACOMPANAMIENTO, SIN_BORRADOR, TITULO } from "@/components/persona/guia/textos";
import { VersionesGuia } from "@/components/persona/guia/versiones";

export const metadata: Metadata = { title: TITULO };

export default async function ComoTrabajarConmigoPage() {
  const { user, acompanamiento } = await puertaPersona("persona");

  if (!acompanamiento) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-5xl leading-tight">{TITULO}</h1>
        <p className="prose-measure">{SIN_ACOMPANAMIENTO}</p>
      </div>
    );
  }

  const { borrador, versiones, avisoCambios } = await withRls(user.claims, (tx) => leerGuiasPersona(tx, acompanamiento.id, user.id));

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-5xl leading-tight">{TITULO}</h1>
        <p className="prose-measure text-muted-foreground">{INTRO}</p>
      </header>

      <AvisoGuia />

      {!borrador && versiones.length === 0 ? (
        // Spec 012 (R-012.34): una tarjeta con una sola acción.
        <section aria-labelledby={ID_TITULO_PEDIR} className="flex flex-col gap-4 rounded-lg border-(length:--border-w) border-border bg-card px-6 py-6 md:px-8">
          <TituloEnfocable id={ID_TITULO_PEDIR} nivel={2} className="text-3xl">
            {PEDIR}
          </TituloEnfocable>
          <p className="prose-measure">{SIN_BORRADOR}</p>
          <p>
            <Link href="/persona/aviso">{LEER_AVISO}</Link>
          </p>
          <PedirBorrador />
        </section>
      ) : null}

      {avisoCambios ? <AvisoCambios /> : null}

      {borrador ? (
        <BorradorGuia
          key={borrador.guia.id}
          guia={borrador.guia}
          fecha={formatFecha(borrador.creadoEn)}
          pedidoPorMi={borrador.pedidoPorMi}
          insumosCambiaron={borrador.insumosCambiaron}
          versionSiguiente={(versiones[0]?.version ?? 0) + 1}
          hayListas={versiones.some((v) => v.estado === "lista")}
        />
      ) : null}

      {versiones.length > 0 ? (
        <VersionesGuia
          versiones={versiones.map((v) => ({ id: v.id, version: v.version, estado: v.estado, fecha: formatFecha(v.fecha) }))}
          hayBorrador={borrador !== null}
        />
      ) : null}
    </div>
  );
}
