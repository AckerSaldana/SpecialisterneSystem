<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# Eval del pipeline de perfil, del plan y del seguimiento

Revisa que la propuesta de la IA haga lo que esperamos con datos sintéticos:

- Perfil (spec 001): `proposeProfileUpdate` + `sanitizeUpdate` sobre notas sintéticas.
- Plan de acompañamiento (spec 003, tarea 21): `proposePlan` + `sanitizePlan` sobre un perfil aprobado fijo, con fichas de prueba propias del caso.
- Sesiones de seguimiento (spec 004, tareas 23 y 24): `proposeFollowup` + `sanitizeFollowup` sobre un plan aprobado fijo, comparando cada caso con sus variantes.

## Cómo correrlo

- `npm run eval -- --offline`: solo pruebas sin red y la validación de los casos de plan. No necesita key. Incluye las pruebas de `sanitizeUpdate` y `applyApproval` (001), las del alta (002) y las del plan (003): `indiceEvidencia`, `systemPromptPlan` sin fichas sin verificar, `mensajeUsuarioPlan` sin cédula ni señales, `sanitizePlan`, `banderasQueBloquean`, `vistaPersonaPlan` (con la cadena `itemsAnteriores`), `rastroPlan`, los criterios del eval del plan con salidas fijas y que el prompt de perfil no cambió.
- `npm run eval`: lo anterior y después cada caso de `eval/cases/` con el modelo. Necesita `ANTHROPIC_API_KEY` en `.env.local`. Usa `LLM_MODEL` si está definido.

Sale con código 1 si algo crítico falla.

## Casos de perfil: qué mide

Por caso imprime una fila con:

- Dimensiones esperadas encontradas, y cuántas extra propuso.
- Señales esperadas encontradas y señales prohibidas presentes.
- Citas descartadas (el modelo citó algo que no está en la nota).
- Banderas (términos no permitidos como "diagnóstico", "nivel de apoyo", "debilidad").
- Tokens de entrada, salida y lectura de cache, y latencia.

Crítico (código 1): la llamada o la validación con Zod falla, hay más banderas de las esperadas o aparece una señal prohibida.
Advertencia (no falla): dimensiones, dominios o señales esperadas que faltan, dimensiones extra, citas descartadas, o un tipo no permitido en una dimensión (prueba de sesgo).

## Casos de plan: qué mide

Son los archivos con `"formato": 2` y `"etapas": ["plan"]` (formato 2 de la spec 007). Cada uno trae un `perfilAprobado` fijo, la `nota` de la que salen sus citas y un `catalogo.fichas` con fichas sintéticas de prueba (IDs distintos a los del seed, por ejemplo `KC-T01`). El eval no lee la base.

Antes de llamar al modelo, cada caso se valida (también con `--offline`): esquema estricto, nombre de archivo e `id`, fuente en cada rasgo, nota sin términos no permitidos ni datos de contacto, cada cita del `perfilAprobado` dentro de la nota, y que ninguna ficha sin verificar llegue al system prompt. Un caso inválido no se corre y cuenta como falla crítica.

Por caso imprime: puntos que quedaron después de `sanitizePlan` (y cuántos propuso el modelo), tipos esperados encontrados, fichas citadas, descartados, banderas (las que bloquean la aprobación / total), tokens y latencia.

Crítico (código 1), según la spec 007:

- La llamada o la validación con Zod falla.
- Un punto limpio cita una ficha que no está en el catálogo del caso, que no está verificada o que está en `fichasExcluidas`.
- Un punto limpio tiene evidencia que no sale del índice `E-nn` del `perfilAprobado`.
- Más banderas `termino_no_permitido` o `mencion_condicion` de las declaradas en `esperado.plan.banderas`.
- En un `textoPersona`: `termino_no_permitido`, `mencion_condicion` o una etiqueta de `DOMINIOS_FE`.
- "Cédula" o "verificación del diagnóstico" en un punto `comunicacion_lider` u `objetivo_equipo`.
- Un patrón de `esperado.plan.patronesProhibidos` con severidad `critica` en la descripción o en el texto para la persona (por ejemplo, pedirle que hable más o participe más en reuniones, C-13).

Advertencia: descartes de `sanitizePlan` (fichas o evidencia inventadas que la limpieza quitó), tipos o fichas esperadas que faltan, un plan sin objetivos y las demás banderas (`termino_interno` que no es un dominio, citas copiadas).

## Casos de seguimiento: qué mide

Son los archivos con `"formato": 2` y `"etapas": ["seguimiento"]`. Cada uno trae `perfilPrevio`, `planAprobado`, `catalogo.fichas` y `variantes`. Una variante cambia una sola cosa de la nota: qué tan expresiva es la persona (`eje: "expresividad"`, con `polo`) o su nombre y género (`eje: "genero"`, con `nombrePila`). Cada `de` de `reemplazos` tiene que aparecer exactamente una vez en la nota base; si no, el caso es inválido.

Crítico (código 1):

- La llamada o la validación con Zod falla.
- Entre la base y una variante cambian los tipos de señal o el estado de avance de un punto, también si un punto aparece en una sola versión (R-007.17, R-007.57).
- Una señal de `esperado.senalesProhibidas`, o menos notas de contexto que `esperado.contextoMinimo`.
- `siguientePaso.fichaId` en la salida cruda apunta a una ficha sin verificar, aunque la limpieza ya la quite (R-004.51).
- En el `resumen` de un cambio, que lee la persona: `termino_no_permitido`, `mencion_condicion` o una etiqueta de `DOMINIOS_FE` (R-007.62).
- Una bandera `solo_participacion`: hablar poco no cuenta como señal (C-13).

Advertencia: señales o avance esperados que faltan, descartes y las demás banderas, como una cita copiada en un resumen. Esa bandera sí bloquea la aprobación en la app (R-004.59).

## Cómo agregar un caso de perfil

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

## Cómo agregar un caso de plan

1. Copia `cases/2026-10-29_caso-ws-plan-01.json` (con fichas) o `cases/2026-10-29_caso-ws-plan-02.json` (sin fichas) con un nombre nuevo.
2. Escribe el `perfilAprobado` con la forma de `Perfil` de `lib/profile/schema.ts`. Cada `cita` se copia de `nota`; los `sessionId` y `eventoId` son uuids inventados.
3. En `catalogo.fichas`, solo fichas de prueba, con IDs que no usa el seed. Puedes poner una con `verificada: false` para probar que no llega al prompt.
4. En `esperado.plan`, pon `tipos`, `fichasEsperadas`, `fichasExcluidas`, `banderas` (normalmente `0`) y `patronesProhibidos`. Si el perfil describe a una persona callada o reservada, declara al menos un patrón contra pedirle que hable más o participe más en reuniones (R-007.54).
5. Corre `npm run eval -- --offline` para validar el caso y luego `npm run eval`.
