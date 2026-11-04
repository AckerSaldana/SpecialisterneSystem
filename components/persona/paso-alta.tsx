// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Un paso del alta de la persona (spec 012, R-012.11, R-012.12, R-012.15; docs/onboarding-persona.jpeg): "Paso n de 3"
// arriba, una tarjeta con el título y su contenido, el doodle quieto en la esquina y "Pedir ayuda a una persona" al pie.
// Solo acomoda: cada página conserva su formulario, sus textos y su puerta.
import type { ReactNode } from "react";
import { DoodleLibreta } from "@/components/Doodle";
import { PedirAyuda } from "@/components/persona/pedir-ayuda";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const TOTAL_PASOS_ALTA = 3;
export const textoPaso = (paso: number) => `Paso ${paso} de ${TOTAL_PASOS_ALTA}`;

type Props = {
  paso: 1 | 2 | 3;
  titulo: string;
  children: ReactNode;
  // El aviso es largo: va más ancho que los formularios cortos.
  ancho?: "angosto" | "amplio";
};

export function PasoAlta({ paso, titulo, children, ancho = "angosto" }: Props) {
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-6", ancho === "angosto" ? "max-w-xl" : "max-w-3xl")}>
      <p className="text-center text-muted-foreground">{textoPaso(paso)}</p>
      <div className="relative">
        <Card className="gap-6 px-(--card-spacing)">
          <h1 className="text-center text-4xl leading-tight">{titulo}</h1>
          {children}
        </Card>
        {/* Fuera de la tarjeta, para no tapar el botón. La tarjeta amplia llena la pantalla hasta lg: antes el doodle se saldría. */}
        <DoodleLibreta className={cn("pointer-events-none absolute -right-20 -bottom-14 hidden w-24", ancho === "angosto" ? "md:block" : "lg:block")} />
      </div>
      <PedirAyuda />
    </div>
  );
}
