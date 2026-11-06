// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Las versiones de la hoja en la pantalla de la persona (spec 009, R-009.32, R-009.38 a R-009.40). Ella ve las
// listas y las retiradas, con su número. "Hacer cambios" solo sale en la versión más alta y sin borrador abierto,
// porque la ruta rechaza lo demás. Retirar pide confirmación y no se puede deshacer.
"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enfocarDespues, useFocoPendiente } from "@/components/coach/plan/foco";
import { TituloEnfocable } from "@/components/coach/plan/titulo-enfocable";
import { llamarGuia } from "./api";
import { avisar } from "./aviso";
import { Confirmar } from "./confirmar";
import {
  AYUDA_HACER_CAMBIOS,
  DIALOGO_RETIRAR,
  etiquetaBoton,
  HACER_CAMBIOS,
  ID_TITULO_BORRADOR,
  ID_TITULO_VERSIONES,
  idVersion,
  RESULTADOS,
  RETIRAR,
  rutaHoja,
  textoVersionLista,
  textoVersionRetirada,
  TITULO_VERSIONES,
  VER_E_IMPRIMIR,
} from "./textos";

export type VersionVista = {
  id: string;
  version: number;
  estado: "lista" | "retirada";
  // Ya con formato: formatFecha se llama en el servidor.
  fecha: string;
};

type Props = {
  // De la más alta a la más baja.
  versiones: VersionVista[];
  hayBorrador: boolean;
};

export function VersionesGuia({ versiones, hayBorrador }: Props) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [refrescando, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ocupado = enviando || refrescando;
  const ultima = versiones[0];

  async function hacerCambios() {
    if (!ultima) return;
    setEnviando(true);
    setError(null);
    avisar("");
    const r = await llamarGuia(`/api/persona/shared-guides/${ultima.id}/copiar`, "POST");
    setEnviando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    avisar(RESULTADOS.copiada);
    enfocarDespues(ID_TITULO_BORRADOR);
    iniciar(() => router.refresh());
  }

  return (
    <section aria-labelledby={ID_TITULO_VERSIONES} className="flex flex-col gap-3">
      <TituloEnfocable id={ID_TITULO_VERSIONES} nivel={2} className="text-xl font-semibold">
        {TITULO_VERSIONES}
      </TituloEnfocable>

      <ul className="flex flex-col gap-3">
        {versiones.map((v) => (
          <FilaVersion
            key={v.id}
            version={v}
            // R-009.40: la que sigue visible para su coach si retira esta.
            otraLista={versiones.find((o) => o.id !== v.id && o.estado === "lista")?.version ?? null}
            ocupado={ocupado}
            alRetirar={async () => {
              avisar("");
              const r = await llamarGuia(`/api/persona/shared-guides/${v.id}/retirar`, "POST");
              if (!r.ok) return r.error;
              avisar(RESULTADOS.retirada(v.version));
              iniciar(() => router.refresh());
              return null;
            }}
          />
        ))}
      </ul>

      {ultima && !hayBorrador ? (
        <div className="flex flex-col gap-2">
          <div>
            <Button type="button" variant="outline" disabled={ocupado} onClick={hacerCambios} aria-describedby="ayuda-hacer-cambios">
              {HACER_CAMBIOS}
            </Button>
          </div>
          <p id="ayuda-hacer-cambios" className="prose-measure text-sm text-muted-foreground">
            {AYUDA_HACER_CAMBIOS}
          </p>
          {error ? (
            <p role="alert" className="prose-measure text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type PropsFila = {
  version: VersionVista;
  otraLista: number | null;
  ocupado: boolean;
  alRetirar: () => Promise<string | null>;
};

function FilaVersion({ version: v, otraLista, ocupado, alRetirar }: PropsFila) {
  const ref = useRef<HTMLParagraphElement>(null);
  const id = idVersion(v.id);
  useFocoPendiente(id, ref);

  if (v.estado === "retirada") {
    return (
      <li className="rounded-lg border border-border p-3">
        <p ref={ref} id={id} tabIndex={-1} className="foco-destino prose-measure">
          {textoVersionRetirada(v.version, v.fecha)}
        </p>
      </li>
    );
  }

  const texto = textoVersionLista(v.version, v.fecha);
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <p ref={ref} id={id} tabIndex={-1} className="foco-destino prose-measure">
        {texto}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={rutaHoja(v.id)} aria-label={etiquetaBoton(VER_E_IMPRIMIR, texto)}>
            {VER_E_IMPRIMIR}
          </Link>
        </Button>
        <Confirmar
          boton={RETIRAR}
          etiquetaBoton={etiquetaBoton(RETIRAR, texto)}
          deshabilitado={ocupado}
          titulo={DIALOGO_RETIRAR.titulo(v.version)}
          texto={otraLista === null ? [DIALOGO_RETIRAR.texto] : [DIALOGO_RETIRAR.texto, DIALOGO_RETIRAR.otraLista(otraLista)]}
          cancelar={DIALOGO_RETIRAR.cancelar}
          confirmar={DIALOGO_RETIRAR.confirmar}
          alConfirmar={alRetirar}
          idFoco={id}
        />
      </div>
    </li>
  );
}
