// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
import type { NextConfig } from "next";

// cacheComponents queda apagado: toda la app depende de la sesión (cookies) y es dinámica.
const nextConfig: NextConfig = {
  // lib/prompts.ts lee prompts/*.md con fs en tiempo de ejecución; esto los incluye en el
  // paquete de las rutas /api al desplegar (si no, el archivo no existiría en producción).
  // lib/legal/aviso.ts lee legal/*.md igual (spec 002): lo usan /bienvenida y /persona.
  outputFileTracingIncludes: {
    "/api/**": ["./prompts/**"],
    "/bienvenida/**": ["./legal/**"],
    "/persona/**": ["./legal/**"],
  },
  // En desarrollo Next registra los argumentos de cada Server Action. Algunos llevan datos que
  // no deben quedar en la terminal: el código de invitación (R-002.47) o correos. Se apaga.
  logging: {
    serverFunctions: false,
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
