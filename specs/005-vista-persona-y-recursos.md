<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# 005 · Vista de la persona y recursos

- Estado: Borrador · Versión 3 · 2026-10-29
- Fuentes: CONTEXTO §4 (F-005), §5, §6 (paso 5, Valor, Arquitectura), §7, §11; D-015, D-017 y D-021 (propuestas en CONTEXTO §9); D-031 a D-035 (bloque de actualización del 29 oct, propuesta); REGLAS §2.5, §3, §6 y §7; C-01, C-02, C-03, C-04, C-05, C-06, C-07, C-08, C-09, C-10, C-11, C-14, C-16, C-17, C-18
- Depende de: 001 (perfil aprobado y `persona_profiles`), 002 (consentimiento vigente, bloqueo al retirarlo, lista de lo que escribe la persona, aviso de privacidad, `private.app_mi_acompanamiento()` y `scripts/rls-check.ts`), 003 (plan vigente, `persona_plans` con `itemsAnteriores`, `origen_item_id`, `TERMINOS_CONDICION` y la regla de bloqueo de R-003.30), 006 (qué se bloquea en la etapa `cierre`). Sus migraciones van después de las de 003.

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

## Requisitos

### Perfil

| ID | Requisito | Fuente |
|---|---|---|
| R-005.1 | Cuando la persona abre `/persona`, el sistema debe leer su perfil solo de `app.persona_profiles`, del acompañamiento de la persona, leído con `private.app_mi_acompanamiento()` (R-002.40), y en la versión más alta. Una persona tiene un solo acompañamiento (002). Si se elige la opción (b) de la decisión abierta 2, lee la versión publicada más alta. Ninguna consulta de las pantallas de la persona lee `profile_snapshots`, `sessions` ni `profile_events` de tipo `propuesta_ia`. | C-09, D-033 (propuesta); R-002.40 de 002 |
| R-005.2 | La vista de la persona nunca debe mostrar citas de las notas, señales de riesgo, nombres de dominios de función ejecutiva, razones internas del coach, versiones de prompt ni los campos de verificación del diagnóstico (`diagnostico_verificado`, `cedula_profesional`, `diagnostico_verificado_por`, `diagnostico_verificado_en`). Cómo se cumple en la base para `engagements` lo resuelve 002 (ver Datos, punto 8). | C-09, C-02, C-03; 002 |
| R-005.3 | El perfil se agrupa en "Lo que te funciona" (`fortaleza`), "Dónde te puede servir apoyo" (`area_de_apoyo`) y "Tu forma de trabajar" (`contexto`), como ya hace `app/persona/page.tsx`. | C-08, as-built |
| R-005.4 | El sistema debe mostrar a la persona solo las dimensiones que estén en una constante única de visibilidad en el código. Mientras el partner no responda, la constante incluye las 15 dimensiones de `DIMENSIONES`, como hoy. | CONTEXTO §6 ("el partner define qué partes ve") y §11 (pregunta pendiente); la lista inicial es suposición |
| R-005.5 | El texto de pantalla vacía del perfil depende de la decisión abierta 2. Con la opción (a) cambia a "Tu perfil todavía no está listo. Tu coach lo prepara contigo.", porque hoy cada aprobación del coach crea la versión de la persona en ese momento. Con la opción (b) se conserva el texto actual, que menciona la publicación. | CONTEXTO §4 (F-005); hallazgo del código (`app/api/profile-events/[id]/decision/route.ts`) |
| R-005.6 | La vista debe mostrar la sección "Tu plan" con los ítems de la versión vigente de `app.persona_plans` (R-003.37, R-003.39 de 003), agrupados por tipo: los `objetivo` bajo "Tus objetivos" y los `apoyo_fe` bajo "Apoyos que puedes pedir". Un subtítulo sin ítems no aparece. Sin plan vigente, la sección muestra un solo texto de vacío, el que venía en 003. Las pantallas de la persona no leen `plans` ni `plan_items`. Un ítem sin texto para la persona no llega a `persona_plans` (R-003.48) y no aparece. Qué tipos de ítem copia 003 a `persona_plans`, incluidos los valores nuevos que 003 propone para `app.plan_item_type`, lo decide 003. Esta spec es la única dueña de la sección y de sus textos; 003 ya no define textos de la persona (cierra su decisión abierta 7). | CONTEXTO §6 (paso 5, Valor); 003; una sola dueña: propuesta (Claude), decide Acker |

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
| R-005.26 | El coach cierra un "no me representa" del perfil con una de dos opciones y con confirmación: "Hubo cambios al perfil" (estado `approved`) o "Sin cambios al perfil" (estado `rejected`). Se guardan `decided_by` y `decided_at`. La ruta de decisión actual responde 409 a estos eventos, así que el cierre usa una ruta propia. Cerrar un comentario no crea un snapshot ni una versión de `persona_profiles`. | C-04; hallazgo del código (`app/api/profile-events/[id]/decision/route.ts`) |
| R-005.27 | Un cambio al perfil entra por el camino normal de 001: el coach registra la sesión, la IA propone y el coach aprueba. La opción "Hubo cambios al perfil" solo se puede elegir si existe una `propuesta_ia` aprobada en el acompañamiento con `decided_at` posterior al comentario; el coach elige cuál y queda guardada en `resuelto_por_evento`. Sin esa propuesta, la opción aparece deshabilitada con su explicación. | C-04, C-05; interpretación del equipo |
| R-005.28 | Cuando el coach cierra el comentario, la persona ve el resultado y la fecha en esa parte del perfil o del plan, y el botón vuelve a estar disponible. | CONTEXTO §4 (F-005, revisión conjunta); interpretación del equipo |
| R-005.32 | La persona puede enviar "Esto no me representa" sobre cada ítem de la versión vigente de su plan en `persona_plans` y sobre el plan en general, con comentario opcional de hasta 2000 caracteres. El envío crea un `profile_event` de tipo `no_me_representa` en estado `proposed` y no cambia el plan. | CONTEXTO §6 (paso 5); extenderlo al plan: propuesta (Claude), decide Acker |
| R-005.33 | `PayloadNoMeRepresenta` (`lib/profile/schema.ts`) agrega `origen` (`perfil`, `plan` o `cierre`) y, solo con `origen = 'plan'`, `planItemId` (nulo para el plan en general) y `planVersion`. Un evento guardado sin `origen` se lee como `perfil`. El valor `cierre` es el que usa 006 para el resumen de cierre (R-006.8); con este requisito y R-005.43, la decisión abierta 6 de 006 queda resuelta. La ruta `/api/persona/feedback` rechaza con 400 un `planItemId` que no esté en la versión vigente de `persona_plans` de ese acompañamiento. | Propuesta (Claude), decide Acker; alternativa en la decisión abierta 13 |
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
| R-005.40 | Lo que escribe la persona está en la lista única de 002. Esta spec no le agrega escrituras: el "no me representa" sobre el plan usa el mismo insert de `profile_events` de tipo `no_me_representa` que ya existe. | 002; C-16 |
| R-005.41 | Las acciones de esta spec no cambian `engagements.stage` ni escriben en `engagements`. Fuera de `engagements_update_coach_alta` de 002 (R-002.41), no existe política de UPDATE sobre `app.engagements`, y esta spec no agrega ninguna; las transiciones de etapa son de 003 y 006. | 002, 003, 006; C-16 |
| R-005.42 | Los casos RLS de esta spec (CA-005.1, CA-005.2, CA-005.7, CA-005.10, CA-005.20 y CA-005.24) se agregan a `scripts/rls-check.ts`, que define 002. | 002 (tarea 7); C-16 |
| R-005.44 | Qué rutas y políticas de INSERT de esta spec se bloquean en la etapa `cierre` con `private.app_engagement_abierto` lo define 006 en su requisito sobre esa etapa; esta spec no repite la lista. Lo que 006 deje permitido después del cierre tiene que incluir que la persona envíe un "no me representa" sobre su resumen de cierre (R-006.8) y que el coach cierre comentarios con R-005.26, R-005.34 y R-005.43. | 006; propuesta (Claude), decide Acker |

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
| CA-005.13 | Dado un comentario pendiente y ninguna `propuesta_ia` aprobada después de él, cuando el coach abre el cierre, entonces "Hubo cambios al perfil" está deshabilitada; y si la ruta recibe esa opción, responde 409. | R-005.27 | prueba offline + navegador |
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

## Datos

Cambios contra `lib/db/schema.ts` y `drizzle/0002_permisos.sql`. RLS filtra filas, y los grants de `0002_permisos.sql` aplican igual al coach y a la persona porque los dos usan el rol `authenticated`. Por eso lo que la persona no debe leer va en otra tabla, como ya se hizo con `persona_profiles` (D-032 y D-033, propuestas). Las migraciones de esta spec van después de las de 003 (orden: 002, 003, luego 004 y 005, y 006 al final).

1. `plan_items`. Retirado de esta spec: la propuesta de `app.persona_plan_items`. Lo resuelve 003: retira `plans_select_persona_approved` y `plan_items_select_persona_approved`, y crea `app.persona_plans` (una fila por versión aprobada, jsonb sin citas ni evidencia, con el ID de cada ítem y su `itemsAnteriores uuid[]`, la cadena de IDs de versiones anteriores que 003 arma desde `origen_item_id`). La persona solo lee `persona_plans`. No existe `persona_plan_items`. R-005.35, R-005.38 y R-005.39 usan `itemsAnteriores` para saber qué sigue vigente.
2. `recommendations`. Hoy la persona puede leer `razon` de las filas aprobadas. Se quita `recommendations_select_persona_approved` y `recommendations` queda solo para el coach. Columnas nuevas: `prompt_version`, `model` y `approved_at` (hoy solo existe `approved_by`). `plan_item_id` ya existe y guarda el ítem de la versión con la que se generó (R-005.38). La persona lee `app.persona_recommendations` (`recommendation_id`, `engagement_id`, `catalog_unit_id`, `plan_item_id`, texto para la persona), escrita en la misma transacción que la aprobación. Ver decisiones abiertas 4 y 10.
3. `catalog_units`. Agregar `verificada boolean not null default false`. El seed actual (`scripts/seed.sql`) tiene `fuente = 'ejemplo-sintetico'` y `url = null` en las tres unidades, así que el filtro de R-005.8 no deja ninguna hasta tener unidades verificadas (decisión abierta 12).
4. Módulo corto. Enum nuevo `app.module_status` (`borrador`, `aprobado`, `retirado`). Tabla nueva `app.modules`, solo coach: `id`, `engagement_id`, `plan_id`, `version`, `status`, `contenido` jsonb validado con Zod, `fuentes` (IDs de apoyo y ficha por paso), `descartados`, `banderas`, `prompt_version`, `model`, `created_by`, `approved_by`, `approved_at`. Tabla `app.persona_modules`, que lee la persona: `module_id`, `engagement_id`, copia del contenido aprobado con el ID de apoyo de cada paso y sin fichas ni banderas, `created_at`. Se escribe en la misma transacción que la aprobación, y la persona ve la fila más reciente con los pasos que siguen vigentes (R-005.39).
5. `profile_events`. Columnas nuevas opcionales `resuelto_por_evento uuid` (referencia `profile_events.id`) y `resuelto_por_plan uuid` (referencia `plans.id`). La política `profile_events_update_coach` ya deja al coach actualizar eventos de su acompañamiento, y la persona ya lee el `status` y `decided_at` de sus propios eventos por `profile_events_select_persona_own`. Al grant de update (`status`, `approved_payload`, `decided_by`, `decided_at`) se agregan `resuelto_por_evento` y `resuelto_por_plan`. El cambio de `PayloadNoMeRepresenta` (R-005.33) es de código: el payload es jsonb y `profile_events_insert_persona_feedback` no cambia.
6. `knowledge_cards`. Hoy `knowledge_cards_select_all` deja a cualquier usuario con sesión leer todas las fichas, incluidas las de tipo `senal` (el seed tiene una). Lo resuelve 003 (R-003.41): solo el coach lee `knowledge_cards`. Esta spec no cambia esa política. La persona recibe el contenido del módulo por `persona_modules`.
7. Publicación del perfil. Depende de la decisión abierta 2. Si se elige la opción (b), `persona_profiles` agrega `publicado_por` y `publicado_en`, y la política de lectura de la persona filtra por `publicado_en is not null`. Esto cambia el comportamiento de 001.
8. `engagements`. `engagements_select_participants` deja a la persona leer su fila completa, incluidas `diagnostico_verificado` y `cedula_profesional`. Lo resuelve 002 (H-12): la persona no lee `cedula_profesional` ni las columnas de verificación. Las páginas de la persona solo seleccionan columnas permitidas, y 002 añade la función `security definer` `private.app_mi_acompanamiento()` (R-002.40), que devuelve `id`, `type` y `stage`; mientras tanto vale la regla fija en código. Esta spec no agrega lecturas de `engagements` desde las pantallas de la persona fuera de `private.app_mi_acompanamiento()`.
9. Grants nuevos: `insert` en `modules`, `persona_modules` y `persona_recommendations`; `update (status, approved_by, approved_at)` en `modules`; `approved_at` se agrega al grant de update de `recommendations`. Las políticas nuevas de `insert` y `update` exigen `app_is_coach_of`, así que la persona no puede escribir en estas tablas aunque tenga el grant.
10. Bloqueo por retiro del consentimiento (R-005.36). Las políticas de lectura de `recommendations`, `persona_recommendations`, `modules`, `persona_modules` y `recommendation_runs` (si se adopta) siguen la regla que 002 defina para el bloqueo; con la propuesta de 002 agregan `private.app_has_consent(engagement_id)` a su condición.

## Pantallas y textos

### Persona (`/persona`)

Textos que ya existen y se conservan: "Tu perfil", "Hola, {nombre}.", "Esto es lo que tu coach y tú han visto hasta ahora. Si algo no te representa, usa el botón de esa parte.", "Lo que te funciona", "Dónde te puede servir apoyo", "Tu forma de trabajar", "Esto no me representa", "Algo de mi perfil no me representa", "Tu coach lo va a revisar contigo."

Todo texto que produce el modelo para la persona pasa por la revisión de R-005.18 antes de aprobarse; con una bandera no se aprueba.

Pantalla vacía del perfil (R-005.5):

- Con la opción (a) de la decisión abierta 2: "Tu perfil todavía no está listo. Tu coach lo prepara contigo."
- Con la opción (b): se conserva "Tu perfil todavía no está listo. Tu coach lo revisa contigo antes de publicarlo."

Tu plan (R-005.6; estos textos venían de 003, que ya no define textos de la persona):

- Título: "Tu plan"
- Línea: "Tu coach lo aprobó el {fecha}."
- Subtítulo de los `objetivo`: "Tus objetivos"
- Subtítulo de los `apoyo_fe`: "Apoyos que puedes pedir", con el texto "Son apoyos que acordaste con tu coach. Puedes pedirlos en tu trabajo."
- Vacío: "Tu coach todavía no aprueba tu plan. Cuando lo apruebe, aparece aquí."
- Ayuda: "Si algo no te queda claro, pregúntale a tu coach en tu próxima sesión."
- Por ítem: botón "Esto no me representa". Al final de la sección: "Algo de mi plan no me representa".
- Retirado: el vacío "Todavía no hay apoyos en tu plan. Tu coach los agrega contigo.". Razón: la sección tiene un solo texto de vacío, el de 003.

Recursos:

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

- Aviso: "{nombre} tiene {n} comentarios sin revisar." / "{nombre} tiene 1 comentario sin revisar." Cada comentario lleva "Sobre el perfil", "Sobre el plan" o "Sobre el resumen de cierre".
- Cerrar comentario del perfil: botón "Marcar como revisado con {nombre}"; opciones "Hubo cambios al perfil" y "Sin cambios al perfil". Si "Hubo cambios al perfil" está deshabilitada: "Para marcar cambios, primero aprueba una propuesta con esos cambios." Con cambios: "¿Qué propuesta resolvió este comentario?" y la lista de propuestas aprobadas después del comentario. Diálogo: "¿Marcar este comentario como revisado? {nombre} verá el resultado la próxima vez que entre."; botones "Sí, marcar como revisado" y "Cancelar".
- Cerrar comentario del plan: mismo botón y diálogo; opciones "Hubo cambios al plan" y "Sin cambios al plan". Si "Hubo cambios al plan" está deshabilitada: "Para marcar cambios, primero aprueba una versión nueva del plan." Con cambios: "¿Qué versión del plan resolvió este comentario?" y la lista de versiones aprobadas después del comentario.
- Cerrar comentario del resumen de cierre (R-005.43): botón "Revisado con {nombre}", sin otras opciones. Línea: "El resumen de cierre ya está aprobado y no cambia." Diálogo: "¿Marcar este comentario como revisado? {nombre} verá el resultado la próxima vez que entre."; botones "Sí, marcar como revisado" y "Cancelar".
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
- La persona no tiene políticas de `update` en ninguna tabla. Lo que escribe está en la lista única de 002, y esta spec no le agrega nada (R-005.40).

## Prompts

- `prompts/AAAA-MM-DD_recomendaciones.md`: orden de unidades candidatas, razón para el coach y texto para la persona. La fecha es la del día en que se escriba. Acción de `audit_log`: `propose_recommendations`.
- `prompts/AAAA-MM-DD_modulo-corto.md`: módulo corto en segunda persona a partir de apoyos del plan y fichas verificadas. Acción de `audit_log`: `propose_module`.

Los nombres siguen el formato de REGLAS §7. Los dos usan `generateText` con `Output.object` (D-031, propuesta) y piden texto literal, positivo y sin etiquetas, con el lenguaje de C-08. El texto para la persona sigue el tono del partner ("prefiere", "le beneficia", CONTEXTO §5), pero en segunda persona.

## Decisiones abiertas

| # | Pregunta | Opciones (pros y contras) | Propuesta | Decide |
|---|---|---|---|---|
| 1 | ¿La persona lee su perfil en tercera persona? | (a) Mostrar el resumen tal cual, en tercera persona con su nombre: es el mismo texto que revisan juntos y sigue el estilo del partner (CONTEXTO §5); suena a que hablan de ella, y algunas etiquetas de dimensión ("Disparadores de estrés y qué le ayuda", "Cómo prefiere recibir retroalimentación") también están en tercera persona. (b) La IA escribe una versión en segunda persona al aprobar: se lee mejor; es otra llamada al modelo, otro texto que validar y aprobar, y puede cambiar el sentido. (c) El coach escribe la versión en segunda persona: control total; más horas de coach, cuando CONTEXTO §6 (Valor) busca reducirlas. | (a) para el demo, con las etiquetas de dimensión reescritas en segunda persona solo en la vista de la persona; (b) después de preguntar al partner. | Acker; los tres si se presenta en el pitch |
| 2 | ¿Cuándo llega a la persona un cambio aprobado? | (a) Al aprobar, como hoy: sin pasos extra; la persona puede ver un cambio antes de hablarlo con el coach. (b) Acción aparte "Publicar perfil para {nombre}": se parece a "lo revisan con la persona y lo firman los dos" (CONTEXTO §4); un clic más y un estado más, y cambia 001. | (b) | Acker |
| 3 | ¿Qué dimensiones ve la persona? | (a) Todas, como hoy: simple; puede mostrar dimensiones sensibles como "Indicadores observables de estrés". (b) Lista fija validada por el partner: una sola regla para todos. (c) El coach elige por acompañamiento: flexible; más pantallas y más decisiones para el coach. | (b), con las 15 mientras el partner no responda. | Acker, con la respuesta del partner |
| 4 | ¿Dónde vive el texto de la recomendación para la persona? | (a) Columna en `recommendations`: menos tablas; la persona también lee la razón para el coach. (b) Tabla `persona_recommendations` escrita al aprobar: mismo patrón que `persona_profiles` y cumple C-09 en la base. | (b) | Acker |
| 5 | ¿La persona confirma que revisó su perfil? | (a) No: menos fricción. (b) Botón "Lo revisé con mi coach" con fecha: se parece a la firma del partner (CONTEXTO §4); no reemplaza la firma del documento. | Preguntar al partner antes de construir. | Los tres |
| 6 | Límites del módulo y de las recomendaciones | Máximo de pasos, largo de cada paso y número de recursos propuestos por vez. Más contenido cubre más apoyos pero sube la carga para la persona. | Suposición del equipo, por validar: hasta 5 pasos y hasta 3 recursos por propuesta. | Acker |
| 7 | ¿El coach puede reescribir el módulo? | (a) Solo aprobar o quitar pasos: se conserva el vínculo con las fichas. (b) Editar libremente, con marca "editado por coach": más control; el texto editado ya no sale solo de fichas verificadas. | (a) en el MVP. | Acker |
| 8 | ¿La persona marca lo que ya revisó? | CONTEXTO §6 (Valor) dice que la persona "puede seguir su avance". (a) Botón "Ya lo revisé" por recurso, sin rachas ni puntajes: le da avance al coach; una tabla y una escritura más de la persona, que habría que sumar a la lista de 002. (b) Dejarlo para "What's next". | (b) si no hay tiempo antes del 3 nov (CONTEXTO §11, pendiente 12). | Acker |
| 9 | Métrica del lado persona | CONTEXTO §7: "si hay usuarios con consentimiento, ver si pueden nombrar sus apoyos antes y después. Si no hay, se dice en el pitch." | No construir nada en el MVP. En el pitch se presenta como métrica de piloto. | Los tres |
| 10 | ¿Dónde se guardan los descartados de una propuesta de recursos? | (a) Solo en la respuesta de la ruta: sin tabla nueva; se pierden al recargar y no quedan para auditar. (b) Tabla `app.recommendation_runs` (`engagement_id`, `plan_id`, `prompt_version`, `model`, `descartados`, `created_by`) y `recommendations.run_id`: queda el rastro de cada corrida, como en `modules`; una tabla más. | (b) | Acker |
| 11 | ¿El filtro del catálogo usa `competencia`? | (a) Solo `dominio_fe`: regla exacta y simple; deja fuera unidades sin dominio. (b) También `competencia`: más candidatos; `plan_items` no tiene esa columna, así que hace falta agregarla en 003 o un mapeo fijo. | (a) en el MVP. | Acker |
| 12 | ¿Quién escribe y verifica las unidades del catálogo? | Hace falta saber quién escribe cada unidad de `catalog_units`, de qué fuente registrada en CONTEXTO §10 (F-0xx) sale y quién la marca como `verificada`. Es el mismo hueco que las fichas en 003. Sin unidades verificadas, R-005.8 no deja candidatos y la sección de recursos queda vacía en el demo. | Responsable por definir. Mismo trato que las fichas de 003. | Los tres |
| 13 | ¿Dónde vive el "no me representa" sobre el plan? | (a) En `profile_events` con `origen` en el payload (R-005.33): un solo ciclo para perfil, plan y cierre, sin escritura nueva de la persona ni política nueva; la tabla se llama "profile" aunque guarde comentarios del plan. (b) Tabla nueva `plan_feedback` con FK al ítem: el vínculo queda en la base; suma una escritura de la persona fuera de la lista de 002, otra política y otra ruta de cierre. (c) Valor nuevo en el enum `profile_event_type`: queda en la base; cambia dos políticas de `profile_events`. | (a). Propuesta (Claude), decide Acker. Con (a), la decisión abierta 6 de 006 queda resuelta por R-005.33 y R-005.43. | Acker |
| 14 | Nombre del proyecto en los textos de la persona | El correo de ayuda y los textos que nombran el producto usan el nombre del proyecto (CONTEXTO §11, pendiente 4, 30 oct). La decisión está abierta en 002, porque el aviso usa el nombre. Esta spec la referencia. | La que se tome en 002. | Los tres (en 002) |
| 15 | ¿Qué pasa con recursos y módulo cuando cambia el plan, y cómo lee la pantalla de la persona la cadena de versiones? | Qué pasa: (a) Siguen al ítem (R-005.38, R-005.39): la persona no pierde lo que ya le sirve; más lógica para resolver la cadena. (b) Una versión nueva del plan retira todos los recursos y el módulo: simple; el coach tiene que volver a pedir y aprobar todo, y la persona pierde recursos sin que nada haya cambiado en su apoyo. Cómo se lee la cadena con (a), porque la persona no lee `plan_items`: (i) 003 agrega a cada ítem de `PlanPersona` su `itemsAnteriores uuid[]`: una sola lectura de `persona_plans`; el jsonb crece un poco por versión. (ii) La aprobación del plan en 003 reescribe `persona_recommendations` y `persona_modules`: la persona lee IDs ya vigentes; la transacción de 003 toca tablas de 005. (iii) 002 agrega una función `security definer` que resuelve la cadena: no cambia tablas; otra función con privilegios que revisar. Las tres opciones también están en la decisión abierta 7 de 003. | (a) con (i). Propuesta (Claude), decide Acker. | Acker |

## Tareas

No aplica: esta spec es de requisitos. Las tareas se escriben cuando pase a "revisada por Acker".

## Verificación

- Los criterios CA-005.1 a CA-005.29 pasan con la prueba indicada.
- Una revisión con la cuenta sintética de persona en el navegador confirma que no aparece ninguna cita, señal, nombre de dominio de función ejecutiva ni dato de verificación (C-09).
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
