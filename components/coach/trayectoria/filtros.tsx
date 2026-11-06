// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Filtros de la pantalla "Función ejecutiva" (spec 008, R-008.24). Dos formularios GET sin JavaScript:
// los filtros viven en la URL. La página se vuelve a cargar y el "#filtros" del action lleva el foco al
// título, con el error justo debajo y las líneas después (R-008.27).
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLASE_SELECT } from "@/components/coach/plan/tipos";
import { DIRECCIONES_FE } from "@/lib/profile/schema";
import type { TipoFiltro } from "@/lib/trayectoria/filtros";
import { ERROR_FECHAS, ID_FILTROS } from "./textos";

type Props = {
  url: string;
  // Lo que escribió el coach, también si las fechas no son válidas, para que lo pueda corregir.
  desde: string;
  hasta: string;
  tipo: TipoFiltro;
  errorFechas: boolean;
};

export function FiltrosTrayectoria({ url, desde, hasta, tipo, errorFechas }: Props) {
  const action = `${url}#${ID_FILTROS}`;
  return (
    // Spec 012 (R-012.31): una franja con fondo apagado, para que no se confunda con los dominios.
    <section aria-labelledby={ID_FILTROS} className="flex flex-col gap-4 rounded-lg border-(length:--border-w) border-border bg-muted px-6 py-5">
      <h2 id={ID_FILTROS} tabIndex={-1} className="foco-destino text-2xl">
        Filtros
      </h2>
      {errorFechas ? (
        <p role="alert" className="prose-measure font-medium text-destructive">
          {ERROR_FECHAS}
        </p>
      ) : null}
      <form method="get" action={action} className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="filtro-desde">Desde</Label>
          <Input id="filtro-desde" name="desde" type="date" defaultValue={desde} className="w-auto" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="filtro-hasta">Hasta</Label>
          <Input id="filtro-hasta" name="hasta" type="date" defaultValue={hasta} className="w-auto" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="filtro-tipo">Tipo</Label>
          <select id="filtro-tipo" name="tipo" defaultValue={tipo} className={CLASE_SELECT}>
            <option value="todos">Todos</option>
            {DIRECCIONES_FE.map((d) => (
              <option key={d.id} value={d.id}>
                {d.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">Aplicar filtros</Button>
      </form>
      <form method="get" action={action}>
        <Button type="submit" variant="outline">
          Quitar filtros
        </Button>
      </form>
    </section>
  );
}
