// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
import type { NextConfig } from "next";

// cacheComponents queda apagado: toda la app depende de la sesión (cookies) y es dinámica.
const nextConfig: NextConfig = {
  // lib/prompts.ts lee prompts/*.md con fs en tiempo de ejecución; esto los incluye en el
  // paquete de las rutas /api al desplegar (si no, el archivo no existiría en producción).
  outputFileTracingIncludes: {
    "/api/**": ["./prompts/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
