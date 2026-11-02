// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// La hoja "Cómo trabajar conmigo" (spec 009, R-009.27, R-009.41). La usan la vista previa, la hoja para imprimir
// y la pantalla del coach, así que los tres ven lo mismo. Su único dato es DocumentoGuia: no tiene lugar para
// estados, orígenes, fechas ni líneas quitadas (R-009.42). No lleva ningún otro texto: sin logo, marca ni
// nombre del producto. Lo que cambia al imprimir está en app/globals.css (R-009.43).
import { TITULO_GUIA, tituloSeccion, type DocumentoGuia } from "@/lib/guia/schema-cliente";

type Props = {
  documento: DocumentoGuia;
  // Dentro de otra pantalla el título no es el principal de la página. No cambia lo que dice la hoja.
  nivel?: "principal" | "dentro";
};

export function HojaLider({ documento, nivel = "principal" }: Props) {
  const Titulo = nivel === "principal" ? "h1" : "h3";
  const TituloSeccion = nivel === "principal" ? "h2" : "h4";

  return (
    <article className="hoja-lider flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Titulo className="hoja-titulo text-2xl font-semibold">{TITULO_GUIA}</Titulo>
        <p className="hoja-nombre text-lg">{documento.nombre}</p>
      </header>
      {documento.secciones.map((seccion) => (
        <section key={seccion.id} className="hoja-seccion flex flex-col gap-2">
          <TituloSeccion className="hoja-seccion-titulo text-lg font-semibold">{tituloSeccion(seccion.id)}</TituloSeccion>
          <ul className="hoja-lineas prose-measure flex list-disc flex-col gap-1 pl-6">
            {seccion.lineas.map((linea, i) => (
              <li key={i}>{linea}</li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
