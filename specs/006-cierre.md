<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# 006 · Cierre

- Estado: Borrador · Versión 3 · 2026-10-29
- Fuentes: F-005 (CONTEXTO §4), F-026 (secundaria), CONTEXTO §6 (flujo del demo, What's next, arquitectura, privacidad), D-015, D-021 y D-022 (propuestas en CONTEXTO §9), D-029 (decidida por los tres según Acker, pendiente de registrar en CONTEXTO §9), D-033, D-034 y D-035 (propuestas del bloque de actualización del 29 oct, todavía no están en CONTEXTO), REGLAS §4, §6 y §7, C-01, C-02, C-03, C-04, C-05, C-08, C-09, C-10, C-11, C-13, C-14, C-16, C-17, C-18
- Depende de: 002 (consentimiento vigente con `private.app_has_consent`, aviso de privacidad, bloqueo al retirar el consentimiento, lista de escrituras de la persona, `private.app_mi_acompanamiento()`, `scripts/rls-check.ts`), 003 (plan aprobado, versiones del plan, tabla de transiciones de etapa, banderas de R-003.30, rutas y políticas del plan), 004 (seguimiento, señales activas y `signal_states`, tablas y rutas que se bloquean en cierre), 005 (vista de la persona, ciclo de "Esto no me representa" y cierre de comentarios de cierre, rutas y tablas de recursos y módulo), 007 (caso sintético de cierre)

Spec de requisitos, sin tareas. Es la última en el orden de construcción de `specs/README.md`, y sus migraciones corren después de las de 002 a 005. Casi todo lo que define el cierre solo lo sabe Specialisterne, así que esta spec fija los límites y deja el contenido en preguntas.

## Problema y para quién

En los proyectos de inclusión, Specialisterne da coaching durante 6 meses: 1 h por semana con la persona y 30 min cada dos semanas con la red de apoyo (líder y mentor), y manda reportes a la empresa (F-005, CONTEXTO §4). CONTEXTO no dice cómo termina ese coaching, qué llevan los reportes ni cuánto dura Workplace Support.

El enum `engagement_stage` de `lib/db/schema.ts` ya tiene la etapa `cierre`, y `lib/engagements/config.ts` la pone al final de los dos tipos de engagement, como pide D-029 (bloque de actualización del 29 oct: un pipeline por tipo de engagement). Hoy no hay ruta, tabla ni pantalla para esa etapa.

Para quién, como interpretación del equipo:

- El coach necesita un resumen de lo que se trabajó, armado desde lo que ya aprobó, sin volver a leer todas las notas.
- La persona necesita quedarse con una versión clara de sus fortalezas y de los apoyos que puede pedir cuando el acompañamiento termina. CONTEXTO §6 dice que la persona "sabe qué apoyos puede pedir"; esta spec lo lleva al momento del cierre.
- La empresa recibe reportes según F-005, pero no sabemos qué llevan y no lo inventamos.

## Alcance

Entra:

- El coach inicia el cierre de un acompañamiento con una acción explícita. Es la transición `seguimiento` → `cierre` de la tabla de transiciones de 003; esta spec define la acción y su función.
- La IA propone un resumen de cierre y el coach lo corrige y aprueba (C-04).
- La persona ve la versión en lenguaje claro del resumen aprobado (C-09).
- Qué se bloquea en la etapa `cierre` y qué sigue permitido, también después de cerrar (R-006.18 y R-006.19). 003 deja esto a 006 para el plan, y aquí se cubren también perfil, seguimiento, recursos y módulo.
- Las reglas que debe cumplir cualquier salida hacia la empresa (C-11), aunque el MVP no la construya.
- La retención de datos al cerrar, como decisión abierta.

**Fuera de alcance:**

- Contenido y formato de los reportes de Specialisterne a la empresa: preguntas para el partner.
- Sesiones con la red de apoyo (líder y mentor, cada dos semanas, CONTEXTO §4): son sesiones de seguimiento y viven en 004. Si el cierre incluye a la red de apoyo sigue en preguntas para el partner.
- Reabrir un acompañamiento cerrado o abrir uno nuevo para la misma persona: con la restricción de 002 (un acompañamiento por persona) hoy no se puede; queda en preguntas para el partner.
- Métricas de impacto para financiadores: What's next (CONTEXTO §6).
- Cuenta o acceso de la empresa: el MVP tiene dos logins, coach y persona, y el admin de organización queda para What's next (CONTEXTO §6).

## Requisitos

| ID | Requisito | Fuente |
|---|---|---|
| R-006.1 | Cuando el coach pulsa "Iniciar cierre", el sistema debe pedir confirmación y solo después pasar la etapa a `cierre` con la función `private.app_iniciar_cierre(eid)` (ver Datos). La función acepta el cambio solo si quien llama es coach del acompañamiento y la etapa actual es `seguimiento`; si no, la ruta responde 409. Ningún rol cambia `engagements.stage` con un UPDATE directo. | C-14; la función en vez de una política de UPDATE es Propuesta (Claude), decide Acker (decisión abierta 7); "solo desde `seguimiento`" es interpretación del equipo (ver preguntas para el partner) |
| R-006.2 | Cuando `engagements.stage = 'cierre'`, `POST /api/engagements/[id]/sessions` debe responder 409 sin guardar la nota ni llamar al modelo, y la política `sessions_insert_coach` debe rechazar el insert aunque la ruta no lo revise. En esa etapa la única llamada al modelo permitida es el borrador del resumen, y solo mientras `cerrado_en` sea nulo. Las demás rutas y políticas que se bloquean en `cierre` están en R-006.18. | Interpretación del equipo; lo de `cerrado_en` depende de la decisión abierta 1 |
| R-006.3 | Cuando el coach pulsa "Preparar borrador del resumen", el sistema debe mandar al modelo solo material aprobado: el último `profile_snapshots` del engagement sin su lista de señales, los ítems de la versión vigente del plan aprobado (003) y las `recommendations` con `status = 'aprobada'`. Las señales van aparte y solo las activas, con la regla de 004 (las del snapshot menos las que `signal_states` marca como cerradas), en un bloque del prompt que solo puede alimentar `para_el_coach`. La salida se guarda en `closing_summaries` con `status = 'borrador'`. | C-04, C-09; qué material entra es la propuesta de la decisión abierta 2 (interpretación del equipo); versión vigente: 003; señales activas: requisito nuevo de 004 en su versión 3; señales solo para el coach: Propuesta (Claude), decide Acker |
| R-006.4 | El sistema nunca debe mandar al modelo `diagnostico_verificado`, `cedula_profesional`, `diagnostico_verificado_por` ni `diagnostico_verificado_en`. | C-02, C-03, D-021, D-022 |
| R-006.5 | Cada afirmación del borrador debe traer el tipo y el ID del registro que la respalda (snapshot, ítem del plan, recomendación o señal activa) y una cita literal de ese registro. Antes de guardar, el código debe descartar la afirmación cuyo ID no esté en el material que se mandó al modelo, o cuya cita no aparezca en el texto de ese registro según `citaEnNota` de `lib/profile/validate.ts`, y anotarla en `descartados`. | D-034 (propuesta, bloque del 29 oct); validar por ID contra el material enviado sigue el criterio de 003 para el plan; aplicar C-05 a registros aprobados en vez de notas es interpretación del equipo |
| R-006.6 | El código debe correr `buscarTerminos` de `lib/profile/validate.ts` y la búsqueda de `TERMINOS_CONDICION` de 003 (`lib/plan/validate.ts`, R-003.47) sobre cada texto del resumen, el que escribió el modelo y el que editó el coach, guardar las banderas (`termino_no_permitido`, `mencion_condicion`) en `banderas` y mostrarlas al coach. Se recalculan cada vez que el coach guarda un texto y otra vez en la ruta de aprobación. Las banderas no quitan texto. En `para_el_coach` solo avisan; en `fortalezas` y `apoyos` bloquean la aprobación (R-006.13). | C-01, C-08; `mencion_condicion` y el recálculo siguen a 003 (R-003.27, R-003.47) |
| R-006.7 | Cuando el coach aprueba el resumen, el sistema debe, en una sola transacción, guardar `approved_by` y `approved_at`, llenar `engagements.cerrado_en` y `engagements.cerrado_por` con la función `private.app_cerrar_acompanamiento(eid)` (ver Datos), y escribir `persona_closing_summaries` armado por código desde el resumen aprobado: solo los textos de fortalezas y apoyos, sin citas, sin señales de riesgo y sin dominios de función ejecutiva. Después de aprobado, el resumen no cambia. | C-04, C-09; cerrar al aprobar y no editar después es la propuesta de la decisión abierta 1; la función es Propuesta (Claude), decide Acker (decisión abierta 7) |
| R-006.8 | Cuando la persona pulsa "Esto no me representa" en su resumen de cierre, el sistema debe registrarlo con el modelo de datos y el ciclo de vida que define 005, que es su dueña, con `origen = 'cierre'` en `PayloadNoMeRepresenta` (R-005.33). Así el coach sabe que vino del resumen de cierre y no del perfil ni del plan. El coach lo cierra con la única opción que 005 define para ese origen, "Revisado con {nombre}" (estado `rejected`), porque el resumen aprobado no cambia (R-006.7). 006 no define tabla, tipo de evento, estados ni textos propios para esto. | CONTEXTO §6 (vista de la persona); 005 (R-005.33 y su requisito nuevo de la versión 3 para cerrar comentarios de cierre); decisión abierta 6, resuelta |
| R-006.9 | El sistema no debe mandar nada a la empresa. Si en una versión futura existe una salida hacia la empresa, debe requerir aprobación del coach y nunca debe incluir diagnóstico ni verificación. Tampoco debe incluir cédula, notas originales, citas ni señales de riesgo. | C-11, D-015, REGLAS §6, decisión de Acker de esta fase (bloque del 29 oct); lo de cédula, notas, citas y señales es interpretación del equipo |
| R-006.10 | Si el acompañamiento no tiene consentimiento vigente (002: `private.app_has_consent(engagement_id)` devuelve falso porque nunca se dio o se retiró), la ruta del borrador y la de aprobación deben responder 409 sin llamar al modelo y sin escribir nada. Las políticas de INSERT de `closing_summaries` y `persona_closing_summaries` repiten la condición. | C-10, D-035 (propuesta, bloque del 29 oct); consentimiento vigente (002, R-002.28 y R-002.31) |
| R-006.11 | Cada llamada al modelo del cierre, con éxito o con error, debe quedar en `audit_log` con `accion = 'propose_closing_summary'`, `modelo`, `prompt_version`, `tokens_entrada`, `tokens_salida`, `latencia_ms` y `ok`, usando `registrarAuditoria` de `lib/ai/audit.ts`. En `error` solo va el texto de `resumirError` de `lib/log.ts`. | C-17, C-18 |
| R-006.12 | El aviso de privacidad de 002 debe decir qué pasa con los datos al cerrar antes de que la persona acepte, como pide 002 para todo el aviso. 006 aporta ese texto según la decisión abierta 3; mientras la retención siga pendiente de la revisión legal, el aviso dice que está pendiente. | 002 (contenido del aviso); interpretación del equipo; F-026 (secundaria) |
| R-006.13 | Los textos de `fortalezas` y `apoyos` los verá la persona. El código los revisa además contra las etiquetas de `DOMINIOS_FE` y de `SENALES` (`lib/profile/schema.ts`, como en R-005.18) y la frase "función ejecutiva", y cada coincidencia es una bandera `termino_interno`, como en R-003.17. La ruta de aprobación responde 400 con la ruta del texto, sin aprobar ni cerrar, si un texto de `fortalezas` o `apoyos` tiene una bandera `termino_no_permitido`, `mencion_condicion` o `termino_interno`, igual que R-003.30. Ninguna casilla de confirmación salta este bloqueo; la de R-005.18 queda solo para textos que la persona no ve. | C-01, C-08, C-09; R-003.17 y R-003.30; bloquear en vez de marcar es Propuesta (Claude), decide Acker (decisión abierta 8) |
| R-006.14 | La página de cierre de la persona solo selecciona columnas de `persona_closing_summaries`. La fecha de fin sale de `persona_closing_summaries.created_at`, que se escribe en la misma transacción que `cerrado_en`. Si necesita otro dato del acompañamiento, lo lee con `private.app_mi_acompanamiento()` de 002 (R-002.40), nunca de `engagements` directo, y nunca lee `cedula_profesional` ni las columnas de verificación. | C-02, C-09; R-002.40 (lo que la persona lee del acompañamiento) |
| R-006.15 | `closing_summaries` y `persona_closing_summaries` guardan datos derivados de notas (`closing_summaries` con citas literales; `persona_closing_summaries` solo con textos armados desde ellas, sin citas, R-006.7), así que entran en el bloqueo por retiro de consentimiento que define 002 (R-002.30). Con la opción propuesta en 002, sus políticas de lectura agregan `private.app_has_consent(engagement_id)` para el coach y para la persona. | 002 (regla general: toda tabla con datos derivados de notas respeta el bloqueo) |
| R-006.16 | El borrador del resumen manda al modelo datos de una etapa que el aviso actual no cubre. Antes de activar la ruta del borrador, sube la versión del aviso (002) con lo que llega al modelo en el cierre: el último perfil aprobado, el plan aprobado y los recursos aprobados. | 002 (el aviso lista qué llega al modelo en cada etapa); C-10 |
| R-006.17 | La persona no gana escrituras nuevas en 006. Lee `persona_closing_summaries`; lo que escribe es lo de la lista de 002 (R-002.45), y 005 no le agrega escrituras (R-005.40). Su "Esto no me representa" sobre el resumen de cierre usa el insert de `profile_events` que ya está en esa lista. | 002 (R-002.45), 005 (R-005.40) |
| R-006.18 | Cuando `engagements.stage = 'cierre'`, estas rutas responden 409 sin escribir nada ni llamar al modelo, y estas políticas suman `(select private.app_engagement_abierto(engagement_id))` a su `with check`, directo o a través del plan padre. Perfil y seguimiento (001, 004): rutas `POST /api/engagements/[id]/sessions` (R-006.2), el reintento de propuesta de R-004.29 y `app/api/profile-events/[id]/decision/route.ts` (aprobar propuestas de perfil y de seguimiento); políticas `sessions_insert_coach`, `profile_events_insert_coach`, `profile_snapshots_insert_coach`, `persona_profiles_insert_coach` y las de insert de las tablas de 004 para el avance de ítems, el contexto de la siguiente sesión y las alertas fuertes. Plan (003): rutas `POST /api/engagements/[id]/plans`, `POST /api/plans/[id]/items`, `PATCH /api/plan-items/[id]`, `DELETE /api/plan-items/[id]` y `POST /api/plans/[id]/decision`; políticas `plans_insert_coach`, `plans_update_coach_borrador`, las de insert, update y delete del coach en `plan_items` y la de insert de `persona_plans`. Recursos y módulo (005): las rutas de "Proponer recursos" (R-005.7), "Generar módulo corto" (R-005.15) y las de aprobación de recursos y módulos; políticas de insert de `recommendations` (hoy `recommendations_all_coach`), `persona_recommendations`, `modules`, `persona_modules` y `recommendation_runs` si se adopta. Señales (004): la política de insert de `signal_states` suma `estado = 'cerrada' or private.app_engagement_abierto(engagement_id)`, para que en cierre no se active ninguna señal. | Pedido de 003 (Fuera de alcance: lo que se hace con el plan en `cierre` lo define 006); interpretación del equipo; Propuesta (Claude), decide Acker (decisión abierta 9 para las propuestas sin revisar) |
| R-006.19 | En `cierre`, también después de llenar `cerrado_en`, siguen permitidas: cambiar el estado de una alerta fuerte que ya existe (escalarla o marcarla atendida, 004); marcar una señal como "Ya no está activa" (R-004.13); cerrar un "Esto no me representa" de cualquier origen con la ruta de 005 y `profile_events_update_coach`. La persona puede enviar "Esto no me representa" (`profile_events_insert_persona_feedback`) y dar o retirar su consentimiento (`consent_events_insert_persona`). Las lecturas no cambian, salvo el bloqueo por retiro del consentimiento (R-006.15). Mientras `cerrado_en` sea nulo siguen además el borrador del resumen, su edición y su aprobación; `closing_summaries_insert_coach` exige `stage = 'cierre'` y `cerrado_en` nulo, y la ruta del borrador responde 409 si no se cumple. | C-12 (las alertas siguen llegando a una persona del equipo), R-002.27; interpretación del equipo; Propuesta (Claude), decide Acker |
| R-006.20 | Antes de guardar el borrador, el código descarta toda afirmación de `fortalezas` o `apoyos` cuyo respaldo sea una señal y la anota en `descartados`. Solo `para_el_coach` puede citar señales, y `persona_closing_summaries` nunca las lleva (R-006.7). | C-09 |

## Criterios de aceptación

| ID | Dado / Cuando / Entonces | Cubre | Cómo se prueba |
|---|---|---|---|
| CA-006.1 | Dado un engagement en `seguimiento`, cuando el coach pulsa "Iniciar cierre" y luego "Cancelar", entonces `stage` sigue en `seguimiento`. Cuando repite y pulsa "Sí, iniciar cierre", `stage` pasa a `cierre`. Dado un engagement en `plan`, la ruta responde 409 y `stage` no cambia. | R-006.1 | navegador + consulta a `engagements` |
| CA-006.2 | Dado un engagement en `cierre`, cuando el coach intenta guardar una nota, entonces la ruta responde 409 con el texto de la sección de pantallas, `sessions` no tiene fila nueva y `audit_log` no tiene fila nueva. Un insert directo en `sessions` con la sesión del coach falla por RLS. | R-006.2 | RLS (`scripts/rls-check.ts`) + navegador |
| CA-006.3 | Dado un borrador con una afirmación cuya cita no está en el registro que cita, y otra cuyo ID no está en el material enviado, cuando se valida, entonces ninguna de las dos se guarda y las dos aparecen en `descartados`. | R-006.5 | prueba offline |
| CA-006.4 | Dado un engagement sintético con `cedula_profesional` llena, cuando se arma el texto del prompt del cierre, entonces ese texto no contiene el valor de la cédula ni las claves de las cuatro columnas de verificación. | R-006.4 | prueba offline |
| CA-006.5 | Dado un resumen con `status = 'borrador'`, cuando se consulta `closing_summaries` y `persona_closing_summaries` con la sesión de la persona, entonces las dos consultas devuelven cero filas. Cuando el coach aprueba, la persona lee una fila en `persona_closing_summaries` y sigue sin leer `closing_summaries`. | R-006.3, R-006.7 | RLS (`scripts/rls-check.ts`) + navegador |
| CA-006.6 | Dado un borrador con la palabra "debilidades" en un texto de `fortalezas` y otra vez en `para_el_coach`, cuando se valida, entonces hay una bandera `termino_no_permitido` en la ruta de cada texto. Cuando el coach aprueba sin corregir, la ruta responde 400 con la ruta del texto de `fortalezas`, el resumen sigue en `borrador` y `cerrado_en` sigue nulo. Cuando corrige solo ese texto y aprueba, el resumen se aprueba con la bandera de `para_el_coach`. | R-006.6, R-006.13 | prueba offline + navegador |
| CA-006.7 | Dado un resumen aprobado, cuando se lee `persona_closing_summaries.contenido`, entonces no tiene citas, IDs de sesión ni señales. Cuando el coach intenta editar el resumen aprobado, la actualización no cambia ninguna fila. | R-006.7 | prueba offline + RLS (`scripts/rls-check.ts`) |
| CA-006.8 | Dado un resumen aprobado, cuando la persona pulsa "Esto no me representa" y envía, entonces queda un `profile_event` `no_me_representa` con `origen = 'cierre'`, y la vista del coach lo muestra como comentario sobre el resumen de cierre. Cuando el coach lo cierra con "Revisado con {nombre}", el evento queda `rejected` con `decided_by` y `decided_at`, y `closing_summaries` y `persona_closing_summaries` no cambian. | R-006.8 | RLS (`scripts/rls-check.ts`) + navegador |
| CA-006.9 | Dado el repositorio, cuando se buscan llamadas de red en las rutas de cierre, entonces la única salida es la llamada al proveedor del modelo en `lib/ai/`. | R-006.9 | revisión de código (búsqueda) |
| CA-006.10 | Dado un engagement sin consentimiento vigente (nunca dado o retirado), cuando el coach pide el borrador o aprueba el resumen, entonces la ruta responde 409, `closing_summaries` y `persona_closing_summaries` no tienen filas nuevas ni cambiadas y `audit_log` tampoco. Un insert directo en esas tablas con la sesión del coach falla por RLS. | R-006.10 | RLS (`scripts/rls-check.ts`) + navegador |
| CA-006.11 | Dado un borrador generado, cuando se consulta `audit_log`, entonces hay una fila con `accion = 'propose_closing_summary'`, `ok = true` y `modelo`, `prompt_version`, `tokens_entrada`, `tokens_salida` y `latencia_ms` no nulos. | R-006.11 | RLS (consulta con la sesión del coach) |
| CA-006.12 | Dada la pantalla del aviso de 002, cuando la persona la abre, entonces ve el párrafo sobre qué pasa con sus datos al cerrar, o el texto que dice que la retención está pendiente. | R-006.12 | navegador |
| CA-006.13 | Dado un borrador con "Memoria de trabajo" en un texto de `fortalezas` y "es autista" en un texto de `apoyos`, cuando se valida, entonces el primero tiene una bandera `termino_interno` y el segundo una `mencion_condicion`. Cuando el coach aprueba, la ruta responde 400, el resumen sigue en `borrador` y `persona_closing_summaries` no tiene fila. | R-006.6, R-006.13 | prueba offline + navegador |
| CA-006.14 | Dada la página de cierre de la persona, cuando se revisan sus consultas, entonces solo lee `persona_closing_summaries` (y `private.app_mi_acompanamiento()` de 002 si hace falta), no selecciona columnas de `engagements` y la fecha que muestra es `created_at` de esa fila. | R-006.14 | revisión de código (búsqueda) + navegador |
| CA-006.15 | Dado un acompañamiento cerrado con resumen aprobado y la opción propuesta en 002 para el retiro, cuando la persona retira su consentimiento, entonces el coach recibe cero filas de `closing_summaries`, la persona recibe cero filas de `persona_closing_summaries` y ninguna fila se borró. | R-006.15 | RLS (`scripts/rls-check.ts`) + consulta SQL como owner |
| CA-006.16 | Dada la ruta del borrador activada, cuando se lee el archivo de `legal/` que apunta `AVISO_VERSION`, entonces tiene la sección de lo que llega al modelo en el cierre, y su fecha es posterior a la del aviso que no la tenía. | R-006.16 | prueba offline |
| CA-006.17 | Dada la sesión de la persona, cuando intenta insertar o actualizar en `closing_summaries` o `persona_closing_summaries`, o actualizar `engagements`, entonces la base lo rechaza. Dada la sesión del coach, cuando intenta un UPDATE directo de `stage`, `cerrado_en` o `cerrado_por`, entonces la base lo rechaza. | R-006.1, R-006.7, R-006.17 | RLS (`scripts/rls-check.ts`) |
| CA-006.18 | Dado un engagement en `cierre`, cuando el coach pide una propuesta de plan, edita un ítem de un borrador, aprueba una propuesta de perfil pendiente, pide otra vez una propuesta (R-004.29), pide recursos o genera un módulo, entonces cada ruta responde 409 con el texto de la sección de pantallas y no hay filas nuevas ni cambiadas en las tablas de R-006.18 ni en `audit_log`. Un insert directo con la sesión del coach en `plans`, `profile_snapshots`, `recommendations` o `modules` falla por RLS. Un insert de una fila `activa` en `signal_states` falla y uno de una fila `cerrada` pasa. | R-006.18 | RLS (`scripts/rls-check.ts`) + prueba de ruta |
| CA-006.19 | Dado un engagement con `cerrado_en` lleno, una alerta fuerte abierta y un comentario de cierre pendiente, cuando el coach marca la alerta como atendida y cierra el comentario con "Revisado con {nombre}", entonces los dos cambios se guardan. Cuando la persona envía "Esto no me representa" sobre su resumen o retira su consentimiento, entonces el evento se guarda. Cuando el coach pide otro borrador del resumen, la ruta responde 409, y un insert directo en `closing_summaries` falla por RLS. | R-006.19 | RLS (`scripts/rls-check.ts`) + navegador |
| CA-006.20 | Dado un snapshot con dos señales, una de ellas cerrada en `signal_states`, cuando se arma el prompt del cierre, entonces el texto trae la señal activa solo en el bloque para el coach y no trae la cerrada. Dado un borrador con una afirmación de `apoyos` respaldada por esa señal, cuando se valida, entonces no se guarda y aparece en `descartados`. | R-006.3, R-006.20 | prueba offline |

## Datos

Propuesta contra `lib/db/schema.ts` y `drizzle/0002_permisos.sql`, sujeta a las decisiones abiertas 1, 2, 7, 8 y 9. Todo vive en el esquema `app` (C-16, D-032 en propuesta). Las migraciones de 006 corren al final, después de las de 002, 003, 004 y 005.

- `engagements`: agregar `cerrado_en` (timestamptz, nulo) y `cerrado_por` (uuid, referencia a `users.id`, nulo). Fuera de `engagements_update_coach_alta` de 002 (que solo cubre `diagnostico_verificado` y `cedula_profesional`), no hay política de UPDATE sobre `engagements` ni grant de update para `authenticated`; `stage`, `cerrado_en` y `cerrado_por` no tienen grant, y las transiciones van por funciones, como en 002 y 003.
  - Retirado: la política `engagements_update_coach` y el grant de update sobre `stage`, `cerrado_en` y `cerrado_por` que proponía la versión 1. Razón: los grants por columna valen para todo `authenticated`, y la regla común de las specs es que ningún rol tiene UPDATE genérico sobre `engagements`.
- Funciones nuevas en `private`, `security definer`, `search_path = ''`, con los mismos permisos de ejecución que las de `drizzle/0000_helpers.sql`:
  - `private.app_iniciar_cierre(eid uuid)`: si `private.app_is_coach_of(eid)` y `stage = 'seguimiento'`, pone `stage = 'cierre'` y devuelve true; si no, no cambia nada y devuelve false, y la ruta responde 409 (R-006.1).
  - `private.app_cerrar_acompanamiento(eid uuid)`: si `private.app_is_coach_of(eid)`, `stage = 'cierre'`, `cerrado_en` es nulo, `private.app_has_consent(eid)` y existe un `closing_summaries` aprobado de `eid`, pone `cerrado_en = now()` y `cerrado_por = auth.uid()`. La ruta de aprobación la llama en la misma transacción, después de marcar el resumen como aprobado y antes de escribir `persona_closing_summaries` (R-006.7).
- Helper nuevo `private.app_engagement_abierto(eid uuid)`, `security definer`, `search_path = ''`, que devuelve true cuando `stage <> 'cierre'`. Va en una migración nueva de 006 (nombre propuesto `drizzle/NNNN_cierre.sql`), no en `drizzle/0000_helpers.sql`, que es una migración que ya corrió.
- Bloqueo en la etapa `cierre` (R-006.18): la misma migración borra y vuelve a crear cada política que nombra R-006.18 con la condición que le da su spec dueña más `and (select private.app_engagement_abierto(engagement_id))` en el `with check`. En `plan_items`, la condición va a través del plan padre, como el consentimiento en 003. Como las migraciones de 006 corren al final, esas políticas ya existen cuando corre. Los nombres de las tablas de 004 y 005 que no tienen nombre final se toman de su spec cuando pasen a detalladas.
- Cambio en la política existente `sessions_insert_coach`: agregar `and (select private.app_engagement_abierto(engagement_id))` al `withCheck` (R-006.2). La condición de consentimiento vigente de 002 se queda como está.
- Lo que sigue permitido (R-006.19) no cambia de política: la de update de alertas de 004, `profile_events_update_coach`, `profile_events_insert_persona_feedback` y `consent_events_insert_persona` no suman la condición de etapa.
- Enum nuevo `app.closing_status` con `borrador` y `aprobado`, igual que `plan_status`.
- Tabla nueva `app.closing_summaries`: `id` (uuid), `engagement_id` (referencia a `engagements`, `on delete cascade`), `contenido` (jsonb con `fortalezas[]`, `apoyos[]` y `para_el_coach`; cada afirmación lleva `texto` y `respaldo` con tipo, ID y cita), `descartados` (jsonb), `banderas` (jsonb), `status` (`closing_status`, por defecto `borrador`), `approved_by`, `approved_at`, `prompt_version`, `model`, `created_by`, `created_at`. Un resumen aprobado por engagement (índice único parcial sobre `engagement_id` donde `status = 'aprobado'`). La forma de `contenido` es suposición del equipo hasta que exista su esquema Zod. Un respaldo de tipo ítem del plan cita el ítem de la versión vigente; si hace falta seguirlo hacia atrás, se usa `origen_item_id` (003). Un respaldo de tipo señal usa como ID el tipo de la señal, porque hay una sola activa por tipo (R-004.37), y solo vale en `para_el_coach` (R-006.20).
  - Políticas: `closing_summaries_select_coach` con `private.app_is_coach_of(engagement_id)`; `closing_summaries_insert_coach` con `private.app_is_coach_of(engagement_id)`, `created_by = auth.uid()`, `private.app_has_consent(engagement_id)` (R-006.10), `not private.app_engagement_abierto(engagement_id)` y `cerrado_en` nulo (R-006.19); `closing_summaries_update_coach` solo sobre filas con `status = 'borrador'`. Ninguna política para la persona.
  - Grants: `select` e `insert`, y `update (contenido, status, approved_by, approved_at)`. El `grant select on all tables` de `0002_permisos.sql` solo cubrió las tablas que existían cuando corrió, así que la migración nueva debe dar los grants de esta tabla.
- Tabla nueva `app.persona_closing_summaries`: `summary_id` (PK, referencia a `closing_summaries.id`, `on delete cascade`), `engagement_id` (referencia a `engagements`, `on delete cascade`), `contenido` (jsonb con `fortalezas[]` y `apoyos[]`, solo texto), `created_at`. Se escribe en la misma transacción que la aprobación, como `persona_profiles` (D-033, propuesta) y `persona_plans` (003). Políticas: select para coach o persona del engagement; insert solo coach, con `private.app_has_consent(engagement_id)`. Grants: `select` e `insert`. La persona no tiene insert ni update aquí (R-006.17).
- Bloqueo al retirar el consentimiento (R-006.15): si se aprueba la opción propuesta en 002, las políticas de select de `closing_summaries` y `persona_closing_summaries` agregan `private.app_has_consent(engagement_id)`.
- Escrituras de la persona: 006 no suma ninguna. Su "Esto no me representa" sobre el cierre usa el modelo de 005 (R-006.8, R-006.17).
- Los casos de CA-006.2, CA-006.5, CA-006.7, CA-006.8, CA-006.10, CA-006.15, CA-006.17, CA-006.18 y CA-006.19 se agregan a `scripts/rls-check.ts`, el script que define 002.
- No se crea ninguna tabla de reportes a la empresa (R-006.9).

Hechos del código que afectan la retención (decisión abierta 3):

- Las tablas hijas de `engagements` que existen hoy (`sessions`, `profile_events`, `profile_snapshots`, `persona_profiles`, `plans`, `plan_items`, `recommendations`) tienen `on delete cascade`, y `audit_log.engagement_id` usa `set null`. Borrar un engagement borra todo eso y deja las filas de `audit_log` sin vínculo.
- Las tablas nuevas de 002 a 005 (por ejemplo `consent_events` y `persona_plans`) definen su propio `on delete` en su spec. Hay que revisarlas antes de decidir la opción 3.
- Nadie puede borrar un engagement desde la app: no hay grant de `delete` sobre `engagements` ni política de DELETE. Solo se podría con el rol de servicio.
- `profile_events.session_id` referencia `sessions` sin `on delete`. Borrar solo las notas (opción 3b) falla mientras haya eventos que las citen.
- Las citas guardadas en `profile_snapshots.perfil`, `plan_items.evidencia` y `closing_summaries.contenido` son texto literal de las notas. Borrar `sessions` no borra ese texto.

## Pantallas y textos

Coach, en la ficha del acompañamiento:

- Botón: "Iniciar cierre"
- Diálogo: "Vas a iniciar el cierre de este acompañamiento. Después ya no podrás registrar sesiones nuevas, aprobar propuestas de la IA ni cambiar el plan o los recursos. Si tienes propuestas sin revisar, revísalas antes." Botones: "Sí, iniciar cierre" y "Cancelar".
- En `cierre`, la página del acompañamiento no muestra los botones de las acciones de R-006.18. Siguen los de alertas, señales y comentarios (R-006.19).
- Error al guardar una nota en cierre: "Este acompañamiento está en cierre. Ya no se pueden registrar sesiones nuevas. No se guardó la nota ni se envió a la IA."
- Error de otra acción de R-006.18 en cierre: "Este acompañamiento está en cierre. Ya no se pueden cambiar el perfil, el plan ni los recursos. No se guardó nada ni se envió a la IA."
- Error si no hay consentimiento vigente: "La persona no tiene un consentimiento vigente. No se preparó el borrador ni se envió nada a la IA."
- Error al aprobar sin consentimiento vigente: "La persona no tiene un consentimiento vigente. No se aprobó el resumen y el acompañamiento sigue abierto."
- Botón: "Preparar borrador del resumen"
- Aviso sobre el borrador: "Borrador hecho con IA. Revísalo y corrígelo antes de aprobar. La persona no lo ve hasta que lo apruebes."
- Aviso de banderas en `fortalezas` y `apoyos`: "Corrige estas palabras antes de aprobar. La persona verá este texto."
- Aviso de banderas en la parte para el coach: "Revisa estas palabras. Este texto solo lo ves tú."
- Botón: "Aprobar resumen"
- Error al aprobar con banderas en un texto para la persona: "No se aprobó el resumen. Hay palabras que la persona no debe ver en {sección}. Corrígelas y vuelve a aprobar."
- Comentarios "Esto no me representa" sobre el resumen de cierre: opción y textos de 005 ("Revisado con {nombre}").
- Diálogo: "Al aprobar, el acompañamiento queda cerrado y la persona podrá ver este resumen en lenguaje claro. Después ya no podrás cambiarlo. No se manda nada a la empresa." Botones: "Aprobar" y "Seguir revisando".

Persona:

- Antes de la aprobación: "Tu coach está preparando el resumen de cierre de tu acompañamiento."
- Título: "Cierre de tu acompañamiento"
- "Tu acompañamiento terminó el {fecha}. Aquí está lo que trabajaste con tu coach." La fecha es `persona_closing_summaries.created_at` (R-006.14).
- Secciones: "Tus fortalezas" y "Apoyos que te sirven y que puedes pedir"
- Botón: "Esto no me representa" (textos y estados de 005)
- Datos: "Qué pasa con tu información: {texto pendiente de la decisión abierta 3}"
- Ayuda: "Si tienes dudas, escribe a tu coach."

## Reglas fijas fuera del LLM

- El contexto del prompt se arma con una consulta que no selecciona columnas de verificación (R-006.4).
- Validación de cada respaldo por ID contra el material enviado y de su cita contra el registro citado, con `citaEnNota` (R-006.5, D-034).
- Al prompt solo llegan las señales activas (snapshot menos las cerradas en `signal_states`), en el bloque para el coach (R-006.3), y se descarta toda afirmación de `fortalezas` o `apoyos` respaldada por una señal (R-006.20).
- `buscarTerminos` y `TERMINOS_CONDICION` sobre el borrador y sobre cada texto que guarda el coach (R-006.6), y búsqueda de etiquetas de `DOMINIOS_FE` en los textos para la persona (R-006.13).
- La ruta de aprobación responde 400 si un texto de `fortalezas` o `apoyos` tiene banderas `termino_no_permitido`, `mencion_condicion` o `termino_interno` (R-006.13).
- Bloqueo en `cierre` por la ruta y por RLS de cada acción de R-006.18, con `private.app_engagement_abierto`.
- La versión para la persona la arma el código desde el resumen aprobado, no el modelo (R-006.7).
- El cambio a `cierre` solo desde `seguimiento`, revisado en `private.app_iniciar_cierre` (R-006.1).
- `cerrado_en` y `cerrado_por` solo los escribe `private.app_cerrar_acompanamiento` (R-006.7).
- Bloqueo de sesiones en `cierre` por la ruta y por RLS (R-006.2).
- Consentimiento vigente revisado en la ruta y en las políticas de INSERT antes del borrador y de la aprobación (R-006.10).
- Ninguna ruta del cierre llama a un servicio externo fuera del proveedor del modelo (R-006.9).

## Prompts

Archivo nuevo fechado en `prompts/` con el formato `AAAA-MM-DD_resumen-de-cierre.md` (REGLAS §7), creado cuando esta spec pase a "revisada por Acker". Cada fila de `closing_summaries` guarda la versión que la produjo (C-18). Cada llamada se audita con `accion = 'propose_closing_summary'` (R-006.11), que sigue el patrón de la acción existente `propose_profile_update`.

El prompt incluye la regla C-13: ser callada o reservada no es un área de apoyo. También separa las señales activas en un bloque que solo puede alimentar `para_el_coach` (R-006.3); el descarte de R-006.20 lo hace el código aunque el modelo no siga esa instrucción. 007 incluye un caso sintético de cierre en su formato de casos (`eval/cases/`) para probar esa regla junto con R-006.4, R-006.5, R-006.13 y R-006.20.

## Decisiones abiertas

| # | Pregunta | Opciones (pros y contras) | Propuesta | Decide |
|---|---|---|---|---|
| 1 | Cómo se marca que el acompañamiento terminó | (a) `stage = 'cierre'` como estado final y `closing_summaries.approved_at` como fecha de fin: sin columnas nuevas en `engagements`, pero no distingue "cerrando" de "cerrado" sin consultar otra tabla. (b) `stage = 'cierre'` al iniciar, y `cerrado_en` y `cerrado_por` al aprobar el resumen: separa las dos fases y deja quién cerró; suma dos columnas y una función. | (b) | Acker |
| 2 | Qué lee la IA para el resumen | (a) Solo material aprobado: menos datos al modelo y todo ya pasó por el coach; puede perder matices de las notas. (b) También las notas originales: resumen más completo; manda más texto sensible al modelo y la validación de citas tendría que cubrir notas y registros. Sobre las señales: con (a) entran solo las activas y solo para `para_el_coach` (R-006.3). La alternativa es no mandarlas: menos datos al modelo; el coach pierde en el resumen el estado de las señales al cerrar. | (a), con las señales activas solo para el coach | Acker |
| 3 | Qué pasa con los datos al cerrar | (a) Se guardan en solo lectura: el coach puede consultar después; guarda datos de salud sin plazo. (b) Se borran notas y señales y queda el resumen aprobado: menos datos sensibles; se pierde el rastro de evidencia y hay que cambiar la referencia de `profile_events.session_id`; las citas copiadas en snapshots y resúmenes siguen ahí. (c) Se borra todo a petición de la persona: le da control; hay que definir plazo y quién lo ejecuta, porque la app no puede borrar engagements. Cualquier opción necesita revisar el texto oficial de la LFPDPPP sobre datos sensibles, que sigue pendiente (F-026 es secundaria; CONTEXTO §6). | Ninguna hasta tener la respuesta del partner y la revisión del texto oficial. En el demo, (a) con datos sintéticos. | Los tres, con la respuesta del partner |
| 4 | Reporte a la empresa en el MVP | (a) No se construye; el pitch muestra la regla C-11. (b) Texto exportable aprobado por el coach: construirlo sin saber qué lleva el reporte real sería inventar su contenido. | (a) | Los tres |
| 5 | Si alguna vez hay reporte, si la persona lo ve antes de que salga | (a) Sí, y lo acepta: coincide con que el perfil lo revisan y firman la persona y el coach (F-005, CONTEXTO §4); suma un paso. (b) Solo el coach aprueba: más rápido; la persona no sabe qué se dijo de ella. | (a), como interpretación del equipo | Los tres, con la respuesta del partner |
| 6 | Cómo distingue el coach un "Esto no me representa" del cierre de uno del perfil o del plan | El modelo de datos es de 005. (a) Usar el modelo de 005 sin marca de origen: sin cambios; el coach no sabe de qué pantalla vino. (b) Que el modelo de 005 tenga un campo de origen con `cierre` entre sus valores: sin cambio de políticas si 005 ya distingue perfil y plan. (c) Valor nuevo en el enum `profile_event_type`: queda en la base; obliga a cambiar las políticas de la persona sobre `profile_events`. | Resuelta en la versión 3 con (b): 005 tiene `origen = 'cierre'` en R-005.33 y su requisito nuevo para cerrar esos comentarios con "Revisado con {nombre}" (estado `rejected`). | Acker, en 005 |
| 7 | Cómo cambia `engagements` al iniciar el cierre y al cerrar | (a) Funciones `security definer` en `private` (`app_iniciar_cierre` y `app_cerrar_acompanamiento`): ningún rol tiene UPDATE sobre `engagements` y la regla de la transición vive en la base; son dos funciones más que probar. (b) Una función para iniciar y un trigger sobre `closing_summaries` que llena `cerrado_en` al aprobar: un paso menos en la ruta; el cierre queda escondido en un trigger. (c) Política `engagements_update_coach` con grant por columna (versión 1): simple; el grant vale para todo `authenticated` y deja abierta la etapa a cualquier política de UPDATE futura. | (a). Propuesta (Claude), decide Acker | Acker, junto con 002 y 003 |
| 8 | Qué hace una bandera en un texto que verá la persona (`fortalezas` y `apoyos`) | (a) Bloquea la aprobación hasta que el coach corrija, igual que R-003.30: C-09 se cumple con código; un falso positivo ("Flexibilidad" o "Iniciación" son palabras de todos los días) obliga a reescribir, y la lista se ajusta en la decisión 9 de 003. (b) Bloquea salvo que el coach confirme que la revisó, como la casilla de R-005.18: menos fricción; C-09 queda en manos de la lectura del coach. (c) Solo marca, como en la versión 2: lo más simple; 003 descartó "solo aviso" en su decisión 9 porque rompe C-09. | (a). Propuesta (Claude), decide Acker | Acker, junto con 003 y 005 |
| 9 | Qué pasa con las propuestas de la IA sin revisar al iniciar el cierre | (a) En `cierre` ya no se aprueban (R-006.18) y el diálogo de "Iniciar cierre" avisa antes: el perfil que lee el resumen no cambia; una propuesta pendiente queda sin decidir. (b) `private.app_iniciar_cierre` rechaza mientras haya propuestas sin revisar: no queda nada colgado; el coach tiene que revisarlas o descartarlas antes. (c) Se pueden aprobar mientras `cerrado_en` sea nulo: el perfil queda completo; un borrador ya hecho puede quedar viejo y hay que volver a pedirlo. | (a). Propuesta (Claude), decide Acker | Acker |

## Verificación

- Las pruebas offline de CA-006.3, CA-006.4, CA-006.6, CA-006.7, CA-006.13, CA-006.16 y CA-006.20 pasan con el caso sintético de cierre de 007.
- Los casos RLS de CA-006.2, CA-006.5, CA-006.7, CA-006.8, CA-006.10, CA-006.15, CA-006.17, CA-006.18 y CA-006.19 están en `scripts/rls-check.ts` (002) y pasan con las cuentas `.test` de coach y persona.
- CA-006.1, CA-006.2, CA-006.5, CA-006.6, CA-006.8, CA-006.10, CA-006.11, CA-006.13, CA-006.14, CA-006.18 y CA-006.19 pasan en el navegador, con pruebas de ruta o con consultas con las mismas cuentas.
- CA-006.9 y CA-006.14: una búsqueda en el código confirma que las rutas de cierre no llaman a servicios externos fuera de `lib/ai/`, que el armado del prompt no lee columnas de verificación y que la página de la persona no lee `engagements`.
- CA-006.12 se revisa en la pantalla del aviso cuando 002 esté implementada.

## Preguntas para el partner

- Cómo cierran hoy un acompañamiento de inclusión al terminar los 6 meses: si hay sesión o documento de cierre.
- Si un acompañamiento puede terminar antes, por ejemplo si la persona deja el trabajo o decide no seguir, y cómo lo cierran en ese caso.
- Qué llevan los reportes a la empresa, cada cuánto se mandan y quién los recibe.
- Si la persona ve esos reportes antes de que salgan.
- En Workplace Support, cuánto dura el acompañamiento y si también se reporta a la empresa.
- Si el cierre incluye a la red de apoyo (líder y mentor).
- Qué información guardan después de cerrar, por cuánto tiempo, y si tienen aviso de privacidad o política de retención que debamos seguir.
- Si la persona se queda con algo al terminar, como su perfil o sus apoyos.
- Si un acompañamiento cerrado se puede reabrir, o si la misma persona puede empezar uno nuevo.
- Si sus financiadores (F-005 menciona al BID antes y a una fundación en EUA) les piden indicadores al cerrar y cuáles, para orientar el What's next de métricas de impacto.

## Cambios

Versión 3 · 2026-10-29 · ajustes de consistencia

- C-09 en los textos para la persona: R-006.6 suma `TERMINOS_CONDICION` de 003 y el recálculo al guardar. R-006.13 pasa de marcar a bloquear la aprobación (400) cuando `fortalezas` o `apoyos` traen `termino_no_permitido`, `mencion_condicion` o `termino_interno`, igual que R-003.30; en `para_el_coach` las banderas solo avisan. Cambian CA-006.6 y CA-006.13, los avisos de banderas y el error de aprobación. Nueva decisión abierta 8 con las alternativas.
- Nuevo R-006.18: cada ruta y política que suma `private.app_engagement_abierto` en `cierre` (perfil y seguimiento, plan, recursos y módulo, señales). Nuevo R-006.19: lo que sigue permitido, también después de cerrar (alertas, señales, comentarios, "Esto no me representa" y consentimiento de la persona). Nuevos CA-006.18 y CA-006.19, textos de pantalla y decisión abierta 9 sobre propuestas sin revisar.
- El helper `private.app_engagement_abierto` sale de `drizzle/0000_helpers.sql` y va en una migración nueva de 006, que también reemplaza las políticas de R-006.18. `closing_summaries_insert_coach` exige `stage = 'cierre'` y `cerrado_en` nulo.
- Señales: R-006.3 manda solo las señales activas (regla nueva de 004) y solo en el bloque para el coach. Nuevo R-006.20 y CA-006.20: una afirmación de `fortalezas` o `apoyos` respaldada por una señal se descarta. R-006.5 suma el respaldo de tipo señal. La decisión abierta 2 anota la alternativa de no mandar señales.
- R-006.8 y CA-006.8 usan `origen = 'cierre'` (R-005.33) y el cierre "Revisado con {nombre}" de 005. La decisión abierta 6 queda resuelta.
- Datos, viñeta de `engagements`: dice que fuera de `engagements_update_coach_alta` de 002 no hay UPDATE sobre `engagements`.
- R-006.14 y CA-006.14 nombran `private.app_mi_acompanamiento()` (R-002.40). R-006.17 dice "la lista de 002; 005 no le agrega escrituras".
- Alcance suma lo que se bloquea en `cierre`; "Depende de" y Verificación se actualizan.

Versión 2 · 2026-10-29 · consolidación entre specs

- R-006.10 y CA-006.10 usan el consentimiento vigente de 002 (`private.app_has_consent`) en vez de `engagements.consentimiento_en`, y cubren también la aprobación.
- R-006.1 y R-006.7 cambian la etapa y el cierre con funciones `security definer`. Se retira la política `engagements_update_coach` y su grant (decisión abierta 7, nueva).
- R-006.8, CA-006.8 y la decisión abierta 6 remiten a 005, dueña de "Esto no me representa".
- "Fuera de alcance" corregido: las sesiones con la red de apoyo son sesiones de seguimiento de 004. Se agrega que la restricción de 002 (un acompañamiento por persona) impide abrir otro después del cierre.
- R-006.3 usa la versión vigente del plan aprobado; R-006.5 valida también el ID del respaldo contra el material enviado.
- R-006.12 y CA-006.12 remiten al aviso de 002.
- Nuevos R-006.14 a R-006.17 y CA-006.14 a CA-006.17: lo que lee la persona, bloqueo al retirar el consentimiento, versión del aviso, escrituras de la persona y UPDATE directo sobre `engagements`.
- El prompt pasa a `AAAA-MM-DD_resumen-de-cierre.md`; el caso de cierre vive en 007; las pruebas RLS van a `scripts/rls-check.ts`; las migraciones de 006 corren al final.
- D-029 figura como decidida por los tres según Acker, pendiente de registrar.
