// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Página para errores en el layout raíz. Reemplaza al layout completo, así que pone su
// propio <html> y <body>, sin las preferencias de presentación ni los estilos globales:
// por eso es mínima y usa estilos en línea con texto negro sobre blanco.
// No muestra el mensaje técnico del error.
"use client";

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#ffffff", color: "#1c1c1e", fontFamily: "system-ui, sans-serif", fontSize: "1.125rem", lineHeight: 1.5 }}>
        <title>Algo salió mal · Caja MEX</title>
        <main id="contenido" style={{ maxWidth: "40rem", margin: "0 auto", padding: "3rem 1rem" }}>
          <h1>Algo salió mal</h1>
          <p>
            Intenta de nuevo. Si vuelve a pasar, avisa a tu coach o escribe a{" "}
            <a href="mailto:ayuda@caja-mex.test" style={{ color: "#1d4ed8" }}>
              ayuda@caja-mex.test
            </a>
            .
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              font: "inherit",
              padding: "0.5rem 1rem",
              background: "#1d4ed8",
              color: "#ffffff",
              border: "2px solid #1d4ed8",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            Intentar de nuevo
          </button>
        </main>
        <footer style={{ maxWidth: "40rem", margin: "0 auto", padding: "1.5rem 1rem", borderTop: "1px solid #d4d4d8" }}>
          <p>Prototipo con datos sintéticos.</p>
        </footer>
      </body>
    </html>
  );
}
