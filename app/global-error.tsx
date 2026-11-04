// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Página para errores en el layout raíz. Reemplaza al layout completo, así que pone su
// propio <html> y <body>, sin las preferencias de presentación ni los estilos globales:
// por eso es mínima y usa estilos en línea. Los hex son los de Estándar en globals.css (spec 012).
// R-012.44: misma forma que app/error.tsx (nombre arriba, tarjeta centrada), con fuentes del sistema.
// No muestra el mensaje técnico del error.
"use client";

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#f6f2ec", color: "#1f1d1a", fontFamily: "system-ui, sans-serif", fontSize: "1.125rem", lineHeight: 1.5 }}>
        <title>Algo salió mal · Shorenote</title>
        <main id="contenido" style={{ maxWidth: "28rem", margin: "0 auto", padding: "3rem 1rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <p style={{ margin: 0, textAlign: "center", fontFamily: "Georgia, serif", fontSize: "1.875rem", lineHeight: 1.25 }}>Shorenote</p>
          <div
            style={{
              background: "#fbf9f5",
              border: "1px solid #cfc8be",
              borderRadius: "14px",
              padding: "2rem 1.5rem",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
            }}
          >
            <div>
              <h1 style={{ margin: "0 0 0.5rem", fontFamily: "Georgia, serif", fontWeight: 500, fontSize: "1.875rem", lineHeight: 1.25 }}>Algo salió mal</h1>
              <p style={{ margin: 0, color: "#6b6560" }}>
                Intenta de nuevo. Si vuelve a pasar, avisa a tu coach o escribe a{" "}
                <a href="mailto:ayuda@caja-mex.test" style={{ color: "#1f1d1a" }}>
                  ayuda@caja-mex.test
                </a>
                .
              </p>
            </div>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                font: "inherit",
                fontWeight: 500,
                padding: "0.5rem 1rem",
                minHeight: "48px",
                background: "#ad5641",
                color: "#fbf9f5",
                border: "1px solid #ad5641",
                borderRadius: "10px",
                cursor: "pointer",
              }}
            >
              Intentar de nuevo
            </button>
          </div>
        </main>
        <footer style={{ maxWidth: "28rem", margin: "0 auto", padding: "1.5rem 1rem", borderTop: "1px solid #cfc8be", textAlign: "center", color: "#6b6560" }}>
          <p style={{ margin: 0 }}>Prototipo con datos sintéticos.</p>
        </footer>
      </body>
    </html>
  );
}
