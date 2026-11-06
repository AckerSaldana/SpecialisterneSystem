// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Sección "Plan de acompañamiento" de /coach/engagements/[id] (spec 003, tareas 18 y 19).
// Decide qué estado mostrar con lo que leyó la página:
//   sin consentimiento vigente → texto literal, sin nada del plan (RLS ya devuelve 0 filas);
//   sin perfil aprobado → texto literal;
//   con perfil → plan vigente (si hay), borrador (si hay) o el botón para pedir la propuesta.
// La persona no ve nada de esto: su sección del plan es de la spec 005.
import Link from "next/link";
import { BorradorPlan } from "./borrador-plan";
import type { DatosPlan } from "./datos";
import { PedirPropuesta } from "./pedir-propuesta";
import { PlanVigente, perfilCambio } from "./plan-vigente";
import { TituloEnfocable } from "./titulo-enfocable";
import { SIN_CONSENTIMIENTO_OCULTO, SIN_FICHAS, SIN_PERFIL, listo, sinConsentimiento } from "./textos";
import { ID_SECCION, type PuntoVigente } from "./tipos";

type Props = {
  engagementId: string;
  nombre: string;
  // null cuando no hay consentimiento vigente: no se leyó nada del plan.
  datos: { plan: DatosPlan; snapshotActualVersion: number | null; fechasSesion: Record<string, string> } | null;
};

export function SeccionPlan({ engagementId, nombre, datos }: Props) {
  return (
    <section aria-labelledby={ID_SECCION} className="flex flex-col gap-6">
      <TituloEnfocable id={ID_SECCION} nivel={2} className="scroll-mt-6 text-3xl">
        Plan de acompañamiento
      </TituloEnfocable>
      <Contenido engagementId={engagementId} nombre={nombre} datos={datos} />
    </section>
  );
}

function Contenido({ engagementId, nombre, datos }: Props) {
  if (!datos) {
    return (
      <div className="flex flex-col gap-2">
        <p className="prose-measure">{sinConsentimiento(nombre)}</p>
        <p className="prose-measure">{SIN_CONSENTIMIENTO_OCULTO}</p>
      </div>
    );
  }

  const { plan, snapshotActualVersion, fechasSesion } = datos;
  if (snapshotActualVersion === null) return <p className="prose-measure">{SIN_PERFIL}</p>;

  const { vigente, borrador, fichas } = plan;
  const hayFichasVerificadas = fichas.some((f) => f.verificada);
  // Con el aviso de perfil nuevo, el botón vive dentro del aviso ("Pedir propuesta nueva").
  const avisoConBoton = vigente !== null && perfilCambio(vigente, snapshotActualVersion) && borrador === null;

  const puntosVigentes: PuntoVigente[] =
    vigente?.items.map((i) => ({ id: i.id, tipo: i.tipo, descripcion: i.descripcion })) ?? [];

  return (
    <>
      {vigente ? (
        <PlanVigente
          engagementId={engagementId}
          nombre={nombre}
          plan={vigente}
          snapshotActualVersion={snapshotActualVersion}
          hayBorrador={borrador !== null}
          hayFichasVerificadas={hayFichasVerificadas}
          fichas={fichas}
          fechasSesion={fechasSesion}
        />
      ) : null}

      {borrador ? (
        <BorradorPlan
          planId={borrador.id}
          nombre={nombre}
          snapshotVersion={borrador.snapshotVersion}
          items={borrador.items}
          descartados={borrador.descartados}
          fichas={fichas}
          fechasSesion={fechasSesion}
          vigente={vigente ? { version: vigente.version, puntos: puntosVigentes } : null}
        />
      ) : avisoConBoton ? null : (
        <PedirPropuesta
          engagementId={engagementId}
          etiqueta="Pedir propuesta de plan"
          notas={[listo(snapshotActualVersion), ...(hayFichasVerificadas ? [] : [SIN_FICHAS])]}
        />
      )}

      {plan.hayHistorial ? (
        <p>
          <Link href={`/coach/engagements/${engagementId}/plan/historial`} className="underline underline-offset-4">
            Ver historial del plan
          </Link>
        </p>
      ) : null}
    </>
  );
}
