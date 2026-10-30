<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# 001 · Evaluación inicial (as-built)

- Estado: Borrador · Versión 4 · 2026-10-30
- Fuentes: F-005, F-017, F-030 (handoff del 29 oct), D-015, D-016, D-017, D-021, D-058, D-031, D-032, D-033, D-034, D-035, REGLAS §2.5, §3, §5, §6, §7, CONTEXTO §4, §5, §6, §11; constitución C-01, C-02, C-03, C-04, C-05, C-07, C-08, C-09, C-10, C-11, C-13, C-14, C-15, C-16, C-17, C-18
- Depende de: 000 y 002. El consentimiento vigente, la verificación y la lista de lo que escribe la persona los define 002; hoy el consentimiento y la verificación los pone `scripts/seed.sql`. Los cambios de etapa los define 003. Qué cuenta como señal activa una vez que se pueden cerrar señales lo define 004.

Esta spec describe lo que ya existe en el código del sprint 1, revisado el 29 oct. No pide código nuevo. Lo que falta o funciona distinto a lo esperado está en "Huecos conocidos" y pasa a la spec que se indica en cada uno.

Estado de las decisiones que se citan:

- D-015, D-016, D-017 y D-021 están en estado propuesta en CONTEXTO §9; falta la aprobación de los tres (CONTEXTO §6). La aprobación de D-021 se lleva como decisión abierta en 002, junto con D-020 y D-022.
- D-058 y D-031 a D-035 están en CONTEXTO §9 desde la versión 5. D-058 está decidida por los tres, según Acker; falta que David y Rodrigo lo confirmen en CONTEXTO §9. D-031 a D-035 son propuestas; las decide Acker.
- "Handoff del 29 oct" es el documento que describe 000; está registrado como F-030 en CONTEXTO §10.

## Problema y para quién

Hoy el coach de Specialisterne trabaja con sus notas y su memoria, y el partner describe el proceso como muy manual (F-005, 23:31). Specialisterne arma un perfil por persona, lo revisa con ella y lo firman los dos (CONTEXTO §4). En Workplace Support el servicio empieza con una evaluación corta (CONTEXTO §4). En el producto, la evaluación inicial convierte la nota que escribe el coach en una propuesta de perfil sobre las 15 dimensiones que describió y autorizó el partner (F-005, 45:53; CONTEXTO §5). Cada parte de la propuesta cita la nota, y el coach decide qué se aplica (D-015, propuesta; CONTEXTO §6, flujo del demo, paso 2).

- Coach: escribe la nota, revisa la propuesta, aprueba una parte o la rechaza, y consulta el perfil con su evidencia.
- Persona: lee su perfil en lenguaje claro y avisa cuando algo no la representa (CONTEXTO §6, flujo del demo, paso 5).

## Alcance

Entra lo que ya funciona:

- la nota de sesión escrita y la propuesta de la IA;
- la validación de la propuesta con código;
- la revisión, la aprobación parcial y el rechazo;
- el snapshot del perfil y su copia para la persona;
- las pantallas del coach (perfil, señales activas, historial) y la de la persona;
- el botón "Esto no me representa";
- el eval con casos sintéticos y las pruebas sin red.

**Fuera de alcance:**

- Notas por voz (Whisper). CONTEXTO §6 dice que el coach carga sus notas "en texto o voz", pero hoy solo hay texto. La columna `sessions.audio_path` existe y ningún archivo la usa. Va a "What's next", igual que en 004.
- Alta, invitación, consentimiento y su retiro, registro de la verificación del diagnóstico y aviso de privacidad: 002.
- Cambios de etapa del acompañamiento: 003, dueña de la tabla de transiciones. El paso de `alta` a `evaluacion_inicial` lo hace 002.
- Plan de acompañamiento: 003, incluidos los objetivos del equipo (CONTEXTO §5) y los ajustes razonables de la dimensión 15 como parte del plan. Fichas de conocimiento y recomendaciones: 003 y 005. La sección "Recursos" de `/persona` ya existe en el código, pero se especifica en 005.
- Retomar propuestas, cambiar el tipo o el texto de un cambio antes de aprobarlo, completar la auditoría y señales en seguimiento: 004.
- Lo que pasa con un "Esto no me representa" después de enviarlo: 005, dueña de su ciclo de vida.
- Cuándo llega a la persona un cambio aprobado: 005, decisión abierta 2. Su propuesta (b), una acción aparte "Publicar perfil para {nombre}", cambiaría R-001.20 y CA-001.10, porque hoy la fila de `persona_profiles` se escribe en la misma transacción que la aprobación.
- En qué persona gramatical lee la persona su perfil (H-4): 005, decisión abierta 1.
- Prueba de sesgo con pares de casos y formato de los casos de eval: 007.
- Pruebas de RLS guardadas en el repo: `scripts/rls-check.ts`, definido en 002.

## Requisitos

Cada requisito describe cómo se comporta el sistema hoy. La columna "Fuente" da la regla o decisión que lo pide y, entre paréntesis, dónde está en el código.

### Nota y propuesta

| ID | Requisito | Fuente |
|---|---|---|
| R-001.1 | Cuando un coach envía una nota de 20 a 20,000 caracteres (después de recortar espacios) a un acompañamiento donde es el coach, el sistema guarda la nota original en `app.sessions` y le pide al modelo una propuesta. Una nota fuera de ese rango recibe 400 con "La nota necesita al menos 20 caracteres." o "La nota puede tener hasta 20,000 caracteres." | D-015 (propuesta); CONTEXTO §6 paso 2 (`ProposeRequest` en `lib/api/contracts.ts`; `app/api/engagements/[id]/sessions/route.ts`) |
| R-001.2 | Cuando el acompañamiento no tiene consentimiento vigente (002), el sistema responde 409, no guarda la nota y no llama al modelo. La pantalla de nueva sesión no muestra el formulario. Si la ruta se saltara esa revisión, la política `sessions_insert_coach` rechaza el insert. El único chequeo es `private.app_has_consent(engagement_id)`. Hoy esa función, la ruta y la pantalla leen `engagements.consentimiento_en`; 002 cambia la función para que lea el último evento de `app.consent_events` (R-002.28) y la ruta y la pantalla pasan a usarla. Propuesta (Claude), decide Acker. | D-035 (propuesta); C-10 (`sessions/route.ts`; `private.app_has_consent` en `drizzle/0000_helpers.sql`; `sessions/new/page.tsx`) |
| R-001.3 | Cuando quien envía la nota no tiene sesión o su rol no es coach, el sistema responde 401. Cuando el id no es un UUID o el coach no participa en ese acompañamiento, responde 404 con el mismo mensaje en ambos casos. | C-16 (`getUserWithRole` en `lib/auth.ts`, `withRls` en `lib/db/rls.ts`) |
| R-001.4 | El modelo recibe el system prompt versionado y un mensaje con cuatro datos: el nombre de pila de la persona, el tipo de acompañamiento, el perfil previo reducido (resumen, tipo, dominios y citas por dimensión, y tipo y descripción de cada señal activa, sin IDs ni fechas) y la nota entre etiquetas `<nota_del_coach>`. No recibe `diagnostico_verificado`, `cedula_profesional` ni ningún otro campo de la verificación. Hoy las señales activas salen directo de `senalesActivas` del snapshot; cuando 004 agregue el cierre de señales, este prompt manda solo las del snapshot menos las cerradas en `signal_states` (hueco H-15). | C-02, C-03, D-021 (propuesta), C-18 (`mensajeUsuarioProfileUpdate` en `lib/prompts.ts`) |
| R-001.5 | La llamada usa `generateText` con `Output.object` sobre el esquema Zod `ProfileUpdate`. Si la respuesta no cumple el esquema, la llamada lanza error y se trata como falla del modelo (R-001.13). El modelo por defecto es `claude-haiku-5-5` y se cambia con la variable `LLM_MODEL`. | D-031 (propuesta); C-15 (`lib/ai/propose-profile-update.ts`, `lib/ai/model.ts`) |
| R-001.6 | La propuesta solo puede usar las 15 dimensiones del partner, los nombres de los 9 dominios de BRIEF-A (de 0 a 3 por cambio), los 4 tipos de señal del seguimiento y los tipos `fortaleza`, `area_de_apoyo` y `contexto`. Los objetos son estrictos: una llave extra, como "diagnostico" o "nivel", hace fallar la validación. | F-005 (45:53), CONTEXTO §5, F-017, C-01, C-08 (`lib/profile/schema.ts`) |
| R-001.7 | Cada cambio, señal y relación con el perfil previo trae de 1 a 5 citas de 8 a 600 caracteres. La propuesta tiene como máximo 15 cambios, 4 señales, 10 relaciones y 5 preguntas para la siguiente sesión. | D-015 (propuesta); C-05 (`ProfileUpdate` en `lib/profile/schema.ts`) |
| R-001.8 | Fuera del LLM, el sistema quita toda cita que no aparece en la nota. Compara textos normalizados (sin acentos, minúsculas, comillas unificadas, espacios colapsados, signos de los bordes recortados), exige al menos 8 caracteres después de normalizar y límite de palabra a los dos lados. Un elemento que se queda sin citas se quita completo. Cada cita quitada se anota en `descartados` con motivo `cita_no_encontrada` y la ruta de la respuesta original. | D-034 (propuesta); C-05 (`sanitizeUpdate` en `lib/profile/validate.ts`) |
| R-001.9 | Cuando quedan dos o más cambios con evidencia para la misma dimensión, el sistema conserva el primero y anota los demás en `descartados` con motivo `dimension_duplicada`. | Interpretación del equipo: evita que un cambio sobrescriba a otro al aprobar (`lib/profile/validate.ts`) |
| R-001.10 | El sistema marca como bandera cada término no permitido que aparece en el texto escrito por el modelo: resúmenes de cambios, descripciones de señales y relaciones, y preguntas. Las citas del coach no se revisan. La lista cubre diagnóstico (y sus derivados), trastorno, TEA (solo en mayúsculas), asperger, autismo leve/moderado/severo, nivel 1/2/3, nivel o grado de autismo, apoyo, severidad o funcionamiento, alto o bajo funcionamiento, paciente, debilidad, déficit y síntoma. Las banderas no quitan nada; avisan al coach. | REGLAS §2.5, D-017 (propuesta), C-01, C-08 (`buscarTerminos` en `lib/profile/validate.ts`) |
| R-001.11 | El sistema guarda la propuesta ya limpia como `profile_event` con `tipo = 'propuesta_ia'`, `status = 'proposed'`, `session_id`, `created_by`, `prompt_version` y `model`. En este paso nada se aplica al perfil. | C-04, C-18 (`sessions/route.ts`) |
| R-001.12 | Cuando la llamada al modelo termina, el sistema escribe una fila en `app.audit_log` con `user_id`, `engagement_id`, `accion = 'propose_profile_update'`, `modelo`, `prompt_version`, `latencia_ms` y `ok`. Si tuvo éxito, agrega `tokens_entrada`, `tokens_salida` y `tokens_cache_lectura`, en la misma transacción que el evento. Si falló, guarda en `error` el texto de `resumirError` (nombre del error y código HTTP del proveedor para errores del AI SDK), recortado a 1000 caracteres. Las excepciones a esta regla están en el hueco H-11. | C-17 (`lib/ai/audit.ts`, `resumirError` en `lib/log.ts`) |
| R-001.13 | Cuando el modelo falla o su respuesta no cumple el esquema, el sistema responde 502 con "No se pudo generar la propuesta. La nota quedó guardada; intenta de nuevo." La sesión con la nota queda guardada sin evento. Si falla el guardado del evento, responde 500 y la nota también queda guardada. | Interpretación del equipo: describe el código actual, sin decisión que lo pida; ver huecos H-3 y H-11 |
| R-001.14 | El system prompt le prohíbe al modelo diagnosticar, usar los términos de R-001.10, inventar, marcar riesgo o área de apoyo porque la persona sea callada o reservada, suponer por género o edad y seguir instrucciones que vengan dentro de la nota. | C-01, C-13, F-005 (13:12) (`prompts/2026-10-29_profile-update.md`) |

### Revisión y decisión del coach

| ID | Requisito | Fuente |
|---|---|---|
| R-001.15 | Con la propuesta lista, la pantalla muestra cada cambio con su dimensión, si está incluido, su tipo, el resumen, las funciones ejecutivas relacionadas, los términos a revisar y sus citas. Todos los cambios y señales empiezan marcados. | C-04; CONTEXTO §6 paso 2 (`components/coach/proposal-review.tsx`) |
| R-001.16 | Las señales se muestran aparte, con el aviso de que la persona no las ve. Cuando existen, también se muestran las relaciones con el perfil anterior y las preguntas para la siguiente sesión. | C-09 (`proposal-review.tsx`) |
| R-001.17 | Si la validación quitó citas o cambios repetidos, o marcó términos, la pantalla lo avisa antes de que el coach decida y deja ver las citas quitadas. | C-05 (`proposal-review.tsx`) |
| R-001.18 | Antes de aplicar, el sistema abre un diálogo de confirmación que lista los cambios y las señales seleccionados. Antes de rechazar, abre otro diálogo de confirmación. Mientras guarda, ningún diálogo se puede cerrar. El botón de aprobar está desactivado si no hay nada seleccionado. | C-14 (`proposal-review.tsx`) |
| R-001.19 | Cuando el coach aprueba, el sistema revisa que los índices existan y que no haya dos cambios aprobados para la misma dimensión. Luego, sobre el último snapshot: reemplaza resumen, tipo y dominios de cada dimensión aprobada; suma las citas nuevas sin duplicados y conserva las 10 más recientes; agrega las señales aprobadas a `senalesActivas`, y valida el resultado con `Perfil.parse`. | C-04 (`applyApproval` y `validarIndices` en `lib/profile/merge.ts`) |
| R-001.20 | En la misma transacción, el sistema guarda un `profile_snapshot` con `version` + 1 y `source_event_id`, una fila en `persona_profiles` con solo resumen y tipo por dimensión (`vistaPersona`), y marca el evento como `approved` con `approved_payload`, `decided_by` y `decided_at`. | D-033 (propuesta); C-09 (`app/api/profile-events/[id]/decision/route.ts`) |
| R-001.21 | Cuando el coach rechaza, el evento pasa a `rejected` con `decided_by` y `decided_at`, y el perfil no cambia. La nota sigue guardada. | C-04 (`decision/route.ts`) |
| R-001.22 | El sistema responde 400 si el cuerpo no es válido, si se aprueba sin nada seleccionado o si la selección no coincide con la propuesta. Responde 409 si la propuesta ya fue revisada, si el evento no es una propuesta de la IA o si otra aprobación guardó la misma versión al mismo tiempo. Responde 404 si el id no es un UUID o el coach no ve el evento. | C-04; el manejo de concurrencia es interpretación del equipo (`decision/route.ts`: bloqueo `for update` y restricción `profile_snapshots_engagement_version`) |
| R-001.23 | La página del acompañamiento muestra al coach el perfil actual por sección, con tipo, resumen, funciones ejecutivas, fecha de actualización y evidencia con la fecha de la sesión; las señales activas aparte, y el historial de eventos con estado, conteos, versión de instrucciones, modelo y quién decidió. Hoy "Señales activas" lee `senalesActivas` del snapshot; con el cierre de señales de 004, la sección descuenta las cerradas en `signal_states` (hueco H-15). | CONTEXTO §6, valor para Specialisterne: cada recomendación deja su razonamiento y la evidencia de las notas; C-18 (`app/coach/engagements/[id]/page.tsx`, `profile-view.tsx`, `event-timeline.tsx`) |

### Vista de la persona

| ID | Requisito | Fuente |
|---|---|---|
| R-001.24 | Para mostrar el perfil, `/persona` lee solo `persona_profiles`: resumen y tipo por dimensión, sin citas, señales ni funciones ejecutivas. Las dimensiones se agrupan por tipo. | D-033 (propuesta); C-09 (`app/persona/page.tsx`) |
| R-001.25 | RLS no deja a la persona leer `sessions`, `profile_snapshots` ni las propuestas de la IA. De `profile_events` solo ve y crea sus propios `no_me_representa`, y solo puede crearlos en `proposed`. No puede actualizar `profile_events`. La lista completa de lo que escribe la persona la define 002. | C-09, C-16 (políticas en `lib/db/schema.ts`) |
| R-001.26 | Cada dimensión tiene un botón "Esto no me representa", y hay otro para el perfil en general. El comentario es opcional, de hasta 2000 caracteres. Al enviarlo, el sistema guarda un `profile_event` con `tipo = 'no_me_representa'` y `status = 'proposed'`, responde 201 y no cambia el perfil. El coach lo ve en el historial con el estado "Sin revisar". Lo que pasa con el comentario después de enviarlo lo define 005 (huecos H-2 y H-10). | CONTEXTO §6 paso 5 (`app/api/persona/feedback/route.ts`, `components/persona/not-me-button.tsx`) |
| R-001.27 | Retirado: sustituido por R-002.4 y la restricción `engagements_persona_unica` de 002, que permiten un solo acompañamiento por persona. Propuesta (Claude), decide Acker. Decía: "Si la persona tiene más de un acompañamiento, la página y el botón usan el más reciente por `created_at`". El código sigue con esa regla hasta que se implemente 002. | Interpretación del equipo (`persona/page.tsx`, `feedback/route.ts`) |

### Datos y eval

| ID | Requisito | Fuente |
|---|---|---|
| R-001.28 | Las tablas viven en el esquema `app`, que la Data API de Supabase no expone. Toda lectura y escritura pasa por el servidor con `withRls` y permisos por columna. En `profile_events` solo se pueden actualizar `status`, `approved_payload`, `decided_by` y `decided_at`. `engagements`, `sessions`, `profile_snapshots` y `persona_profiles` no tienen permiso de UPDATE. | D-032 (propuesta); C-16 (`drizzle/0002_permisos.sql`) |
| R-001.29 | `npm run eval -- --offline` corre 6 pruebas sin red de `sanitizeUpdate`, `validarIndices` y `applyApproval`. `npm run eval` corre además cada caso de `eval/cases/` con el modelo y reporta dimensiones esperadas y extra, dominios, señales esperadas y prohibidas, tipos no permitidos, citas descartadas, banderas, tokens y latencia. Sale con código 1 si falla una prueba sin red, la llamada o la validación, si el update limpio no cumple el esquema, si hay más banderas de las esperadas o si aparece una señal prohibida. | D-016 (propuesta), C-07, C-13 (`eval/compare.ts`, `eval/README.md`) |
| R-001.30 | Los casos de eval son sintéticos y cada rasgo de la nota lleva el ID de la fuente que lo justifica en el campo `rasgos`. El formato de los casos lo define 007 (formato 2); `caso-ws-01` está en el formato anterior y 007 lo migra o lo reemplaza (R-007.11). | D-016 (propuesta), C-07 (`eval/cases/2026-10-29_caso-ws-01.json`) |

## Criterios de aceptación

| ID | Dado / Cuando / Entonces | Cubre | Cómo se prueba |
|---|---|---|---|
| CA-001.1 | Dado el caso sintético `caso-ws-01`, cuando se corre el eval con el modelo, entonces sale con código 0 y reporta las 6 dimensiones esperadas, la señal `cambio_de_vida`, ninguna señal prohibida, ningún `estilo_comunicacion` como `area_de_apoyo`, 0 citas descartadas y 0 banderas. Cada rasgo del caso tiene fuente en `rasgos`. | R-001.4 a R-001.8, R-001.10, R-001.14, R-001.29, R-001.30 | eval (`npm run eval` con `ANTHROPIC_API_KEY`) y revisión del archivo del caso |
| CA-001.2 | Dada una nota con otras mayúsculas, acentos, comillas y espacios, cuando la cita del modelo difiere solo en eso, entonces la cita se conserva. | R-001.8 | prueba offline 1 de `eval/compare.ts` |
| CA-001.3 | Dada una propuesta con citas inventadas, cuando pasa por `sanitizeUpdate`, entonces se quitan esas citas, se quita todo elemento sin evidencia y las rutas de `descartados` apuntan a la respuesta original. | R-001.8 | prueba offline 2 |
| CA-001.4 | Dada una cita de menos de 8 caracteres o cortada a mitad de palabra, cuando pasa por `sanitizeUpdate`, entonces se descarta. | R-001.8 | prueba offline 3 |
| CA-001.5 | Dados tres cambios para la misma dimensión, cuando pasan por `sanitizeUpdate`, entonces queda el primero con evidencia válida; y `validarIndices` rechaza aprobar dos cambios de la misma dimensión. | R-001.9, R-001.19 | prueba offline 4 |
| CA-001.6 | Dado un resumen con "nivel de apoyo" y "debilidad" y una pregunta con "diagnóstico" y "TEA", cuando pasa por `sanitizeUpdate`, entonces se marcan esas 4 banderas y "nivel de inglés" no se marca. | R-001.10 | prueba offline 5 |
| CA-001.7 | Dado un perfil con 9 citas en una dimensión, cuando se aprueba un cambio con 2 citas nuevas, entonces el resumen se reemplaza, quedan 10 citas (sale la más antigua), lo no aprobado no entra, la señal se agrega, el perfil previo no cambia y aprobar otra vez no duplica citas. | R-001.19 | prueba offline 6 |
| CA-001.8 | Dadas las cuentas del seed y un coach sin acompañamientos, cuando se corren consultas con `set local role authenticated` y los claims de cada cuenta, entonces: la persona lee 0 filas de `sessions`, `profile_snapshots` y de `profile_events` con `tipo = 'propuesta_ia'`; la persona inserta un `no_me_representa` propio en `proposed`, pero no uno con otro `created_by` ni en `approved`; un UPDATE de la persona sobre `profile_events` afecta 0 filas; un UPDATE de `payload` responde "permission denied"; el coach sin acompañamientos lee 0 filas de las tablas del acompañamiento del seed. | R-001.2, R-001.25, R-001.28 | RLS con `scripts/rls-check.ts` (002), al que se suman estas comprobaciones |
| CA-001.9 | Dado el proyecto de Supabase, cuando se pide `/rest/v1/<tabla>` para una tabla de `app`, con y sin el encabezado `Accept-Profile: app`, entonces la respuesta es un error 4xx y no trae filas. | R-001.28 | petición HTTP (curl) |
| CA-001.10 | Dado el seed, cuando el coach escribe una nota, pide la propuesta y la aprueba, y la persona entra y manda "Esto no me representa", entonces el coach ve la versión nueva del perfil y el comentario en el historial como "Sin revisar"; la persona ve su perfil sin citas ni señales; y en la base hay un `profile_snapshot` y una fila de `persona_profiles` con la misma `version`, y el evento quedó `approved` con `decided_by`. | R-001.1, R-001.11, R-001.15 a R-001.18, R-001.20, R-001.23, R-001.24, R-001.26 | navegador + SQL |
| CA-001.11 | Dado un acompañamiento sin consentimiento vigente (002; hasta que entre R-002.33, con `consentimiento_en` nulo), cuando el coach abre "Nueva sesión" o llama directo a la ruta, entonces no ve el formulario, la ruta responde 409 y no hay fila nueva en `sessions` ni en `audit_log`. | R-001.2 | navegador + SQL, con el segundo acompañamiento del seed de 002 (etapa `alta`, sin consentimiento, R-002.34) |
| CA-001.12 | Dado `LLM_MODEL` con un id de modelo que no existe, cuando el coach pide la propuesta, entonces recibe 502, la sesión queda guardada sin evento y `audit_log` tiene una fila con `ok = false` y en `error` solo el nombre del error y el código HTTP. | R-001.12, R-001.13 | navegador + SQL |
| CA-001.13 | Dadas dos propuestas pendientes del mismo acompañamiento, cuando se aprueban con dos peticiones simultáneas, entonces una responde 409 con "Otra aprobación se guardó al mismo tiempo." y solo existe un snapshot por versión. | R-001.22 | script con dos peticiones HTTP en paralelo + SQL |
| CA-001.14 | Dada una propuesta ya aprobada o rechazada, cuando llega otra decisión, entonces responde 409 y el perfil no cambia. Dada una aprobación vacía o con un índice que no existe, responde 400. | R-001.22 | petición HTTP + SQL |
| CA-001.15 | Dado un objeto `ProfileUpdate` con una llave extra "nivel", con 16 cambios o con un cambio sin citas, cuando se valida con `ProfileUpdate.safeParse`, entonces falla. | R-001.5, R-001.6, R-001.7 | prueba offline nueva en `eval/compare.ts` |
| CA-001.16 | Dada una llamada exitosa, cuando se revisa `audit_log`, entonces la fila tiene `modelo`, `prompt_version`, tokens y `latencia_ms`, y `error` es nulo. La tabla no tiene columnas para la nota ni para la respuesta. | R-001.12 | SQL |
| CA-001.17 | Dado un rechazo, cuando el coach confirma, entonces el evento queda `rejected` con `decided_by` y `decided_at`, y no hay snapshot nuevo. | R-001.21 | navegador + SQL |
| CA-001.18 | Dada una petición a `POST /api/engagements/[id]/sessions` sin sesión, con sesión de persona, con un id que no es UUID o con el id de un acompañamiento de otro coach, entonces responde 401, 401, 404 y 404, y los dos 404 tienen el mismo mensaje. | R-001.3 | petición HTTP |
| CA-001.19 | Retirado: sustituido junto con R-001.27 por R-002.4 (002); el caso ya no puede existir. Decía: "Dada una persona con dos acompañamientos, cuando abre `/persona` y manda 'Esto no me representa', entonces la página muestra el perfil del más reciente y el evento se guarda en ese acompañamiento". | R-001.27 | No aplica; lo cubre CA-002.4 |
| CA-001.20 | Dado un acompañamiento con verificación y cédula registradas, cuando se arma el mensaje con `mensajeUsuarioProfileUpdate`, entonces el texto no contiene la cédula ni la palabra "verificado", y `EntradaProfileUpdate` no tiene campos de la verificación. | R-001.4 | prueba offline nueva + revisión de código |

## Datos

Esta spec no cambia nada. Documenta lo que usa, con los nombres de `lib/db/schema.ts` y `drizzle/0002_permisos.sql`:

- `app.engagements`: hoy `consentimiento_en` decide si se aceptan notas. 002 la retira o la deriva de `app.consent_events`, y ninguna spec la usa como chequeo: todas dicen "consentimiento vigente (002)". `diagnostico_verificado`, `cedula_profesional`, `diagnostico_verificado_por` y `diagnostico_verificado_en` existen; esta etapa no los lee para el modelo. La página del coach muestra "Diagnóstico verificado: Sí" o "No". `stage` usa el enum `app.engagement_stage`. No hay política ni permiso de UPDATE, y no habrá una política genérica de UPDATE para ningún rol: los cambios de etapa van por funciones `security definer` del esquema `private` o por triggers (003; hueco H-7).
- `app.sessions`: `nota_original` (solo la lee el coach), `realizada_en`, `audio_path` sin uso.
- `app.profile_events`: enum `app.profile_event_type` (`propuesta_ia`, `no_me_representa`) y enum `app.profile_event_status` (`proposed`, `approved`, `rejected`); columnas `session_id`, `payload`, `approved_payload`, `prompt_version`, `model`, `created_by`, `decided_by`, `decided_at`.
- `app.profile_snapshots`: `perfil` completo con citas y señales, solo para el coach; `source_event_id`; restricción única `profile_snapshots_engagement_version` sobre `(engagement_id, version)`.
- `app.persona_profiles`: llave `snapshot_id`; `contenido` con resumen y tipo por dimensión. Vive en otra tabla porque RLS filtra filas y no columnas.
- `app.audit_log`: `user_id`, `engagement_id`, `accion`, `modelo`, `prompt_version`, `tokens_entrada`, `tokens_salida`, `tokens_cache_lectura`, `latencia_ms`, `ok`, `error`.
- Funciones RLS en `drizzle/0000_helpers.sql`, esquema `private`: `app_role`, `app_org_id`, `app_is_coach_of`, `app_is_persona_of`, `app_has_consent`.
- No existe tabla, columna ni bucket de Storage para un documento de diagnóstico (C-02).
- `sessions`, `profile_events`, `profile_snapshots` y `persona_profiles` guardan datos derivados de notas y entran en el bloqueo por retiro de consentimiento que define 002. Hoy no hay bloqueo.
- Lo que la persona puede escribir está en una sola lista en 002. De esta etapa solo entra el `profile_event` de tipo `no_me_representa`.
- Los enums `app.profile_event_type`, `app.profile_event_status` y `app.engagement_stage` se conservan con sus valores actuales.

## Pantallas y textos

Texto literal que hoy ve cada rol. `{…}` marca un valor que llena el sistema.

Coach, nueva sesión (`/coach/engagements/[id]/sessions/new`)

- Enlace: "Volver al perfil de {nombre}"
- Título: "Nueva sesión con {nombre}"
- Sin consentimiento: "Falta el consentimiento" / "{nombre} todavía no tiene consentimiento registrado. Regístralo antes de escribir notas de sesión." Este texto choca con R-002.24, porque el coach no puede registrar el consentimiento; 002 da el texto nuevo para esta pantalla.
- Campo: "Nota de la sesión"
- Ayuda: "Escribe con tus palabras lo que pasó en la sesión. La IA propone cambios al perfil y cita partes de esta nota. Tú decides qué se aplica. La persona no ve esta nota."
- Botón: "Pedir propuesta"
- Mientras espera: "Generando la propuesta. Puede tardar unos segundos."
- Error: "No se pudo pedir la propuesta" y el mensaje del servidor, por ejemplo "La nota necesita al menos 20 caracteres.", "Falta registrar el consentimiento de la persona. No se guardó la nota ni se envió a la IA." o "No se pudo generar la propuesta. La nota quedó guardada; intenta de nuevo."
- Con la propuesta lista: "Ver la nota que enviaste"

Coach, revisión de la propuesta

- "Revisa la propuesta"
- "La propuesta quedó guardada como pendiente. Nada cambia en el perfil hasta que la apruebes. Modelo: {modelo}. Versión de instrucciones: {versión}."
- Aviso: "Revisa esto antes de decidir", "Quitamos {n} citas que no aparecen en la nota.", "Ver las citas quitadas", "Quitamos {n} cambios repetidos para la misma parte del perfil.", "Revisa estos términos: {términos}."
- "Cambios al perfil ({n})"; sin cambios: "La IA no propuso cambios al perfil con esta nota."
- Por cambio: "Incluido. Se va a aplicar." / "No incluido. No se va a aplicar." y "Funciones ejecutivas relacionadas: …"
- "Señales ({n})" / "Las señales solo las ves tú. La persona no las ve."; por señal: "Incluida. Se va a registrar." / "No incluida. No se va a registrar."; sin señales: "La IA no propuso señales con esta nota."
- "Relación con el perfil anterior": "Coincide con el perfil: {dimensión}" o "No coincide con el perfil: {dimensión}"
- "Preguntas para la siguiente sesión"
- "Tu decisión"; sin selección: "Selecciona al menos un cambio o una señal para aprobar."
- Botones: "Aprobar lo seleccionado", "Rechazar propuesta"
- Confirmación: "¿Aplicar esto al perfil?" / "La persona va a ver los cambios al perfil. Las señales solo las ves tú." / "Cambios ({n})" y "Señales ({n})", con "Ninguno." o "Ninguna." / "Cancelar" / "Confirmar y aplicar"
- Rechazo: "¿Rechazar la propuesta?" / "No se aplica ningún cambio al perfil. La nota de la sesión queda guardada." / "Cancelar" / "Rechazar propuesta"
- Mientras guarda: "Guardando la decisión."
- Resultado: "Listo. Se aplicaron {n} cambios y {n} señales al perfil. El perfil ahora está en la versión {v}." o "Rechazaste la propuesta. El perfil no cambió." y el enlace "Ver perfil"
- Error: "No se guardó la decisión" y el mensaje del servidor

Coach, acompañamiento (`/coach/engagements/[id]`)

- "Volver a tus acompañamientos"
- Datos: "Tipo:", "Etapa:", "Consentimiento: Sí, desde el {fecha}" o "Pendiente", "Diagnóstico verificado: Sí" o "No"
- Botón: "Nueva sesión"
- "Perfil actual" / "Versión {v}, del {fecha}."; sin perfil: "Todavía no hay perfil. Escribe la nota de una sesión y aprueba la propuesta para crear la primera versión."
- Por dimensión: "Actualizado el {fecha}", "Ver evidencia ({n} citas)", "Sesión del {fecha}"; sección vacía: "Todavía no hay información en esta sección."
- "Señales activas" / "Solo tú ves esta sección. La persona no la ve." / "Registrada el {fecha}"; sin señales: "No hay señales activas."
- "Historial"; vacío: "Todavía no hay eventos."
- Propuesta: "Propuesta de la IA" con "Estado: Pendiente de revisión", "Aprobada" o "Rechazada"; "Propuso", "Se aplicó", "Citas quitadas por no estar en la nota", "Cambios repetidos quitados", "Versión de instrucciones", "Modelo", "Aprobó" o "Rechazó"
- Comentario de la persona: "La persona dijo: “Esto no me representa”" con "Estado: Sin revisar"; "Sobre" ("El perfil en general" si no es una dimensión), "Lo envió", "No dejó comentario."

Persona (`/persona`)

- "Tu perfil" / "Hola, {nombre}."
- Grupos: "Lo que te funciona", "Dónde te puede servir apoyo", "Tu forma de trabajar"; grupo vacío: "Todavía no hay nada en esta parte."
- "Esto es lo que tu coach y tú han visto hasta ahora. Si algo no te representa, usa el botón de esa parte."
- Sin acompañamiento: "Todavía no tienes un acompañamiento activo. Tu coach te avisa cuando empiece."
- Sin perfil: "Tu perfil todavía no está listo. Tu coach lo revisa contigo antes de publicarlo."
- "Tu perfil en general"
- Botones: "Esto no me representa" y "Algo de mi perfil no me representa"
- Diálogo: "Esto no me representa" / "Sobre: {parte}. Tu coach recibe tu mensaje y lo habla contigo." / "¿Qué cambiarías? (opcional)" / "Enviando." / "Cancelar" / "Enviar a mi coach"
- Enviado: "Tu coach lo va a revisar contigo."
- Error: "No se pudo enviar. Intenta de nuevo."

## Reglas fijas fuera del LLM

- Esquema estricto con Zod (`lib/profile/schema.ts`): sin campos de diagnóstico, tipo o nivel, catálogos cerrados y evidencia obligatoria.
- Citas validadas contra la nota y dimensiones duplicadas quitadas (`sanitizeUpdate`).
- Banderas de términos no permitidos (`buscarTerminos`).
- Índices de aprobación validados y perfil validado con `Perfil.parse` antes de guardar (`lib/profile/merge.ts`).
- Consentimiento exigido por la política RLS `sessions_insert_coach`, además de la revisión en la ruta.
- Copia para la persona armada con `vistaPersona`, que solo deja resumen y tipo.
- `audit_log.error` y los logs del servidor pasan por `resumirError` (ver hueco H-11).
- La verificación del diagnóstico no llega al modelo: `EntradaProfileUpdate` no tiene esos campos (C-02, C-03).
- De `engagements`, la página y la ruta de la persona solo seleccionan `id` (`persona/page.tsx`, `feedback/route.ts`). Es la regla fija en código mientras 002 resuelve H-12.
- No existe ninguna ruta, tabla ni pantalla que envíe algo a la empresa empleadora (C-11).

## Prompts

- `prompts/2026-10-29_profile-update.md`, versión `2026-10-29_profile-update`, revisión de Acker pendiente. El nombre no sigue el formato `AAAA-MM-DD_tema-en-espanol` (REGLAS §7) y se conserva porque ya hay eventos guardados con esa versión. Los prompts nuevos de otras etapas usan el formato en español.
- La acción de `audit_log` de esta llamada es `propose_profile_update` (R-001.12).
- `lib/prompts.ts` toma el texto debajo de `<!-- PROMPT -->` y llena `{{DIMENSIONES}}`, `{{DOMINIOS_FE}}` y `{{SENALES}}` desde `lib/profile/schema.ts`. Si queda un marcador sin llenar, falla.
- El system prompt se marca para el cache de Anthropic. La llamada no manda `temperature`; el comentario en `lib/ai/propose-profile-update.ts` dice que `claude-haiku-5-5` no la acepta. Suposición: no se revisó contra la documentación del proveedor.

## Decisiones abiertas

| # | Pregunta | Opciones (pros y contras) | Propuesta | Decide |
|---|---|---|---|---|
| 1 | ¿Se aprueban D-031, D-033, D-034 y D-035 tal como ya están en el código? | (a) Aprobarlas: el código ya las cumple y las pruebas sin red pasan. (b) Cambiar alguna: obliga a tocar código ya probado. | (a), y registrarlas en CONTEXTO §9 con su nombre | Acker |
| 2 | ¿En qué persona gramatical lee la persona su perfil? (H-4) | (a) Tercera persona para el coach y una segunda versión en segunda persona para la persona: más claro para ella, pero es otra salida del modelo que el coach tiene que aprobar. (b) Una sola versión en segunda persona: cambia el estilo que describe CONTEXTO §5. (c) Dejar tercera persona: sigue el estilo del partner, pero la persona lee sobre sí misma como si fuera otra. | Pasa a la decisión abierta 1 de 005, que propone para el demo la opción (c) con las etiquetas de dimensión reescritas en segunda persona solo en la vista de la persona, y una versión en segunda persona escrita por la IA, cercana a (a), después de preguntar al partner. | Acker, en 005, con la respuesta del partner |
| 3 | ¿Qué hacer con una preferencia que el modelo marca como fortaleza? (H-5) | (a) Ajustar el prompt con criterios para `contexto`: barato, pero no garantiza nada. (b) Agregar al caso de eval un `tipoNoPermitido` para esa dimensión: lo detecta, no lo corrige. (c) Las dos. | (c). Que el coach pueda cambiar el tipo antes de aprobar es requisito de 004. | Acker |
| 4 | ¿Las 5 dimensiones extra del eval son un problema? (H-6) | (a) Revisarlas a mano y, si tienen evidencia, sumarlas a `esperado`. (b) Pedir en el prompt menos dimensiones: puede perder información real. | (a) antes de tocar el prompt | Acker; si cambia el caso, con David Betancourth (Beta), que según el handoff del 29 oct (F-030, propuesta) lleva los casos sintéticos para evaluación. En CONTEXTO §11 el pendiente 9 sigue con responsable por definir. |
| 5 | ¿La primera nota se trata distinto a las de seguimiento? | (a) Igual que hoy, un solo pipeline: simple y ya probado. (b) Prompt o pantalla distinta para la evaluación inicial: más cerca de la "evaluación corta" de Workplace Support (CONTEXTO §4), pero más trabajo. Cualquiera de las dos respeta D-058 (decidida por los tres según Acker; falta que David y Rodrigo lo confirmen en CONTEXTO §9) si se configura por tipo de acompañamiento. | (a) en el MVP; revisar en 004 | Acker |
| 6 | ¿La persona puede leer en la base todas las columnas de su fila en `engagements`, incluida la cédula? (H-12) | (a) Dejarlo: es su propio dato y la app no lo muestra. (b) Quitar con permisos por columna `cedula_profesional` y `diagnostico_verificado_por` para la persona: más cerrado, pero el permiso de SELECT es por rol y coach y persona comparten `authenticated`, así que pide una vista o una función. | Pasa a 002. Propuesta (Claude), decide Acker: la persona no lee `cedula_profesional` ni las columnas de verificación; 002 añade la función `security definer` `private.app_mi_acompanamiento()` (R-002.40), que le da solo `id`, `type` y `stage`, y mientras tanto rige la regla fija en código (las páginas de la persona solo seleccionan columnas permitidas). | Acker, en 002 |

## Tareas

No aplica: es una spec as-built. Los huecos pasan a la spec que indica cada uno.

## Verificación

- `npm run eval -- --offline`: las 6 pruebas pasan.
- `npm run eval` con `ANTHROPIC_API_KEY`: `caso-ws-01` sin fallas críticas.
- Las pruebas de RLS de CA-001.8 pasan y quedan guardadas en `scripts/rls-check.ts` (002, H-8).
- La Data API no devuelve filas de `app` (CA-001.9).
- Recorrido en navegador del CA-001.10.
- Los criterios pendientes se prueban antes de pasar esta spec a "Verificada".

Estado de los criterios al 29 oct:

- CA-001.2 a CA-001.7: verificados el 29 oct. El revisor volvió a correr `npm run eval -- --offline` ese día y las 6 pruebas pasaron.
- CA-001.1: reportado como verificado en la sesión del 29 oct, con 6/6 dimensiones, 1/1 señal, 0 descartadas, 0 banderas y 5 dimensiones extra como advertencia (H-6). El eval no guarda su salida, así que no hay registro en el repo.
- CA-001.8: reportado como verificado en la sesión del 29 oct con 19 pruebas por SQL. Esas pruebas no están en el repo (H-8) y no se puede confirmar cuáles de las comprobaciones de CA-001.8 incluían.
- CA-001.9: reportado como verificado el 29 oct (respuesta 404 sin el encabezado de esquema). Con `Accept-Profile: app`: pendiente.
- CA-001.10: reportado como verificado en navegador el 29 oct. La parte de SQL: pendiente.
- CA-001.11 a CA-001.20: pendientes, salvo CA-001.19, que está retirado. Para CA-001.11 el seed actual no alcanza porque su único acompañamiento tiene consentimiento; se prueba con el segundo acompañamiento que agrega el seed de 002, en etapa `alta` y sin consentimiento (R-002.34).

## Huecos conocidos

Todos pasan a 004 salvo que se indique otra cosa.

| # | Hueco | Qué pasa hoy | Dónde se ve |
|---|---|---|---|
| H-1 | No hay pantalla para retomar una propuesta pendiente. | Si el coach cierra la página antes de decidir, el evento queda `proposed` y solo aparece en el historial como "Pendiente de revisión", sin forma de aprobarlo o rechazarlo desde la interfaz. | `session-composer.tsx`, `event-timeline.tsx` |
| H-2 | No hay endpoint para marcar como revisado un `no_me_representa`. Pasa a 005, dueña del ciclo de vida de "Esto no me representa"; 004 solo la referencia. | El comentario queda "Sin revisar" para siempre. La ruta de decisión responde 409 porque no es una propuesta de la IA. | `decision/route.ts`, `event-timeline.tsx` |
| H-3 | Reintentar después de un 502 crea otra sesión. | La nota ya se guardó en el primer intento; al volver a enviar se inserta una sesión nueva con la misma nota y la primera queda sin evento. | `sessions/route.ts` |
| H-4 | La persona lee el resumen en tercera persona. Pasa a 005 (decisión abierta 1). | El prompt pide tercera persona con el nombre de pila (estilo de CONTEXTO §5) y `/persona` muestra ese mismo texto bajo encabezados en segunda persona. | `prompts/2026-10-29_profile-update.md`, `persona/page.tsx` |
| H-5 | El modelo clasificó una preferencia como fortaleza en la prueba del 29 oct. Pasa a 004 como requisito: cambiar el tipo de un cambio antes de aprobarlo. | El tipo decide en qué grupo lo ve la persona ("Lo que te funciona"). El coach puede desmarcar el cambio, pero no puede cambiar el tipo. | `proposal-review.tsx`, `persona/page.tsx` |
| H-6 | El eval reportó 5 dimensiones extra. | Es advertencia, no falla. Falta revisar si tienen evidencia válida o si el caso tiene que esperarlas. | `eval/compare.ts` |
| H-7 | La etapa del acompañamiento no cambia. Pasa a 003, dueña de la tabla de transiciones y de sus tareas. Propuesta (Claude), decide Acker: 002 pasa de `alta` a `evaluacion_inicial` al registrar el consentimiento; aprobar el primer perfil (snapshot versión 1) pasa a `perfil`. Cada cambio va por una función `security definer` del esquema `private` o por un trigger, sin política genérica de UPDATE sobre `engagements`. | El seed la pone en `evaluacion_inicial` y `engagements` no tiene política ni permiso de UPDATE. La página sigue diciendo "Etapa: Evaluación inicial" después de aprobar el perfil. | `lib/db/schema.ts`, `drizzle/0002_permisos.sql`, `scripts/seed.sql` |
| H-8 | Las 19 pruebas de RLS no están en el repo. Pasa a 002. Propuesta (Claude), decide Acker: 002 define `scripts/rls-check.ts` y las comprobaciones de CA-001.8 se suman a ese script; 003 a 006 agregan las suyas. 007 no toca la base. | Se corrieron por SQL el 29 oct según la sesión; el repo no tiene un archivo que las guarde. | repo: no hay script ni archivo SQL de pruebas RLS |
| H-9 | El coach no puede editar el texto de un cambio antes de aprobarlo. Pasa a 004 como requisito. | Solo puede incluirlo o no. | `proposal-review.tsx` |
| H-10 | El aviso "Tu coach lo va a revisar contigo." no se guarda. Pasa a 005. | Al recargar `/persona`, el botón vuelve a aparecer y no hay registro visible de lo que ya mandó. | `not-me-button.tsx` |
| H-11 | `audit_log` no registra todas las llamadas, y el resumen de error no siempre está libre de contenido. Pasa a 004 como requisito. | Si falla el guardado del evento (500), la llamada exitosa queda sin fila porque la auditoría va en la misma transacción. Si `PayloadPropuestaIA.parse` lanza error, no hay fila ni respuesta controlada. Si la fila de error no se puede escribir, solo queda en el log del servidor. Para errores que no son del AI SDK, de Drizzle ni de Postgres, `resumirError` guarda hasta 200 caracteres del mensaje, que podrían traer texto de la nota (C-17). | `sessions/route.ts`, `lib/log.ts` |
| H-12 | La persona tiene permiso de leer todas las columnas de su fila en `engagements`. Pasa a 002 (decisión abierta e de 002; decisión abierta 6 de esta spec). | `grant select on all tables` y la política `engagements_select_participants` le dejan leer `cedula_profesional` y la verificación. La app no las lee ni las muestra: de `engagements`, las páginas de la persona solo seleccionan `id`. El acceso solo existe desde el servidor. | `lib/db/schema.ts`, `drizzle/0002_permisos.sql` |
| H-13 | No hay aviso de privacidad que diga qué datos de esta etapa llegan al modelo. Pasa a 002. | El consentimiento lo pone el seed y no hay pantalla de aviso. 002 exige que el aviso liste qué llega al modelo en cada etapa; de esta etapa llegan la nota, el nombre de pila, el tipo de acompañamiento y el perfil previo reducido (R-001.4). | repo: no hay aviso en `app/`, `lib/` ni `components/` |
| H-14 | El comentario de `lib/auth.ts` dice que el rol sale de `public.users`, pero la tabla es `app.users`. En esta fase no se toca código; se corrige cuando se vuelva a programar. | Solo es el comentario; el código importa `users` de `lib/db/schema.ts`, que vive en el esquema `app`. | `lib/auth.ts` (línea 4) |
| H-15 | El prompt (R-001.4) y la sección "Señales activas" del coach (R-001.23) leen `senalesActivas` directo del snapshot. Pasa a 004, que define las señales activas como las del snapshot menos las cerradas en `signal_states`, en todo lector. | Hoy no se puede cerrar una señal, así que el resultado coincide. Cuando exista el cierre de señales (R-004.13), una señal cerrada seguiría llegando al modelo y apareciendo como activa si estos dos lectores no cambian. | `mensajeUsuarioProfileUpdate` en `lib/prompts.ts`, `profile-view.tsx` |

## Preguntas para el partner

- ¿Qué partes del perfil debería ver la persona? Hoy ve todas las dimensiones aprobadas, incluidas "Disparadores de estrés y qué le ayuda" e "Indicadores observables de estrés" (pendiente ya listado en CONTEXTO §11).
- ¿Cuál es el título de la sección 3 del perfil y qué lleva la parte de ajustes razonables? Hoy usamos "Motivación y aprendizaje" como título provisional (CONTEXTO §5 y §11).
- Cuando revisan el perfil con la persona, ¿se lo leen en tercera persona o se lo cuentan en segunda?
- En la primera evaluación de Workplace Support, ¿el coach escribe una sola nota o varias antes de armar el perfil?
- Cuando una persona dice que algo no la representa, ¿cómo lo resuelven hoy: cambian el texto en ese momento, lo dejan para la siguiente sesión o anotan el desacuerdo?

## Cambios

Versión 4 · 2026-10-30 · numeración de decisiones

- Solo cambia la numeración: la decisión de la plataforma para los dos servicios se citaba aquí como D-029, y en CONTEXTO v5 esa decisión es D-058, porque D-029 ya era el reparto de negocio de Rodrigo. El cambio incluye las notas de versiones anteriores de esta sección.
- Las notas que decían que estas decisiones y el handoff faltaban por registrar ahora remiten a CONTEXTO v5. Las notas de versiones anteriores de esta sección conservan lo que decían entonces.

Versión 3 · 2026-10-29 · ajustes de consistencia

- Señales activas: R-001.4 y R-001.23 dicen que hoy leen el snapshot directo y que 004 define las activas como el snapshot menos las cerradas en `signal_states`. Hueco nuevo H-15, que pasa a 004. "Depende de" lo anota.
- Decisión abierta 6: nombra `private.app_mi_acompanamiento()` (R-002.40) en lugar de "una vista o una función".
- Decisión abierta 2 y H-4: remiten a la decisión 1 de 005 y alinean la propuesta con la suya.
- Fuera de alcance: cuándo llega a la persona un cambio aprobado (decisión 2 de 005, que cambiaría R-001.20 y CA-001.10) y la persona gramatical del perfil (005).
- CA-001.11 y la nota de Verificación usan el segundo acompañamiento del seed de 002 (R-002.34) en lugar del caso de demo de 007.
- Pantallas: el texto "Regístralo antes de escribir notas de sesión." queda marcado como contrario a R-002.24; el texto nuevo lo da 002.

Versión 2 · 2026-10-29 · consolidación entre specs

- El consentimiento se lee como "consentimiento vigente (002)" con un solo chequeo, `private.app_has_consent`; `consentimiento_en` queda descrito solo como lo que hay hoy (R-001.2, CA-001.11, Datos).
- R-001.27 y CA-001.19 retirados: los sustituye R-002.4, un acompañamiento por persona.
- H-7 pasa a 003, con las transiciones de etapa por funciones `security definer` o triggers. H-8 pasa a 002 (`scripts/rls-check.ts`). H-2 pasa a 005. H-5, H-9 y H-11 quedan como requisitos de 004.
- H-12 y la decisión abierta 6 llevan la propuesta de 002 y la regla fija en código de las páginas de la persona.
- Huecos nuevos: H-13 (aviso de privacidad, 002) y H-14 (comentario de `lib/auth.ts`).
- Fuera de alcance: voz a "What's next"; objetivos del equipo y ajustes razonables en el plan de 003; ciclo de vida de "Esto no me representa" en 005; formato de casos en 007.
- Datos: bloqueo por retiro de consentimiento (002), lista única de lo que escribe la persona (002) y enums que se conservan.
- Prompts: se explica por qué se conserva el nombre `2026-10-29_profile-update` y se nombra la acción de `audit_log`.
- Estado de D-058 (decidida por los tres según Acker) y F-030 propuesta; la decisión abierta 4 nombra a David Betancourth (Beta) para los casos sintéticos.
