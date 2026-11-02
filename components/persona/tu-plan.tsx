// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Sección "Tu plan" de /persona (spec 005, R-005.6). Esta spec es la única dueña de la sección y de
// sus textos. Lee solo persona_plans: el texto para la persona, sin citas, fichas ni dominios (C-09).
import { formatFecha } from "@/components/coach/labels";
import { NotMeButton } from "@/components/persona/not-me-button";
import { Card, CardContent } from "@/components/ui/card";
import { vistaEstado, type EstadosComentarios } from "@/lib/persona/comentarios";
import type { PlanPersona } from "@/lib/plan/schema";

type ItemPersona = PlanPersona["items"][number];

function ItemsDelPlan({ items, estados }: { items: ItemPersona[]; estados: EstadosComentarios }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.planItemId}>
          <Card>
            <CardContent className="flex flex-col gap-3">
              <p className="prose-measure">{item.texto}</p>
              <NotMeButton
                origen="plan"
                planItemId={item.planItemId}
                sobre={item.texto}
                estado={vistaEstado(estados.items[item.planItemId], formatFecha)}
              />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

type Props = {
  plan: { contenido: PlanPersona; createdAt: Date } | null;
  estados: EstadosComentarios;
};

export function TuPlan({ plan, estados }: Props) {
  const objetivos = plan?.contenido.items.filter((i) => i.tipo === "objetivo") ?? [];
  const apoyos = plan?.contenido.items.filter((i) => i.tipo === "apoyo_fe") ?? [];

  return (
    <section aria-labelledby="tu-plan" className="flex flex-col gap-3">
      <h2 id="tu-plan" className="text-xl font-semibold">
        Tu plan
      </h2>
      {!plan ? (
        <p className="prose-measure">Tu coach todavía no aprueba tu plan. Cuando lo apruebe, aparece aquí.</p>
      ) : (
        <>
          {/* persona_plans se escribe en la misma transacción que la aprobación del plan. */}
          <p className="prose-measure">Tu coach lo aprobó el {formatFecha(plan.createdAt)}.</p>

          {objetivos.length > 0 ? (
            <section aria-labelledby="tus-objetivos" className="flex flex-col gap-3">
              <h3 id="tus-objetivos" className="text-lg font-semibold">
                Tus objetivos
              </h3>
              <ItemsDelPlan items={objetivos} estados={estados} />
            </section>
          ) : null}

          {apoyos.length > 0 ? (
            <section aria-labelledby="apoyos-que-puedes-pedir" className="flex flex-col gap-3">
              <h3 id="apoyos-que-puedes-pedir" className="text-lg font-semibold">
                Apoyos que puedes pedir
              </h3>
              <p className="prose-measure">Son apoyos que acordaste con tu coach. Puedes pedirlos en tu trabajo.</p>
              <ItemsDelPlan items={apoyos} estados={estados} />
            </section>
          ) : null}

          <p className="prose-measure">Si algo no te queda claro, pregúntale a tu coach en tu próxima sesión.</p>

          <section aria-labelledby="plan-general" className="flex flex-col gap-3">
            <h3 id="plan-general" className="text-lg font-semibold">
              Tu plan en general
            </h3>
            <NotMeButton
              origen="plan"
              sobre="tu plan en general"
              textoBoton="Algo de mi plan no me representa"
              estado={vistaEstado(estados.planGeneral, formatFecha)}
            />
          </section>
        </>
      )}
    </section>
  );
}
