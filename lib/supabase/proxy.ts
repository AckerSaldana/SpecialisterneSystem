// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Refresco de la sesión de Supabase en cada petición (lo llama proxy.ts).
// Patrón de @supabase/ssr: el cliente lee las cookies de la petición y, si renueva el token,
// escribe las cookies nuevas en la petición (para el resto de este render) y en la respuesta
// (para el navegador).
//
// Es una verificación optimista: solo decide si mandar a /login. La autorización real
// está en requireRole() (lib/auth.ts) y en las políticas RLS de la base.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rutas que exigen sesión. /, /login, /preferencias e /invitacion (entrada con código,
// spec 002) quedan públicas. /bienvenida son los pasos de la persona antes de su página.
const RUTAS_PRIVADAS = ["/coach", "/persona", "/bienvenida"];

function esPrivada(pathname: string) {
  return RUTAS_PRIVADAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // 1. La petición: así los Server Components de esta misma petición ven el token nuevo.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // 2. Una respuesta nueva que lleve la petición actualizada.
          response = NextResponse.next({ request });
          // 3. Las cookies y los encabezados (p. ej. no cachear) que el navegador debe recibir.
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // No poner código entre createServerClient y getClaims: getClaims es lo que renueva
  // la sesión si el token venció, y además verifica la firma del JWT.
  const { data } = await supabase.auth.getClaims();
  const haySesion = Boolean(data?.claims?.sub);

  if (!haySesion && esPrivada(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Devolver la misma "response" (con sus cookies), no una nueva, para no perder la sesión.
  return response;
}
