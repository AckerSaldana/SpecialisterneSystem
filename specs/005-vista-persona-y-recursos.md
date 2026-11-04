<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado -->

# 005 · Vista de la persona y recursos

- Estado: Implementada solo en la parte "Entra a la fase del 31 oct"; el resto sigue en Borrador · Versión 10 · 2026-11-01. Lo no probado está en "Cambios". Acker autorizó construir esa parte en el plan del 31 oct; su revisión de esta spec sigue pendiente.
- Fuentes: CONTEXTO §4 (F-005), §5, §6 (paso 5, Valor, Arquitectura), §7, §11; D-015, D-017 y D-021 (propuestas en CONTEXTO §9); D-031 a D-035 (propuestas en CONTEXTO §9); D-073 (por registrar en CONTEXTO §9); REGLAS §2.5, §3, §6 y §7; C-01, C-02, C-03, C-04, C-05, C-06, C-07, C-08, C-09, C-10, C-11, C-14, C-16, C-17, C-18
- Depende de: 001 (perfil aprobado y `persona_profiles`), 002 (consentimiento vigente, bloqueo al retirarlo, lista de lo que escribe la persona, aviso de privacidad, `private.app_mi_acompanamiento()` y `scripts/rls-check.ts`), 003 (plan vigente, `persona_plans` con `itemsAnteriores`, `origen_item_id`, `TERMINOS_CONDICION` y la regla de bloqueo de R-003.30), 006 (qué se bloquea en la etapa `cierre`). Sus migraciones van después de las de 003 y 004. La base de esta fase empieza en `drizzle/0014`; después siguen las de 008, 009 y 010.

## Problema y para quién

Para la persona participante. CONTEXTO §6 (Valor) dice que la persona "entiende su perfil y sabe qué apoyos puede pedir", recibe recursos verificados según sus áreas de apoyo y corrige lo que no la representa. Lo último ya lo hace el partner hoy: el perfil lo revisan con la persona y lo firman los dos (CONTEXTO §4, F-005).

El paso 5 del flujo del demo (CONTEXTO §6) fija lo que ve la persona: su perfil en lenguaje claro con los apoyos que puede pedir, recursos del catálogo verificado, un módulo corto generado desde su plan y un botón de "esto no me representa". El mismo paso pide diseño de texto primero, sin temporizadores ni notificaciones sorpresa, y deja al partner definir qué partes ve.

Para el coach, esta spec define cómo revisa y aprueba lo que llega a la persona. La IA propone recursos y módulos; el coach decide (C-04).

Estado actual (sprint 1, verificado en el código el 29 oct): `/persona` muestra el perfil agrupado por tipo de hallazgo, la lista de recursos con estado `aprobada` y el botón "Esto no me representa" por dimensión y para el perfil en general. Ninguna ruta propone recursos, el módulo corto no existe y el coach no tiene forma de cerrar un "no me representa".

## Alcance

Entra:

- Lo que la persona ve de su perfil y lo que nunca ve.
- La sección "Tu plan" de `/persona`, leída de `persona_plans` (003). Esta spec es su única dueña: textos, agrupación por tipo y botones de "Esto no me representa".
- Recomendaciones del catálogo: filtro por metadatos con código, orden propuesto por la IA y aprobación del coach.
- Módulo corto generado solo a partir del plan vigente y de fichas verificadas, aprobado por el coach antes de que la persona lo vea.
- El ciclo del "no me representa" sobre el perfil, sobre el plan vigente y sobre el resumen de cierre de 006, desde que la persona lo envía hasta que el coach lo revisa con ella y lo cierra. Esta spec es dueña de su ciclo de vida y de su modelo de datos; 004 y 006 la referencian.
- Uso de las preferencias de presentación que ya existen (`lib/preferences.ts`, `/preferencias`).

**Fuera de alcance:**

- Ranking semántico (por ejemplo con pgvector). En el MVP la IA ordena una lista corta ya filtrada por código; un ranking semántico solo tiene sentido con un catálogo grande (interpretación del equipo). Va a "What's next".
- Notificaciones por correo, push o SMS a la persona. No se construyen (C-14).
- Que la persona edite su perfil o su plan directamente. Sus correcciones pasan por el coach.
- Salidas hacia la empresa empleadora (C-11). Van en 006 o en "What's next"; 003 no define ninguna.
- Señales de riesgo y alertas: 004. La persona nunca las ve (C-09).
- El resumen de cierre y lo que la persona ve de él: 006. Esta spec solo da el modelo de datos del "no me representa" que 006 usa y la forma de cerrarlo (R-005.43).
- Medir con personas reales si pueden nombrar sus apoyos. Se describe como métrica posible en Verificación; no se construye porque el prototipo usa solo datos sintéticos (C-07).

### Entra a la fase del 31 oct

D-073 deja fuera de esta fase los recursos, el módulo corto y el cierre. La fase construye solo la base que necesitan 008, 009 y 010: que la persona vea su plan y que su "no me representa" tenga un ciclo completo. Lo que queda fuera no se retira: sigue escrito aquí para cuando se retome.

| Parte | Entra | Queda fuera |
|---|---|---|
| Perfil | R-005.1 a R-005.6 | |
| Recomendaciones del catálogo | | R-005.7 a R-005.14, R-005.38 |
| Módulo corto | | R-005.15 a R-005.21, R-005.39 |
| "Esto no me representa" | R-005.22 a R-005.28, R-005.32 a R-005.35 | De R-005.43 entra solo el valor `cierre` en el esquema (R-005.47). La opción "Revisado con {nombre}" y sus textos se construyen con 006 |
| Presentación y accesibilidad | R-005.29 a R-005.31 | |
| Relación con otras specs | R-005.40 a R-005.42 | R-005.36 y R-005.37 (hablan de tablas y datos de recursos y módulo), R-005.44 (etapa `cierre`) |
| Agregados de esta fase | R-005.45 a R-005.49 | |
| Criterios | CA-005.1, CA-005.2 (solo `plans`, `plan_items` y las columnas de `persona_plans`), CA-005.3, CA-005.11 a CA-005.14 (CA-005.14 se prueba en `/persona`, porque el módulo no existe), CA-005.18, CA-005.20, CA-005.21, CA-005.26, CA-005.28, CA-005.30 a CA-005.38 | CA-005.4 a CA-005.10, CA-005.15 a CA-005.17, CA-005.19, CA-005.22 a CA-005.25, CA-005.27, CA-005.29 |

Primer recorte si la fecha no alcanza (plan del 31 oct): el cierre del comentario por el coach, R-005.26 a R-005.28 y R-005.34 (tareas 10 y 11). Sin eso, el comentario se queda pendiente y el coach lo lee en el historial. Solo Acker decide el recorte.

Esta parte no llama al modelo, no agrega tablas y no sube `AVISO_VERSION`. El comentario de "Esto no me representa" ya se guardaba y el aviso no lo declaraba: el aviso vigente lo suma en el mismo archivo, por la misma razón de su encabezado, con la última frase de R-005.37 (que no llega al modelo).

## Requisitos

### Perfil

| ID | Requisito | Fuente |
|---|---|---|
| R-005.1 | Cuando la persona abre `/persona`, el sistema debe leer su perfil solo de `app.persona_profiles`, del acompañamiento de la persona, leído con `private.app_mi_acompanamiento()` (R-002.40), y en la versión más alta. Una persona tiene un solo acompañamiento (002). Retirado: leer "la versión publicada más alta" (opción b de la decisión abierta 2), porque un cambio llega a la persona al aprobarlo, como hoy. Ninguna consulta de las pantallas de la persona lee `profile_snapshots`, `sessions` ni `profile_events` de tipo `propuesta_ia`. | C-09, D-033 (propuesta); R-002.40 de 002 |
| R-005.2 | La vista de la persona nunca debe mostrar citas de las notas, señales de riesgo, nombres de dominios de función ejecutiva, razones internas del coach, versiones de prompt ni los campos de verificación del diagnóstico (`diagnostico_verificado`, `cedula_profesional`, `diagnostico_verificado_por`, `diagnostico_verificado_en`). Cómo se cumple en la base para `engagements` lo resuelve 002 (ver Datos, punto 8). | C-09, C-02, C-03; 002 |
| R-005.3 | El perfil se agrupa en "Lo que te funciona" (`fortaleza`), "Dónde te puede servir apoyo" (`area_de_apoyo`) y "Tu forma de trabajar" (`contexto`), como ya hace `app/persona/page.tsx`. | C-08, as-built |
| R-005.4 | El sistema debe mostrar a la persona solo las dimensiones que estén en una constante única de visibilidad en el código, `DIMENSIONES_PERSONA` de `lib/persona/dimensiones.ts`. Mientras el partner no responda, la constante incluye las 15 dimensiones de `DIMENSIONES`, como hoy (decisión abierta 3). Una dimensión fuera de la constante no aparece, no tiene botón y `/api/persona/feedback` responde 400 si la recibe. | CONTEXTO §6 ("el partner define qué partes ve") y §11 (pregunta pendiente); la lista inicial es suposición |
| R-005.5 | El texto de pantalla vacía del perfil cambia a "Tu perfil todavía no está listo. Tu coach lo prepara contigo.", porque cada aprobación del coach crea la versión de la persona en ese momento (opción a de la decisión abierta 2). Retirado: conservar el texto actual, que menciona la publicación (opción b), porque no existe una acción de publicar. | CONTEXTO §4 (F-005); hallazgo del código (`lib/followup/decision.ts`, que escribe `persona_profiles` en la misma transacción de la aprobación) |
| R-005.6 | Hoy no está construido: `app/persona/page.tsx` no lee `persona_plans`, aunque el diálogo de aprobación del coach lo promete (`aprobarTexto`, `components/coach/plan/textos.ts:61`). La vista debe mostrar la sección "Tu plan", en el componente nuevo `components/persona/tu-plan.tsx`, con los ítems de la versión vigente de `app.persona_plans` (R-003.37, R-003.39 de 003), agrupados por tipo: los `objetivo` bajo "Tus objetivos" y los `apoyo_fe` bajo "Apoyos que puedes pedir". Un subtítulo sin ítems no aparece. Sin plan vigente, la sección muestra un solo texto de vacío, el que venía en 003. Las pantallas de la persona no leen `plans` ni `plan_items`. Un ítem sin texto para la persona no llega a `persona_plans` (R-003.48) y no aparece. Qué tipos de ítem copia 003 a `persona_plans`, incluidos los valores nuevos que 003 propone para `app.plan_item_type`, lo decide 003. Esta spec es la única dueña de la sección y de sus textos; 003 ya no define textos de la persona (cierra su decisión abierta 7). | CONTEXTO §6 (paso 5, Valor); 003; una sola dueña: propuesta (Claude), decide Acker |

### Recomendaciones del catálogo

| ID | Requisito | Fuente |
|---|---|---|
| R-005.7 | El sistema propone recursos solo cuando el coach presiona "Proponer recursos", el acompañamiento tiene plan vigente (R-003.33 de 003) y consentimiento vigente (002): `private.app_has_consent(engagement_id)` devuelve verdadero. Sin consentimiento vigente, no se llama al modelo y la ruta responde 409. Sin plan vigente, la ruta responde 409 con otro mensaje. | C-04, C-10, D-035 (propuesta); R-002.28 de 002 |
| R-005.8 | Antes de llamar al modelo, el código filtra `catalog_units`: solo unidades con `verificada = true` (columna nueva, ver Datos), `idioma = 'es'` y un `dominio_fe` igual al `dominio_fe` de algún `plan_item` de tipo `apoyo_fe` de la versión vigente del plan. Si el filtro deja cero unidades, no se llama al modelo y el coach ve el aviso. Usar también `competencia` para el filtro queda en la decisión abierta 11. | D-015 (propuesta: catálogo verificado); el filtro por metadatos es interpretación del equipo; el español como único idioma del MVP es suposición |
| R-005.9 | El modelo recibe solo las unidades candidatas (ID y metadatos), los apoyos de la versión vigente del plan (ID, tipo, descripción y dominio) y el `PerfilPersona` del acompañamiento. No recibe notas, citas, señales, comentarios de "no me representa" ni campos de verificación del diagnóstico. | C-03, C-09, D-021 (propuesta) |
| R-005.10 | El modelo devuelve, por recomendación, un ID de la lista candidata, el ID del apoyo del plan al que responde, una razón para el coach y un texto para la persona. La llamada usa `generateText` con `Output.object` y un esquema Zod estricto. | C-06, D-031 (propuesta) |
| R-005.11 | El código descarta cualquier recomendación cuyo ID de unidad no esté en la lista candidata, cuyo ID de apoyo no pertenezca a la versión vigente del plan o que repita una unidad, y muestra al coach cuántas descartó. El modelo nunca devuelve URLs; el link sale de `catalog_units.url`. | C-06; validación fuera del LLM por analogía con D-034 (propuesta), interpretación del equipo |
| R-005.12 | Cada recomendación se guarda con estado `propuesta`. La persona solo ve las que el coach marca como `aprobada`. El coach aprueba o descarta (`descartada`) cada una por separado. | C-04, as-built (enum `recommendation_status`) |
| R-005.13 | Para cada recurso aprobado, la persona ve título, formato, duración, esfuerzo de concentración y "Por qué te lo recomendamos". No ve la razón para el coach ni ningún puntaje del modelo. | C-09; interpretación del equipo |
| R-005.14 | El texto de un link a un recurso externo dice que se abre en otro sitio. Si la unidad no tiene URL, la tarjeta dice que el coach la comparte en la sesión. | C-14 (lenguaje literal, sin sorpresas) |
| R-005.38 | Cada recomendación guarda el `plan_item_id` del ítem de la versión con la que se generó. Cuando 003 aprueba una versión nueva del plan, una recomendación aprobada sigue visible para la persona si su ítem tiene equivalente en la versión vigente: su `plan_item_id` es el `planItemId` de un ítem de la versión vigente de `PlanPersona` o está en el `itemsAnteriores` de ese ítem (003). La persona no lee `plan_items`, así que la pantalla de la persona no recorre `origen_item_id`. Si no hay equivalente, deja de verse y la fila se conserva en el historial del coach. Nada se regenera solo. | Propuesta (Claude), decide Acker; `itemsAnteriores` lo define 003 a partir de `origen_item_id`; alternativas en la decisión abierta 15 |

### Módulo corto

| ID | Requisito | Fuente |
|---|---|---|
| R-005.15 | El sistema genera un módulo corto solo cuando el coach presiona "Generar módulo corto", con plan vigente y consentimiento vigente (002). Sin consentimiento vigente, no se llama al modelo y la ruta responde 409. | CONTEXTO §6 (paso 5), C-04, C-10 |
| R-005.16 | El modelo recibe solo los apoyos de la versión vigente del plan y el contenido de las fichas de `knowledge_cards` con `verificada = true`, de tipo `estrategia_fe` o `ajuste_razonable` (nunca `senal`), ligadas a esos apoyos por `knowledge_card_id` o por `dominio_fe`. Una ficha sin verificar no llega al prompt, igual que en 003. No recibe notas, citas, señales ni campos de verificación del diagnóstico. Si no hay fichas que cumplan, no se llama al modelo. Quién escribe y verifica las fichas es una decisión abierta de 003. | D-015 (propuesta: RAG curado), C-03, C-09; 003 |
| R-005.17 | Cada paso del módulo cita un ID de apoyo del plan y un ID de ficha. El código descarta el paso si alguno de los dos no existe, si la ficha no está verificada o si la ficha no estaba en lo que recibió el modelo. Si no queda ningún paso, el módulo no se guarda. | C-05, C-06; validación fuera del LLM por analogía con D-034 (propuesta) |
| R-005.18 | Todo texto que produce el modelo en esta spec se revisa con `buscarTerminos` de `lib/profile/validate.ts` (bandera `termino_no_permitido`), con `TERMINOS_CONDICION` de 003 (bandera `mencion_condicion`) y con las etiquetas de `DOMINIOS_FE` y `SENALES` de `lib/profile/schema.ts` y la frase "función ejecutiva" (bandera `termino_interno`, como R-003.17). En los textos que ve la persona (texto de la recomendación y contenido del módulo), cualquiera de esas banderas bloquea la aprobación, igual que R-003.30: la ruta responde 400 con la ruta del texto y la confirmación del coach no la desbloquea. La casilla de confirmación queda solo para banderas en textos que la persona no ve (la razón para el coach): ahí la ruta responde 400 si la petición no trae la confirmación explícita de que el coach las revisó. Que las etiquetas de `SENALES` también bloqueen es interpretación del equipo a partir de C-09. | C-01, C-08, C-09; R-003.17 y R-003.30 de 003; bloquear en textos de la persona: propuesta (Claude), decide Acker |
| R-005.19 | El módulo se guarda en estado `borrador`. La persona lo ve solo después de que el coach lo aprueba con confirmación. Al aprobar un módulo nuevo, el anterior pasa a `retirado` y deja de verse; la fila se conserva en el historial del coach. | C-04; interpretación del equipo a partir de REGLAS §3 ("nada se descarta sin registro") |
| R-005.20 | El módulo que ve la persona tiene título, "Para qué sirve", pasos numerados y "Si te atoras". Está escrito en segunda persona, en texto plano, sin temporizadores, contadores, puntajes ni medios que se reproduzcan solos. | CONTEXTO §6 (paso 5), C-14 |
| R-005.21 | Cada llamada al modelo de esta spec deja una fila en `app.audit_log` con `modelo`, `prompt_version`, tokens y `latencia_ms`, sin texto del perfil, de las notas ni del comentario de la persona. La acción es `propose_recommendations` para recursos y `propose_module` para el módulo, con el mismo patrón que `propose_profile_update` (001) y `propose_plan` (003). Cada recomendación y cada módulo guardan la versión del prompt y el modelo que los produjo. | C-17, C-18 |
| R-005.39 | Cuando 003 aprueba una versión nueva del plan, un paso del módulo aprobado sigue visible si su apoyo tiene equivalente en la versión vigente, con la misma regla de R-005.38: el ID de apoyo del paso es el `planItemId` de un ítem vigente de `PlanPersona` o está en su `itemsAnteriores` (003). Los pasos sin equivalente dejan de verse; si no queda ninguno, el módulo deja de verse. El coach ve un aviso con el número de pasos ocultos y el botón "Generar módulo corto". El módulo no se regenera solo. | Propuesta (Claude), decide Acker; `itemsAnteriores` lo define 003; C-04; alternativas en la decisión abierta 15 |

### "Esto no me representa"

| ID | Requisito | Fuente |
|---|---|---|
| R-005.22 | La persona puede enviar "Esto no me representa" sobre cada dimensión visible y sobre el perfil en general, con comentario opcional de hasta 2000 caracteres. El envío crea un `profile_event` de tipo `no_me_representa` en estado `proposed` y no cambia el perfil. | As-built (`app/api/persona/feedback/route.ts`, `FeedbackRequest`), CONTEXTO §6 |
| R-005.23 | El comentario de la persona no se envía al modelo. Lo lee el coach. | Interpretación del equipo (C-04, C-10) |
| R-005.24 | Después de enviar, y también al volver a cargar la página, la persona ve en esa parte del perfil o del plan que su mensaje está pendiente y la fecha en que lo envió. Hoy ese estado vive en el estado local de `NotMeButton` y se pierde al recargar. | C-14 (sin sorpresas); hallazgo del código (`components/persona/not-me-button.tsx`) |
| R-005.25 | El coach ve los "no me representa" en el historial del acompañamiento, como ya hace `components/coach/event-timeline.tsx`, y además un aviso con el número de comentarios en estado `proposed` en la página del acompañamiento. Cada comentario dice si es sobre el perfil, el plan o el resumen de cierre (R-005.33). | As-built; el aviso es interpretación del equipo |
| R-005.26 | El coach cierra un "no me representa" del perfil con una de dos opciones y con confirmación: "Hubo cambios al perfil" (estado `approved`) o "Sin cambios al perfil" (estado `rejected`). Se guardan `decided_by` y `decided_at`. La ruta de decisión actual responde 409 a estos eventos (`lib/followup/decision.ts:80`), así que el cierre usa una ruta propia, `POST /api/profile-events/[id]/cierre`. Cerrar un comentario no crea un snapshot ni una versión de `persona_profiles`. | C-04; hallazgo del código (`lib/followup/decision.ts:80`) |
| R-005.27 | Un cambio al perfil entra por el camino normal de 001: el coach registra la sesión, la IA propone y el coach aprueba. La opción "Hubo cambios al perfil" solo se puede elegir si existe un evento con columna `tipo = 'propuesta_ia'`, de 001 o de seguimiento, con `status = 'approved'`, `decided_at` posterior al comentario y `approved_payload.cambios` no vacío, porque 004 permite aprobar sin cambiar el perfil (R-004.56); el coach elige cuál y queda guardada en `resuelto_por_evento`. Sin esa propuesta, la opción aparece deshabilitada con su explicación. | C-04, C-05; interpretación del equipo |
| R-005.28 | Cuando el coach cierra el comentario, la persona ve el resultado y la fecha en esa parte del perfil o del plan, y el botón vuelve a estar disponible. | CONTEXTO §4 (F-005, revisión conjunta); interpretación del equipo |
| R-005.32 | La persona puede enviar "Esto no me representa" sobre cada ítem de la versión vigente de su plan en `persona_plans` y sobre el plan en general, con comentario opcional de hasta 2000 caracteres. El envío crea un `profile_event` de tipo `no_me_representa` en estado `proposed` y no cambia el plan. | CONTEXTO §6 (paso 5); extenderlo al plan: propuesta (Claude), decide Acker |
| R-005.33 | `PayloadNoMeRepresenta` (`lib/profile/schema.ts`) agrega `origen` (`perfil`, `plan` o `cierre`) y, solo con `origen = 'plan'`, `planItemId` (nulo para el plan en general) y `planVersion`. Un evento guardado sin `origen` se lee como `perfil`. El valor `cierre` es el que usa 006 para el resumen de cierre (R-006.8); con este requisito y R-005.43, la decisión abierta 6 de 006 queda resuelta. La ruta `/api/persona/feedback` rechaza con 400 un `planItemId` que no esté en la versión vigente de `persona_plans` de ese acompañamiento, un `origen = 'plan'` sin plan vigente y un `origen = 'plan'` con `dimension` no nula. `planVersion` lo pone la ruta con la versión vigente; no viene del navegador. | Propuesta de Acker del 31 oct (decisión abierta 13, opción a); los rechazos y `planVersion`: interpretación del equipo |
| R-005.34 | El coach cierra un "no me representa" del plan con confirmación: "Hubo cambios al plan" (estado `approved`) o "Sin cambios al plan" (estado `rejected`), con `decided_by` y `decided_at`. Un cambio al plan entra por el camino de 003 (propuesta nueva y aprobación de otra versión). "Hubo cambios al plan" solo se puede elegir si existe una versión del plan aprobada después del comentario; el coach elige cuál y queda guardada en `resuelto_por_plan`. Sin esa versión, la opción aparece deshabilitada con su explicación. Cerrar el comentario no crea una versión del plan. | C-04; 003; interpretación del equipo |
| R-005.35 | El estado de un comentario sobre un ítem del plan se muestra en el ítem equivalente de la versión vigente: el ítem cuyo `planItemId` es el `planItemId` del comentario o lo tiene en su `itemsAnteriores` (003). Si el ítem ya no tiene equivalente, el estado se muestra en "Tu plan en general". | Interpretación del equipo; `itemsAnteriores` lo define 003 |
| R-005.43 | El coach cierra un "no me representa" con `origen = 'cierre'` con una sola opción, "Revisado con {nombre}", y con confirmación. El evento queda en estado `rejected` con `decided_by` y `decided_at`. El resumen aprobado no cambia (R-006.7), así que no hay opción "Hubo cambios" y la ruta responde 400 si la recibe. Cerrar el comentario no crea un resumen nuevo ni cambia `closing_summaries` ni `persona_closing_summaries`. En su página de cierre, la persona ve el estado pendiente de R-005.24 y, ya cerrado, el resultado con la fecha. | Propuesta (Claude), decide Acker; R-006.7 y R-006.8 de 006 |

### Presentación y accesibilidad

| ID | Requisito | Fuente |
|---|---|---|
| R-005.29 | Todas las pantallas de la persona, incluido el módulo, usan las preferencias de `lib/preferences.ts` (modo, fuente, tamaño, interletrado, interlineado y ancho). Las preferencias viven en una cookie de ese navegador, no en la cuenta, así que no se usan para recomendar. | C-14, as-built |
| R-005.30 | La vista de la persona no tiene temporizadores, cuentas regresivas, rachas ni avisos que aparezcan solos. Lo nuevo se ve cuando la persona entra. | CONTEXTO §6 (paso 5), C-14 |
| R-005.31 | Toda acción de la persona que no se puede deshacer pide confirmación, y cada pantalla de la persona lleva el pie de ayuda humana (`SiteFooter`). | C-14, as-built (`app/persona/layout.tsx`) |

### Relación con 002, 003 y 006

| ID | Requisito | Fuente |
|---|---|---|
| R-005.36 | Las tablas de esta spec que guardan datos derivados de notas entran en el bloqueo de 002 al retirar el consentimiento: `recommendations`, `persona_recommendations`, `modules`, `persona_modules` y `recommendation_runs` si se adopta (decisión abierta 10). Siguen la regla general de 002 (R-002.30): nada se borra y, con la opción propuesta en 002, ni la persona ni el coach las ven hasta que haya consentimiento vigente otra vez. Los comentarios `no_me_representa` viven en `profile_events` y ya los cubre 002. | R-002.44 de 002; C-10 |
| R-005.37 | Antes de activar "Proponer recursos" y "Generar módulo corto", el aviso de privacidad sube de versión (002) y dice qué datos llegan al modelo en esta etapa: el perfil para la persona, los apoyos del plan vigente, metadatos del catálogo y contenido de fichas. También dice que el comentario de "no me representa" no llega al modelo. | R-002.42 y R-002.43 de 002; C-10, C-17 |
| R-005.40 | Lo que escribe la persona está en la lista única de 002. Esta spec no le agrega escrituras: el "no me representa" sobre el plan usa el mismo insert de `profile_events` de tipo `no_me_representa` que ya existe. Lo único que cambia de ese insert es que ahora exige consentimiento vigente (R-005.46); así queda también en la fila de R-002.45. | 002; C-16 |
| R-005.41 | Las acciones de esta spec no cambian `engagements.stage` ni escriben en `engagements`. Fuera de `engagements_update_coach_alta` de 002 (R-002.41), no existe política de UPDATE sobre `app.engagements`, y esta spec no agrega ninguna; las transiciones de etapa son de 003 y 006. | 002, 003, 006; C-16 |
| R-005.42 | Los casos RLS de esta spec (CA-005.1, CA-005.2, CA-005.7, CA-005.10, CA-005.20, CA-005.24, CA-005.31 y CA-005.38) se agregan a `scripts/rls-check.ts`, que define 002. En la fase del 31 oct entran CA-005.1, CA-005.2 (solo `plans` y `plan_items`), CA-005.20, CA-005.31 y CA-005.38. | 002 (tarea 7); C-16 |
| R-005.44 | Qué rutas y políticas de INSERT de esta spec se bloquean en la etapa `cierre` con `private.app_engagement_abierto` lo define 006 en su requisito sobre esa etapa; esta spec no repite la lista. Lo que 006 deje permitido después del cierre tiene que incluir que la persona envíe un "no me representa" sobre su resumen de cierre (R-006.8) y que el coach cierre comentarios con R-005.26, R-005.34 y R-005.43. | 006; propuesta (Claude), decide Acker |

### Agregados de la fase del 31 oct

| ID | Requisito | Fuente |
|---|---|---|
| R-005.45 | La persona lee el resumen de cada dimensión tal cual, en tercera persona con su nombre: es el mismo texto de `persona_profiles`, sin otra llamada al modelo. Las etiquetas de dimensión van en segunda persona solo en la vista de la persona, en `DIMENSIONES_PERSONA` (R-005.4). Cambian tres: `disparadores_estres` a "Disparadores de estrés y qué te ayuda", `trabajo_en_equipo` a "Trabajo en equipo y rol que asumes" y `retroalimentacion` a "Cómo prefieres recibir retroalimentación". Las otras doce son iguales a las de `DIMENSIONES`. `DIMENSIONES` y `etiquetaDimension` de `lib/profile/schema.ts` no cambian: las siguen usando el coach, el prompt y el eval. | Propuesta de Acker del 31 oct (decisión abierta 1, opción a); los tres textos son interpretación del equipo |
| R-005.46 | Sin consentimiento vigente (002), la persona no puede guardar un "no me representa". Hoy `profile_events_insert_persona_feedback` no lo exige (`lib/db/schema.ts:305`), aunque la lectura de la persona sí (`profile_events_select_persona_own`). La política suma `private.app_has_consent(engagement_id)`, y `/api/persona/feedback` llama a `exigirConsentimiento` de `lib/consent.ts` antes de insertar y responde 409. La puerta de `lib/persona/puerta.ts` no alcanza: protege páginas, no rutas de API. | C-10; propuesta de Acker del 31 oct; extender C-10 a este insert es interpretación del equipo a partir de R-002.19 |
| R-005.47 | En esta fase, `cierre` existe solo como valor de `origen` en `PayloadNoMeRepresenta`, para que 006 no tenga que cambiar el esquema. `FeedbackRequest` acepta solo `perfil` y `plan`, así que `/api/persona/feedback` responde 400 a `cierre`. Si `POST /api/profile-events/[id]/cierre` recibe un evento con `origen = 'cierre'`, responde 400 y no lo cambia. El resto de R-005.43 se construye con 006. | D-073; propuesta de Acker del 31 oct |
| R-005.48 | Mientras recursos quede fuera de esta fase, `/persona` no muestra la sección "Recursos" si no hay recursos aprobados. Hoy muestra "Todavía no hay recursos. Tu coach los agrega cuando tu plan esté listo.", y ese texto dejaría de ser cierto con el plan aprobado, porque ninguna ruta propone recursos. | C-14 (lenguaje literal); interpretación del equipo, decide Acker (decisión abierta 16) |
| R-005.49 | Un `no_me_representa` cerrado con "Hubo cambios" queda con `status = 'approved'`, igual que una propuesta aprobada. Todo lector de eventos aprobados filtra además por la columna `tipo = 'propuesta_ia'`: la lista de R-005.27 y el cálculo de la Trayectoria (R-008.13). Un comentario de la persona no es evidencia ni cuenta como cambio al perfil. | C-05; interpretación del equipo |
| R-005.50 | Al insertar un `no_me_representa`, la persona solo escribe `engagement_id`, `tipo`, `status`, `payload` y `created_by`. `profile_events_insert_persona_feedback` exige además que `session_id`, `approved_payload`, `decided_by`, `decided_at`, `prompt_version`, `model`, `perfil_version_base`, `plan_base_id`, `resuelto_por_evento` y `resuelto_por_plan` queden vacíos, y que `created_at` sea el de la inserción. `enviarComentario` ya escribe solo esas columnas; esto lo garantiza también la base, porque el grant de INSERT de `drizzle/0002` es de toda la tabla. | C-16; interpretación del equipo |

## Criterios de aceptación

| ID | Dado / Cuando / Entonces | Cubre | Cómo se prueba |
|---|---|---|---|
| CA-005.1 | Dada una persona con sesión, cuando consulta `profile_snapshots`, `sessions` o un `profile_event` de tipo `propuesta_ia` con `withRls`, entonces recibe cero filas. | R-005.1, R-005.2 | RLS |
| CA-005.2 | Dada una persona con plan vigente, recursos aprobados y módulo aprobado, cuando consulta `plans`, `plan_items`, `recommendations` o `modules` con `withRls`, entonces recibe cero filas; y las tablas `persona_plans`, `persona_recommendations` y `persona_modules` no tienen columnas de evidencia, dominio, razón para el coach, banderas ni fuentes. | R-005.2, R-005.6, R-005.13 | RLS + revisión del esquema |
| CA-005.3 | Dado un perfil con una dimensión fuera de la constante de visibilidad, cuando la persona abre `/persona`, entonces esa dimensión no aparece ni tiene botón. | R-005.4 | prueba offline + navegador |
| CA-005.4 | Dado un acompañamiento sin consentimiento vigente (sin eventos o con `retirado` como último evento, según 002), cuando el coach pide recursos o un módulo, entonces la ruta responde 409, la función que llama al modelo (simulada) no se invoca y `audit_log` no tiene fila nueva. | R-005.7, R-005.15 | prueba offline |
| CA-005.5 | Dada una respuesta simulada del modelo con un ID de unidad fuera de la lista candidata y otra con un ID de apoyo de otro plan, cuando el código la valida, entonces las dos se descartan, no se guardan y el conteo de descartados es 2. | R-005.11 | prueba offline |
| CA-005.6 | Dado el armado de la entrada al modelo para recursos y para módulo, cuando se inspecciona, entonces no contiene texto de `sessions.nota_original`, citas, señales, comentarios de `no_me_representa` ni campos de verificación del diagnóstico. | R-005.9, R-005.16, R-005.23 | prueba offline |
| CA-005.7 | Dada una recomendación en estado `propuesta`, cuando la persona abre `/persona`, entonces no la ve; cuando el coach la aprueba, entonces la ve con "Por qué te lo recomendamos". | R-005.12, R-005.13 | RLS + navegador |
| CA-005.8 | Dado un módulo simulado con un paso que cita una ficha no verificada, cuando el código lo valida, entonces el paso se descarta; si no queda ningún paso, no se guarda módulo. | R-005.17 | prueba offline |
| CA-005.9 | Dado un módulo o un texto de recomendación para la persona con "memoria de trabajo" o "diagnóstico", cuando el código lo revisa, entonces guarda la bandera; y cuando el coach pide aprobarlo, con o sin la confirmación de banderas, la ruta responde 400 y nada llega a `persona_modules` ni a `persona_recommendations`. | R-005.18 | prueba offline + navegador |
| CA-005.10 | Dado un módulo en `borrador`, cuando la persona abre `/persona`, entonces no lo ve; cuando el coach lo aprueba, entonces lo ve y el módulo anterior queda en `retirado`. | R-005.19 | RLS + navegador |
| CA-005.11 | Dada una persona que envió "Esto no me representa", cuando recarga la página, entonces ve "Enviaste esto el {fecha}. Tu coach lo va a revisar contigo." en esa dimensión. | R-005.24 | navegador |
| CA-005.12 | Dado un comentario pendiente, cuando el coach lo cierra con "Sin cambios al perfil", entonces el evento queda `rejected` con `decided_by` y `decided_at`, `persona_profiles` y `profile_snapshots` no tienen versión nueva y la persona ve el resultado. | R-005.26, R-005.28 | prueba offline + navegador |
| CA-005.13 | Dado un comentario pendiente y ninguna propuesta aprobada con cambios después de él, cuando el coach abre el cierre, entonces "Hubo cambios al perfil" está deshabilitada; y si la ruta recibe esa opción, o un evento aprobado solo con avance o con señales, responde 409. | R-005.27 | prueba offline + navegador |
| CA-005.14 | Dado el modo Calma y la fuente OpenDyslexic guardados en la cookie, cuando la persona abre su módulo, entonces el `<html>` trae `data-mode="calma"` y `data-font="opendyslexic"`, y ningún elemento tiene animación ni transición activa. | R-005.29, R-005.30 | navegador |
| CA-005.15 | Dada cualquier llamada al modelo de esta spec, cuando termina, entonces hay una fila en `audit_log` con `accion` igual a `propose_recommendations` o `propose_module`, con `modelo` y `prompt_version`, y la fila no tiene texto del perfil, de las notas ni del comentario. | R-005.21 | prueba offline |
| CA-005.16 | Dado un plan vigente cuyos dominios no coinciden con ninguna unidad verificada, cuando el coach pide recursos, entonces el modelo (simulado) no se invoca y el coach ve "No hay recursos verificados que coincidan con este plan." | R-005.8 | prueba offline |
| CA-005.17 | Dada una ficha de tipo `senal` ligada al dominio de un apoyo, cuando se arma la entrada del módulo, entonces esa ficha no está en la entrada. | R-005.16 | prueba offline |
| CA-005.18 | Dado un plan aprobado con un apoyo con texto para la persona y otro sin él, cuando la persona abre `/persona`, entonces "Apoyos que puedes pedir" muestra solo el primero. | R-005.6 | navegador |
| CA-005.19 | Dado un recurso aprobado con URL y otro sin URL, cuando la persona abre `/persona`, entonces el primero dice "Abrir el recurso (se abre en otro sitio)" y el segundo "Tu coach te comparte este recurso en tu sesión." | R-005.14 | navegador |
| CA-005.20 | Dada una persona con plan vigente, cuando envía "Esto no me representa" sobre un ítem, entonces existe un `profile_event` `no_me_representa` en `proposed` con `origen = 'plan'`, `planItemId` y `planVersion`, y `plans` y `persona_plans` no cambian. Cuando envía un `planItemId` de otro acompañamiento, la ruta responde 400 y no hay fila nueva. | R-005.32, R-005.33, R-005.40 | RLS + prueba offline + navegador |
| CA-005.21 | Dado un comentario pendiente sobre el plan y ninguna versión aprobada después de él, cuando el coach abre el cierre, entonces "Hubo cambios al plan" está deshabilitada. Dada una versión aprobada después del comentario, cuando el coach la elige y confirma, entonces el evento queda `approved` con `resuelto_por_plan` y la persona ve "Tu plan se actualizó." en el ítem equivalente. | R-005.34, R-005.35 | prueba offline + navegador |
| CA-005.22 | Dada una recomendación aprobada ligada al ítem A de la versión 1 y una versión 2 aprobada donde el ítem B tiene `origen_item_id = A` y, en `persona_plans`, `itemsAnteriores` con A, cuando la persona abre `/persona`, entonces ve la recomendación y ninguna consulta de su pantalla lee `plan_items`. Dada una versión 2 sin equivalente de A, entonces no la ve y el coach la sigue viendo en el historial. | R-005.38 | prueba offline + navegador |
| CA-005.23 | Dado un módulo aprobado con dos pasos y una versión nueva del plan donde solo uno de sus apoyos tiene equivalente, cuando la persona abre su módulo, entonces ve un paso; y el coach ve el aviso "1 paso del módulo dejó de verse porque su apoyo ya no está en el plan." | R-005.39 | prueba offline + navegador |
| CA-005.24 | Dado un acompañamiento con recursos y módulo aprobados, cuando la persona retira su consentimiento, entonces la persona no ve recursos ni módulo, el coach no los ve y ninguna fila de `recommendations`, `persona_recommendations`, `modules` ni `persona_modules` se borró. | R-005.36 | RLS + consulta SQL como owner |
| CA-005.25 | Dado el aviso vigente, cuando se activan las rutas de recursos y módulo, entonces `AVISO_VERSION` es posterior a la versión que no menciona esta etapa y el archivo del aviso lista los datos de R-005.37. | R-005.37 | revisión del repo |
| CA-005.26 | Dada cualquier acción de esta spec, cuando termina, entonces `engagements.stage` no cambió. | R-005.41 | prueba offline |
| CA-005.27 | Dada una recomendación cuyo texto para la persona está limpio y cuya razón para el coach dice "memoria de trabajo", cuando el coach pide aprobarla sin la confirmación, entonces la ruta responde 400; cuando la pide con la confirmación, entonces se aprueba y `persona_recommendations` no trae la razón. | R-005.18 | prueba offline + navegador |
| CA-005.28 | Dado un plan vigente con un `objetivo` y un `apoyo_fe` con texto para la persona, cuando la persona abre `/persona`, entonces ve "Tu plan" con el primero bajo "Tus objetivos" y el segundo bajo "Apoyos que puedes pedir". Dado un acompañamiento sin plan vigente, entonces la sección muestra "Tu coach todavía no aprueba tu plan. Cuando lo apruebe, aparece aquí." y ningún otro texto de vacío. | R-005.6 | navegador |
| CA-005.29 | Dado un comentario pendiente con `origen = 'cierre'`, cuando el coach abre el cierre, entonces la única opción es "Revisado con {nombre}"; cuando confirma, entonces el evento queda `rejected` con `decided_by` y `decided_at`, `closing_summaries` y `persona_closing_summaries` no cambian y la persona ve "Tu coach lo revisó contigo el {fecha}." en su página de cierre. Si la ruta recibe la opción "Hubo cambios", responde 400. | R-005.43 | prueba offline + navegador |
| CA-005.30 | Dado un perfil con `retroalimentacion`, `disparadores_estres` y `trabajo_en_equipo`, cuando la persona abre `/persona`, entonces ve las tres etiquetas de R-005.45 y un resumen igual al de `persona_profiles`, carácter por carácter. Cuando el coach abre el historial, entonces ve la etiqueta de `DIMENSIONES`. `DIMENSIONES_PERSONA` tiene las 15 dimensiones. | R-005.4, R-005.45 | prueba offline + navegador |
| CA-005.31 | Dada la sesión de la persona con `retirado` como último evento, cuando inserta un `no_me_representa` propio en `proposed`, entonces la base lo rechaza. Con `otorgado` como último evento, lo acepta. Cuando la misma persona sin consentimiento llama a la ruta, entonces responde 409 con el texto de "Pantallas y textos" y no hay fila nueva. | R-005.46 | RLS + prueba de ruta |
| CA-005.32 | Dado un evento guardado sin `origen`, cuando se lee con `PayloadNoMeRepresenta`, entonces cuenta como `perfil`. Dado un payload con `origen = 'cierre'`, entonces el esquema lo acepta. Cuando la ruta de la persona recibe `origen = 'cierre'`, entonces responde 400 y no hay fila nueva. Cuando la ruta de cierre recibe un evento con ese origen, entonces responde 400 y el evento no cambia. | R-005.33, R-005.47 | prueba offline + prueba de ruta |
| CA-005.33 | Dado un acompañamiento con plan vigente y sin recursos aprobados, cuando la persona abre `/persona`, entonces no aparece "Recursos" ni "Tu coach los agrega cuando tu plan esté listo." Con un recurso aprobado, la sección aparece como hoy. | R-005.48 | navegador |
| CA-005.34 | Dado un comentario cerrado con "Hubo cambios" y otro comentario pendiente, cuando el coach abre las opciones de cierre del pendiente, entonces la lista de propuestas no trae el comentario cerrado. Si la ruta lo recibe como `resueltoPorEvento`, responde 409. | R-005.27, R-005.49 | prueba de ruta |
| CA-005.35 | Dados dos comentarios sobre la misma parte, uno cerrado y otro pendiente más reciente, cuando se calcula su estado, entonces sale el pendiente. Dado un comentario sobre el ítem A y una versión vigente con el ítem B cuyo `itemsAnteriores` trae A, entonces el estado sale en B. Sin equivalente, sale en "Tu plan en general". | R-005.24, R-005.28, R-005.35 | prueba offline |
| CA-005.36 | Dado un evento con `resuelto_por_evento` y otro con `resuelto_por_plan`, cuando corre `npm run purge-retirados -- --test`, entonces CA-002.42 sigue pasando, sin error de llave foránea. | R-005.26, R-005.34; R-002.49 de 002 | ejecución del script |
| CA-005.37 | Dada una versión 2 del plan, cuando la ruta de la persona recibe un `planItemId` que solo está en la versión 1, entonces responde 400 con "Tu plan cambió. Recarga la página y vuelve a intentarlo." y no hay fila nueva. Lo mismo con `origen = 'plan'` y `dimension` no nula, y sin plan vigente. Si el navegador manda `planVersion`, `FeedbackRequest` es estricto y la ruta responde 400. El evento guardado trae el `planVersion` que puso la ruta. | R-005.33 | prueba de ruta |
| CA-005.38 | Dado un comentario pendiente, cuando la persona o un coach ajeno hacen UPDATE de `status` o `resuelto_por_plan`, entonces la base afecta 0 filas. Cuando lo hace el coach del acompañamiento, la base lo acepta. Cuando la persona inserta un comentario con cualquiera de las columnas de R-005.50, la base lo rechaza. | R-005.26, R-005.34, R-005.50 | RLS |

## Datos

Cambios contra `lib/db/schema.ts` y `drizzle/0002_permisos.sql`. RLS filtra filas, y los grants de `0002_permisos.sql` aplican igual al coach y a la persona porque los dos usan el rol `authenticated`. Por eso lo que la persona no debe leer va en otra tabla, como ya se hizo con `persona_profiles` (D-032 y D-033, propuestas). Las migraciones de esta spec van después de las de 003 (orden: 002, 003, luego 004 y 005, luego 008 a 010, y 006 al final).

1. `plan_items`. Retirado de esta spec: la propuesta de `app.persona_plan_items`. Lo resuelve 003: retira `plans_select_persona_approved` y `plan_items_select_persona_approved`, y crea `app.persona_plans` (una fila por versión aprobada, jsonb sin citas ni evidencia, con el ID de cada ítem y su `itemsAnteriores uuid[]`, la cadena de IDs de versiones anteriores que 003 arma desde `origen_item_id`). La persona solo lee `persona_plans`. No existe `persona_plan_items`. R-005.35, R-005.38 y R-005.39 usan `itemsAnteriores` para saber qué sigue vigente.
2. `recommendations`. Hoy la persona puede leer `razon` de las filas aprobadas. Se quita `recommendations_select_persona_approved` y `recommendations` queda solo para el coach. Columnas nuevas: `prompt_version`, `model` y `approved_at` (hoy solo existe `approved_by`). `plan_item_id` ya existe y guarda el ítem de la versión con la que se generó (R-005.38). La persona lee `app.persona_recommendations` (`recommendation_id`, `engagement_id`, `catalog_unit_id`, `plan_item_id`, texto para la persona), escrita en la misma transacción que la aprobación. Ver decisiones abiertas 4 y 10.
3. `catalog_units`. Agregar `verificada boolean not null default false`. El seed actual (`scripts/seed.sql`) tiene `fuente = 'ejemplo-sintetico'` y `url = null` en las tres unidades, así que el filtro de R-005.8 no deja ninguna hasta tener unidades verificadas (decisión abierta 12).
4. Módulo corto. Enum nuevo `app.module_status` (`borrador`, `aprobado`, `retirado`). Tabla nueva `app.modules`, solo coach: `id`, `engagement_id`, `plan_id`, `version`, `status`, `contenido` jsonb validado con Zod, `fuentes` (IDs de apoyo y ficha por paso), `descartados`, `banderas`, `prompt_version`, `model`, `created_by`, `approved_by`, `approved_at`. Tabla `app.persona_modules`, que lee la persona: `module_id`, `engagement_id`, copia del contenido aprobado con el ID de apoyo de cada paso y sin fichas ni banderas, `created_at`. Se escribe en la misma transacción que la aprobación, y la persona ve la fila más reciente con los pasos que siguen vigentes (R-005.39).
5. `profile_events`. Columnas nuevas opcionales `resuelto_por_evento uuid` (referencia `profile_events.id`) y `resuelto_por_plan uuid` (referencia `plans.id`), las dos con `on delete set null` (ver "Migración de la base"). La política `profile_events_update_coach` ya deja al coach actualizar eventos de su acompañamiento, y la persona ya lee el `status` y `decided_at` de sus propios eventos por `profile_events_select_persona_own`. Al grant de update (`status`, `approved_payload`, `decided_by`, `decided_at`) se agregan `resuelto_por_evento` y `resuelto_por_plan`. El cambio de `PayloadNoMeRepresenta` (R-005.33) es de código, porque el payload es jsonb. Retirado: "`profile_events_insert_persona_feedback` no cambia", porque esa política tiene que exigir consentimiento vigente (R-005.46).
6. `knowledge_cards`. Hoy `knowledge_cards_select_all` deja a cualquier usuario con sesión leer todas las fichas, incluidas las de tipo `senal` (el seed tiene una). Lo resuelve 003 (R-003.41): solo el coach lee `knowledge_cards`. Esta spec no cambia esa política. La persona recibe el contenido del módulo por `persona_modules`.
7. Publicación del perfil. Retirado: `publicado_por`, `publicado_en` y el filtro de lectura de la persona, porque la decisión abierta 2 quedó en la opción (a). `persona_profiles` no cambia y 001 tampoco.
8. `engagements`. `engagements_select_participants` deja a la persona leer su fila completa, incluidas `diagnostico_verificado` y `cedula_profesional`. Lo resuelve 002 (H-12): la persona no lee `cedula_profesional` ni las columnas de verificación. Las páginas de la persona solo seleccionan columnas permitidas, y 002 añade la función `security definer` `private.app_mi_acompanamiento()` (R-002.40), que devuelve `id`, `type` y `stage`; mientras tanto vale la regla fija en código. Esta spec no agrega lecturas de `engagements` desde las pantallas de la persona fuera de `private.app_mi_acompanamiento()`.
9. Grants nuevos: `insert` en `modules`, `persona_modules` y `persona_recommendations`; `update (status, approved_by, approved_at)` en `modules`; `approved_at` se agrega al grant de update de `recommendations`. Las políticas nuevas de `insert` y `update` exigen `app_is_coach_of`, así que la persona no puede escribir en estas tablas aunque tenga el grant.
10. Bloqueo por retiro del consentimiento (R-005.36). Las políticas de lectura de `recommendations`, `persona_recommendations`, `modules`, `persona_modules` y `recommendation_runs` (si se adopta) siguen la regla que 002 defina para el bloqueo; con la propuesta de 002 agregan `private.app_has_consent(engagement_id)` a su condición.

Los puntos 2, 3, 4, 9 y 10 quedan fuera de la fase del 31 oct, junto con recursos y módulo. Entra el punto 5, descrito abajo.

### Migración de la base (fase del 31 oct)

Es la primera de la fase. Empieza en `drizzle/0014` y va antes de las de 008, 009 y 010. Esas specs separan funciones, esquema generado y permisos, como `drizzle/0011` a `drizzle/0013`. Esta base no necesita archivo de funciones, porque no agrega ninguna función de `private`.

1. `drizzle/0014_comentarios_persona.sql`, generada con `npm run db:generate` desde `lib/db/schema.ts`:
   - `resueltoPorEvento: uuid("resuelto_por_evento").references((): AnyPgColumn => profileEvents.id, { onDelete: "set null" })`.
   - `resueltoPorPlan: uuid("resuelto_por_plan").references((): AnyPgColumn => plans.id, { onDelete: "set null" })`. `plans` se declara después, igual que en `planBaseId`.
   - `profile_events_insert_persona_feedback` queda con `withCheck: sql\`${personaOf(t.engagementId)} and ${t.createdBy} = ${authUid} and ${t.tipo} = 'no_me_representa' and ${t.status} = 'proposed' and ${hasConsent(t.engagementId)}\``.
2. `drizzle/0015_permisos_comentarios_persona.sql`, a mano con `drizzle-kit generate --custom`: `grant update (resuelto_por_evento, resuelto_por_plan) on app.profile_events to authenticated;`.

El `set null` evita otro ciclo como el de `plan_base_id` (004): `resuelto_por_plan` cerraría `plans` → `profile_snapshots` → `profile_events` → `plans` y rompería `scripts/purge-retirados.ts` (R-002.49). `resuelto_por_evento` apunta a la misma tabla por la misma razón.

No hay tablas nuevas, así que no hace falta `grant select`, y `TABLAS_BLOQUEO` de `scripts/rls-check.ts` y `TABLAS_PURGA` de `scripts/purge-retirados.ts` no cambian: `profile_events` y `persona_plans` ya están en las dos. `sembrar` de `purge-retirados.ts` llena las dos columnas nuevas (CA-005.36).

3. `drizzle/0016_comentario_persona_sin_decision.sql`, generada con `npm run db:generate`: suma a `profile_events_insert_persona_feedback` las condiciones de R-005.50.

Los grants no distinguen entre coach y persona. La persona no gana UPDATE, porque `profile_events` no tiene ninguna política de UPDATE para ella (CA-005.38). El INSERT lo limita la política (R-005.50), no el grant.

Límite conocido: `recommendations_select_persona_approved` sigue viva y deja leer `recommendations.razon` en la base. Hoy no hay filas, porque ni el seed ni ninguna ruta las crea, y `app/persona/page.tsx` no selecciona esa columna. Se cierra con recursos (punto 2; decisión abierta 17).

### Esquemas y rutas (fase del 31 oct)

`lib/profile/schema.ts`, `PayloadNoMeRepresenta` sigue estricto y suma `origen` opcional (`perfil`, `plan`, `cierre`), `planItemId` opcional (uuid o nulo) y `planVersion` opcional (entero). Los eventos que ya existen se siguen leyendo.

`lib/api/contracts.ts`:

- `FeedbackRequest` suma `origen` opcional (`perfil`, `plan`) y `planItemId` opcional (uuid o nulo). Sin `origen` cuenta como `perfil`. Sigue estricto.
- `CerrarComentarioRequest`, unión por `resultado`: `{ resultado: "sin_cambios" }` o `{ resultado: "con_cambios", resueltoPorEvento?: uuid, resueltoPorPlan?: uuid }`. Con `origen = 'perfil'` exige `resueltoPorEvento`; con `origen = 'plan'`, `resueltoPorPlan`. Si no, 400.
- `CerrarComentarioResponse`: `{ eventId, status }`, con `status` `approved` o `rejected`.

Archivos nuevos:

| Archivo | Qué hace |
|---|---|
| `lib/persona/dimensiones.ts` | `DIMENSIONES_PERSONA`: `{ id, etiqueta }` de las 15 dimensiones (R-005.4, R-005.45), y `dimensionesDeGrupo`, con la lista como parámetro para poder probar CA-005.3 mientras la constante traiga las 15. |
| `lib/persona/comentarios.ts` | Funciones puras, sin red ni base: `origenDe(payload)`, el estado de cada parte del perfil y del plan (R-005.24, R-005.28, R-005.35) y su texto, qué propuesta o versión resuelve un comentario (R-005.27, R-005.34, R-005.49) y los textos del coach por origen. Por parte manda el comentario más reciente. |
| `lib/persona/feedback.ts` | `enviarComentario(user, body, visibles?)`, con la forma de `RespuestaRuta` de `lib/api/ruta.ts`: lee el acompañamiento con `miAcompanamiento`, `exigirConsentimiento` (falso, 409), valida origen y plan contra `persona_plans`, e inserta. `visibles` solo lo pasan las pruebas de R-005.4; la ruta usa la constante. También `leerPlanYComentarios`, la lectura de `/persona`, para que `scripts/persona-check.ts` pruebe lo que ve la persona con la misma consulta. |
| `lib/persona/cierre-comentario.ts` | `cerrarComentario(user, eventId, body)` y la lectura de opciones. Bloquea la fila con `for update`, como `lib/followup/decision.ts`. Valida que el evento o el plan elegidos sean del mismo acompañamiento y cumplan R-005.27 o R-005.34. |
| `components/persona/tu-plan.tsx` | Sección "Tu plan" (R-005.6). |
| `components/coach/seguimiento/cerrar-comentario.tsx` | Opciones y diálogo de cierre (R-005.26, R-005.34). |
| `scripts/persona-check.ts` | Pruebas de ruta, igual que `scripts/followup-check.ts`, con `npm run persona-check`. |

Rutas:

| Ruta | Quién | Qué hace |
|---|---|---|
| `POST /api/persona/feedback` | persona | La misma ruta. Delega en `enviarComentario`. Suma consentimiento, `origen` y `planItemId` (R-005.32, R-005.33, R-005.46, R-005.47). |
| `POST /api/profile-events/[id]/cierre` | coach | Nueva. Autentica con `getUserWithRole("coach")`, valida el id con `esUuid` y delega en `cerrarComentario`. Sin fila visible responde 404, también si no hay consentimiento vigente, porque RLS oculta el evento. Un evento que no es comentario o que ya se cerró responde 409. |

`/persona` lee con `withRls` de la persona solo `persona_profiles`, `persona_plans` (la versión más alta) y sus eventos `no_me_representa` (`id`, `status`, `payload`, `created_at`, `decided_at`). No selecciona `decided_by` ni las columnas `resuelto_*`, y no lee `plans` ni `plan_items`.

## Pantallas y textos

### Persona (`/persona`)

Textos que ya existen y se conservan: "Tu perfil", "Hola, {nombre}.", "Esto es lo que tu coach y tú han visto hasta ahora. Si algo no te representa, usa el botón de esa parte.", "Lo que te funciona", "Dónde te puede servir apoyo", "Tu forma de trabajar", "Esto no me representa", "Algo de mi perfil no me representa", "Tu coach lo va a revisar contigo."

Todo texto que produce el modelo para la persona pasa por la revisión de R-005.18 antes de aprobarse; con una bandera no se aprueba.

Pantalla vacía del perfil (R-005.5):

- "Tu perfil todavía no está listo. Tu coach lo prepara contigo."
- Retirado: "Tu perfil todavía no está listo. Tu coach lo revisa contigo antes de publicarlo." Razón: la decisión abierta 2 quedó en la opción (a), y no hay publicación.

Etiquetas en segunda persona (R-005.45): "Disparadores de estrés y qué te ayuda", "Trabajo en equipo y rol que asumes", "Cómo prefieres recibir retroalimentación". En el diálogo del botón, "Sobre: {sobre}" usa estas etiquetas; en un ítem del plan, el texto del ítem, que ya trae su punto final y no se le agrega otro; en general, "tu perfil en general" o "tu plan en general".

Errores de `/api/persona/feedback`, que el diálogo muestra como hoy:

- Sin consentimiento vigente (409, R-005.46): "Tu consentimiento no está vigente. No guardamos tu mensaje."
- Ítem que ya no está en la versión vigente, o sin plan vigente (400, R-005.33): "Tu plan cambió. Recarga la página y vuelve a intentarlo."

Tu plan (R-005.6; estos textos venían de 003, que ya no define textos de la persona):

- Título: "Tu plan"
- Línea: "Tu coach lo aprobó el {fecha}."
- Subtítulo de los `objetivo`: "Tus objetivos"
- Subtítulo de los `apoyo_fe`: "Apoyos que puedes pedir", con el texto "Son apoyos que acordaste con tu coach. Puedes pedirlos en tu trabajo."
- Vacío: "Tu coach todavía no aprueba tu plan. Cuando lo apruebe, aparece aquí."
- Ayuda: "Si algo no te queda claro, pregúntale a tu coach en tu próxima sesión."
- Por ítem: botón "Esto no me representa". Al final de la sección: "Algo de mi plan no me representa".
- Retirado: el vacío "Todavía no hay apoyos en tu plan. Tu coach los agrega contigo.". Razón: la sección tiene un solo texto de vacío, el de 003.

Recursos (fuera de la fase del 31 oct, salvo R-005.48: sin recursos aprobados, esta sección no aparece):

- Título: "Recursos" (ya existe)
- Por tarjeta: "Formato:", "Duración: {n} minutos", "Esfuerzo de concentración:" (ya existen), "Por qué te lo recomendamos: {texto}"
- Link: "Abrir el recurso (se abre en otro sitio)"
- Sin URL: "Tu coach te comparte este recurso en tu sesión."
- Vacío (ya existe): "Todavía no hay recursos. Tu coach los agrega cuando tu plan esté listo."

Módulo corto:

- Título: "Tu módulo corto: {título}"
- Subtítulos: "Para qué sirve", "Pasos", "Si te atoras"
- Texto fijo de "Si te atoras": "Habla con tu coach o escribe a ayuda@caja-mex.test." El correo y cualquier texto con el nombre del producto dependen del nombre del proyecto, que es una decisión abierta de 002.
- Vacío: "Todavía no hay un módulo para ti. Tu coach lo prepara a partir de tu plan."

Estado de "Esto no me representa", en la tarjeta de la dimensión, en el ítem del plan, en "Tu perfil en general" o en "Tu plan en general":

- Pendiente: "Enviaste esto el {fecha}. Tu coach lo va a revisar contigo."
- Perfil, cerrado con cambios: "Tu coach lo revisó contigo el {fecha}. Tu perfil se actualizó."
- Perfil, cerrado sin cambios: "Tu coach lo revisó contigo el {fecha}. Acordaron dejar esta parte como está."
- Plan, cerrado con cambios: "Tu coach lo revisó contigo el {fecha}. Tu plan se actualizó."
- Plan, cerrado sin cambios: "Tu coach lo revisó contigo el {fecha}. Acordaron dejar esta parte del plan como está."
- Resumen de cierre, revisado (R-005.43), en la página de cierre de 006: "Tu coach lo revisó contigo el {fecha}. El resumen de cierre se queda como está, y tu comentario queda guardado en tu acompañamiento."

### Coach (página del acompañamiento)

- Aviso: "{nombre} tiene {n} comentarios sin revisar." / "{nombre} tiene 1 comentario sin revisar." Cada comentario lleva "Sobre el perfil", "Sobre el plan" o "Sobre el resumen de cierre". El aviso es el título de una sección al inicio de la página, con cada comentario pendiente, su línea "Sobre", su fecha, su texto ("No dejó comentario." si no trae) y el botón de cierre.
- Opciones de las listas de cierre: "Propuesta aprobada el {fecha}, con {n} cambios al perfil" ("1 cambio" en singular) y "Versión {n}, aprobada el {fecha}". Las opciones y la pregunta de la lista van dentro del mismo diálogo de confirmación, y "Sí, marcar como revisado" queda deshabilitado hasta elegir.
- Cerrar comentario del perfil: botón "Marcar como revisado con {nombre}"; opciones "Hubo cambios al perfil" y "Sin cambios al perfil". Si "Hubo cambios al perfil" está deshabilitada: "Para marcar cambios, primero aprueba una propuesta con esos cambios." Con cambios: "¿Qué propuesta resolvió este comentario?" y la lista de propuestas aprobadas después del comentario. Diálogo: "¿Marcar este comentario como revisado? {nombre} verá el resultado la próxima vez que entre."; botones "Sí, marcar como revisado" y "Cancelar".
- Cerrar comentario del plan: mismo botón y diálogo; opciones "Hubo cambios al plan" y "Sin cambios al plan". Si "Hubo cambios al plan" está deshabilitada: "Para marcar cambios, primero aprueba una versión nueva del plan." Con cambios: "¿Qué versión del plan resolvió este comentario?" y la lista de versiones aprobadas después del comentario.
- Cerrar comentario del resumen de cierre (R-005.43): botón "Revisado con {nombre}", sin otras opciones. Línea: "El resumen de cierre ya está aprobado y no cambia." Diálogo: "¿Marcar este comentario como revisado? {nombre} verá el resultado la próxima vez que entre."; botones "Sí, marcar como revisado" y "Cancelar".
- En el comentario, la línea "Sobre" dice "El perfil en general", la etiqueta de la dimensión (de `DIMENSIONES`, no la de la persona), "El plan en general" o "El plan, versión {n}: {texto del ítem}". El texto sale de `persona_plans` de esa versión, y es lo que la persona vio. El estado en `components/coach/event-timeline.tsx` dice, según el origen, "Revisado, con cambios al perfil" o "Revisado, con cambios al plan", y "Revisado, sin cambios al perfil" o "Revisado, sin cambios al plan".
- Errores de la ruta de cierre (fase del 31 oct): "Este comentario ya fue revisado. Recarga la página para ver su estado." (409). "Este evento no es un comentario de la persona." (409). "Esa propuesta no cambió el perfil o es anterior al comentario. Elige otra." (409). "Esa versión del plan es anterior al comentario. Elige otra." (409). "Este comentario se revisa desde el resumen de cierre." (400, R-005.47). "La decisión no es válida." (400: body mal formado, o "Hubo cambios" sin la opción que pide su origen). "No encontramos este comentario." (404). "No se pudo guardar. Intenta de nuevo." (500).
- Recursos: botón "Proponer recursos". Sin plan vigente: "Primero aprueba el plan." Sin consentimiento vigente: "No hay consentimiento vigente. No se puede usar la IA en este acompañamiento." Sin candidatos: "No hay recursos verificados que coincidan con este plan."
- Por recurso propuesto: "Lo que verá {nombre}:", "Razón para ti:", botones "Aprobar" y "Descartar". Descartados por código: "Recursos quitados porque no estaban en la lista de candidatos o no correspondían al plan: {n}".
- Banderas en un texto que ve la persona (R-005.18): "Este texto no se puede aprobar porque usa palabras que {nombre} no debe ver: {lista}." En un recurso se agrega "Descarta este recurso o pide otra propuesta."; en un paso del módulo, "Quita este paso o genera otro módulo." El botón de aprobar queda deshabilitado.
- Banderas en la razón para el coach: "Revisa estas palabras antes de aprobar: {lista}"; casilla "Ya revisé estas palabras".
- Módulo: botón "Generar módulo corto". Sin fichas verificadas: "No hay fichas verificadas para los apoyos de este plan." Pasos quitados: "Pasos quitados por citar una ficha o un apoyo que no existe: {n}". Botón "Aprobar y mostrar a {nombre}"; diálogo "¿Mostrar este módulo a {nombre}? Lo verá la próxima vez que entre. El módulo anterior deja de verse."; botones "Sí, mostrarlo" y "Cancelar".
- Plan nuevo con pasos ocultos (R-005.39): "{n} pasos del módulo dejaron de verse porque su apoyo ya no está en el plan." / "1 paso del módulo dejó de verse porque su apoyo ya no está en el plan."

## Reglas fijas fuera del LLM

- Filtro de candidatos del catálogo por `verificada`, `idioma` y `dominio_fe` (R-005.8).
- Rechazo de cualquier ID de unidad, apoyo o ficha que no esté en la entrada que recibió el modelo (R-005.11, R-005.17).
- Ningún link sale del modelo: la URL siempre viene de `catalog_units.url` (C-06).
- Fichas de tipo `senal` y fichas sin verificar excluidas de la entrada del módulo (R-005.16).
- Revisión de términos con `buscarTerminos` de `lib/profile/validate.ts`, `TERMINOS_CONDICION` de 003 y las etiquetas de `DOMINIOS_FE` y `SENALES` de `lib/profile/schema.ts` sobre todo texto que produce el modelo. En los textos que ve la persona, la ruta de aprobación rechaza con 400 cualquier bandera, con o sin confirmación; la casilla solo vale para la razón para el coach (R-005.18).
- Consentimiento vigente (002) revisado con `private.app_has_consent(engagement_id)` antes de cualquier llamada al modelo (C-10).
- Entrada al modelo armada con una función que solo acepta los tipos permitidos; las notas, citas, señales y comentarios de la persona no tienen camino hacia ella (R-005.9, R-005.16, R-005.23).
- Constante única de visibilidad de dimensiones (R-005.4).
- Seguimiento de recomendaciones, pasos del módulo y estados de comentarios a la versión vigente del plan por `itemsAnteriores` de `PlanPersona` (R-005.35, R-005.38, R-005.39).
- Un comentario con `origen = 'cierre'` solo se cierra como `rejected` (R-005.43).
- `planItemId` de un "no me representa" validado contra la versión vigente de `persona_plans` (R-005.33).
- La persona no tiene políticas de `update` en ninguna tabla de esta spec. Lo que escribe está en la lista única de 002, y esta spec no le agrega nada (R-005.40). Retirado: "en ninguna tabla", porque 002 tiene `invitations_update_persona`, y 009 y 010 le dan UPDATE en las suyas (R-002.45).
- Consentimiento vigente en el insert del comentario, en la política y en la ruta (R-005.46).
- `planVersion` lo pone la ruta; `FeedbackRequest` no lo acepta (R-005.33).
- `origen = 'cierre'` no entra por `FeedbackRequest` y no se cierra por la ruta de esta fase (R-005.47).
- "Hubo cambios" solo con un evento `tipo = 'propuesta_ia'`, `status = 'approved'`, `decided_at` posterior al comentario, `approved_payload.cambios` no vacío y del mismo acompañamiento (R-005.27, R-005.49), o con un plan `status = 'aprobado'` y `approved_at` posterior al comentario, del mismo acompañamiento (R-005.34). Dos pestañas pueden mandar dos comentarios sobre la misma parte: los dos le llegan al coach y la persona ve el más reciente.

## Prompts

En la fase del 31 oct esta spec no tiene prompt ni llamada al modelo. Los dos archivos de abajo son de recursos y módulo.

- `prompts/AAAA-MM-DD_recomendaciones.md`: orden de unidades candidatas, razón para el coach y texto para la persona. La fecha es la del día en que se escriba. Acción de `audit_log`: `propose_recommendations`.
- `prompts/AAAA-MM-DD_modulo-corto.md`: módulo corto en segunda persona a partir de apoyos del plan y fichas verificadas. Acción de `audit_log`: `propose_module`.

Los nombres siguen el formato de REGLAS §7. Los dos usan `generateText` con `Output.object` (D-031, propuesta) y piden texto literal, positivo y sin etiquetas, con el lenguaje de C-08. El texto para la persona sigue el tono del partner ("prefiere", "le beneficia", CONTEXTO §5), pero en segunda persona.

## Decisiones abiertas

| # | Pregunta | Opciones (pros y contras) | Propuesta | Decide |
|---|---|---|---|---|
| 1 | ¿La persona lee su perfil en tercera persona? | (a) Mostrar el resumen tal cual, en tercera persona con su nombre: es el mismo texto que revisan juntos y sigue el estilo del partner (CONTEXTO §5); suena a que hablan de ella, y algunas etiquetas de dimensión ("Disparadores de estrés y qué le ayuda", "Cómo prefiere recibir retroalimentación") también están en tercera persona. (b) La IA escribe una versión en segunda persona al aprobar: se lee mejor; es otra llamada al modelo, otro texto que validar y aprobar, y puede cambiar el sentido. (c) El coach escribe la versión en segunda persona: control total; más horas de coach, cuando CONTEXTO §6 (Valor) busca reducirlas. | (a) para el demo, con las etiquetas de dimensión reescritas en segunda persona solo en la vista de la persona; (b) después de preguntar al partner. **Resuelta para esta fase con la tabla de decisiones del plan anterior (31 oct): (a), R-005.45.** | Acker; los tres si se presenta en el pitch |
| 2 | ¿Cuándo llega a la persona un cambio aprobado? | (a) Al aprobar, como hoy: sin pasos extra; la persona puede ver un cambio antes de hablarlo con el coach. (b) Acción aparte "Publicar perfil para {nombre}": se parece a "lo revisan con la persona y lo firman los dos" (CONTEXTO §4); un clic más y un estado más, y cambia 001. | (b). **Resuelta para esta fase con la tabla de decisiones del plan anterior (31 oct): (a), al aprobar, como hoy. Se aparta de la propuesta (b) para no cambiar 001 en esta fase. Se reabre si el partner pide otra cosa (P-31).** | Acker |
| 3 | ¿Qué dimensiones ve la persona? | (a) Todas, como hoy: simple; puede mostrar dimensiones sensibles como "Indicadores observables de estrés". (b) Lista fija validada por el partner: una sola regla para todos. (c) El coach elige por acompañamiento: flexible; más pantallas y más decisiones para el coach. | (b), con las 15 mientras el partner no responda. **Resuelta para esta fase con la tabla de decisiones del plan anterior (31 oct): constante con las 15, R-005.4.** | Acker, con la respuesta del partner |
| 4 | ¿Dónde vive el texto de la recomendación para la persona? | (a) Columna en `recommendations`: menos tablas; la persona también lee la razón para el coach. (b) Tabla `persona_recommendations` escrita al aprobar: mismo patrón que `persona_profiles` y cumple C-09 en la base. | (b) | Acker |
| 5 | ¿La persona confirma que revisó su perfil? | (a) No: menos fricción. (b) Botón "Lo revisé con mi coach" con fecha: se parece a la firma del partner (CONTEXTO §4); no reemplaza la firma del documento. | Preguntar al partner antes de construir. | Los tres |
| 6 | Límites del módulo y de las recomendaciones | Máximo de pasos, largo de cada paso y número de recursos propuestos por vez. Más contenido cubre más apoyos pero sube la carga para la persona. | Suposición del equipo, por validar: hasta 5 pasos y hasta 3 recursos por propuesta. | Acker |
| 7 | ¿El coach puede reescribir el módulo? | (a) Solo aprobar o quitar pasos: se conserva el vínculo con las fichas. (b) Editar libremente, con marca "editado por coach": más control; el texto editado ya no sale solo de fichas verificadas. | (a) en el MVP. | Acker |
| 8 | ¿La persona marca lo que ya revisó? | CONTEXTO §6 (Valor) dice que la persona "puede seguir su avance". (a) Botón "Ya lo revisé" por recurso, sin rachas ni puntajes: le da avance al coach; una tabla y una escritura más de la persona, que habría que sumar a la lista de 002. (b) Dejarlo para "What's next". | (b) si no hay tiempo antes del 3 nov (CONTEXTO §11, pendiente 12). | Acker |
| 9 | Métrica del lado persona | CONTEXTO §7: "si hay usuarios con consentimiento, ver si pueden nombrar sus apoyos antes y después. Si no hay, se dice en el pitch." | No construir nada en el MVP. En el pitch se presenta como métrica de piloto. | Los tres |
| 10 | ¿Dónde se guardan los descartados de una propuesta de recursos? | (a) Solo en la respuesta de la ruta: sin tabla nueva; se pierden al recargar y no quedan para auditar. (b) Tabla `app.recommendation_runs` (`engagement_id`, `plan_id`, `prompt_version`, `model`, `descartados`, `created_by`) y `recommendations.run_id`: queda el rastro de cada corrida, como en `modules`; una tabla más. | (b) | Acker |
| 11 | ¿El filtro del catálogo usa `competencia`? | (a) Solo `dominio_fe`: regla exacta y simple; deja fuera unidades sin dominio. (b) También `competencia`: más candidatos; `plan_items` no tiene esa columna, así que hace falta agregarla en 003 o un mapeo fijo. | (a) en el MVP. | Acker |
| 12 | ¿Quién escribe y verifica las unidades del catálogo? | Hace falta saber quién escribe cada unidad de `catalog_units`, de qué fuente registrada en CONTEXTO §10 (F-0xx) sale y quién la marca como `verificada`. Es el mismo hueco que las fichas en 003. Sin unidades verificadas, R-005.8 no deja candidatos y la sección de recursos queda vacía en el demo. | Responsable por definir. Mismo trato que las fichas de 003. | Los tres |
| 13 | ¿Dónde vive el "no me representa" sobre el plan? | (a) En `profile_events` con `origen` en el payload (R-005.33): un solo ciclo para perfil, plan y cierre, sin escritura nueva de la persona ni política nueva; la tabla se llama "profile" aunque guarde comentarios del plan. (b) Tabla nueva `plan_feedback` con FK al ítem: el vínculo queda en la base; suma una escritura de la persona fuera de la lista de 002, otra política y otra ruta de cierre. (c) Valor nuevo en el enum `profile_event_type`: queda en la base; cambia dos políticas de `profile_events`. | (a). Propuesta (Claude), decide Acker. Con (a), la decisión abierta 6 de 006 queda resuelta por R-005.33 y R-005.43. **Resuelta para esta fase con la tabla de decisiones del plan anterior (31 oct): (a), `profile_events` con `origen`.** | Acker |
| 14 | Nombre del proyecto en los textos de la persona | El correo de ayuda y los textos que nombran el producto usan el nombre del proyecto (CONTEXTO §11, pendiente 4, 30 oct). La decisión está abierta en 002, porque el aviso usa el nombre. Esta spec la referencia. | La que se tome en 002. | Los tres (en 002) |
| 15 | ¿Qué pasa con recursos y módulo cuando cambia el plan, y cómo lee la pantalla de la persona la cadena de versiones? | Qué pasa: (a) Siguen al ítem (R-005.38, R-005.39): la persona no pierde lo que ya le sirve; más lógica para resolver la cadena. (b) Una versión nueva del plan retira todos los recursos y el módulo: simple; el coach tiene que volver a pedir y aprobar todo, y la persona pierde recursos sin que nada haya cambiado en su apoyo. Cómo se lee la cadena con (a), porque la persona no lee `plan_items`: (i) 003 agrega a cada ítem de `PlanPersona` su `itemsAnteriores uuid[]`: una sola lectura de `persona_plans`; el jsonb crece un poco por versión. (ii) La aprobación del plan en 003 reescribe `persona_recommendations` y `persona_modules`: la persona lee IDs ya vigentes; la transacción de 003 toca tablas de 005. (iii) 002 agrega una función `security definer` que resuelve la cadena: no cambia tablas; otra función con privilegios que revisar. Las tres opciones también están en la decisión abierta 7 de 003. | (a) con (i). Propuesta (Claude), decide Acker. | Acker |
| 16 | ¿Qué hace `/persona` con "Recursos" mientras no se construye esa parte? | (a) Ocultar la sección si no hay recursos aprobados (R-005.48): la pantalla no promete algo que no va a pasar; cuando se construya recursos, hay que decidir otra vez el texto de vacío. (b) Dejar el texto actual: no cambia nada; le dice a la persona que su coach los agrega cuando el plan esté listo, y con el plan aprobado eso ya no es cierto. (c) Cambiar el texto: se ve la sección vacía sin decir nada falso; es ruido en una pantalla de texto primero. | (a). Propuesta (Claude), decide Acker. | Acker |
| 17 | ¿Se quita ya `recommendations_select_persona_approved`? | (a) Dejarla para cuando se construya recursos (Datos, punto 2): no toca la lectura de `app/persona/page.tsx`; el hueco queda en la base, sin filas y sin pantalla que lo muestre. (b) Quitarla en `drizzle/0014`: cierra el hueco de C-09 ya; `/persona` deja de poder listar recursos, y hay que tocar esa lectura y `CA-005.7` antes de tiempo. | (a), porque hoy no hay filas. Propuesta (Claude), decide Acker. | Acker |

## Tareas

Retirado: "No aplica: esta spec es de requisitos." Razón: Acker autorizó construir esta parte en el plan del 31 oct. Las tareas cubren solo lo que entra a esa fase; recursos, módulo y el resto de cierre siguen sin tareas.

Cada tarea es un commit pequeño que dice sus R-IDs, la herramienta y quién lo revisó (REGLAS §3), cuando Acker pida el commit. Debe estar el 1 nov en la noche, según el plan.

1. Esquema: en `lib/db/schema.ts`, las dos columnas y el consentimiento en `profile_events_insert_persona_feedback`. `npm run db:generate` crea `drizzle/0014`. (R-005.26, R-005.27, R-005.34, R-005.46)
2. Permisos: `drizzle/0015` a mano, y `npm run db:migrate`. (R-005.26, R-005.34)
3. RLS y purga: en `scripts/rls-check.ts`, los casos CA-005.1, CA-005.2 (solo `plans` y `plan_items`), CA-005.20, CA-005.31 y CA-005.38. En `sembrar` de `scripts/purge-retirados.ts`, un evento con cada columna nueva (CA-005.36). (R-005.1, R-005.2, R-005.42, R-005.46)
4. Zod y contratos: `PayloadNoMeRepresenta`, `FeedbackRequest` y `CerrarComentarioRequest`. (R-005.22, R-005.32, R-005.33, R-005.47)
5. Visibilidad y etiquetas: `lib/persona/dimensiones.ts`. `app/persona/page.tsx` filtra y rotula con esa constante. (R-005.3, R-005.4, R-005.45)
6. Estado de cada parte: `lib/persona/comentarios.ts`. (R-005.24, R-005.28, R-005.35)
7. Envío: `lib/persona/feedback.ts`, y `app/api/persona/feedback/route.ts` queda solo con autenticar, leer el body y delegar. (R-005.22, R-005.23, R-005.32, R-005.33, R-005.40, R-005.46, R-005.47)
8. Vista de la persona: `components/persona/tu-plan.tsx` y `app/persona/page.tsx` con `persona_plans`, sus comentarios, el texto de vacío nuevo y "Recursos" oculta sin recursos. (R-005.1, R-005.2, R-005.5, R-005.6, R-005.29 a R-005.31, R-005.48)
9. Botón con estado: `components/persona/not-me-button.tsx` recibe origen, ítem y estado guardado. Reemplaza "Tu coach lo va a revisar contigo." del estado local por los textos con fecha, y refresca la página al enviar. (R-005.24, R-005.28, R-005.32, R-005.35)
10. Cierre, ruta: `lib/persona/cierre-comentario.ts` y `app/api/profile-events/[id]/cierre/route.ts`. Recortable (ver "Entra a la fase del 31 oct"). (R-005.26, R-005.27, R-005.34, R-005.41, R-005.47, R-005.49)
11. Cierre, pantalla del coach: aviso con el conteo, `components/coach/seguimiento/cerrar-comentario.tsx` en `app/coach/engagements/[id]/page.tsx`, y "Sobre" y estado por origen en `components/coach/event-timeline.tsx`. Recortable. (R-005.25, R-005.26, R-005.27, R-005.34)
12. Pruebas sin red, en `eval/compare.ts`: CA-005.3, CA-005.30 (constante), CA-005.32 (esquema) y CA-005.35. (R-005.4, R-005.33, R-005.35, R-005.45, R-005.47)
13. Pruebas de ruta: `scripts/persona-check.ts`, con cuentas sintéticas, que borra lo que crea: CA-005.12, CA-005.13, CA-005.20, CA-005.21, CA-005.26, CA-005.31, CA-005.32, CA-005.34 y CA-005.37. (R-005.26, R-005.27, R-005.32 a R-005.34, R-005.41, R-005.46, R-005.47, R-005.49)
14. Recorrido en el navegador, con coach y persona, teclado y modo Calma, después de reiniciar `next dev`: CA-005.11, CA-005.14, CA-005.18, CA-005.28, CA-005.30, CA-005.33 y la parte de pantalla de CA-005.12, CA-005.13, CA-005.20 y CA-005.21. (R-005.2, R-005.29 a R-005.31)
15. Cierre de la tarea: subir el estado a "Implementada" solo en lo construido, anotar en "Cambios" lo no probado y revisar que `specs/002-alta-y-consentimiento.md` siga diciendo lo mismo en R-002.45. (C-19)

## Verificación

- Los criterios CA-005.1 a CA-005.29 pasan con la prueba indicada.
- En la fase del 31 oct solo cuentan los criterios de "Entra a la fase del 31 oct". Pasan `npm run typecheck`, `npm run lint`, `npm run build`, `npm run rls-check`, `npm run persona-check`, `npm run eval -- --offline` y `npm run purge-retirados -- --test`.
- Una revisión con la cuenta sintética de persona en el navegador confirma que no aparece ninguna cita, señal, nombre de dominio de función ejecutiva ni dato de verificación (C-09).
- Lo anterior solo ve la pantalla. Para el JavaScript que descarga la persona, una prueba de `npm run eval -- --offline` revisa que ningún componente de cliente de `/persona` llegue a `lib/profile/schema`, y después de `npm run build` se busca "Quiere renunciar" en los chunks que lista `.next/server/app/persona/page_client-reference-manifest.js` (C-09, R-005.2).
- Los casos RLS de esta spec corren en `scripts/rls-check.ts` (002), después de aplicar los cambios de Datos y con `drizzle/0002_permisos.sql` actualizado (R-005.42).
- La evaluación de las recomendaciones usa el formato de casos de 007 (`eval/cases/`); esta spec no define un formato propio. Si se evalúa el módulo, el caso va en 007 con el mismo formato, y una ficha sin verificar en la salida cuenta como falla.
- Métrica posible (CONTEXTO §7): en un piloto con consentimiento, antes de publicar el perfil y al cierre, el coach pregunta "¿Qué apoyos puedes pedir en tu trabajo?" y anota cuántos apoyos nombra la persona. No pasa por la IA. En el prototipo no hay usuarios reales (C-07), así que no se mide; lo que se mida en un piloto se presenta como piloto, no como resultado (CONTEXTO §7).

## Preguntas para el partner

- ¿Qué partes del perfil ve hoy la persona? ¿Hay dimensiones que no deba ver, por ejemplo los indicadores de estrés? (ya está en CONTEXTO §11)
- ¿La persona lee su perfil en tercera persona o se lo explican en segunda?
- Cuando la persona dice que algo de su perfil o de su plan no la representa, ¿cómo lo revisan y cuándo lo dan por resuelto?
- ¿La firma del perfil es solo en el documento o les serviría que la persona confirme en el sistema?
- ¿Qué recursos o cursos recomiendan hoy, quién los revisa y en qué idioma están?
- ¿Les sirve un módulo corto escrito para la persona, o prefieren que el coach explique el material en la sesión?
- ¿Les sirve que la persona marque lo que ya revisó, o prefieren hablarlo en la sesión?
- En un piloto, ¿podrían preguntar con consentimiento qué apoyos puede nombrar la persona antes y después?
- ¿Tienen un perfil en blanco o inventado que nos puedan compartir?

## Cambios

2026-11-03, sin cambiar de versión: las opciones de R-005.29 (fuentes, tamaños, interletrado, interlineado y ancho) cambian por R-012.5 de la spec 012. Siguen en la cookie del navegador, no en la cuenta.

Versión 9 · 2026-11-01 · tareas 14 y 15: recorrido en el navegador y cierre de la parte construida

- Probado en el navegador con Renata y Coach Demo, tras reiniciar `next dev`: CA-005.11, CA-005.28 (con plan), CA-005.33, y la parte de pantalla de CA-005.12, CA-005.13 y CA-005.20. De CA-005.21, las dos opciones del diálogo y el cierre contra la versión 2, con una versión real del modelo. Modo Calma con OpenDyslexic: `data-mode`, `data-font`, sin animaciones en `/persona` y sin sombra en el diálogo. Teclado: abrir, enviar y volver; el foco termina en el mensaje de estado, o en "Propuestas y comentarios" en la pantalla del coach. Ninguna cita, señal, dominio ni verificación en el HTML de `/persona` (C-09).
- No probado en pantalla:
  - CA-005.14 en el módulo, que no existe en esta fase.
  - CA-005.18: un apoyo sin texto para la persona.
  - CA-005.28: el texto de vacío sin plan.
  - CA-005.30: `trabajo_en_equipo`, porque Renata no lo tiene.
  - CA-005.21: "Tu plan se actualizó." en el ítem equivalente. El modelo marcó los cinco puntos de la versión 2 como nuevos, así que los comentarios cayeron en "Tu plan en general", y ahí se ve el más reciente (CA-005.35). El texto lo cubren las pruebas sin red.
- Para revisar: un comentario cerrado con cambios queda oculto si otro más reciente cae en la misma parte, como pide CA-005.35. En la versión 2 real ningún punto siguió a uno de la versión 1, aunque "Cuando un caso tenga pocos datos, empieza por la primera pregunta de tu lista" continúa el primer objetivo.
- Revisado: R-002.45 sigue diciendo lo mismo.

Versión 8 · 2026-11-01 · hallazgos de la revisión de la fase

- Requisito nuevo R-005.50 y CA-005.38 suma el INSERT: la política de la persona no limitaba las columnas de decisión. La revisión pidió `decided_by`, `decided_at`, `approved_payload` y las columnas `resuelto_*`. También entran `created_at` y las demás columnas que la persona no escribe, para que la regla sea una sola. Migración `drizzle/0016`. El texto de la política en "Migración de la base", punto 1, es el de `drizzle/0014`, y `drizzle/0016` lo reemplaza.
- C-09 y R-005.2 también valen para el JavaScript que descarga la persona: el botón ya no importa valores de `lib/profile/schema`. `lib/api/contracts-cliente.ts` y `lib/persona/texto-comentario.ts` no dependen de ese archivo. El navegador revisa `dimension` solo como texto y el servidor la valida contra `DimensionId`.
- "Sobre: {sobre}" no agrega un segundo punto cuando el texto del ítem ya termina en uno.

Versión 7 · 2026-11-01 · ajustes al construir las tareas 1 a 13

- Textos que faltaban (interpretación del equipo, decide Acker): las opciones de las listas de cierre, el error 400 de la ruta de cierre por un body inválido y el lugar del aviso en la página del coach.
- Archivos: `enviarComentario` suma un parámetro opcional `visibles`, porque con las 15 dimensiones en la constante no se puede probar el 400 de R-005.4 de otra forma. `lib/persona/feedback.ts` también guarda la lectura de `/persona`.
- `/api/persona/feedback` responde 400 a `origen = 'perfil'` con `planItemId`, porque R-005.33 lo permite solo con `origen = 'plan'`. Usa el mensaje de un cuerpo inválido.

Versión 6 · 2026-10-31 · fase del 31 oct (D-073)

- Nueva sección "Entra a la fase del 31 oct": base de la fase, sin recursos ni módulo. Tareas nuevas para esa parte.
- Decisiones 1, 2, 3 y 13 resueltas para esta fase con la tabla de decisiones del plan anterior. La 2 se aparta de la propuesta (b): queda (a). Se retiran la lectura de una versión publicada (R-005.1), el texto de vacío con "publicarlo" (R-005.5) y las columnas de publicación (Datos, punto 7).
- Requisitos nuevos R-005.45 (etiquetas en segunda persona solo para la persona), R-005.46 (consentimiento en `profile_events_insert_persona_feedback` y en la ruta), R-005.47 (`cierre` solo como valor de esquema), R-005.48 (sección "Recursos" sin recursos) y R-005.49 (un comentario `approved` no es una propuesta aprobada). Criterios nuevos CA-005.30 a CA-005.38.
- R-005.4, R-005.6, R-005.26, R-005.33, R-005.40 y R-005.42 precisan constante, componente, ruta, rechazos y casos RLS. Datos 5 retira "la política no cambia".
- Datos: migración de la base en `drizzle/0014` y `drizzle/0015`, con `on delete set null` en las columnas `resuelto_*` para no romper la purga. Esquemas, archivos y rutas con nombre final.
- Decisiones abiertas nuevas: 16 y 17.
- Datos: el orden de migraciones suma 008 a 010.

Versión 5 · 2026-10-30 · ajuste por 004

- R-005.27 y CA-005.13 exigen `approved_payload.cambios` no vacío, porque 004 permite aprobar sin cambiar el perfil.

Versión 4 · 2026-10-30 · registro en CONTEXTO

- Las notas que decían que estas decisiones y el handoff faltaban por registrar ahora remiten a CONTEXTO v5. Las notas de versiones anteriores de esta sección conservan lo que decían entonces.

Versión 3 · 2026-10-29 · ajustes de consistencia

- Textos para la persona y C-09: en el texto de la recomendación y en el módulo, `termino_no_permitido`, `mencion_condicion` y `termino_interno` (etiquetas de `DOMINIOS_FE` y `SENALES`) bloquean la aprobación, igual que R-003.30. La casilla de confirmación queda solo para la razón para el coach (R-005.18, CA-005.9 ajustado, CA-005.27 nuevo, textos del coach, reglas fijas).
- Cadena de versiones del plan: R-005.35, R-005.38 y R-005.39 usan `itemsAnteriores` de `PlanPersona` (003) en vez de recorrer `origen_item_id`, que la persona no puede leer. Datos 1, CA-005.22 y reglas fijas ajustados; la decisión abierta 15 suma las otras dos opciones.
- "Tu plan": esta spec es la única dueña de la sección. R-005.6 agrupa por tipo en "Tus objetivos" y "Apoyos que puedes pedir" y adopta el título, la línea de aprobación, el vacío y la ayuda de 003. Se retira el vacío anterior de 005. CA-005.28 nuevo.
- Comentario sobre el resumen de cierre: R-005.43 nuevo, con la sola opción "Revisado con {nombre}" (estado `rejected`) y sus textos; CA-005.29 nuevo. R-005.33 y la decisión abierta 13 dicen que la decisión 6 de 006 queda resuelta.
- Etapa `cierre`: R-005.44 nuevo remite a 006 lo que se bloquea y pide que siga permitido enviar y cerrar comentarios.
- R-005.1 y Datos 8 nombran `private.app_mi_acompanamiento()` (R-002.40) y ya no dicen "del acompañamiento más reciente".
- Citas a 002: R-005.36 cita R-002.44 y R-005.37 cita R-002.42 y R-002.43.
- R-005.41 reconoce `engagements_update_coach_alta` de 002 y deja las transiciones de etapa a 003 y 006.
- Fuera de alcance: las salidas a la empresa van en 006 o en "What's next". Datos 6 remite a R-003.41 para `knowledge_cards`.
- Alcance, "Depende de" y el título de la tabla de relación con otras specs se ajustan a lo anterior.

Versión 2 · 2026-10-29 · consolidación entre specs

- Consentimiento: toda referencia a `engagements.consentimiento_en` pasa a "consentimiento vigente (002)" con `private.app_has_consent(engagement_id)` (R-005.7, R-005.15, CA-005.4, reglas fijas, textos del coach).
- Plan para la persona: se retira la propuesta de `persona_plan_items`; la persona lee `persona_plans` de 003 (R-005.6, CA-005.2, Datos 1 y 9). "Plan aprobado" pasa a "plan vigente" donde importa la versión.
- "Esto no me representa": esta spec es dueña del ciclo sobre perfil y plan. Nuevos R-005.32 a R-005.35, `origen` en el payload con el valor `cierre` para 006, columna `resuelto_por_plan`, decisión abierta 13.
- Versiones del plan: recursos y pasos del módulo siguen al ítem por `origen_item_id` (R-005.38, R-005.39, decisión abierta 15).
- Nuevos R-005.36, R-005.37 y R-005.40 a R-005.42: bloqueo por retiro del consentimiento, versión del aviso, escrituras de la persona según la lista de 002, sin cambios de etapa y casos en `scripts/rls-check.ts`.
- Verificación del diagnóstico: Datos 8 remite a la resolución de 002 (H-12).
- Acciones de `audit_log` con nombre: `propose_recommendations` y `propose_module`.
- Decisiones abiertas nuevas: catálogo verificado (12) y nombre del proyecto (14). Pregunta nueva al partner sobre un perfil en blanco o inventado. La evaluación remite al formato de 007.
- CA-005.20 a CA-005.26 nuevos; CA-005.12 y CA-005.15 ajustados.

Versión 10 · 2026-11-01 · revisión cruzada de la fase del 31 oct

- El aviso declara lo que se escribe en "Esto no me representa": se guarda, lo lee el coach y no llega al modelo. Decía que esta parte no agregaba datos al aviso, y el dato ya existía sin estar declarado.
