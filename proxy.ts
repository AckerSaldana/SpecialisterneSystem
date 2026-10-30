// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Proxy de Next 16 (antes "middleware"). Corre antes de cada petición que coincide con
// el matcher y solo refresca la sesión de Supabase. Ver lib/supabase/proxy.ts.
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Todo excepto los archivos internos de Next, el favicon y las imágenes o fuentes estáticas.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)",
  ],
};
