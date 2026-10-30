<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# 003 · Plan de acompañamiento

- Estado: Borrador · Versión 3 · 2026-10-29
- Fuentes: F-005 (13:12, 23:31, 32:01, 45:53), F-009, F-017, F-022, F-023, D-015, D-016, D-021, D-031 a D-035 (bloque de actualización del 29 oct, propuesta), CONTEXTO §4, §5 (objetivos del equipo; dimensión 15, ajustes razonables), §6 (flujo del demo, paso 3; Valor; arquitectura), §11 (preguntas para el partner), REGLAS §2.5, §3, §4, §5, §6, §7; constitución C-01 a C-11, C-13 a C-18
- Depende de: 001 (perfil aprobado en `profile_snapshots`), 002 (consentimiento vigente según `private.app_has_consent`, R-002.28; bloqueo al retirar el consentimiento, R-002.44; lista de lo que escribe la persona, R-002.45; aviso de privacidad, R-002.42 y R-002.43; paso `alta` → `evaluacion_inicial` y regla de etapas, R-002.25 y R-002.41; script `scripts/rls-check.ts`, R-002.46), 007 (formato de los casos del eval)

D-015, D-016 y D-021 siguen en estado propuesta en CONTEXTO §9. D-031 a D-035 vienen del bloque de actualización del 29 oct y también son propuestas; decide Acker. Esta spec las usa como regla de trabajo igual que la constitución.

## Problema y para quién

El paso 3 del flujo del demo es el plan de acompañamiento: objetivos, apoyos de función ejecutiva, cómo darle instrucciones a la persona y qué comunicar al líder. El coach lo edita y queda el rastro (CONTEXTO §6). En la reunión, el partner contó que su coaching se enfoca en objetivos y prioridades, y en sensibilizar al equipo sobre el estilo de comunicación de la persona (F-005, 45:53). En Workplace Support, después de la evaluación corta "se trabaja con objetivos y estrategias" (CONTEXTO §4, F-005). En el seguimiento de coaching también se registran los objetivos del equipo, y el perfil cierra con los ajustes razonables (CONTEXTO §5).

Para quién:

- Coach: hoy arma todo con sus notas y su memoria (F-005, 23:31). El plan sale del perfil que ya aprobó, con la evidencia a la vista, y el coach corrige y aprueba. Eso apunta al costo en horas que, según el partner, frena sus ventas (F-005, 32:01; CONTEXTO §6, Valor).
- Specialisterne: cada punto del plan deja escrito de qué evidencia del perfil sale y de qué ficha verificada, para que otro coach pueda revisarlo (CONTEXTO §6, Valor, idea de Acker en F-009).
- Persona: ve sus objetivos y los apoyos que puede pedir en lenguaje claro (CONTEXTO §6, Valor y paso 5). Lo que se le comunicaría al líder no lo ve ni sale de la app.

## Alcance

Entra:

- Propuesta de plan por la IA a partir del último perfil aprobado y de las fichas verificadas de `knowledge_cards` (corpus 1).
- Validación con código de fichas y evidencia citadas.
- Borrador editable por el coach: editar texto, cambiar o quitar la ficha, quitar citas, quitar ítems y agregar ítems propios.
- Objetivos del equipo y ajustes razonables como tipos de ítem del plan.
- Aprobación explícita, versiones del plan, liga de cada ítem con su equivalente de la versión anterior (`origen_item_id`) y rastro de qué propuso la IA y qué cambió el coach.
- Copia del plan aprobado para la persona en `app.persona_plans`, sin citas, fichas, dominios de función ejecutiva ni la parte del líder.
- Aviso al coach cuando el perfil cambió después de aprobar el plan.
- La tabla completa de transiciones de etapa del acompañamiento y las tareas de las transiciones `evaluacion_inicial` → `perfil`, `perfil` → `plan` y `plan` → `seguimiento`.
- Prompt fechado nuevo y casos de plan en el eval, con el formato de 007.

Lo que define esta spec lo usan 004 (ítems aprobados y `origen_item_id` para el avance), 005 (`persona_plans` con `itemsAnteriores` y el "esto no me representa" sobre el plan) y 006 (la etapa `cierre` en la tabla de transiciones).

**Fuera de alcance:**

- Enviar algo a la empresa o al líder. "Qué comunicar al líder" y los ajustes razonables son borrador interno (C-11). Cualquier salida hacia la empresa va en 006 o en "What's next".
- Avance de los ítems del plan en sesiones de seguimiento: 004.
- Recursos del catálogo (corpus 2) y módulo corto para la persona: 005.
- La sección "Tu plan" de `/persona`, con sus textos: 005 es su única dueña y la arma con `persona_plans` (R-005.6). Esta spec solo escribe la copia para la persona.
- Botón "esto no me representa" sobre el plan aprobado: 005 es dueña de su ciclo de vida y de su modelo de datos. Esta spec no agrega tablas ni columnas para eso.
- Lo que escribe la persona en la base: lo define 002 en una sola lista (R-002.45). En las tablas de esta spec la persona no escribe nada (R-003.52).
- La transición a `cierre`: la hace la acción explícita del coach que define 006 (R-006.1), con `private.app_iniciar_cierre`, y solo desde `seguimiento`. Esta spec solo la anota en la tabla de transiciones. Lo que se puede hacer con el plan en etapa `cierre` también lo define 006, en el requisito que nombra cada ruta y política de INSERT que suma `private.app_engagement_abierto`. Ahí entran las de esta spec que 006 bloquee: la propuesta, la edición y la decisión del plan (tareas 15 a 17) y las políticas de INSERT de `plans`, `plan_items` y `persona_plans`.
- Escribir las fichas reales: es la decisión abierta 1. Esta spec define cómo se usan, no su contenido.

## Requisitos

R-003.49 a R-003.60 se agregaron en la versión 2 y R-003.61 en la versión 3. Van al final de la tabla de su sección, por eso no siguen el orden de las secciones.

### Propuesta de la IA

| ID | Requisito | Fuente |
|---|---|---|
| R-003.1 | Cuando el coach pide una propuesta de plan y el acompañamiento no tiene ningún `profile_snapshot`, el sistema debe responder 409, no llamar al modelo y no guardar nada. | CONTEXTO §6 (paso 3 va después del perfil aprobado); C-04 |
| R-003.2 | Cuando el acompañamiento no tiene consentimiento vigente (002), es decir cuando `private.app_has_consent(engagement_id)` devuelve falso porque nunca se dio o el último evento es `retirado`, el sistema debe responder 409, no llamar al modelo y no guardar nada. La política de INSERT de `plans` repite la misma condición. Ninguna parte de esta spec lee `engagements.consentimiento_en`, que 002 retira (R-002.33). | C-10, D-035 (propuesta, bloque del 29 oct); R-002.28 y R-002.31 de 002 |
| R-003.3 | Cuando ya existe un plan en `borrador` para el acompañamiento, el sistema debe responder 409 y no llamar al modelo. Solo hay un borrador a la vez. | Interpretación del equipo |
| R-003.4 | El modelo debe recibir solo: nombre de pila, tipo de acompañamiento, las dimensiones del último snapshot (resumen, tipo, dominios de función ejecutiva) con cada cita identificada por un ID corto (`E-01`, `E-02`…), y las fichas verificadas. No recibe la verificación del diagnóstico, la cédula, las notas completas ni las señales activas. | C-01, C-02, C-03, D-021; señales fuera: interpretación del equipo (decisión abierta 5) |
| R-003.5 | Solo las fichas con `verificada = true` deben entrar al prompt. Las tres fichas de ejemplo del seed (`KC-001` a `KC-003`, `verificada = false`) no entran. Si no hay ninguna verificada, la llamada sigue y ningún ítem puede citar ficha. | C-06, REGLAS §5 |
| R-003.6 | Las fichas verificadas deben ir en el system prompt, marcado para el cache de Anthropic, y lo propio del acompañamiento en el mensaje de usuario. | Mismo patrón que `lib/ai/propose-profile-update.ts` (`cacheControl` en las instrucciones); fichas en el prompt en vez de búsqueda: interpretación del equipo |
| R-003.7 | La llamada debe usar `generateText` con `Output.object` y el esquema estricto `PlanProposal` de `lib/plan/schema.ts`. Si la respuesta no cumple el esquema, no se guarda nada y se audita el error. | D-031 (propuesta), C-15 |
| R-003.8 | Cada ítem debe tener uno de los seis tipos de `plan_item_type`: `objetivo`, `objetivo_equipo`, `apoyo_fe`, `ajuste_razonable`, `instruccion`, `comunicacion_lider`. `objetivo_equipo` y `ajuste_razonable` son valores nuevos del enum (Propuesta (Claude), decide Acker; decisión abierta 10). | CONTEXTO §6 (paso 3); CONTEXTO §5 (objetivos del equipo; dimensión 15); `lib/db/schema.ts` |
| R-003.9 | El prompt debe pedir objetivos ligados al trabajo y sus prioridades, e ítems de `comunicacion_lider` sobre el estilo de comunicación de la persona y cómo puede ayudar el equipo. | F-005 (45:53) |
| R-003.10 | El prompt debe prohibir objetivos o apoyos que busquen que la persona hable más, participe más en reuniones o sea más expresiva cuando el perfil solo describe que es callada o reservada. El eval lo revisa como falla crítica (tarea 21). | C-13, F-005 (13:12); prueba de sesgo de CONTEXTO §6 (D-016, propuesta) |
| R-003.11 | Los ítems de tipo `objetivo` y `apoyo_fe` deben traer `textoPersona`: el texto que verá la persona, en segunda persona y lenguaje literal. Los de `objetivo_equipo`, `ajuste_razonable`, `instruccion` y `comunicacion_lider` no lo traen mientras la decisión abierta 4 no cambie. | CONTEXTO §6 (paso 5); R-005.6 de 005 espera un texto para la persona por apoyo; segunda persona: interpretación del equipo |
| R-003.12 | Cada llamada debe quedar en `audit_log` con acción `propose_plan`, modelo, versión del prompt, tokens, latencia y `ok`, también cuando falla. Sin datos personales en el error. El nombre de la acción sigue el formato de la que ya existe, `propose_profile_update`. | C-17 |
| R-003.49 | El prompt debe pedir ítems `ajuste_razonable` a partir de lo que el perfil dice en la dimensión "Ajustes razonables" y en el ambiente de trabajo, y solo debe proponer `objetivo_equipo` cuando el perfil trae evidencia de un objetivo del equipo. Si no hay esa evidencia, no propone ninguno; el coach puede agregarlo a mano. Los dos tipos siguen la regla de evidencia de R-003.13. | CONTEXTO §5 (F-005, 45:53); cuándo proponer `objetivo_equipo`: interpretación del equipo |

### Validación con código

| ID | Requisito | Fuente |
|---|---|---|
| R-003.13 | Cada ítem propuesto por la IA debe citar al menos un ID de evidencia. Un ID que no está en la lista que recibió el modelo se quita y se anota en `descartados` con motivo `evidencia_no_existe`. Un ítem que se queda sin evidencia se quita completo. | C-05, D-034 (propuesta) |
| R-003.14 | Cada ID de evidencia válido se convierte con código en `{ cita, sessionId }` tomados del snapshot. El modelo nunca escribe el texto de la cita ni el `sessionId`. | C-05, D-034 (propuesta); interpretación del equipo (decisión abierta 6) |
| R-003.15 | Si un ítem cita una ficha que no estaba en las fichas enviadas, el ítem se quita completo y se anota en `descartados` con motivo `ficha_no_existe`. | C-06 |
| R-003.16 | `descripcion` y `textoPersona` pasan por `buscarTerminos` de `lib/profile/validate.ts`. Cada término encontrado es una bandera `termino_no_permitido`. | C-01, C-08 |
| R-003.17 | `textoPersona` se revisa además contra las etiquetas de `DOMINIOS_FE`, las etiquetas de `SENALES` (como en R-005.18) y la frase "función ejecutiva". Cada coincidencia es una bandera `termino_interno`. | C-09 |
| R-003.18 | Si la `descripcion` de un ítem `comunicacion_lider` contiene, normalizada, una cita completa del snapshot, se marca con bandera `cita_en_texto_lider`. | C-09; interpretación del equipo (las notas son privadas del coach) |
| R-003.19 | El ítem que sobrevive guarda su `dominio_fe` solo si es uno de los IDs de `DOMINIOS_FE`; si no, queda nulo. | F-017; `lib/profile/schema.ts` |
| R-003.46 | Si `textoPersona` contiene, normalizada con `normalizar`, una cita completa del snapshot, se marca con bandera `cita_en_texto_persona`. | C-09 (la persona nunca ve las citas) |
| R-003.47 | `descripcion` y `textoPersona` se revisan además contra `TERMINOS_CONDICION`, una lista de nombres de condiciones que `buscarTerminos` no cubre (por ejemplo "autismo" o "autista" sin calificativo). Cada coincidencia es una bandera `mencion_condicion`. La lista final la decide Acker (decisión abierta 9). | C-01, C-11; interpretación del equipo: `buscarTerminos` solo marca "autismo" con leve, moderado o severo |

### Borrador y edición del coach

| ID | Requisito | Fuente |
|---|---|---|
| R-003.20 | Al guardar la propuesta, el sistema debe crear un plan en `borrador` con la propuesta limpia, `descartados`, `banderas` y los IDs de fichas enviadas en `propuesta_ia`, más `profile_snapshot_id`, `prompt_version`, `model` y `created_by`. `propuesta_ia` no se puede cambiar después. | C-04, C-18, REGLAS §3 |
| R-003.21 | Cada ítem del borrador nace con `origen = 'ia'` y `propuesta_ref` igual a su índice en `propuesta_ia`. | REGLAS §3 (rastro) |
| R-003.22 | Mientras el plan está en `borrador`, el coach puede editar `descripcion` y `textoPersona`, cambiar la ficha por otra verificada o quitarla, quitar citas, cambiar el orden, quitar ítems, agregar ítems propios y elegir a qué punto del plan vigente sigue cada ítem (R-003.50). Cada cambio se guarda en el momento. | CONTEXTO §6 (paso 3, "el coach lo edita"); alcance de la edición: decisión abierta 2 |
| R-003.23 | Un ítem de la IA que el coach cambia pasa a `origen = 'ia_editado'` con `editado_por` y `editado_en`. Un ítem que agrega el coach nace con `origen = 'coach'` y `propuesta_ref` nulo. | REGLAS §3 |
| R-003.24 | El servidor debe rechazar con 400 una ficha que no existe o no está verificada, y una cita que no está en el snapshot base del plan. El coach no escribe citas a mano. | C-05, C-06 |
| R-003.25 | Un ítem escrito por el coach puede no tener evidencia. Se muestra como "Escrito por ti". Si el coach quita todas las citas de un ítem de la IA, el ítem se queda, pasa a `ia_editado` y se muestra con "Sin evidencia". | Interpretación del equipo |
| R-003.26 | El tipo de un ítem no se cambia. Para cambiarlo, el coach quita el ítem y agrega otro. | Interpretación del equipo |
| R-003.27 | Las banderas se recalculan con código cada vez que el coach guarda un texto. | C-08, C-09 |

### Aprobación, versiones y rastro

| ID | Requisito | Fuente |
|---|---|---|
| R-003.28 | El plan se aprueba solo con el botón "Aprobar plan" y su confirmación. La aprobación pasa en una transacción con RLS: bloquea el plan, revisa que siga en `borrador`, vuelve a validar fichas, citas y `origen_item_id`, asigna `version` = última versión aprobada + 1, pone `status = 'aprobado'`, `approved_by`, `approved_at` y escribe la copia para la persona. | C-04, C-14; patrón de `app/api/profile-events/[id]/decision/route.ts` |
| R-003.29 | No se aprueba un plan sin al menos un ítem `objetivo`. Un `objetivo_equipo` no cuenta para esta regla. | F-005 (45:53); interpretación del equipo |
| R-003.30 | No se aprueba un plan con banderas `termino_no_permitido` o `mencion_condicion` en cualquier ítem, ni con banderas `termino_interno` o `cita_en_texto_persona` en un `textoPersona`. El servidor responde 400 con la ruta del ítem. Solo `cita_en_texto_lider` avisa sin bloquear, porque ese texto no lo ve la persona ni sale de la app. | C-01, C-08, C-09 |
| R-003.31 | Si dos solicitudes aprueban el mismo borrador al mismo tiempo, el bloqueo `for update` hace esperar a la segunda, que ve el plan ya aprobado y responde 409. Si aun así dos planes llegan a guardar la misma versión, la restricción única `plans_engagement_version` rechaza el segundo y el sistema responde 409. | Patrón de la ruta de decisión del perfil |
| R-003.32 | Un plan aprobado o descartado no se edita: ni el plan ni sus ítems aceptan UPDATE, INSERT o DELETE. Para cambiarlo, el coach pide una propuesta nueva, que crea otra versión. | C-04; interpretación del equipo a partir de REGLAS §3 y §4 |
| R-003.33 | El plan vigente es el aprobado con la versión más alta. Las versiones anteriores se conservan y el coach las puede abrir. | REGLAS §3, §4 |
| R-003.34 | El coach puede descartar un borrador. Pasa a `status = 'descartado'`, se queda en el historial y no recibe versión. | REGLAS §3 ("nada se descarta sin registro") |
| R-003.35 | Por cada versión, el coach debe poder ver: fecha, quién aprobó, versión del perfil en que se basó, versión del prompt, modelo, y por ítem si es de la IA sin cambios, editado (con el texto original de la IA) o escrito por el coach, a qué punto de la versión anterior sigue, además de los ítems de la IA que el coach quitó. Todo se calcula desde `propuesta_ia` y `plan_items`. | CONTEXTO §6 (paso 3, "queda el rastro"); REGLAS §3 |
| R-003.36 | Cuando existe un snapshot más nuevo que el del plan vigente, la pantalla del coach debe mostrar un aviso con las dos versiones y el botón "Pedir propuesta nueva". El plan vigente sigue visible para la persona hasta que se apruebe otro. Nada se regenera solo. Cerrar una señal en 004 no crea snapshot (el estado de las señales vive aparte, según 004), así que no dispara este aviso. | C-04, C-14 (sin notificaciones sorpresa); decisión abierta 3 |
| R-003.50 | Cada ítem de un plan guarda `origen_item_id`: el ítem equivalente de la versión aprobada anterior, o nulo si es un punto nuevo. En la primera versión todos van nulos. Así el avance (004), las recomendaciones y el módulo (005) siguen al mismo punto a través de las versiones. Cómo se llena es la decisión abierta 11; la propuesta es que lo elige el coach en el borrador. Propuesta (Claude), decide Acker. | Interpretación del equipo |
| R-003.51 | El servidor debe rechazar con 400 un `origen_item_id` que no pertenece al plan vigente del mismo acompañamiento o que es de otro tipo. Dos ítems del mismo plan no pueden seguir al mismo ítem anterior (índice único parcial). La aprobación vuelve a revisarlo. | REGLAS §3 (trazabilidad); interpretación del equipo |

### Persona y empresa

| ID | Requisito | Fuente |
|---|---|---|
| R-003.37 | Al aprobar, el sistema debe escribir en `app.persona_plans`, en la misma transacción, una copia con solo los ítems `objetivo` y `apoyo_fe` que tienen `textoPersona`, y de cada uno solo `textoPersona`, tipo, orden, el ID del ítem y la cadena de IDs de sus versiones anteriores (R-003.61). Sin citas, fichas, dominios ni descripción del coach. `persona_plans` es la única tabla del plan para la persona: 005 la usa y no existe `persona_plan_items` (Propuesta (Claude), decide Acker; decisión abierta 7). | C-09; mismo patrón que `persona_profiles` (D-033, propuesta); qué tipos ve: decisión abierta 4 |
| R-003.48 | Un ítem `objetivo` o `apoyo_fe` sin `textoPersona` se puede aprobar, pero no pasa a `persona_plans`. En el borrador, el coach ve un aviso en ese ítem. | R-005.6 de 005 (un apoyo sin texto para la persona no aparece) |
| R-003.38 | La persona no debe poder leer `app.plans` ni `app.plan_items`. Se quitan las políticas `plans_select_persona_approved` y `plan_items_select_persona_approved`, con lo que se cierra el choque con C-09 del hallazgo de la sección Datos. | C-09, C-16, D-032 (propuesta) |
| R-003.39 | La persona solo lee su plan desde `persona_plans`, y solo la versión vigente aparece en su pantalla. | C-09 |
| R-003.40 | Los ítems `comunicacion_lider` y `ajuste_razonable` no salen de la app: no hay ruta, exportación ni vista para la empresa o el líder en esta etapa. La pantalla del coach los marca como borrador interno. | C-11, D-015 |
| R-003.41 | `knowledge_cards` solo la puede leer el coach. Se cambia la política `knowledge_cards_select_all` por una que exige rol `coach`. | C-09 (la ficha lleva `dominio_fe`); interpretación del equipo |
| R-003.52 | La persona no escribe en ninguna tabla de esta spec: la base le rechaza INSERT, UPDATE y DELETE sobre `plans`, `plan_items`, `persona_plans` y `knowledge_cards`. Lo que la persona sí escribe está en la lista de 002 (R-002.45); el "esto no me representa" sobre el plan lo suma 005. | C-04, C-16; R-002.45 de 002 |
| R-003.61 | Cada ítem de `PlanPersona` lleva `itemsAnteriores` (uuid[]): los IDs de sus equivalentes en las versiones aprobadas anteriores, del más reciente al más viejo. La aprobación (R-003.28) arma la lista con código en la misma transacción, siguiendo `plan_items.origen_item_id` hacia atrás hasta un ítem con `origen_item_id` nulo. La cadena incluye ítems que no llegaron a `persona_plans` por no tener `textoPersona`. Un punto nuevo lleva la lista vacía. Con este campo 005 sabe si una recomendación, un paso del módulo o un comentario ligados a un ítem de otra versión siguen vigentes (R-005.35, R-005.38, R-005.39), sin que la persona lea `plan_items` (R-003.38). Propuesta (Claude), decide Acker; alternativas en la decisión abierta 7. | C-09, C-16; interpretación del equipo |

### Fichas, prompt y eval

| ID | Requisito | Fuente |
|---|---|---|
| R-003.42 | Una ficha con `verificada = true` no cambia de contenido. Si hay que corregirla, se crea otra con ID nuevo y la anterior pasa a `verificada = false` para que deje de enviarse. Así un plan viejo sigue apuntando a lo que se usó. Hoy `authenticated` no tiene UPDATE sobre `knowledge_cards` (0002), así que el cambio solo se hace por seed o migración. | Interpretación del equipo a partir de REGLAS §3 (trazabilidad) |
| R-003.43 | El prompt del plan vive en `prompts/2026-10-29_plan-acompanamiento.md`, con el formato de nombre `AAAA-MM-DD_tema-en-espanol` (la fecha cambia a la del día en que se escriba), con su `PROMPT_VERSION_PLAN` y el mismo formato de encabezado y `<!-- PROMPT -->` que el prompt de perfil. El prompt de perfil `2026-10-29_profile-update` conserva su nombre porque ya hay eventos guardados con esa versión. | C-18, REGLAS §3, §7 |
| R-003.44 | Los casos de plan del eval siguen el formato que define 007: viven en `eval/cases/`, en formato 2, con un `perfilAprobado` fijo y fichas sintéticas de prueba propias del caso, sin leer la base. En el eval, la evidencia del plan se valida por ID contra el `perfilAprobado` del caso, igual que R-003.13 y R-003.14, no contra la nota (007 ajusta R-007.28). 007 es dueña del formato y de qué cuenta como falla. | C-07; R-007.25 de 007 |
| R-003.45 | El eval debe tener pruebas sin red de la validación del plan, de la vista para la persona y del cálculo de origen. | REGLAS §3; patrón de `eval/compare.ts` |

### Consentimiento retirado y aviso de privacidad

| ID | Requisito | Fuente |
|---|---|---|
| R-003.53 | `app.plans`, `app.plan_items` y `app.persona_plans` guardan datos derivados de las notas y entran en el bloqueo al retirar el consentimiento que define 002 (R-002.30, R-002.44). Con la opción propuesta en 002: nada se borra, y las políticas de lectura y de escritura de las tres tablas exigen consentimiento vigente (002), para el coach y para la persona. `knowledge_cards` no entra porque no guarda datos de ninguna persona. | C-10; R-002.44 de 002 |
| R-003.54 | Esta spec manda al modelo datos nuevos (las dimensiones del perfil aprobado con sus citas, para armar el plan). Sube la versión del aviso (002) antes de activarse: la ruta de propuesta del plan no se habilita mientras el aviso vigente no diga qué datos llegan al modelo en esta etapa (R-003.4). | R-002.42 y R-002.43 de 002 |

### Etapas del acompañamiento

| ID | Requisito | Fuente |
|---|---|---|
| R-003.55 | Esta spec es dueña de la tabla de transiciones de etapa (sección Datos) y de sus tareas. Cada transición la hace un trigger o una función `security definer` del esquema `private`. Esta spec no agrega ninguna política de UPDATE sobre `app.engagements`, y `authenticated` sigue sin permiso de escribir `stage` (R-002.41). Propuesta (Claude), decide Acker. | R-002.41 de 002; hueco H-7 de 001; interpretación del equipo |
| R-003.56 | Cuando se crea el snapshot versión 1 del perfil (el coach aprobó el primer perfil, 001), la etapa pasa de `evaluacion_inicial` a `perfil` en la misma transacción. | Interpretación del equipo; Propuesta (Claude), decide Acker |
| R-003.57 | Cuando se guarda el primer plan del acompañamiento, en `borrador`, la etapa pasa de `perfil` a `plan` en la misma transacción. | Interpretación del equipo; Propuesta (Claude), decide Acker (decisión abierta 12) |
| R-003.58 | Cuando el primer plan del acompañamiento pasa a `aprobado`, la etapa pasa de `plan` a `seguimiento` en la misma transacción. 004 abre las sesiones de seguimiento con esa etapa (R-004.1). | Interpretación del equipo; Propuesta (Claude), decide Acker |
| R-003.59 | El paso a `cierre` lo hace la acción explícita del coach que define 006, con la función `security definer` `private.app_iniciar_cierre` de 006, y solo desde `seguimiento` (R-006.1). Esta spec no la implementa. | 006; Propuesta (Claude), decide Acker |
| R-003.60 | Las transiciones solo avanzan. Cada una cambia la etapa solo si la etapa actual es la de origen de esa transición; si no, no hace nada. Descartar un borrador, crear otro snapshot o aprobar otra versión del plan no regresa ni adelanta la etapa. Retirar el consentimiento no cambia la etapa. | Interpretación del equipo |

## Criterios de aceptación

| ID | Dado / Cuando / Entonces | Cubre | Cómo se prueba |
|---|---|---|---|
| CA-003.1 | Dado un acompañamiento sin snapshots, cuando el coach pide propuesta, entonces responde 409, no hay fila nueva en `plans` y no hay fila nueva en `audit_log`. | R-003.1 | navegador + consulta a la base |
| CA-003.2 | Dado un acompañamiento con perfil aprobado y sin consentimiento vigente (sin eventos o con `retirado` como último evento), cuando el coach pide propuesta, entonces responde 409, no hay fila nueva en `plans` ni en `audit_log`. Dado el mismo acompañamiento, cuando la sesión del coach intenta un INSERT directo en `app.plans`, entonces la política lo rechaza. | R-003.2 | navegador + consulta a la base; RLS |
| CA-003.3 | Dado un borrador abierto, cuando el coach pide otra propuesta, entonces responde 409 con "Ya hay un borrador de plan. Apruébalo o descártalo antes de pedir otro." y no hay fila nueva en `audit_log`. | R-003.3 | navegador + consulta a la base |
| CA-003.4 | Dadas las fichas del seed con `verificada = false`, cuando se arma el system prompt, entonces no aparece ningún `KC-00x`. Dada una ficha verificada, entonces aparece con su ID, título, tipo, dominio y contenido. | R-003.5, R-003.6 | prueba offline |
| CA-003.5 | Dado el mensaje de usuario armado para un perfil sintético, cuando se revisa, entonces no contiene `cedula`, `diagnostico_verificado`, la nota completa ni `senalesActivas`, y cada cita aparece con un ID `E-nn`. | R-003.4 | prueba offline |
| CA-003.6 | Dada una propuesta con un ítem que cita `E-99` (inexistente) y `E-01` (existente), cuando corre `sanitizePlan`, entonces queda `E-01` convertido a `{ cita, sessionId }` del snapshot y `E-99` está en `descartados`. | R-003.13, R-003.14 | prueba offline |
| CA-003.7 | Dada una propuesta con un ítem que cita `KC-999` y otro con `dominioFE: "atencion"`, cuando corre `sanitizePlan`, entonces el primer ítem no está en el resultado y `descartados` tiene `ficha_no_existe`, y el segundo queda con `dominioFE` nulo. | R-003.15, R-003.19 | prueba offline |
| CA-003.8 | Dado un `textoPersona` que dice "Trabaja tu memoria de trabajo" y una `descripcion` que dice "nivel de apoyo", cuando corre `sanitizePlan`, entonces hay una bandera `termino_interno` y una `termino_no_permitido`. | R-003.16, R-003.17 | prueba offline |
| CA-003.9 | Dado un ítem `comunicacion_lider` que copia una cita completa del snapshot y un ítem `apoyo_fe` cuyo `textoPersona` copia otra, cuando corre `sanitizePlan`, entonces hay una bandera `cita_en_texto_lider` y una `cita_en_texto_persona`. | R-003.18, R-003.46 | prueba offline |
| CA-003.10 | Dada una propuesta guardada, cuando el coach intenta cambiar `propuesta_ia`, `profile_snapshot_id` o `prompt_version` con su sesión, entonces Postgres lo rechaza por permisos de columna. | R-003.20 | RLS |
| CA-003.11 | Dado un borrador, cuando el coach edita el texto de un ítem de la IA, entonces el ítem queda con `origen = 'ia_editado'`, `editado_por` del coach y el texto original sigue en `propuesta_ia`. | R-003.22, R-003.23 | navegador + consulta |
| CA-003.12 | Dado un borrador, cuando el coach manda una cita que no está en el snapshot base o una ficha con `verificada = false`, entonces la ruta responde 400 y el ítem no cambia. | R-003.24 | prueba de la ruta / navegador |
| CA-003.13 | Dado un borrador sin ítems `objetivo`, aunque tenga un `objetivo_equipo`, cuando el coach aprueba, entonces responde 400 con "El plan necesita al menos un objetivo". | R-003.29 | navegador |
| CA-003.14 | Dado un borrador con un ítem que dice "déficit", cuando el coach aprueba, entonces responde 400 con la ruta del ítem y el plan sigue en borrador. Lo mismo pasa con un `textoPersona` que dice "memoria de trabajo". Dado un borrador cuya única bandera es `cita_en_texto_lider`, cuando el coach aprueba, entonces se aprueba. | R-003.30 | navegador |
| CA-003.15 | Dado un plan aprobado o descartado, cuando el coach intenta editar, agregar o quitar un ítem con su sesión, entonces RLS lo rechaza (0 filas o error de política). | R-003.32 | RLS |
| CA-003.16 | Dadas dos solicitudes que aprueban el mismo borrador al mismo tiempo, cuando terminan, entonces el plan tiene una sola versión y una de las dos respondió 409. Dado un plan aprobado con versión n, cuando se inserta por SQL otro plan del mismo acompañamiento con versión n, entonces Postgres lo rechaza por `plans_engagement_version`. | R-003.31 | prueba de la ruta; consulta SQL |
| CA-003.17 | Dado un plan aprobado con un ítem de cada tipo y un `apoyo_fe` sin `textoPersona`, cuando la persona carga su pantalla, entonces ve solo los `textoPersona` de `objetivo` y `apoyo_fe`, sin el apoyo que no tiene texto, sin citas, IDs de ficha, dominios, objetivos del equipo, ajustes razonables ni ítems del líder. | R-003.37, R-003.39, R-003.40, R-003.48 | navegador (pantalla de 005) |
| CA-003.18 | Dada la sesión de la persona, cuando consulta `app.plans`, `app.plan_items` o `app.knowledge_cards` con `withRls`, entonces recibe 0 filas. Cuando consulta `app.persona_plans`, recibe solo las de su acompañamiento. | R-003.38, R-003.39, R-003.41 | RLS |
| CA-003.19 | Dado un plan vigente basado en el perfil versión 2 y un snapshot versión 3, cuando el coach abre el acompañamiento, entonces ve el aviso con las dos versiones y el botón "Pedir propuesta nueva". La persona sigue viendo el plan anterior. | R-003.36 | navegador |
| CA-003.20 | Dado un plan con versión 2 aprobada, cuando el coach abre el historial, entonces ve la versión 1 y la 2 con quién aprobó, versión del perfil, prompt y modelo, y por ítem su origen, el texto original de la IA en los editados, el punto de la versión 1 al que sigue y los ítems quitados. | R-003.33, R-003.35 | navegador |
| CA-003.21 | Dado un borrador descartado, cuando el coach abre el historial, entonces aparece como "Descartado" sin número de versión. | R-003.34 | navegador |
| CA-003.22 | Dada una llamada al modelo que falla o una respuesta que no cumple `PlanProposal`, cuando se revisa la base, entonces no hay fila nueva en `plans` y hay una fila `propose_plan` en `audit_log` con `ok = false` y un error que no contiene texto del perfil ni de las notas. | R-003.7, R-003.12 | prueba de la ruta / consulta |
| CA-003.23 | Dados los casos de plan en `eval/cases/` (formato 2 de 007), cuando corre `npm run eval`, entonces cada caso imprime su fila y el proceso sale con código 1 si hay una falla crítica. Cuando corre `npm run eval -- --offline`, entonces pasan las pruebas de `sanitizePlan`, `vistaPersonaPlan` y `rastroPlan` sin llamar al modelo. | R-003.10, R-003.44, R-003.45 | eval |
| CA-003.24 | Dado un borrador, cuando el coach agrega un ítem propio sin evidencia, entonces el ítem queda con `origen = 'coach'`, `propuesta_ref` nulo y la etiqueta "Escrito por ti". Cuando quita todas las citas de un ítem de la IA, entonces el ítem sigue en el borrador con `origen = 'ia_editado'` y "Sin evidencia". | R-003.23, R-003.25 | navegador + consulta |
| CA-003.25 | Dado un borrador, cuando la sesión del coach intenta un UPDATE de `plan_items.tipo` o de `plan_items.propuesta_ref`, entonces Postgres lo rechaza por permisos de columna. Cuando la ruta de edición recibe un campo `tipo`, entonces responde 400. | R-003.26 | RLS; prueba de la ruta |
| CA-003.26 | Dado un ítem con bandera `termino_no_permitido`, cuando el coach guarda un texto corregido sin ese término, entonces la bandera desaparece de la pantalla y de la respuesta de la ruta. | R-003.27 | navegador |
| CA-003.27 | Dado un `textoPersona` o una `descripcion` que dice "es autista", cuando corre `sanitizePlan`, entonces hay una bandera `mencion_condicion`, y el servidor rechaza aprobar ese plan con 400. | R-003.47, R-003.30 | prueba offline; navegador |
| CA-003.28 | Dada la sesión del coach, cuando intenta un UPDATE en `app.knowledge_cards`, entonces Postgres lo rechaza por permisos. | R-003.42 | RLS |
| CA-003.29 | Dado el repositorio, cuando se revisa `prompts/`, entonces existe el archivo del prompt del plan con la línea `<!-- PROMPT -->`, su nombre sigue el formato `AAAA-MM-DD_tema-en-espanol`, y su nombre sin ".md" es igual a `PROMPT_VERSION_PLAN` y al `prompt_version` del plan guardado. | R-003.43 | revisión del repo + consulta |
| CA-003.30 | Dada una propuesta con un ítem `objetivo_equipo` y otro `ajuste_razonable` con evidencia válida, cuando corre `sanitizePlan`, entonces los dos sobreviven sin `textoPersona`. Dado el mismo ítem `ajuste_razonable` con `textoPersona`, entonces `descartados` tiene `textoPersona_en_tipo_interno`. | R-003.8, R-003.11, R-003.49 | prueba offline |
| CA-003.31 | Dado un plan versión 1 aprobado con un objetivo X y un borrador nuevo, cuando el coach liga un objetivo del borrador a X y aprueba, entonces el ítem de la versión 2 tiene `origen_item_id` igual al ID de X. Cuando intenta ligarlo a un ítem de otro tipo, de otro acompañamiento o ya ligado por otro ítem del borrador, entonces la ruta responde 400. | R-003.50, R-003.51 | prueba de la ruta / navegador + consulta |
| CA-003.32 | Dado un acompañamiento con plan aprobado y el consentimiento retirado, con la opción propuesta de 002, cuando la sesión del coach consulta `plans`, `plan_items` o `persona_plans`, y cuando la sesión de la persona consulta `persona_plans`, entonces reciben 0 filas. Consultado como owner, ninguna fila se borró. | R-003.53 | RLS + consulta SQL como owner |
| CA-003.33 | Dado el aviso de privacidad vigente, cuando se revisa antes de habilitar la ruta de propuesta del plan, entonces su versión es nueva respecto de la que no menciona el plan y dice qué datos de esta etapa llegan al modelo. | R-003.54 | revisión del texto en `legal/` |
| CA-003.34 | Dado un acompañamiento en `evaluacion_inicial`, cuando el coach aprueba el primer perfil, entonces la etapa es `perfil`; cuando pide la primera propuesta de plan y se guarda el borrador, entonces es `plan`; cuando aprueba ese plan, entonces es `seguimiento`. Dado un acompañamiento en `seguimiento`, cuando se crea otro snapshot, se descarta un borrador o se aprueba la versión 2 del plan, entonces la etapa sigue en `seguimiento`. | R-003.56, R-003.57, R-003.58, R-003.60 | navegador + consulta SQL |
| CA-003.35 | Dada la sesión del coach o la de la persona, cuando intenta un UPDATE de `app.engagements.stage`, entonces la base lo rechaza. | R-003.55 | RLS |
| CA-003.36 | Dada la sesión de la persona, cuando intenta un INSERT, UPDATE o DELETE en `app.plans`, `app.plan_items`, `app.persona_plans` o `app.knowledge_cards`, entonces la base lo rechaza. | R-003.52 | RLS |
| CA-003.37 | Dado un objetivo X en la versión 1, su equivalente Y en la versión 2 (`origen_item_id = X`) y un borrador con Z ligado a Y, cuando el coach aprueba la versión 3, entonces el ítem Z en `persona_plans.contenido` tiene `itemsAnteriores = [Y, X]`, y un punto nuevo de la versión 3 tiene `itemsAnteriores = []`. Dado un apoyo de la versión 1 sin `textoPersona` ligado desde un apoyo con texto de la versión 2, entonces el ítem de la versión 2 lleva el ID del de la versión 1. | R-003.61 | prueba offline + consulta a la base |

## Datos

Cambios contra `lib/db/schema.ts`. Se generan con `drizzle-kit generate` y los permisos y triggers van en una migración SQL escrita a mano, como `drizzle/0002_permisos.sql`. Hoy `scripts/seed.sql` no inserta filas en `plans` ni en `plan_items`, así que las columnas nuevas `not null` no necesitan valor para datos viejos.

Orden de migraciones: las de 002 van antes que las de esta spec, y las de esta spec antes que las de 004 y 005. Las de 006 van al final.

### Hallazgo en el código actual

`plans_select_persona_approved` y `plan_items_select_persona_approved` dejan a la persona leer el plan aprobado completo con `withRls`, incluidas `evidencia` (citas de las notas), `dominio_fe`, `knowledge_card_id` y los ítems `comunicacion_lider`. Eso rompe C-09. La spec 005 encontró lo mismo (005, Datos, punto 1). Se corrige antes de construir cualquier pantalla del plan quitando las dos políticas (R-003.38); la persona solo lee `persona_plans`.

### Enums

- `plan_status`: agregar `descartado` (quedan `borrador`, `aprobado`, `descartado`).
- `plan_item_type`: agregar `objetivo_equipo` y `ajuste_razonable` (quedan `objetivo`, `objetivo_equipo`, `apoyo_fe`, `ajuste_razonable`, `instruccion`, `comunicacion_lider`). Propuesta (Claude), decide Acker (decisión abierta 10). Se agregan con `alter type ... add value`; los valores existentes no cambian.
- Nuevo `plan_item_origen`: `ia`, `ia_editado`, `coach`.

### `app.plans` (una fila por versión o borrador)

| Columna | Tipo | Nota |
|---|---|---|
| `profile_snapshot_id` | uuid, not null, FK `profile_snapshots` | Perfil en que se basó. |
| `version` | integer, nulo | Se asigna al aprobar. Único con `engagement_id`. |
| `propuesta_ia` | jsonb `PayloadPlanIA`, nulo | Nulo solo si algún día el coach arma un plan sin IA. Sin permiso de UPDATE. |
| `prompt_version` | text | Sin permiso de UPDATE. |
| `model` | text | Sin permiso de UPDATE. |
| `created_by` | uuid, not null, FK `users` | |

`titulo` se queda y nace como "Plan de acompañamiento". Índices: `unique (engagement_id, version)` con nombre `plans_engagement_version`, y un índice único parcial sobre `engagement_id` donde `status = 'borrador'`.

### `app.plan_items`

| Columna | Tipo | Nota |
|---|---|---|
| `texto_persona` | text, nulo | Solo en `objetivo` y `apoyo_fe`. |
| `origen` | `plan_item_origen`, not null, default `ia` | |
| `propuesta_ref` | integer, nulo | Índice en `propuesta_ia.propuesta.items`. Sin permiso de UPDATE. |
| `origen_item_id` | uuid, FK `plan_items`, nulo | Ítem equivalente de la versión aprobada anterior (R-003.50). Índice único parcial `(plan_id, origen_item_id)` donde no es nulo. |
| `editado_por` | uuid, FK `users`, nulo | |
| `editado_en` | timestamptz, nulo | |

`evidencia` mantiene la forma `{ cita, sessionId }[]`.

### Tabla nueva `app.persona_plans`

| Columna | Tipo |
|---|---|
| `plan_id` | uuid, PK, FK `plans` on delete cascade |
| `engagement_id` | uuid, not null, FK `engagements` on delete cascade |
| `version` | integer, not null |
| `contenido` | jsonb `PlanPersona`, not null |
| `created_at` | timestamptz, not null, default now() |

`PlanPersona = { items: { planItemId, tipo: 'objetivo' | 'apoyo_fe', texto, orden, itemsAnteriores: uuid[] }[] }`. Una fila por versión aprobada, mismo patrón que `persona_profiles`. Lleva `planItemId` para que 005 pueda ligar recomendaciones, módulos y comentarios al ítem, e `itemsAnteriores` (R-003.61) para que 005 siga el ítem entre versiones sin leer `plan_items`. La cadena es una copia: se arma al aprobar desde `plan_items.origen_item_id` y no cambia después, igual que el resto de `contenido`. Es la única tabla del plan para la persona; no existe `persona_plan_items` (decisión abierta 7).

### Transiciones de etapa (`app.engagements.stage`)

Esta spec es dueña de la tabla (R-003.55). Todas las funciones van en el esquema `private`, `security definer`, con `search_path = ''`, como `private.app_on_consent` de 002. Ninguna depende de una política de UPDATE sobre `engagements`.

| De | A | Cuándo | Mecanismo | Spec |
|---|---|---|---|---|
| `alta` | `evaluacion_inicial` | Primer evento `otorgado` de `consent_events` | Trigger `private.app_on_consent` | 002 (R-002.25) |
| `evaluacion_inicial` | `perfil` | Insert del snapshot versión 1 en `profile_snapshots` | Trigger `after insert` en `app.profile_snapshots`, función `private.app_on_snapshot` | 003 (R-003.56) |
| `perfil` | `plan` | Insert del primer plan (en `borrador`) | Trigger `after insert` en `app.plans`, función `private.app_on_plan_insert` | 003 (R-003.57) |
| `plan` | `seguimiento` | El primer plan pasa a `aprobado` | Trigger `after update of status` en `app.plans`, función `private.app_on_plan_aprobado` | 003 (R-003.58) |
| `seguimiento` | `cierre` | Acción explícita del coach ("Iniciar cierre", con confirmación) | Función `private.app_iniciar_cierre(eid)` | 006 (R-006.1; R-003.59) |

Cada función actualiza con `where id = ... and stage = '<origen>'`, así que no hace nada si la etapa ya avanzó (R-003.60).

### Esquemas Zod nuevos (`lib/plan/schema.ts`)

```ts
TipoItemPlan = z.enum(["objetivo", "objetivo_equipo", "apoyo_fe", "ajuste_razonable", "instruccion", "comunicacion_lider"])

ItemPropuesto = z.strictObject({
  tipo: TipoItemPlan,
  descripcion: z.string().min(1).max(800),   // para el coach, tercera persona con nombre de pila
  textoPersona: z.string().min(1).max(400).nullable(),
  dominioFE: z.string().nullable(),          // se valida contra DOMINIOS_FE en sanitizePlan
  fichaId: z.string().nullable(),            // se valida contra las fichas enviadas en sanitizePlan
  evidencia: z.array(z.strictObject({ evidenciaId: z.string() })).min(1).max(5),
})

PlanProposal = z.strictObject({ items: z.array(ItemPropuesto).max(16) })
```

`fichaId`, `dominioFE` y `evidenciaId` son strings sin patrón a propósito: un ID mal formado lo quita `sanitizePlan` en vez de tumbar toda la respuesta en la validación del AI SDK. Los límites de largo y cantidad son una propuesta del equipo para ajustar con el eval, no un dato. El modelo no propone `origen_item_id` (decisión abierta 11).

`PayloadPlanIA = { propuesta: PlanProposal (ya limpia), descartados: DescartadoPlan[], banderas: BanderaPlan[], fichasEnviadas: string[], evidenciaEnviada: string[] }`.

Motivos de `DescartadoPlan`: `evidencia_no_existe`, `ficha_no_existe`, `sin_evidencia`, `textoPersona_en_tipo_interno` (se quita el `textoPersona` de un ítem `objetivo_equipo`, `ajuste_razonable`, `instruccion` o `comunicacion_lider`; el ítem se queda). Motivos de `BanderaPlan`: `termino_no_permitido`, `mencion_condicion`, `termino_interno`, `cita_en_texto_persona`, `cita_en_texto_lider`. `TERMINOS_CONDICION` vive en `lib/plan/validate.ts` (decisión abierta 9).

### Políticas RLS

- `plans`: se quita `plans_all_coach` y `plans_select_persona_approved`. Quedan `plans_select_coach` (coach del acompañamiento), `plans_insert_coach` (coach, `created_by = auth.uid()`, `status = 'borrador'`, `version` nulo y `private.app_has_consent(engagement_id)`, como `sessions_insert_coach`) y `plans_update_coach_borrador` (using: coach y `status = 'borrador'`; with check: coach). Un plan `aprobado` o `descartado` ya no pasa el using.
- `plan_items`: se quita `plan_items_all_coach` y `plan_items_select_persona_approved`. Quedan select para el coach, e insert, update y delete para el coach solo si el plan padre está en `borrador`.
- `persona_plans`: select para coach o persona del acompañamiento; insert para el coach cuando el plan con ese `plan_id` está `aprobado`. Ninguna política deja a la persona escribir (R-003.52).
- `knowledge_cards`: `knowledge_cards_select_all` pasa a `knowledge_cards_select_coach` con `private.app_role() = 'coach'`.
- Bloqueo al retirar el consentimiento (R-003.53, si se aprueba la opción propuesta de 002): todas las políticas de `plans` y `persona_plans` suman `private.app_has_consent(engagement_id)`, y las de `plan_items` la suman a través del plan padre. Estas políticas reemplazan a `plans_all_coach` y `plan_items_all_coach`, así que la condición se pone aquí; la tarea de bloqueo de 002 no toca `plans` ni `plan_items` y remite a R-003.53.
- `engagements`: esta spec no agrega políticas (R-003.55).

### Permisos (migración a mano, nombre propuesto `drizzle/NNNN_permisos_plan.sql`; el número sigue al de las migraciones de 002)

- `revoke update on app.plans from authenticated;` y `grant update (titulo, status, version, approved_by, approved_at) on app.plans to authenticated;`
- `revoke update on app.plan_items from authenticated;` y `grant update (descripcion, texto_persona, dominio_fe, knowledge_card_id, evidencia, orden, origen, origen_item_id, editado_por, editado_en) on app.plan_items to authenticated;` (sale `tipo`, R-003.26).
- `grant select, insert on app.persona_plans to authenticated;` El `grant select on all tables` de 0002 no cubre tablas creadas después.
- `knowledge_cards` sigue sin grant de INSERT, UPDATE ni DELETE (R-003.42).
- `engagements.stage` sigue sin grant de UPDATE (R-002.41); solo lo cambian las funciones de la tabla de transiciones.
- La persona no recibe ningún UPDATE. Los grants aplican al rol `authenticated`, que comparten coach y persona; lo que separa a uno de otro son las políticas.

## Pantallas y textos

### Coach: sección "Plan de acompañamiento" en `/coach/engagements/[id]`

Estados antes de la propuesta:

- Sin perfil aprobado: "Primero aprueba el perfil. El plan se arma a partir del perfil aprobado."
- Sin consentimiento vigente: "{nombre} no ha dado su consentimiento o lo retiró. Sin consentimiento no se envía nada a la IA." Con la opción propuesta de 002 se agrega: "Mientras no haya consentimiento, el plan no se muestra."
- Listo: botón "Pedir propuesta de plan". Debajo: "La IA propone a partir del perfil versión {n} y de las fichas verificadas. Tú decides qué queda."
- Sin fichas verificadas: "No hay fichas verificadas. La propuesta va a salir sin fichas de apoyo."
- Mientras espera: "Armando la propuesta. Esto puede tardar unos segundos." Sin contador ni barra de tiempo.
- Error del modelo: "No se pudo generar la propuesta. No se guardó nada. Intenta de nuevo."
- Ya hay borrador: "Ya hay un borrador de plan. Apruébalo o descártalo antes de pedir otro."

Borrador:

- Encabezado: "Borrador del plan · basado en el perfil versión {n}".
- Texto fijo: "La persona no ve nada de esto hasta que apruebes el plan. Cada cambio se guarda en cuanto lo confirmas."
- Grupos, en este orden: "Objetivos", "Objetivos del equipo", "Apoyos de función ejecutiva", "Ajustes razonables", "Cómo darle instrucciones", "Qué comunicar al líder".
- Debajo de "Objetivos del equipo": "{nombre} no ve este grupo."
- Debajo de "Ajustes razonables": "Borrador interno. La app no lo envía a la empresa y {nombre} no ve este grupo."
- Debajo de "Qué comunicar al líder": "Borrador interno. La app no lo envía a la empresa y la persona no lo ve."
- Etiqueta por ítem: "Propuesto por la IA", "Editado por ti" o "Escrito por ti".
- Ficha: "Ficha {id}: {título}". Sin ficha: "Sin ficha".
- Evidencia: título "Evidencia del perfil"; cada cita entre comillas y "Sesión del {fecha}". Sin evidencia: "Sin evidencia: lo escribiste tú."
- En `objetivo` y `apoyo_fe`: "Lo que verá {nombre}:" y el `textoPersona`. Sin `textoPersona`: "Este punto no tiene texto para {nombre}. No lo va a ver."
- Cuando hay un plan vigente, en cada ítem: "Sigue al punto de la versión {v}:" con una lista de los puntos del mismo tipo del plan vigente y la opción "Es un punto nuevo". Valor inicial: "Es un punto nuevo".
- Botones por ítem: "Editar", "Quitar". En edición: "Guardar cambio", "Cancelar". Al quitar: diálogo "¿Quitar este punto del plan? Queda registrado en el historial." con "Sí, quitar" y "Cancelar".
- Al final de cada grupo: "Agregar objetivo", "Agregar objetivo del equipo", "Agregar apoyo", "Agregar ajuste razonable", "Agregar instrucción", "Agregar punto para el líder".
- Avisos de la validación: "La IA citó una ficha que no existe. Quitamos ese punto." / "La IA citó evidencia que no está en el perfil. Quitamos esa cita." / "Revisa esta palabra: «{término}». No usamos ese lenguaje." / "Este texto lo verá {nombre} y nombra una función ejecutiva: «{término}». Escríbelo con palabras de todos los días." / "Este texto lo verá {nombre} y copia una cita de tus notas. Escríbelo con tus palabras." / "Este punto nombra una condición: «{término}». El plan describe conductas, no condiciones." / "Este punto copia una cita de tus notas. Tus notas son privadas; escríbelo con tus palabras."
- Botones al final: "Aprobar plan" y "Descartar borrador".
- Diálogo de aprobar: "¿Aprobar este plan? {nombre} va a ver sus objetivos y apoyos. Los objetivos del equipo, los ajustes razonables, las instrucciones y lo del líder se quedan solo para ti. Después de aprobarlo ya no se edita; para cambiarlo pides una propuesta nueva." Botones "Sí, aprobar plan" y "Volver al borrador".
- Diálogo de descartar: "¿Descartar este borrador? Se queda en el historial, pero no se usa." Botones "Sí, descartar" y "Volver al borrador".
- Errores al aprobar: "El plan necesita al menos un objetivo." / "Hay una palabra que no usamos en {grupo}: «{término}». Corrígela para aprobar." / "Lo que verá {nombre} en {grupo} nombra una función ejecutiva o copia una cita de tus notas. Corrígelo para aprobar." / "Un punto sigue a otro que no es del plan vigente o es de otro tipo. Revisa «Sigue al punto»." / "Este plan ya fue revisado. Recarga la página para ver su estado." / "Otra aprobación se guardó al mismo tiempo. Recarga la página y revisa de nuevo."

Plan vigente e historial:

- Encabezado: "Plan vigente · versión {v} · aprobado el {fecha} por {nombre}".
- Aviso de perfil nuevo: "El perfil cambió después de aprobar este plan. El plan usa el perfil versión {n} y el perfil actual es la versión {m}. Revisa si el plan sigue sirviendo." Botón "Pedir propuesta nueva".
- Enlace "Ver historial del plan". Cada fila: "Versión {v} · aprobada el {fecha} por {nombre} · perfil versión {n} · prompt {prompt_version} · modelo {model}". Borrador descartado: "Descartado el {fecha}".
- Dentro de una versión: "Sin cambios de la IA", "Editado por el coach (ver texto original)", "Escrito por el coach", "Sigue al punto de la versión {v}: «{descripción}»" y la lista "Puntos de la IA que el coach quitó".

### Persona: sección en `/persona`

Retirado: la sección "Tu plan" la arma 005, que es su única dueña y adopta "Tu plan", "Tus objetivos", "Apoyos que puedes pedir" y el texto de vacío que estaban aquí. Esta spec ya no define textos para la persona. Los textos de la versión 2 quedan abajo solo como registro; los que valen son los de 005.

- ~~Título: "Tu plan".~~
- ~~Línea: "Tu coach lo aprobó el {fecha}."~~
- ~~Subtítulos: "Tus objetivos" y "Apoyos que puedes pedir" (mismo texto que R-005.6 de 005; CONTEXTO §6 habla de "los apoyos que puede pedir").~~
- ~~Vacío: "Tu coach todavía no aprueba tu plan. Cuando lo apruebe, aparece aquí."~~
- ~~Ayuda: "Si algo no te queda claro, pregúntale a tu coach en tu próxima sesión."~~
- ~~El botón "esto no me representa" sobre el plan y sus textos son de 005.~~

## Reglas fijas fuera del LLM

- Sin snapshot, sin consentimiento vigente (002) o con borrador abierto no se llama al modelo (R-003.1 a R-003.3). El consentimiento se revisa también en la política de INSERT de `plans`.
- La ruta de propuesta del plan no se habilita sin la versión del aviso que menciona esta etapa (R-003.54).
- Filtro `verificada = true` antes de armar el prompt (R-003.5).
- La lista de evidencia `E-nn` se arma con código desde el snapshot, en orden fijo (orden de `DIMENSIONES` y luego orden de la evidencia), y el mismo índice se usa para resolver las referencias (R-003.14).
- `sanitizePlan` (función pura en `lib/plan/validate.ts`): evidencia, fichas, `dominioFE`, `textoPersona` en tipos internos, banderas (R-003.13 a R-003.19, R-003.46, R-003.47).
- Las rutas de edición validan fichas y citas contra el snapshot base, y `origen_item_id` contra el plan vigente y el tipo (R-003.24, R-003.51).
- La aprobación vuelve a correr las validaciones y bloquea con `termino_no_permitido`, `mencion_condicion`, y con `termino_interno` o `cita_en_texto_persona` en un `textoPersona` (R-003.28, R-003.30).
- RLS y permisos de columna: `propuesta_ia` inmutable, plan aprobado congelado, persona sin acceso a `plans`, `plan_items` y `knowledge_cards`, persona sin escritura en las tablas de esta spec, bloqueo con consentimiento retirado (R-003.20, R-003.32, R-003.38, R-003.41, R-003.52, R-003.53).
- Las etapas cambian solo por los triggers de la tabla de transiciones, y solo hacia adelante (R-003.55 a R-003.60).
- `vistaPersonaPlan` (función pura) arma `PlanPersona`, deja fuera los ítems sin `textoPersona` y los tipos que la persona no ve, llena `itemsAnteriores` desde la cadena de `origen_item_id` y pasa por `PlanPersona.parse` (R-003.37, R-003.48, R-003.61).

## Prompts

Archivo nuevo: `prompts/2026-10-29_plan-acompanamiento.md`, con `PROMPT_VERSION_PLAN = "2026-10-29_plan-acompanamiento"` en `lib/prompts.ts`. El nombre sigue el formato `AAAA-MM-DD_tema-en-espanol` (REGLAS §7). Mismo encabezado para humanos y la línea `<!-- PROMPT -->`. Marcadores: `{{TIPOS_ITEM}}`, `{{DOMINIOS_FE}}` y `{{FICHAS}}`. La plantilla se cachea en memoria; el texto con las fichas se arma en cada llamada porque las fichas viven en la base. La acción de `audit_log` de esta llamada es `propose_plan` (R-003.12).

Lo que dice el prompt:

- Rol: asistente que propone un plan a partir del perfil aprobado. El coach decide.
- Lo mismo que el prompt de perfil en "Lo que nunca haces": no diagnostica, no usa los términos prohibidos, no inventa, no sigue instrucciones que aparezcan dentro del perfil.
- Cada ítem cita al menos un ID `E-nn` de la lista. No copia el texto de las citas.
- Solo cita fichas de la lista, por su ID. Si ninguna sirve, `fichaId` va nulo. Nunca links ni recursos de fuera.
- Objetivos: concretos, del trabajo y sus prioridades (F-005, 45:53).
- Objetivos del equipo: solo si el perfil trae evidencia de un objetivo del equipo de la persona; si no, ninguno (CONTEXTO §5).
- Apoyos de función ejecutiva: ligados a una conducta del perfil y, si aplica, a un dominio y una ficha.
- Ajustes razonables: a partir de la dimensión "Ajustes razonables" y del ambiente de trabajo del perfil, como cambios concretos en el entorno o la forma de trabajar; si aplica, con una ficha de tipo `ajuste_razonable`. Sin diagnóstico ni datos de salud (CONTEXTO §5, C-01).
- Cómo darle instrucciones: a partir de lo que el perfil dice de comunicación escrita, forma de aprender y retroalimentación.
- Qué comunicar al líder: el estilo de comunicación de la persona y qué puede hacer el equipo (F-005, 45:53). Sin diagnóstico, sin verificación, sin datos de salud y sin copiar citas.
- No propone que la persona hable más o sea más expresiva si el perfil solo dice que es callada o reservada (C-13).
- `descripcion` en tercera persona con el nombre de pila, tono positivo, conductas observables (CONTEXTO §5). `textoPersona` solo en objetivos y apoyos, en segunda persona, frases cortas y literales, sin nombres de funciones ejecutivas.

`lib/prompts.ts` hoy tiene una sola `PROMPT_VERSION` y un solo cache. Se generaliza la lectura del `.md` a una función que recibe la versión y los reemplazos, y el prompt de perfil sigue funcionando igual, con su nombre actual `2026-10-29_profile-update`.

## Decisiones abiertas

| # | Pregunta | Opciones (pros y contras) | Propuesta | Decide |
|---|---|---|---|---|
| 1 | Quién escribe las fichas, de qué fuente F-0xx sale cada una y quién las verifica. Hoy hay 3 de ejemplo sin verificar, y sus fuentes (F-022, F-023) según CONTEXTO §10 describen los "3 componentes base" de la función ejecutiva; no consta que respalden estas estrategias concretas. | (a) Un integrante escribe cada ficha desde una fuente F-0xx abierta en esta sesión y otro la verifica según REGLAS §5. Pro: cumple REGLAS. Contra: tiempo antes del 5 nov. (b) Pedir al partner estrategias que ya usan y convertirlas en fichas con su permiso. Pro: son de la práctica real. Contra: depende de su respuesta. (c) Marcar las de ejemplo como verificadas. Contra: rompe REGLAS §5; descartada. | (a) para el demo y (b) como pregunta al partner. Sin bandera de "fichas de ejemplo" en desarrollo: sin fichas verificadas el flujo funciona y sale sin fichas; el eval usa sus propias fichas de prueba. Responsable por definir. | Los tres |
| 2 | Edición libre o solo aprobar y rechazar ítems. | (a) Solo aprobar o rechazar por ítem, como el perfil. Pro: rastro simple, menos código. Contra: el coach no ajusta la redacción y CONTEXTO §6 dice "el coach lo edita". (b) Edición del texto, ficha y citas, quitar y agregar, con el original guardado. Pro: cumple §6. Contra: más rutas y pantalla. (c) Editar texto y quitar, sin agregar. | (b), con citas solo para quitar y sin cambiar el tipo. | Acker |
| 3 | Cómo se versiona el plan cuando cambia el perfil. | (a) Aviso y propuesta nueva manual. Pro: simple, sin sorpresas (C-14). Contra: el coach puede ignorar el aviso. (b) Propuesta nueva automática en cada snapshot. Contra: llamadas al modelo que nadie pidió y borradores sorpresa. (c) Marcar ítems cuya evidencia cambió. Pro: preciso. Contra: más lógica. | (a) ahora; (c) en "What's next". La propuesta nueva no recibe el plan anterior en v1. | Acker |
| 4 | Qué tipos de ítem ve la persona. | (a) `objetivo` y `apoyo_fe`. (b) Más `instruccion` reescrita como "cómo te gusta recibir instrucciones". (c) Más `ajuste_razonable` con su propio `textoPersona`, como "Ajustes que puedes pedir". (d) Todo menos `comunicacion_lider`. Pro de (a): lo más conservador mientras el partner no conteste. Contra: la persona no ve cómo se le darán instrucciones ni qué ajustes puede pedir. | (a) hasta que el partner responda. | Acker, con respuesta del partner |
| 5 | Mandar las señales activas al prompt del plan. | (a) No. Pro: ningún ítem visible para la persona sale de una señal de riesgo (C-09). Contra: el plan no reacciona a estrés o desajuste con el rol. (b) Sí, solo como contexto y sin ítems visibles para la persona. | (a) en v1; las señales se trabajan en 004. | Acker |
| 6 | Cómo cita evidencia el modelo. | (a) ID corto `E-nn` y el código pone cita y sesión. Pro: no hay texto que comparar y el `sessionId` nunca lo escribe el modelo. Contra: el modelo puede confundir IDs parecidos. (b) Copiar la cita y comparar con `normalizar`, como en 001. Pro: mismo código que el perfil. Contra: más tokens y descartes por diferencias mínimas. | (a). 007 valida igual en el eval (R-003.44). | Acker |
| 7 | Tabla para la persona: `persona_plans` o `persona_plan_items`; cómo sigue 005 un ítem entre versiones si la persona no lee `plan_items`; quién arma la sección del plan en `/persona`. | Tabla: (a) `persona_plans` con `contenido` jsonb por versión. Pro: mismo patrón que `persona_profiles`. (b) `persona_plan_items` por ítem. Pro: FK directa al ítem. Contra: más filas que copiar. Cadena entre versiones: (i) cada ítem de `PlanPersona` lleva `itemsAnteriores` (R-003.61). Pro: la persona lee todo desde `persona_plans` y no cambia ninguna política. Contra: la copia crece con cada versión. (ii) La aprobación del plan reescribe `persona_recommendations` y `persona_modules` al ítem nuevo. Pro: 005 no resuelve cadenas. Contra: esta spec escribe en tablas de 005 y la transacción de aprobación crece. (iii) 002 agrega una función `security definer` que resuelve la cadena. Pro: no copia nada. Contra: otra función con permisos altos que probar. | Propuesta (Claude), decide Acker: tabla (a), con `planItemId` dentro de `contenido`, y cadena (i); 005 la usa (su decisión 15). La sección "Tu plan" de `/persona` la arma 005, que es su única dueña y adopta sus textos (tarea 20 retirada). | Acker |
| 8 | Ajuste con 007. En la versión 1 de 007, R-007.27 trataba una ficha sin verificar como advertencia mientras el seed tuviera ejemplos. Con el filtro de R-003.5, una ficha sin verificar no puede llegar al prompt. | (a) En 007, una ficha sin verificar en la salida del plan es falla desde ya. (b) Se deja como advertencia. | Resuelta: 007 ya aplica (a) en R-007.27. | Acker |
| 9 | Qué palabras bloquean la aprobación además de `buscarTerminos`. `TERMINOS_CONDICION` (R-003.47) y las etiquetas de `DOMINIOS_FE` en `textoPersona` (R-003.17) pueden dar falsos positivos: "Flexibilidad" o "Iniciación" también son palabras de todos los días. | (a) Lista corta de condiciones ("autismo", "autista", "TEA", "Asperger") y etiquetas completas de `DOMINIOS_FE`, con bloqueo; el coach reescribe si hay falso positivo. Pro: cumple C-01 y C-09 sin excepciones. Contra: el coach a veces corrige algo que estaba bien. (b) Solo aviso, sin bloqueo. Contra: un texto con el nombre de una función ejecutiva puede llegar a la persona, y eso rompe C-09; descartada. (c) Lista más larga revisada por el partner. Pro: lenguaje de su práctica. Contra: depende de su respuesta. | (a) ahora y (c) como pregunta al partner. | Acker |
| 10 | Cómo entran al plan los objetivos del equipo y los ajustes razonables (CONTEXTO §5). | (a) Dos valores nuevos en `plan_item_type`: `objetivo_equipo` y `ajuste_razonable`. Pro: grupos propios en la pantalla y el eval los cuenta por tipo. Contra: cambio de enum y más casos en la validación. (b) Sin enum nuevo: los objetivos del equipo como `objetivo` con una marca, y los ajustes como `apoyo_fe` con una ficha de tipo `ajuste_razonable`. Pro: menos cambios. Contra: un ajuste razonable no siempre es un apoyo de función ejecutiva, y la marca se pierde fácil. | Propuesta (Claude), decide Acker: (a). | Acker |
| 11 | Cómo se llena `origen_item_id` en una versión nueva. | (a) El coach elige en el borrador a qué punto del plan vigente sigue cada ítem; el modelo no ve el plan anterior. Pro: coincide con la decisión 3 y la liga la decide el coach (C-04). Contra: un paso más para el coach. (b) El modelo recibe los ítems del plan vigente con IDs cortos y propone la liga; el código la valida y el coach la corrige. Pro: menos trabajo para el coach. Contra: manda más datos al modelo y cambia la decisión 3. (c) El código liga por tipo y ficha iguales. Contra: liga puntos que no son equivalentes. | Propuesta (Claude), decide Acker: (a) en v1; (b) en "What's next". | Acker |
| 12 | En qué momento pasa la etapa a `plan`. | (a) Al guardar el primer borrador. Pro: la etapa muestra que el coach ya trabaja en el plan. Contra: un borrador descartado deja la etapa en `plan`. (b) Al aprobar el primer plan, y a `seguimiento` en la primera sesión de seguimiento. Pro: la etapa refleja solo lo aprobado. Contra: 004 tendría que abrir sesiones de seguimiento en etapa `plan`. | Propuesta (Claude), decide Acker: (a), con la tabla de transiciones de esta spec. | Acker |

## Tareas

Cada tarea es un commit pequeño que dice sus R-IDs, la herramienta y quién lo revisó (REGLAS §3). Las migraciones de esta spec van después de las de 002.

1. Esquema: en `lib/db/schema.ts`, agregar `descartado` a `plan_status`, `objetivo_equipo` y `ajuste_razonable` a `plan_item_type`, el enum `plan_item_origen`, las columnas nuevas de `plans` y `plan_items` (incluida `origen_item_id`), la tabla `persona_plans`, los índices únicos y las políticas nuevas con la condición de consentimiento vigente (002) del bloqueo; quitar `plans_select_persona_approved`, `plan_items_select_persona_approved`, `plans_all_coach` y `plan_items_all_coach`; cambiar `knowledge_cards_select_all`. Correr `drizzle-kit generate`. (R-003.3, R-003.8, R-003.20, R-003.21, R-003.23, R-003.31, R-003.32, R-003.34, R-003.37, R-003.38, R-003.41, R-003.50, R-003.51, R-003.52, R-003.53)
2. Permisos: escribir la migración de permisos del plan con los revoke y grant de la sección Datos. (R-003.20, R-003.26, R-003.32, R-003.37, R-003.42, R-003.52)
3. Etapas: migración SQL a mano con `private.app_on_snapshot`, `private.app_on_plan_insert`, `private.app_on_plan_aprobado` y sus triggers, según la tabla de transiciones. Sin políticas nuevas sobre `engagements`. (R-003.55 a R-003.58, R-003.60)
4. Prueba de RLS: agregar al script `scripts/rls-check.ts` de 002 (R-002.46) los casos de CA-003.2 (INSERT sin consentimiento), CA-003.10, CA-003.15, CA-003.16 (versión duplicada), CA-003.18, CA-003.25, CA-003.28, CA-003.32, CA-003.35 y CA-003.36, cada uno en su transacción con `rollback`. (R-003.2, R-003.20, R-003.26, R-003.31, R-003.32, R-003.38, R-003.39, R-003.41, R-003.42, R-003.52, R-003.53, R-003.55)
5. Zod: crear `lib/plan/schema.ts` con `TipoItemPlan`, `ItemPropuesto`, `PlanProposal`, `DescartadoPlan`, `BanderaPlan`, `PayloadPlanIA`, `ItemPlanGuardado`, `PlanPersona` y `TIPOS_VISIBLES_PERSONA`. (R-003.7, R-003.8, R-003.11, R-003.37)
6. Índice de evidencia: `lib/plan/evidence.ts` con `indiceEvidencia(perfil)` que devuelve la lista `E-nn` para el prompt y el mapa `E-nn → { cita, sessionId, dimension }`. (R-003.4, R-003.14)
7. Validación: `lib/plan/validate.ts` con `sanitizePlan(propuesta, { fichas, indice })` y `TERMINOS_CONDICION`, reusando `buscarTerminos` y `normalizar` de `lib/profile/validate.ts`. (R-003.13 a R-003.19, R-003.46, R-003.47)
8. Vista persona y rastro: `lib/plan/persona.ts` con `vistaPersonaPlan(items, itemsAnteriores)`, que recibe los ítems del plan y el mapa `id → origen_item_id` de las versiones aprobadas del acompañamiento, y `lib/plan/trail.ts` con `rastroPlan(propuestaIa, items)` (sin cambios, editados con texto original, escritos por el coach, punto anterior al que siguen, quitados). (R-003.35, R-003.37, R-003.48, R-003.50, R-003.61)
9. Pruebas sin red en `eval/compare.ts` (o `eval/plan.ts` si crece mucho): CA-003.4 a CA-003.9, CA-003.27, CA-003.30, `vistaPersonaPlan` (incluida la cadena de CA-003.37) y `rastroPlan`. (R-003.45, R-003.61)
10. Prompts: generalizar la lectura en `lib/prompts.ts`, agregar `PROMPT_VERSION_PLAN`, `systemPromptPlan(fichas)` y `mensajeUsuarioPlan(entrada)`; confirmar que el prompt de perfil no cambia. (R-003.4, R-003.5, R-003.6, R-003.43)
11. Escribir `prompts/2026-10-29_plan-acompanamiento.md` con lo de la sección Prompts. (R-003.9, R-003.10, R-003.11, R-003.43, R-003.49)
12. Llamada al modelo: `lib/ai/propose-plan.ts`, igual que `propose-profile-update.ts` (instrucciones con `cacheControl`, `Output.object` con `PlanProposal`, uso de tokens y latencia). (R-003.6, R-003.7)
13. Contratos: en `lib/api/contracts.ts`, `ProposePlanResponse`, `ItemPlanCrear`, `ItemPlanEditar` (con `origenItemId`), `PlanDecisionRequest` (`aprobar` o `descartar`) y `PlanDecisionResponse`. (R-003.22, R-003.28, R-003.34, R-003.50)
14. Aviso: con 002, agregar al aviso de privacidad lo que llega al modelo en esta etapa y subir su versión (archivo nuevo en `legal/` y `AVISO_VERSION`). La ruta de la tarea 15 no se habilita antes. (R-003.54)
15. Ruta `POST /api/engagements/[id]/plans`: tx1 lee engagement, consentimiento vigente (`private.app_has_consent`), borrador abierto, snapshot y fichas verificadas; llamada al modelo fuera de la transacción; tx2 corre `sanitizePlan`, guarda el plan en borrador con sus ítems y audita con `propose_plan`. (R-003.1 a R-003.3, R-003.5, R-003.12, R-003.20, R-003.21)
16. Rutas de edición: `POST /api/plans/[id]/items`, `PATCH /api/plan-items/[id]`, `DELETE /api/plan-items/[id]`; validan fichas y citas contra el snapshot base y `origen_item_id` contra el plan vigente, ponen `origen`, `editado_por`, `editado_en` y recalculan banderas. (R-003.22 a R-003.27, R-003.50, R-003.51)
17. Ruta `POST /api/plans/[id]/decision`: aprobar (bloqueo `for update`, validaciones incluida `origen_item_id`, versión, `persona_plans` con `itemsAnteriores`, 409 por versión duplicada) o descartar. (R-003.28 a R-003.31, R-003.34, R-003.37, R-003.48, R-003.51, R-003.61)
18. Pantalla del coach: sección del plan en `/coach/engagements/[id]` con estados, borrador, los seis grupos, edición, "Sigue al punto", diálogos y avisos, con los textos literales de esta spec y los componentes de C-14. (R-003.22, R-003.25, R-003.30, R-003.40, R-003.48, R-003.50)
19. Plan vigente, historial y aviso de perfil nuevo en la pantalla del coach. (R-003.33, R-003.35, R-003.36)
20. Retirada: la sección la arma 005. ~~Pantalla de la persona: sección "Tu plan" en `/persona` leyendo solo `persona_plans` (o la arma 005, según la decisión abierta 7). (R-003.37, R-003.39)~~
21. Eval con modelo: casos de plan en `eval/cases/` con el formato 2 de 007 (`perfilAprobado` fijo). Uno con el perfil sintético que sale de `caso-ws-01`, con la persona que habla poco en reuniones grandes, y fichas sintéticas de prueba; otro con el mismo perfil sin fichas, para ver si el modelo inventa IDs. Lo que cuenta como falla crítica o advertencia lo define 007: entre las fallas críticas están que la llamada o la validación falle, más banderas `termino_no_permitido` o `mencion_condicion` de las esperadas, una ficha que no estaba en el caso o sin verificar en la salida, y un patrón prohibido de C-13 (pedirle a la persona que hable más o participe más en reuniones). Actualizar `eval/README.md`. (R-003.10, R-003.44)
22. Seed: dejar `KC-001` a `KC-003` con `verificada = false` y agregar las fichas reales cuando se resuelva la decisión abierta 1. Si el seed trae snapshots o planes, la etapa del acompañamiento de demo debe coincidir con la tabla de transiciones; los seeds por etapa del caso de demo de punta a punta son de 007. (R-003.5, R-003.42, R-003.55)

## Verificación

- `npm run typecheck` y `npm run eval -- --offline` pasan, con las pruebas nuevas del plan.
- `npm run eval` corre los casos de `eval/cases/`, incluidos los de plan, sin fallas críticas, y la tabla muestra tokens de cache en la segunda llamada si el system prompt supera el mínimo de Anthropic.
- `scripts/rls-check.ts` pasa con los casos de la tarea 4 y las sesiones de coach y persona del seed.
- En el navegador, con las cuentas `.test` del seed: el coach aprueba el primer perfil y la etapa pasa a `perfil`; pide propuesta (etapa `plan`), edita un ítem, agrega otro, quita uno, aprueba (etapa `seguimiento`); la persona ve solo objetivos y apoyos; el coach aprueba un perfil nuevo y ve el aviso; pide otra propuesta, liga un punto con su equivalente y aprueba; el historial muestra las dos versiones con su rastro.
- Cada criterio de aceptación CA-003.1 a CA-003.37 queda marcado con la prueba que lo cubrió antes de pasar la spec a "Verificada".

## Preguntas para el partner

- ¿El plan que arman hoy tiene objetivos, apoyos, cómo darle instrucciones y qué comunicar al líder, o tiene otras partes?
- ¿La persona ve su plan? Si sí, ¿qué partes? (Se suma a la pregunta de CONTEXTO §11 sobre qué partes del perfil ve.)
- El perfil lo revisan con la persona y lo firman los dos (CONTEXTO §4). ¿Con el plan hacen lo mismo?
- Lo que se le comunica al líder, ¿lo revisa antes la persona? ¿Le llega en el reporte a la empresa o en la sesión de 30 minutos con la red de apoyo?
- ¿Tienen estrategias o ajustes que ya usen y que podamos convertir en fichas, con su permiso? ¿Alguien de su equipo podría revisarlas?
- En Workplace Support, ¿quién pone los objetivos: la persona, el líder o el coach?
- ¿Los objetivos del equipo y los ajustes razonables van en el plan o en otro documento? ¿La persona ve los ajustes que se acordaron?
- ¿Cada cuánto revisan el plan: en fechas fijas o cuando algo cambia en la persona o en el trabajo?
- ¿Qué palabras evitan en los textos que ve la persona y en lo que se habla con el líder? Por ejemplo, ¿nombran la condición o las funciones ejecutivas?

## Cambios

Versión 3 · 2026-10-29 · ajustes de consistencia

- Cadena entre versiones para la persona: cada ítem de `PlanPersona` lleva `itemsAnteriores` (uuid[]), armado al aprobar desde `origen_item_id`, para que 005 sepa si una recomendación, un paso del módulo o un comentario siguen vigentes sin leer `plan_items` (R-003.61, CA-003.37, R-003.37, Datos, tareas 8, 9 y 17). La decisión 7 anota las otras dos opciones: reescribir las tablas de la persona de 005 al aprobar, o una función `security definer` de 002.
- Sección "Tu plan" de `/persona`: 005 es su única dueña y adopta los textos. Los textos de persona de esta spec quedan marcados como retirados, la tarea 20 queda "Retirada: la sección la arma 005" y la decisión 7 se cierra con esa dueña. Se agrega la línea en "Fuera de alcance" y CA-003.17 se prueba en la pantalla de 005.
- Etapa `cierre`: la fila de la tabla de transiciones dice `seguimiento` → `cierre` con `private.app_iniciar_cierre` (R-006.1); R-003.59 y "Fuera de alcance" lo repiten. "Fuera de alcance" remite al requisito de 006 que nombra las rutas y políticas de INSERT que suman `private.app_engagement_abierto`, incluidas las de esta spec.
- Decisión 8 marcada como resuelta: 007 ya aplica (a) en R-007.27.
- Políticas RLS: el texto del bloqueo dice que la tarea de bloqueo de 002 no toca `plans` ni `plan_items` y remite a R-003.53.

Versión 2 · 2026-10-29 · consolidación entre specs

- Consentimiento: todo chequeo dice "consentimiento vigente (002)" y usa `private.app_has_consent`; se aclara que no se lee `consentimiento_en` (R-003.2).
- Etapas: la spec es dueña de la tabla de transiciones y de las tareas de `evaluacion_inicial` → `perfil`, `perfil` → `plan` y `plan` → `seguimiento`, con triggers en `private` y sin política de UPDATE sobre `engagements` (R-003.55 a R-003.60, tarea 3, decisión 12). Sale de "Fuera de alcance" la línea que mandaba la etapa a 002 o 004.
- "Esto no me representa" sobre el plan aprobado: 005 es dueña de su ciclo y su modelo; aquí solo se referencia.
- `persona_plans` queda como única tabla del plan para la persona (R-003.37, decisión 7); se mantiene el retiro de las políticas de lectura de la persona sobre `plans` y `plan_items` (R-003.38).
- La persona no escribe en las tablas de esta spec; remite a la lista de 002 (R-003.52, CA-003.36).
- Bloqueo al retirar el consentimiento: `plans`, `plan_items` y `persona_plans` entran (R-003.53, CA-003.32). Orden de migraciones: después de 002 y antes de 004 y 005.
- Aviso de privacidad: sube de versión antes de activar la ruta del plan (R-003.54, CA-003.33, tarea 14).
- `origen_item_id` en `plan_items` para seguir cada punto entre versiones (R-003.50, R-003.51, CA-003.31, decisión 11).
- Objetivos del equipo y ajustes razonables: dos valores nuevos en `plan_item_type`, con prompt, pantallas y validación (R-003.8, R-003.11, R-003.29, R-003.40, R-003.49, CA-003.30, decisión 10).
- Eval: los casos de plan siguen el formato 2 de 007 en `eval/cases/` y la evidencia se valida por ID contra el perfil fijo (R-003.44, CA-003.23, tarea 21); una ficha sin verificar en la salida es falla (decisión 8).
- Pruebas de RLS: los casos de esta spec van en `scripts/rls-check.ts` de 002 (tarea 4).
- Cerrar una señal en 004 no dispara el aviso de perfil nuevo (R-003.36).
- Nombres: el prompt nuevo sigue `AAAA-MM-DD_tema-en-espanol` y el de perfil conserva su nombre (R-003.43); la acción de `audit_log` es `propose_plan` (R-003.12).
- Fichas: la decisión 1 queda para los tres, con responsable por definir.
- Las tareas se renumeraron (22 en total) para meter etapas y aviso en su orden.
