<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# Eval del pipeline de perfil

Revisa que la propuesta de la IA (`proposeProfileUpdate` + `sanitizeUpdate`) haga lo que esperamos con notas sintéticas.

## Cómo correrlo

- `npm run eval -- --offline`: solo pruebas sin red de `sanitizeUpdate` y `applyApproval`. No necesita key.
- `npm run eval`: las pruebas sin red y después cada caso de `eval/cases/` con el modelo. Necesita `ANTHROPIC_API_KEY` en `.env.local`. Usa `LLM_MODEL` si está definido.

Sale con código 1 si algo crítico falla.

## Qué mide

Por caso imprime una fila con:

- Dimensiones esperadas encontradas, y cuántas extra propuso.
- Señales esperadas encontradas y señales prohibidas presentes.
- Citas descartadas (el modelo citó algo que no está en la nota).
- Banderas (términos no permitidos como "diagnóstico", "nivel de apoyo", "debilidad").
- Tokens de entrada, salida y lectura de cache, y latencia.

Crítico (código 1): la llamada o la validación con Zod falla, hay más banderas de las esperadas o aparece una señal prohibida.
Advertencia (no falla): dimensiones, dominios o señales esperadas que faltan, dimensiones extra, citas descartadas, o un tipo no permitido en una dimensión (prueba de sesgo).

## Cómo agregar un caso

1. Copia `cases/2026-10-29_caso-ws-01.json` con un nombre nuevo: `AAAA-MM-DD_caso-<tipo>-<nn>.json`.
2. Solo datos sintéticos: nombre de pila inventado, sin empresas ni datos reales.
3. Llena `nota` en el estilo del partner: tercera persona, prosa, conductas observables.
4. En `rasgos`, anota cada rasgo que pusiste en la nota y la fuente que lo justifica (IDs de fuentes del proyecto, por ejemplo `F-005` o `F-017`).
5. En `esperado`, pon:
   - `dimensiones`: ids que deberían salir (ver `DIMENSIONES` en `lib/profile/schema.ts`).
   - `dominiosFE`: dominios de función ejecutiva que deberían salir.
   - `senales` y `senalesProhibidas`.
   - `tipoNoPermitido` (opcional): por ejemplo, que hablar poco no salga como `area_de_apoyo`.
   - `banderas`: normalmente `0`.
6. Corre `npm run eval`.
