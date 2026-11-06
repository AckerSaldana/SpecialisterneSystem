// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Cómo queda una línea después de una decisión de la persona (spec 009, R-009.20 a R-009.22, R-009.49, R-009.50).
// Función pura, sin red ni base, para que la pruebe eval/compare.ts. lib/guia/acciones.ts la llama con la fila
// bloqueada y guarda el resultado.
import type { AccionLineaRequest, LineaGuia } from "@/lib/guia/schema";

// Devuelve la línea como queda, o null si esa acción no aplica a su estado.
export function aplicarAccion(linea: LineaGuia, pedido: AccionLineaRequest): LineaGuia | null {
  const { accion } = pedido;
  const { estado, cambio } = linea;

  if (accion === "aceptar_cambio" || accion === "rechazar_cambio") {
    if (cambio?.decision !== "pendiente") return null;
    const acepta = accion === "aceptar_cambio";
    const decision = acepta ? ("aceptado" as const) : ("rechazado" as const);
    // Ya decidido, textoAnterior no se guarda: por RLS el coach lee lineas de una versión lista, y ese texto podría
    // venir de una versión que ella retiró (R-009.38).
    const decidido = { ...cambio, textoAnterior: null, decision };
    switch (cambio.tipo) {
      // "Reglas fijas": aceptar deja incluida; rechazar, quitada.
      case "nueva":
        return { ...linea, estado: acepta ? "incluida" : "quitada", cambio: decidido };
      // Aceptar deja el texto de la IA, con textoIa nuevo; rechazar conserva el texto y el estado anteriores.
      case "cambia":
        return acepta
          ? { ...linea, estado: "incluida", textoIa: linea.texto, cambio: decidido }
          : { ...linea, texto: cambio.textoAnterior ?? linea.texto, cambio: decidido };
      // Aceptar la quita, con su texto de la IA (ver "quitar"); rechazar conserva la línea.
      case "sale":
        return acepta ? { ...linea, estado: "quitada", texto: linea.textoIa ?? linea.texto, cambio: decidido } : { ...linea, cambio: decidido };
    }
  }

  // Una línea con un cambio sin decidir solo admite aceptarlo o rechazarlo (R-009.49).
  if (cambio?.decision === "pendiente") return null;

  switch (accion) {
    case "incluir":
      return estado === "pendiente" ? { ...linea, estado: "incluida" } : null;
    case "editar":
      // R-009.21: guardar la edición cuenta como aprobarla y conserva textoIa. Una línea propia sigue propia.
      if (estado === "quitada") return null;
      if (estado === "propia") return { ...linea, texto: pedido.texto };
      return { ...linea, texto: pedido.texto, estado: pedido.texto === linea.textoIa ? "incluida" : "editada" };
    case "quitar":
      // R-009.22. El coach lee lineas de una versión lista por RLS: una edición quitada no debe quedar en la
      // fila, porque el historial solo muestra lo que se quitó de la propuesta de la IA (R-009.36).
      if (estado !== "pendiente" && estado !== "incluida" && estado !== "editada") return null;
      return { ...linea, estado: "quitada", texto: linea.textoIa ?? linea.texto };
    case "volver_a_incluir":
      return estado === "quitada" ? { ...linea, estado: "incluida" } : null;
    case "volver_al_texto_ia":
      return estado === "editada" ? { ...linea, estado: "pendiente", texto: linea.textoIa ?? linea.texto } : null;
  }
}
