# Caja MEX · Sistema visual

Referencia para Claude Code. Las dos imágenes en `docs/diseno/` (onboarding-persona.png, panel-coach.png) muestran el resultado esperado; este archivo es la fuente de verdad en tokens. Todo vive en `app/globals.css` como variables en `:root` y se sobreescribe por `data-mode` en `<html>`. Ningún componente usa colores, tiempos o fuentes fuera de los tokens.

## Carácter
Calmado, cálido y profesional. Fondo tipo papel, un solo acento terroso, tipografía serif humanista en títulos y sans legible en cuerpo, bordes finos, nada de sombras fuertes ni degradados. Las ilustraciones son doodles de una sola línea en tinta, monocromas y quietas en pantallas de trabajo. Pantallas de la persona: una acción por vista, texto grande, progreso visible. Pantallas del coach: columna principal más panel lateral, densidad ordenada.

## Tokens (modo Estándar)

```css
:root {
  --bg: #F6F2EC;            /* papel */
  --bg-elevated: #FBF9F5;   /* tarjetas */
  --bg-muted: #EFEAE2;      /* opciones no seleccionadas */
  --fg: #1F1D1A;            /* texto */
  --fg-muted: #6B6560;      /* texto secundario, metadatos */
  --border: #CFC8BE;        /* bordes 1px */
  --accent: #B85C45;        /* terracota: acción primaria, selección */
  --accent-fg: #FBF9F5;     /* texto sobre acento */
  --accent-soft: #E8D5CD;   /* fondo de chips, hover suave */
  --ink: #2A2724;           /* doodles */

  --font-serif: "Source Serif 4", "Georgia", serif;
  --font-sans: "Atkinson Hyperlegible", "Inter", system-ui, sans-serif;
  --font-body: var(--font-sans);
  --text-base: 18px;
  --leading: 1.6;
  --tracking: 0;
  --measure: 62ch;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --border-w: 1px;
  --shadow: none;

  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;

  --motion-duration: 180ms;
  --motion-distance: 4px;
  --motion-ease: cubic-bezier(.2,.7,.2,1);
}
```

## Modos

```css
:root[data-mode="calma"] {
  --bg: #F3F0EA; --bg-elevated: #F6F3EE; --bg-muted: #ECE8E1;
  --fg: #3A3733; --fg-muted: #7A746E; --border: #D9D3CA;
  --accent: #8F6B5E; --accent-soft: #E6DCD6;
  --motion-duration: 0ms; --motion-distance: 0px;
  --leading: 1.8;
}
:root[data-mode="alto-contraste"] {
  --bg: #FFFFFF; --bg-elevated: #FFFFFF; --bg-muted: #F2F2F2;
  --fg: #000000; --fg-muted: #333333; --border: #000000;
  --accent: #8A2E1A; --accent-fg: #FFFFFF; --accent-soft: #F5E3DD;
  --border-w: 2px;
}
@media (prefers-reduced-motion: reduce) {
  :root { --motion-duration: 0ms; --motion-distance: 0px; }
}
```

Preferencias de la persona que también son tokens: `data-font` (sans | opendyslexic | lexend), `--text-base` (16 a 24px), `--tracking` (0 a 0.06em), `--leading` (1.5 a 2), `--measure` (50 a 75ch). Se cargan desde `localStorage` antes del primer render y se sincronizan con el perfil.

## Tipografía
- Títulos de página y de sección: `--font-serif`, peso 500, sin mayúsculas forzadas. H1 40 a 48px, H2 28px.
- Cuerpo y controles: `--font-sans`. Mínimo 18px en pantallas de la persona, 16px en las del coach.
- Citas de evidencia en el perfil: itálica, `--fg`, seguidas de la fuente en `--fg-muted` ("Nota de sesión, 14 oct").
- Metadatos (Tipo, Etapa, fechas): `--fg-muted`; la etiqueta en `--accent` solo cuando identifica el tipo de acompañamiento.

## Componentes
- Tarjeta: fondo `--bg-elevated`, borde `--border-w` `--border`, radio `--radius-lg`, padding `--space-8`, sin sombra.
- Botón primario: fondo `--accent`, texto `--accent-fg`, radio `--radius-md`, alto mínimo 48px, texto 18px. Hover: oscurecer 6 %. Foco: anillo 3px `--accent` con offset 2px, siempre visible.
- Botón secundario y "Ver detalle": fondo transparente, borde `--border`, texto `--fg`, radio `--radius-md` (pill en chips pequeños).
- Opción de respuesta (persona): bloque ancho, alto mínimo 64px, fondo `--bg-muted`, borde `--border`; seleccionada: fondo `--accent`, texto `--accent-fg`, borde `--accent`. Una sola seleccionable, navegable con flechas y espacio.
- Enlace de ayuda ("Pedir ayuda a una persona"): subrayado, `--fg-muted`, presente en toda pantalla de la persona, al pie.
- Progreso: texto "Paso n de m" centrado arriba en `--fg-muted`; sin barra animada.
- Navegación del coach: columna izquierda 260px, nombre del producto en serif, ítems en sans 20px, activo en peso 600 sin fondo.
- Doodles: SVG inline, `stroke: var(--ink)`, `stroke-width: 1.5`, `fill: none`. Estáticos en pantallas de trabajo. Solo en bienvenida y confirmaciones pueden dibujarse con `stroke-dasharray` y `stroke-dashoffset` durante `--motion-duration * 4`, una vez, sin bucle; en Calma o reduced motion aparecen completos.

## Movimiento
Solo estados: opacidad y desplazamiento de `--motion-distance`, duración `--motion-duration`. Nada de escala, rebote, parallax, autoplay ni bucles. Cambio de pantalla: corte limpio o fundido de opacidad.

## Lenguaje
Literal y directo. Botones que dicen qué pasa ("Guardar nota", no "Enviar"). Persona o participante, nunca paciente. Fortalezas y áreas de apoyo, nunca debilidades. Sin tiempos límite ni avisos sorpresa. Confirmación antes de acciones irreversibles.

## Checklist por pantalla
- Contraste AA en todos los modos (axe sin errores).
- Navegable completa con teclado, foco visible.
- Una sola acción primaria por vista en pantallas de la persona.
- Ningún color, fuente ni tiempo fuera de tokens.