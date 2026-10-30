<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# 004 · Sesiones de seguimiento y señales

- Estado: Borrador · Versión 4 · 2026-10-30
- Fuentes: F-005 (23:31, 45:53, 13:12), F-012, F-018, D-015, D-016, D-021, D-058, D-031, D-032, D-033, D-034, D-035, REGLAS §2.5, §3 y §6, CONTEXTO §4, §5 y §6 (roles y pasos 4 y 5). Reglas de la constitución: C-01, C-03, C-04, C-05, C-06, C-07, C-08, C-09, C-10, C-11, C-12, C-13, C-14, C-16, C-17, C-18
- Depende de: 001 (pipeline nota → propuesta → aprobación y sus huecos H-1, H-3, H-5, H-9 y H-11), 002 (consentimiento vigente, bloqueo por retiro, aviso de privacidad, lista de lo que escribe la persona y `scripts/rls-check.ts`), 003 (plan aprobado con sus ítems, `origen_item_id` entre versiones, fichas verificadas y la tabla de transiciones que pasa el acompañamiento a `seguimiento`), 005 ("esto no me representa"). Sus migraciones corren después de las de 002 y 003.

Esta spec es de requisitos y no trae tareas. D-015, D-016 y D-021 están en estado propuesta en CONTEXTO §9. D-058 y D-030 están decididas por los tres según Acker; falta que David y Rodrigo lo confirmen en CONTEXTO §9. D-031 a D-035 son propuestas en CONTEXTO §9; las decide Acker. Lo que esta versión toma de la consolidación entre specs se marca "Propuesta (Claude), decide Acker".

## Problema y para quién

En los proyectos de inclusión, Specialisterne acompaña a la persona seis meses con una hora por semana y 30 minutos cada dos semanas con su red de apoyo (líder y mentor), y manda reportes a la empresa (F-005, CONTEXTO §4). Workplace Support usa el mismo coaching con personas que ya trabajan (F-005, CONTEXTO §4); su duración y frecuencia no están confirmadas y van en las preguntas para el partner. Hoy el seguimiento es muy manual: notas del coach y memoria (F-005, 23:31). La coach anota detalles personales para preguntar por ellos en la siguiente sesión y lo ve como parte del vínculo (F-005; CONTEXTO §4 lo anota bajo el punto del 23:31, sin minuto propio). El coaching se enfoca en objetivos y prioridades (F-005, 45:53).

En el seguimiento se registran objetivos y prioridades, objetivos del equipo, notas de contexto como vacaciones o asuntos personales, y riesgos: estrés o desregulación, querer renunciar, cambios de vida y desajuste con el rol (CONTEXTO §5). Los objetivos del equipo y los ajustes razonables viven como ítems del plan (tipos `objetivo_equipo` y `ajuste_razonable`, propuestos en 003); esta etapa registra su avance. El flujo del demo pide que el coach registre la sesión, que la IA actualice el avance y detecte señales con evidencia citada, que recuerde el contexto para la siguiente sesión y proponga el siguiente paso, y que el coach valide (CONTEXTO §6, paso 4).

Para quién:

- El coach, que hoy depende de su memoria para saber qué pasó en sesiones anteriores y qué quedó pendiente.
- La persona, que recibe un acompañamiento que no pierde el hilo entre sesiones. No ve nada de lo que se registra en esta etapa salvo los cambios al perfil que el coach apruebe (C-09).

Motivación, sin promesa de predicción: un estudio longitudinal de ocho años con 2,449 adultos autistas de Países Bajos encontró cuatro trayectorias de empleo, y una es de empleo que se va reduciendo (F-018). En jóvenes de 18 a 23 años, las dificultades de función ejecutiva fueron el predictor más claro de menor empleo competitivo (F-012). Que un seguimiento ordenado ayude al coach a notar a tiempo un patrón que se repite es interpretación del equipo. El sistema no calcula probabilidades ni puntajes de riesgo.

## Alcance

Entra:

- Registrar sesiones de seguimiento con la persona y con la red de apoyo, con fecha y tipo. Las sesiones con el líder y el mentor (cada dos semanas en inclusión, CONTEXTO §4) son sesiones de seguimiento de esta spec.
- Proponer avance sobre los ítems aprobados del plan (003), incluidos objetivos del equipo y ajustes razonables, con cita de la nota, y seguir a cada ítem cuando el plan cambia de versión.
- Proponer señales de los cuatro tipos de `SENALES` con evidencia, aprobarlas y cerrarlas sin crear una versión nueva del perfil.
- Marcar como alerta fuerte las señales que el coach considere fuertes. La app se las muestra al coach y registra que él las pasó a una persona del equipo de Specialisterne fuera del sistema (C-12).
- Guardar el contexto que el coach aprueba para la siguiente sesión y mostrarlo antes de escribir la nota nueva.
- Proponer un siguiente paso ligado a un ítem del plan o a una ficha verificada (C-06).
- Cerrar los huecos de 001 que le tocan: H-1 (retomar una propuesta pendiente), H-3 (reintentar tras un 502 sin duplicar la sesión), H-5 (cambiar el tipo de un cambio antes de aprobarlo), H-9 (editar el texto de un cambio antes de aprobarlo) y H-11 (huecos de auditoría).
- La prueba de sesgo propia de esta etapa (C-13).

**Fuera de alcance:**

- Reportes a la empresa. En esta etapa nada sale hacia la empresa (C-11). Qué va en el reporte y quién lo aprueba se define en 006 o en "What's next", según lo que conteste el partner.
- Lo que ve la persona de su avance o de sus recursos: 005.
- "Esto no me representa", sobre el perfil y sobre el plan aprobado, incluido marcarlo como revisado (H-2 de 001): 005 es dueña de su ciclo de vida y de su modelo de datos.
- Cambiar la etapa del acompañamiento. 003 tiene la tabla de transiciones y 006 el paso a `cierre`.
- Qué se bloquea de esta spec cuando el acompañamiento está en `cierre` (el reintento de R-004.29, la creación de avance, contexto, estado de señales y alertas) y qué sigue permitido, como cambiar el estado de una alerta: 006 lo define en su requisito de rutas y políticas que suman `private.app_engagement_abierto`.
- Notas por voz con Whisper (`sessions.audio_path` existe pero no se usa): "What's next", igual que en 001.
- Un tercer rol que reciba las alertas dentro de la app: "What's next", lo deciden los tres.
- Atención de emergencias. El sistema no es un servicio de crisis.
- Recordatorios, avisos o correos a la persona por cualquier evento de esta etapa (C-14).
- El formato de los casos de eval, los casos sintéticos completos, el caso de demo de punta a punta y el reporte de la prueba de sesgo: 007.

## Requisitos

### Registro de la sesión

| ID | Requisito | Fuente |
|---|---|---|
| R-004.1 | Cuando el coach abre una sesión nueva en un acompañamiento con `stage = 'seguimiento'`, el sistema debe pedirle el tipo de sesión (con la persona o con la red de apoyo) y la fecha en que ocurrió, con la fecha de hoy como valor inicial. La ruta rechaza con 400 una fecha posterior a hoy. | CONTEXTO §4 (F-005); la fecha editable y el límite son interpretación del equipo |
| R-004.2 | Cuando el acompañamiento no tiene consentimiento vigente (002), es decir, cuando `private.app_has_consent(engagement_id)` devuelve `false`, el sistema responde 409, no guarda la nota y no llama al modelo. Usa el mismo chequeo compartido que define 002 y no lee `engagements.consentimiento_en`. | C-10, D-035 (propuesta), R-002.28 y R-002.31 de 002 |
| R-004.3 | La etapa `seguimiento` solo se alcanza al aprobar el primer plan (003), así que siempre debería haber un plan con `status = 'aprobado'`. Si la ruta no lo encuentra (dato inconsistente o seed incompleto), guarda la sesión, no manda ítems del plan al modelo y muestra al coach el aviso de "Sin plan aprobado". | Interpretación del equipo; transiciones de etapa: 003 |
| R-004.4 | El seguimiento debe funcionar para los dos valores de `engagement_type` (`inclusion` y `workplace_support`) con la misma ruta y el mismo esquema de salida; lo que cambia por tipo vive en la configuración del prompt, como hoy hace `ENGAGEMENT_CONFIG` en `lib/prompts.ts`. | D-058 (decidida por los tres según Acker; falta que David y Rodrigo lo confirmen en CONTEXTO §9); esta lectura de D-058 es interpretación del equipo, ver decisión abierta 10 |
| R-004.5 | Cuando el tipo de sesión es "red de apoyo", el sistema trata la nota igual que las demás (solo la lee el coach del acompañamiento) y no tiene campos aparte para nombres, correos ni puestos del líder o del mentor. | REGLAS §6 (datos de terceros), C-07, C-09; interpretación del equipo |
| R-004.38 | Esta etapa no cambia `engagements.stage` ni escribe en `app.engagements`. El paso a `seguimiento` es de 003 y el paso a `cierre` es de 006, cada uno con su función `security definer` en el esquema `private`. Esta spec no agrega ninguna política de UPDATE sobre `app.engagements`. | Propuesta (Claude), decide Acker; 003 es dueña de la tabla de transiciones |
| R-004.39 | La persona no escribe nada nuevo en esta etapa. Lo que puede escribir es la lista única de 002. 005 no le agrega escrituras (R-005.40) y esta spec tampoco. | C-09; lista de escrituras de la persona: 002 |

### Avance sobre el plan

| ID | Requisito | Fuente |
|---|---|---|
| R-004.6 | Cuando hay plan aprobado, el sistema manda al modelo los ítems de la versión vigente (`plan_items.id`, `tipo` y `descripcion`), incluidos los de tipo `objetivo_equipo` y `ajuste_razonable` que propone 003, con su último estado aprobado (R-004.40). El modelo puede proponer un estado nuevo por ítem, solo de esta lista: `avanza` ("Avanza"), `sin_cambios` ("Sin cambios"), `necesita_ajuste` ("Necesita ajuste") y `cumplido` ("Cumplido"). | CONTEXTO §5 y §6 (paso 4); las cuatro etiquetas son interpretación del equipo |
| R-004.7 | Cada avance propuesto lleva al menos una cita literal de la nota. Un avance que se queda sin cita válida se descarta con código. | C-05, D-034 (propuesta) |
| R-004.8 | Un avance que apunta a un id que no está en la versión vigente del plan aprobado de ese acompañamiento se descarta con código y aparece en "descartados". | C-06; interpretación del equipo |
| R-004.9 | El esquema de salida no tiene campos para crear, borrar ni reescribir ítems del plan. Si la nota sugiere un objetivo nuevo, un objetivo del equipo o un ajuste razonable que no está en el plan, el modelo solo puede dejarlo como pregunta para la siguiente sesión, y el coach decide si lo agrega al plan con el flujo de 003. | C-04; tipos del plan: 003 |
| R-004.10 | Cuando el coach aprueba un avance, el sistema lo guarda con el ítem, la sesión, el evento, quién aprobó y cuándo, sin borrar los estados anteriores, para que se vea la historia de cada ítem. | Interpretación del equipo a partir de REGLAS §3 ("nada se descarta sin registro") |
| R-004.40 | Cuando 003 aprueba una versión nueva del plan, el último estado y la historia de cada ítem se leen siguiendo `origen_item_id` (definido en 003) hacia las versiones anteriores. Un ítem sin `origen_item_id` empieza sin avance. | 003 (`origen_item_id`); Propuesta (Claude), decide Acker |
| R-004.41 | Si al revisar una propuesta el plan aprobado ya es otra versión, el sistema lo avisa con texto antes de los botones de aprobar, igual que R-004.27, y guarda cada avance sobre el ítem equivalente de la versión vigente siguiendo `origen_item_id`. Un avance cuyo ítem no tiene equivalente en la versión vigente no se puede aprobar. | Interpretación del equipo |

### Señales y alertas fuertes

| ID | Requisito | Fuente |
|---|---|---|
| R-004.11 | El modelo solo puede proponer señales de los cuatro tipos de `SENALES` (`estres_desregulacion`, `intencion_de_renunciar`, `cambio_de_vida`, `desajuste_con_rol`), cada una con evidencia citada. Un tipo fuera de la lista hace fallar la validación. | CONTEXTO §5, C-05 |
| R-004.12 | Al pedir la propuesta, el sistema manda al modelo las señales activas (las del último snapshot menos las que la tabla de estado marca como cerradas, R-004.13), para que distinga una señal que sigue de una nueva. | Interpretación del equipo a partir de CONTEXTO §6 (paso 4) |
| R-004.37 | Cuando el coach aprueba una señal de un tipo que ya está activa, el sistema suma la evidencia nueva a la señal activa de ese tipo y no crea otra. Hoy `applyApproval` agrega una entrada nueva cada vez. | Interpretación del equipo |
| R-004.13 | El coach puede marcar una señal activa como "Ya no está activa", con un motivo opcional. La señal sale de "Señales activas" y queda en el historial con quién la cerró y cuándo. Cerrarla no crea snapshot nuevo, no cambia la versión del perfil ni `persona_profiles`, y no dispara el aviso de R-004.27: el estado de la señal vive en su propia tabla (decisión abierta 6). | Interpretación del equipo; estado fuera del snapshot: Propuesta (Claude), decide Acker |
| R-004.14 | El sistema no calcula, guarda ni muestra puntaje, probabilidad, nivel ni severidad de una señal, y no predice renuncia ni pérdida de empleo. | Interpretación del equipo a partir de C-01; F-018 solo como motivación |
| R-004.15 | Solo el coach del acompañamiento puede marcar una señal aprobada como alerta fuerte. El esquema de salida del modelo no tiene campo de alerta ni de clasificación. Qué cuenta como alerta fuerte queda en la decisión abierta 1. | C-04, C-12, D-015 (propuesta) |
| R-004.16 | Cuando el coach marca una alerta fuerte, el sistema la registra con quién la marcó, cuándo, el tipo de la señal de origen y una nota opcional del coach, y se la muestra en la lista "Alertas fuertes" del acompañamiento con la indicación de pasarla a la persona de Specialisterne que atiende alertas, fuera del sistema. El sistema no avisa a nadie, no escribe a la empresa, no cambia el plan y no contacta a la persona. Ninguna cuenta fuera del coach del acompañamiento lee la alerta. | C-12, C-11, D-015 (propuesta); dos logins (CONTEXTO §6) y escalamiento fuera del sistema: Propuesta (Claude), decide Acker |
| R-004.17 | Retirado: no hay cuenta que reciba alertas dentro de la app, porque el escalamiento ocurre fuera del sistema. Lo sustituye R-004.42. | Decisión abierta 2 |
| R-004.18 | La persona no ve señales, alertas ni sus estados, y no recibe ningún aviso por ellas. | C-09, C-14 |
| R-004.19 | Junto al botón de alerta, el sistema muestra un texto fijo que dice que la herramienta no atiende emergencias. El texto final depende de que el partner confirme su protocolo. | Interpretación del equipo; ver Preguntas para el partner |
| R-004.42 | El coach puede marcar una alerta fuerte como "Ya la pasé", con la fecha y una nota opcional, y después como "Atendida". La lista "Alertas fuertes" muestra el estado y las fechas de cada alerta. | Propuesta (Claude), decide Acker; sustituye a R-004.17 |
| R-004.52 | Las señales activas de un acompañamiento son las del último snapshot menos las que `signal_states` marca como cerradas (R-004.13). Todo lector las arma con esa regla, escrita en un solo lugar del código: el prompt de seguimiento (R-004.12), el prompt de 001 (R-001.4), que se usa antes de `seguimiento`, "Señales activas" en la página del coach (R-001.23), el panel "Antes de esta sesión" (R-004.22) y la entrada del cierre (R-006.3), donde solo entran en la parte para el coach. Ningún lector toma `senalesActivas` directo del snapshot. | Propuesta (Claude), decide Acker; estado de la señal fuera del snapshot: decisión abierta 6 |

### Contexto para la siguiente sesión y siguiente paso

| ID | Requisito | Fuente |
|---|---|---|
| R-004.20 | El modelo puede proponer hasta cinco notas de contexto (por ejemplo, vacaciones o un asunto personal que el coach quiere retomar), cada una con cita de la nota. | CONTEXTO §5, F-005 (CONTEXTO §4); el límite de cinco es interpretación del equipo, igual al de `preguntasParaSiguienteSesion` |
| R-004.21 | Cuando el coach aprueba preguntas para la siguiente sesión y notas de contexto, el sistema las guarda. Hoy `preguntasParaSiguienteSesion` queda en `profile_events.payload`, pero `Aprobacion` no tiene índices para ellas y no pasan al perfil, así que ninguna pantalla las vuelve a mostrar después de aprobar. | Hueco de 001; CONTEXTO §6 (paso 4) |
| R-004.22 | Al abrir una sesión nueva, el sistema muestra al coach, antes del campo de la nota, el panel "Antes de esta sesión" con la fecha y el tipo de la última sesión, las preguntas guardadas, el contexto guardado, el último estado de cada ítem del plan y las señales activas. | CONTEXTO §6 (paso 4) |
| R-004.23 | El coach puede quitar del panel una pregunta o una nota de contexto que ya no aplica. Lo quitado queda en el historial con quién y cuándo. | Interpretación del equipo |
| R-004.24 | El modelo puede proponer un siguiente paso. Debe apuntar a un ítem del plan aprobado o a una ficha de `knowledge_cards` que exista y tenga `verificada = true`; si no, se descarta con código. Una ficha sin verificar no llega al prompt (mismo filtro que R-003.5 de 003); el descarte con código es la segunda barrera. | C-06, D-015 (propuesta); exigir `verificada` es interpretación del equipo |
| R-004.25 | El modelo no usa las notas de contexto para inferir salud, diagnóstico ni riesgo. Un asunto personal no es una señal salvo que la nota describa un cambio de vida concreto. | C-01; prompt de 001 (sección Señales) |

### Huecos de 001

| ID | Requisito | Fuente |
|---|---|---|
| R-004.26 | Cuando existe una propuesta de la IA con `status = 'proposed'`, la página del acompañamiento la muestra con un botón para revisarla. La revisión se arma con lo guardado en `profile_events.payload`, sin llamar otra vez al modelo. | H-1 de 001: `SessionComposer` guarda la respuesta solo en el navegador |
| R-004.27 | Cada propuesta guarda la versión del perfil con la que se generó. Si al revisarla el último snapshot tiene otra versión, el sistema lo avisa con texto antes de los botones de aprobar. | Interpretación del equipo |
| R-004.28 | Retirado: marcar como revisado un "esto no me representa" (H-2 de 001) es parte del ciclo de vida que define 005. | 005 es dueña de "esto no me representa" |
| R-004.29 | Cuando el modelo falla (502) o falla el guardado de la propuesta después de guardar la nota (500 de tx2), el sistema permite pedir la propuesta otra vez para esa misma sesión, leyendo `sessions.nota_original`, sin crear otra fila en `sessions` y sin que el coach vuelva a escribir la nota. | H-3 de 001: tx1 guarda la sesión antes de llamar al modelo |
| R-004.30 | Si la sesión ya tiene una propuesta de la IA en cualquier estado, el reintento responde 409 con el id de esa propuesta y no llama al modelo. Dos reintentos al mismo tiempo no pueden dejar dos propuestas para la misma sesión. | Interpretación del equipo |
| R-004.31 | La página del acompañamiento lista las sesiones que no tienen propuesta de la IA, con la opción de pedirla. | Interpretación del equipo |
| R-004.43 | Antes de aprobar, el coach puede cambiar el tipo de un cambio propuesto (`fortaleza`, `area_de_apoyo` o `contexto`). La evidencia no cambia, y la decisión guarda el tipo que propuso la IA y el que eligió el coach. Aplica a la revisión de 001 y a la de esta etapa, que son la misma pantalla. | H-5 de 001; C-04, C-08 |
| R-004.44 | Antes de aprobar, el coach puede editar el texto del resumen de un cambio propuesto. Las citas no se editan. El texto editado pasa por la misma revisión de términos de `lib/profile/validate.ts` y muestra sus banderas antes de aprobar. La decisión guarda el texto de la IA y el editado. Aplica a 001 y a esta etapa. | H-9 de 001; C-01, C-04, C-05 |
| R-004.45 | Una llamada exitosa al modelo queda en `audit_log` aunque después falle el guardado de la propuesta: la fila de auditoría se escribe en su propia transacción, separada de la del evento. Aplica a la ruta de 001 y a las de esta etapa. | H-11 de 001; C-17 |
| R-004.46 | Si la respuesta del modelo no pasa `PayloadPropuestaIA.parse` u otra validación del servidor, la ruta responde 502 con el texto de 001, deja la nota guardada y escribe una fila en `audit_log` con `ok = false`. | H-11 de 001; C-17 |
| R-004.47 | El campo `audit_log.error` y los logs del servidor solo guardan la clase y el código del error, nunca el mensaje libre de un error desconocido, para que no lleven texto de la nota. Si la fila de error no se puede escribir, el log del servidor registra solo la acción y el código. | H-11 de 001; C-17 |

### Sesgo, auditoría y reglas comunes

| ID | Requisito | Fuente |
|---|---|---|
| R-004.32 | Ser callada, reservada o poco expresiva no produce una señal, un avance "Necesita ajuste" ni un área de apoyo. | C-13, F-005 (13:12), D-016 (propuesta) |
| R-004.33 | Si la única evidencia de una señal o de un avance "Necesita ajuste" son frases sobre hablar poco o participar poco, el sistema le pone una bandera para que el coach la revise. La bandera no bloquea la aprobación. | C-13; la lista de frases es interpretación del equipo |
| R-004.34 | Para el mismo contenido, cambiar en la nota el nombre, el género o qué tan expresiva es la persona no cambia los tipos de señal ni los estados de avance propuestos. | C-13, D-016 (propuesta) |
| R-004.35 | Cada llamada al modelo de esta etapa queda en `audit_log` con `accion = 'propose_followup_update'`, `modelo`, `prompt_version`, tokens, `latencia_ms` y `ok`, también cuando falla (R-004.45 a R-004.47), sin texto de la nota ni datos personales. | C-17 |
| R-004.36 | El prompt de seguimiento no recibe ningún dato de la verificación del diagnóstico (`diagnostico_verificado`, `cedula_profesional`, `diagnostico_verificado_por`, `diagnostico_verificado_en`). | C-03, D-021 (propuesta) |
| R-004.48 | Las tablas nuevas de esta spec guardan datos derivados de notas y entran en el bloqueo por retiro de consentimiento de 002: el avance de ítems, el contexto para la siguiente sesión, el estado de las señales y las alertas fuertes. Con el consentimiento retirado siguen la regla de 002 (con su propuesta: nada se borra y deja de mostrarse, también al coach), y el reintento de R-004.29 responde 409. | 002 (R-002.30 y R-002.44); Propuesta (Claude), decide Acker; alertas: decisión abierta 11 |
| R-004.49 | Esta etapa manda al modelo datos que 001 no mandaba: el tipo de sesión, notas de sesiones con la red de apoyo que hablan del líder y del mentor, los ítems del plan con su último estado, las señales activas y el contexto guardado. Antes de activarse, sube la versión del aviso de privacidad (002) para que liste esos datos y diga cómo se escalan las alertas fuertes: el coach las pasa a una persona de Specialisterne fuera del sistema. | 002 (aviso de privacidad, R-002.42 y R-002.43); C-10 |
| R-004.50 | Los criterios de esta spec que se prueban con RLS se agregan como casos a `scripts/rls-check.ts`, el script que define 002. | 002 (tarea de pruebas RLS); REGLAS §3 |
| R-004.51 | Los casos de eval de esta spec usan el formato de 007 (`eval/cases/`). Una ficha sin verificar en la salida del modelo cuenta como falla del caso, no como advertencia. | 007 es dueña del formato; C-06 |

## Criterios de aceptación

| ID | Dado / Cuando / Entonces | Cubre | Cómo se prueba |
|---|---|---|---|
| CA-004.1 | Dado un acompañamiento en seguimiento, cuando el coach guarda una sesión de tipo "red de apoyo" con fecha de hace tres días, entonces la fila de `sessions` queda con ese tipo y ese `realizada_en`, y el historial la muestra así. | R-004.1 | prueba de ruta + navegador |
| CA-004.2 | Dado un acompañamiento en seguimiento, cuando el coach manda una fecha de mañana, entonces la ruta responde 400, no hay fila nueva en `sessions` y la pantalla muestra el texto de fecha inválida. | R-004.1 | prueba de ruta + navegador |
| CA-004.3 | Dado un acompañamiento sin consentimiento vigente (002), cuando el coach envía una nota, entonces la respuesta es 409, no hay fila nueva en `sessions` y no hay fila nueva en `audit_log`. | R-004.2 | RLS + prueba de ruta |
| CA-004.4 | Dado un acompañamiento en seguimiento al que el seed de prueba le dejó sin plan aprobado, cuando el coach guarda una nota, entonces la sesión se guarda, el mensaje al modelo no trae ítems del plan, la propuesta no trae avance y la pantalla muestra el aviso "Sin plan aprobado". | R-004.3 | prueba de ruta con el modelo simulado + navegador |
| CA-004.5 | Dados un acompañamiento `inclusion` y otro `workplace_support`, cuando el coach registra una sesión en cada uno, entonces los dos dejan un evento `proposed` que pasa la misma validación de esquema. | R-004.4 | prueba de ruta con el modelo simulado |
| CA-004.6 | Dada una sesión de tipo "red de apoyo", cuando una cuenta de persona consulta `sessions`, entonces no lee la fila. | R-004.5 | RLS |
| CA-004.7 | Dado un plan aprobado con tres ítems, cuando el modelo propone un avance para un id que no está en el plan, entonces ese avance aparece en descartados y no se puede aprobar. | R-004.8 | prueba offline |
| CA-004.8 | Dado un avance cuya única cita no está en la nota, cuando se limpia la propuesta, entonces el avance se descarta. | R-004.7 | prueba offline |
| CA-004.9 | Dada una respuesta del modelo con un campo para crear o borrar ítems del plan, cuando se valida, entonces falla el esquema estricto. | R-004.9 | prueba offline |
| CA-004.10 | Dado un ítem con estado "Avanza" aprobado la semana pasada, cuando el coach aprueba "Cumplido" hoy, entonces el historial del ítem muestra los dos estados en orden y el último es "Cumplido". | R-004.10 | prueba offline + navegador |
| CA-004.11 | Dada una respuesta del modelo con una señal de tipo fuera de `SENALES`, cuando se valida, entonces falla el esquema. | R-004.11 | prueba offline |
| CA-004.12 | Dado un perfil con una señal activa y otra cerrada en la tabla de estado, cuando se arma el mensaje al modelo, entonces el mensaje incluye el tipo y la descripción de la activa y no incluye la cerrada. | R-004.12 | prueba offline del armado del prompt |
| CA-004.13 | Dada una señal activa `estres_desregulacion`, cuando el coach aprueba otra del mismo tipo, entonces `senalesActivas` tiene una sola señal de ese tipo con la evidencia de las dos sesiones. | R-004.37 | prueba offline (`applyApproval`) |
| CA-004.14 | Dada una señal activa, cuando el coach la marca como "Ya no está activa", entonces sale de "Señales activas", queda en el historial con su nombre y la fecha, no hay snapshot nuevo, la versión del perfil sigue igual y el `contenido` de `persona_profiles` no cambia. | R-004.13, R-004.18 | navegador + RLS |
| CA-004.15 | Dado el esquema de salida del seguimiento, cuando el modelo agrega un campo de puntaje, probabilidad, nivel o severidad, entonces la validación falla, la ruta responde 502, no se guarda ningún evento y la nota queda guardada sin propuesta. | R-004.14 | prueba offline (objetos estrictos) + prueba de ruta con el modelo simulado |
| CA-004.16 | Dada una señal aprobada, cuando una cuenta que no es el coach del acompañamiento (otro coach o la persona) intenta crear una alerta con esa señal, entonces RLS rechaza el insert. | R-004.15 | RLS |
| CA-004.17 | Dada una alerta marcada por el coach, cuando una cuenta de persona consulta sus datos, entonces no puede leer la alerta ni la señal. | R-004.16, R-004.18 | RLS |
| CA-004.18 | Retirado: no hay cuenta que reciba alertas dentro de la app (R-004.17 retirado). | — | — |
| CA-004.19 | Retirado: lo sustituye CA-004.39. | — | — |
| CA-004.20 | Dada una señal activa, cuando el coach ve el botón "Marcar como alerta fuerte", entonces el texto fijo de emergencias aparece junto al botón. | R-004.19 | navegador |
| CA-004.21 | Dada una respuesta del modelo con seis notas de contexto, cuando se valida, entonces falla el esquema. | R-004.20 | prueba offline |
| CA-004.22 | Dadas dos preguntas y una nota de contexto aprobadas, cuando el coach abre la sesión siguiente, entonces el panel "Antes de esta sesión" las muestra arriba del campo de la nota. | R-004.21, R-004.22 | navegador |
| CA-004.23 | Dada una pregunta en el panel, cuando el coach pulsa "Ya no aplica", entonces la pregunta sale del panel y queda en el historial con su nombre y la fecha. | R-004.23 | navegador |
| CA-004.24 | Dado un siguiente paso que apunta a una ficha que no existe o con `verificada = false`, cuando se limpia la propuesta, entonces se descarta. | R-004.24 | prueba offline |
| CA-004.25 | Dada una nota sintética que solo menciona vacaciones y un asunto familiar sin cambio de vida concreto, cuando se corre el eval, entonces la propuesta trae notas de contexto y ninguna señal. | R-004.25 | eval (formato y casos de 007) |
| CA-004.26 | Dada una propuesta pendiente, cuando el coach cierra la página y vuelve al acompañamiento, entonces ve "Propuesta sin revisar" con el botón, y la revisión muestra los mismos cambios, señales, descartados y banderas que guarda el payload. | R-004.26 | navegador |
| CA-004.27 | Dada una propuesta hecha con la versión 2 del perfil, cuando el último snapshot ya es la versión 3, entonces la revisión muestra el aviso de versión antes de los botones. | R-004.27 | navegador |
| CA-004.28 | Retirado: pasa a 005 junto con R-004.28. | — | — |
| CA-004.29 | Dada una sesión guardada cuyo modelo respondió 502, cuando el coach pide la propuesta otra vez, entonces `sessions` sigue con una sola fila para esa nota y aparece un evento `proposed` con ese `session_id`. | R-004.29 | prueba de ruta con el modelo simulado |
| CA-004.30 | Dada una sesión que ya tiene propuesta, cuando se llama al reintento, entonces responde 409 y no hay fila nueva en `audit_log`. Dados dos reintentos simultáneos para una sesión sin propuesta, entonces solo queda un evento. | R-004.30 | prueba de ruta |
| CA-004.31 | Dada una sesión sin propuesta, cuando el coach abre el acompañamiento, entonces la ve en la lista con el botón "Pedir la propuesta". | R-004.31 | navegador |
| CA-004.32 | Dado un par de notas sintéticas iguales salvo que en una la persona habla poco en reuniones, cuando se corre el eval, entonces las dos producen los mismos tipos de señal y los mismos estados de avance. | R-004.32, R-004.34 | eval (formato y casos de 007) |
| CA-004.33 | Dado un par de notas iguales salvo el nombre y el género, cuando se corre el eval, entonces las dos producen los mismos tipos de señal y los mismos estados de avance. | R-004.34 | eval (formato y casos de 007) |
| CA-004.34 | Dada una señal cuya única cita es "casi no habló en la junta", cuando se limpia la propuesta, entonces la señal lleva la bandera de participación. | R-004.33 | prueba offline |
| CA-004.35 | Dada una propuesta de seguimiento guardada, cuando se lee `audit_log`, entonces hay una fila con `accion = 'propose_followup_update'`, modelo, versión de prompt, tokens y latencia, y ninguna columna trae texto de la nota. | R-004.35 | prueba de ruta con el modelo simulado |
| CA-004.36 | Dados dos acompañamientos iguales salvo que uno tiene `diagnostico_verificado = true` y cédula, cuando se arma el mensaje al modelo, entonces el texto es idéntico. | R-004.36 | prueba offline del armado del prompt |
| CA-004.37 | Dada la sesión del coach, cuando intenta un UPDATE directo sobre `app.engagements`, entonces la base lo rechaza. Después de guardar una sesión de seguimiento y aprobar su propuesta, `stage` sigue en `seguimiento`. | R-004.38 | RLS + prueba de ruta |
| CA-004.38 | Dada la sesión de la persona, cuando intenta insertar en `sessions` o en las tablas de avance, contexto, estado de señales o alertas, entonces RLS rechaza cada intento. | R-004.39 | RLS |
| CA-004.39 | Dada una alerta abierta, cuando el coach la marca "Ya la pasé" y después "Atendida", entonces la lista muestra los dos estados con su fecha. Cuando otro coach intenta cambiar el estado, RLS lo rechaza. | R-004.42 | navegador + RLS |
| CA-004.40 | Dado un ítem con estado "Avanza" en la versión 1 del plan y su equivalente en la versión 2 con `origen_item_id`, cuando el coach abre el panel "Antes de esta sesión", entonces ve "Avanza" con la fecha en que se aprobó. Un ítem de la versión 2 sin `origen_item_id` aparece sin avance. | R-004.40 | prueba offline + navegador |
| CA-004.41 | Dada una propuesta hecha con la versión 1 del plan, cuando la versión 2 se aprueba antes de revisarla, entonces la revisión muestra el aviso, el avance de un ítem con equivalente se guarda sobre el ítem de la versión 2 y el de un ítem sin equivalente no se puede aprobar. | R-004.41 | prueba de ruta + navegador |
| CA-004.42 | Dado un cambio propuesto como `fortaleza`, cuando el coach lo cambia a `contexto` y aprueba, entonces el snapshot lo guarda como `contexto`, la decisión guarda los dos tipos y la persona no lo ve en "Lo que te funciona". | R-004.43 | prueba offline + navegador |
| CA-004.43 | Dado un cambio cuyo texto el coach edita con un término no permitido, cuando revisa la propuesta, entonces aparece la bandera antes de aprobar. Las citas no se pueden editar y la decisión guarda los dos textos. | R-004.44 | prueba offline + navegador |
| CA-004.44 | Dada una llamada exitosa al modelo cuyo guardado de propuesta falla (500), cuando se lee `audit_log`, entonces hay una fila de esa llamada con `ok = true`. | R-004.45 | prueba de ruta con el modelo simulado |
| CA-004.45 | Dada una respuesta del modelo que no pasa `PayloadPropuestaIA.parse`, cuando la ruta la recibe, entonces responde 502, la nota queda guardada y `audit_log` tiene una fila con `ok = false`. | R-004.46 | prueba de ruta con el modelo simulado |
| CA-004.46 | Dado un error desconocido cuyo mensaje trae una frase de la nota, cuando se registra, entonces ni `audit_log.error` ni el log del servidor contienen esa frase. | R-004.47 | prueba offline |
| CA-004.47 | Dado un acompañamiento con avance, contexto, una señal cerrada y una alerta, cuando la persona retira su consentimiento, entonces el coach no ve esas filas, ninguna fila se borró y el reintento de una sesión sin propuesta responde 409. | R-004.48 | RLS + consulta SQL como owner |
| CA-004.48 | Dado el aviso de privacidad de 002, cuando se activa el seguimiento, entonces el aviso tiene una versión nueva que lista los datos de R-004.49 y explica cómo se escalan las alertas fuertes. | R-004.49 | prueba offline (contenido del aviso) |
| CA-004.49 | Cuando se corre `scripts/rls-check.ts`, entonces incluye los casos de CA-004.3, .6, .14, .16, .17, .37, .38, .39 y .47, y todos pasan. | R-004.50 | RLS (`scripts/rls-check.ts`) |
| CA-004.50 | Dado un caso de eval de seguimiento cuya salida propone un siguiente paso con una ficha sin verificar, cuando corre el eval, entonces el caso falla. | R-004.51 | eval (formato de 007) |
| CA-004.51 | Dado un perfil cuyo último snapshot trae `estres_desregulacion` y `cambio_de_vida`, con `cambio_de_vida` cerrada en `signal_states`, cuando se arman el mensaje del prompt de 001, el del prompt de seguimiento y la entrada del cierre, y cuando el coach abre la página del acompañamiento y el panel "Antes de esta sesión", entonces todos muestran o mandan solo `estres_desregulacion`. | R-004.52 | prueba offline del armado de los prompts + navegador |

## Datos

Cambios contra `lib/db/schema.ts`, `lib/profile/schema.ts` y `drizzle/0002_permisos.sql`. Son de nivel requisito; los nombres finales se fijan cuando esta spec pase a detallada. Todas las tablas nuevas van en el esquema `app`, fuera de la Data API (C-16, D-032 propuesta), y sus estados van en español. Las migraciones de esta spec corren después de las de 002 y 003.

- `sessions`: enum nuevo, por ejemplo `session_type` (`persona`, `red_de_apoyo`), y columna `tipo` con valor por defecto `persona` para las filas que ya existen. `realizada_en` ya existe con `defaultNow()`; la ruta debe aceptar la fecha que da el coach. Sin columnas para datos del líder o del mentor (R-004.5). El `grant insert` ya existe y no hace falta `update`.
- `profile_events`:
  - columna `perfil_version_base` (entero, nula para eventos de la persona) (R-004.27);
  - el plan con el que se generó la propuesta, en una columna o en el payload, para el aviso de R-004.41;
  - índice único parcial sobre `session_id` donde `tipo = 'propuesta_ia'`, para que dos reintentos no dejen dos propuestas (R-004.30);
  - lo que necesita "esto no me representa" (estado revisado, resultado y permisos) lo define 005.
- `lib/profile/schema.ts`:
  - `Aprobacion` agrega índices de avance, preguntas, contexto y siguiente paso, además de `cambios` y `senales`, y por cada cambio el tipo y el texto que eligió el coach si los cambió (R-004.43, R-004.44);
  - `Descartado.motivo` agrega valores para ítem que no existe y ficha que no existe o no está verificada;
  - `Bandera.motivo` hoy es el literal `termino_no_permitido` y necesita un valor para la bandera de participación (R-004.33).
- `lib/profile/merge.ts`: `applyApproval` suma evidencia a una señal activa del mismo tipo en lugar de agregar otra (R-004.37) y aplica el tipo y el texto editados por el coach (R-004.43, R-004.44).
- Tabla nueva para el avance de ítems, por ejemplo `plan_item_updates`: ítem, sesión, evento, estado, resumen, evidencia (`{ cita, sessionId }[]`, igual que `plan_items.evidencia`), quién aprobó y cuándo. La historia de un ítem entre versiones del plan se arma con `plan_items.origen_item_id` de 003 (R-004.40). RLS: solo el coach del acompañamiento. 003 no deja borrar ítems de un plan aprobado (R-003.32); la llave a `plan_items` usa `restrict`, para que un borrado que se salte esa regla falle en lugar de perder la historia (R-004.10). Si la persona ve algo del avance se decide en 005; `persona_plans` (003) no lo trae.
- Tabla nueva para el contexto de la siguiente sesión (decisión abierta 5): acompañamiento, tipo (`pregunta`, `contexto`), texto, evidencia, evento de origen, quién aprobó, cuándo, y quién la quitó y cuándo (R-004.23). RLS: solo el coach del acompañamiento. Nunca en `persona_profiles` (C-09, D-033 propuesta).
- Tabla nueva para el estado de las señales (decisión abierta 6), por ejemplo `signal_states`: acompañamiento, tipo de señal, estado (`activa`, `cerrada`), motivo, evento de origen, quién y cuándo. Una fila por cambio de estado, para que quede el historial. Una señal se identifica por acompañamiento y tipo, porque hay una sola activa por tipo (R-004.37). Si el coach aprueba una señal de un tipo cerrado, se agrega una fila `activa`; cómo se separa la evidencia de antes del cierre se fija cuando esta spec pase a detallada. Esta tabla no crea snapshots ni cambia `perfil_version` (R-004.13). Todo lector de señales activas la descuenta del snapshot (R-004.52). RLS: solo el coach del acompañamiento.
- Tabla nueva de alertas fuertes: acompañamiento, tipo de la señal de origen, evento de origen, quién la marcó, estado (`abierta`, `escalada`, `atendida`), nota del coach y fechas de cada estado. RLS: el coach del acompañamiento crea, lee y cambia el estado; ninguna otra cuenta tiene políticas. No se agrega ningún valor a `app_role` (`coach`, `persona`).
- Bloqueo por retiro (R-004.48): las cuatro tablas nuevas aplican la misma regla que 002 aplica a notas y perfiles, con `private.app_has_consent` o el mecanismo que fije 002.
- `0002_permisos.sql`: el `grant select on all tables in schema app` solo cubrió las tablas que existían cuando corrió, así que cada tabla nueva necesita su `grant select` además de `grant insert`. En alertas, `update` solo de las columnas de estado y fechas. En contexto, `update` solo de quién la quitó y cuándo. Ningún `grant update` sobre `app.engagements` (R-004.38).
- `audit_log`: valor nuevo de `accion`, `propose_followup_update` (R-004.35). La escritura de auditoría va en su propia transacción (R-004.45).
- Plan visible a la persona: 003 retira `plan_items_select_persona_approved` y `plans_select_persona_approved`, y la persona solo lee `persona_plans`. Con eso no lee `plan_items.evidencia` ni las tablas de esta spec (C-09).
- Pruebas: los casos de RLS de esta spec van en `scripts/rls-check.ts` (R-004.50).

## Pantallas y textos

La persona no tiene pantallas nuevas en esta etapa y no recibe avisos (C-14). Los textos de abajo son del coach, salvo que se diga otra cosa.

Sesión nueva:

- Campo: "Tipo de sesión". Opciones: "Sesión con {nombre}" y "Sesión con la red de apoyo (líder y mentor)".
- Campo: "Fecha de la sesión". Error: "La fecha de la sesión no puede ser después de hoy."
- Sin plan aprobado: "Este acompañamiento todavía no tiene un plan aprobado. Puedes guardar la sesión, pero la IA no va a proponer avance del plan."
- Ayuda de la nota (sesión con la red de apoyo): "Escribe lo que se habló con el líder y el mentor. No escribas sus nombres: usa \"el líder\" y \"el mentor\". {nombre} no ve esta nota."

Panel "Antes de esta sesión":

- "Última sesión: {tipo}, el {fecha}."
- "Preguntas que guardaste". Vacío: "No guardaste preguntas."
- "Contexto que guardaste". Vacío: "No guardaste contexto."
- "Avance del plan". Por ítem: "{descripción}: {estado}, desde el {fecha}." Vacío: "Todavía no hay avance registrado."
- "Señales activas". Vacío: "No hay señales activas."
- Botón por pregunta o contexto: "Ya no aplica".

Revisión de la propuesta (se suma a lo de 001):

- Sección "Avance del plan ({n})". Por ítem: "{descripción}" y "Estado propuesto: {estado}". Vacío: "La IA no propuso avance del plan con esta nota."
- Sección "Contexto para la siguiente sesión ({n})". Ayuda: "Solo tú ves esto."
- Sección "Siguiente paso". Texto: "Propuesta: {texto}. Sale de: {ítem del plan o ficha}."
- Aviso de versión del perfil: "Esta propuesta se hizo con la versión {n} del perfil. El perfil ya está en la versión {m}. Revisa que los cambios sigan teniendo sentido antes de aprobar."
- Aviso de versión del plan: "Esta propuesta se hizo con la versión {n} del plan. El plan aprobado ya es la versión {m}. El avance se guarda en los puntos equivalentes; los que ya no están en el plan no se pueden aprobar."
- Bandera de participación: "Revisa esta propuesta. Su única evidencia es que {nombre} habla o participa poco, y hablar poco no cuenta como señal de riesgo."
- Por cada cambio: campo "Tipo" con las opciones "Fortaleza", "Área de apoyo" y "Contexto". Si el coach lo cambia: "La IA lo propuso como {tipo}."
- Por cada cambio: botón "Editar texto". Ayuda: "Puedes cambiar el texto. Las citas de la nota no se cambian."

Página del acompañamiento:

- "Propuesta sin revisar de la sesión del {fecha}." Botón: "Revisar propuesta".
- "La sesión del {fecha} no tiene propuesta." Botón: "Pedir la propuesta".
- Error 502 en la sesión nueva: "No se pudo generar la propuesta. La nota quedó guardada. Puedes pedir la propuesta otra vez sin escribirla de nuevo." Botón: "Pedir la propuesta otra vez".
- Reintento con propuesta ya existente: "Esta sesión ya tiene una propuesta." Enlace: "Ver la propuesta".

Señales:

- Botón: "Ya no está activa". Diálogo: título "¿Marcar esta señal como no activa?", texto "La señal sale de Señales activas y queda en el historial. El perfil no cambia.", campo "Motivo (opcional, solo lo ves tú)", botones "Cancelar" y "Marcar como no activa".
- Botón: "Marcar como alerta fuerte". Diálogo: título "¿Marcar esta señal como alerta fuerte?", texto "La alerta queda en tu lista de Alertas fuertes. La app no le avisa a nadie: pásala tú a {responsable} por el canal que usa Specialisterne. {nombre} no recibe ningún aviso. La empresa tampoco.", campo "Nota (opcional, solo la ves tú)", botones "Cancelar" y "Marcar como alerta fuerte". {responsable} depende de la decisión abierta 2 y de la respuesta del partner.
- Texto fijo junto al botón (pendiente del partner): "Esta herramienta no atiende emergencias. Si hay riesgo inmediato, sigue el protocolo de Specialisterne."

Alertas fuertes (lista en la página del acompañamiento):

- Por alerta: "{tipo de señal}, marcada el {fecha}." Botones: "Ya la pasé" y "Atendida".
- Estados: "Abierta: falta pasarla a {responsable}.", "La pasaste el {fecha}." y "Atendida el {fecha}."
- Vacío: "No hay alertas fuertes."

"Esto no me representa": los textos para revisarlo, sobre el perfil y sobre el plan, los define 005.

## Reglas fijas fuera del LLM

- Citas del avance, del contexto, de las señales y del siguiente paso: se buscan en la nota con el mismo criterio de `sanitizeUpdate` (D-034 propuesta).
- Ids de ítems del plan: deben existir en la versión vigente del plan aprobado del acompañamiento; entre versiones se siguen por `origen_item_id`.
- Ids de fichas: solo las fichas con `verificada = true` entran al prompt, y la salida se revisa otra vez contra `knowledge_cards` (C-06).
- Esquema estricto: sin campos de puntaje, probabilidad, nivel, severidad, alerta ni diagnóstico (C-01).
- Tipos de señal y estados de avance: solo los de los catálogos.
- Señal repetida: una sola señal activa por tipo (R-004.37).
- Cierre de señal: se escribe en la tabla de estado, nunca en un snapshot.
- Señales activas: último snapshot menos las cerradas en `signal_states`, con la misma regla en todo lector (R-004.52).
- Texto editado por el coach: pasa por la revisión de términos de `lib/profile/validate.ts`; las citas no se editan.
- Fecha de la sesión: no posterior a hoy.
- Consentimiento: el chequeo compartido de 002 (`private.app_has_consent`) se revisa antes de guardar la nota y antes de cada reintento (C-10).
- Reintento: una sola propuesta de la IA por sesión, revisada antes de llamar al modelo y asegurada con el índice único al guardar.
- Bandera de participación: lista fija de frases sobre hablar o participar poco, revisada contra la evidencia.
- Alertas: solo se crean desde una señal aprobada y solo por el coach del acompañamiento. Ninguna otra cuenta las lee.
- Auditoría: fila propia por llamada, también si falla el guardado; el error solo lleva clase y código.
- Etapa: esta spec no escribe en `app.engagements`.
- La persona no tiene políticas de lectura ni de escritura sobre señales, alertas, avance ni contexto (C-09).

## Prompts

Archivo nuevo con fecha en `prompts/`, `AAAA-MM-DD_seguimiento.md`, con su propia `prompt_version` (C-18). El prompt de 001 conserva su nombre `2026-10-29_profile-update` porque ya hay eventos con esa versión. Recibe la nota, el nombre de pila, el tipo de sesión, la configuración del tipo de acompañamiento, el perfil previo, los ítems de la versión vigente del plan con su último estado, las señales activas, el contexto guardado y las fichas verificadas con el mismo filtro de 003. No recibe datos de la verificación (C-03) ni notas completas de sesiones anteriores. Se llama con `generateText` y `Output.object` (D-031 propuesta) y se audita con `accion = 'propose_followup_update'`. Mantiene las reglas del prompt de 001 y agrega: no proponer señal ni "Necesita ajuste" por hablar poco, no convertir un asunto personal en señal salvo un cambio de vida concreto, y no proponer ítems nuevos del plan. No se activa hasta que el aviso de privacidad suba de versión (R-004.49).

## Decisiones abiertas

| # | Pregunta | Opciones (pros y contras) | Propuesta | Decide |
|---|---|---|---|---|
| 1 | ¿Qué es una alerta fuerte? | A) El coach la marca a mano sobre cualquier señal aprobada. Pro: el criterio queda en una persona (C-04); contra: depende del juicio de cada coach. B) Toda señal de "Quiere renunciar" o "Estrés o desregulación" es fuerte por regla. Pro: no depende del coach; contra: el sistema clasifica severidad, choca con R-004.14 y puede saturar a quien atiende. C) A, con una lista de criterios escrita por el partner que se muestra como ayuda. | C; mientras el partner no conteste, A. | Acker, con respuesta del partner |
| 2 | ¿Quién atiende la alerta fuerte y dónde? | A) Rol nuevo "responsable de alertas" en `app_role`. Pro: hay acuse dentro de la app; contra: tercer login, más políticas y algo que CONTEXTO §6 no tiene. B) Otro coach marcado como supervisor. Pro: no agrega rol; contra: mezcla permisos de coach. C) Fuera de la app: la app le muestra la alerta al coach, él la pasa a una persona de Specialisterne y registra que lo hizo. Pro: se mantienen los dos logins de CONTEXTO §6; contra: el acuse depende de que el coach lo registre. | Propuesta (Claude), decide Acker: C. La opción A queda en "What's next" como decisión de los tres. | Acker; el tercer rol, los tres |
| 3 | ¿Cómo se reintenta tras un 502 sin duplicar? | A) Ruta de reintento por id de sesión. Pro: usa lo que ya se guarda; contra: una ruta más. B) Llave de idempotencia que manda el navegador. Pro: la misma ruta; contra: se pierde si el coach recarga. C) No guardar la nota hasta tener la propuesta. Pro: no hay sesiones sin propuesta; contra: si el modelo falla, el coach pierde la nota. | A, con la lista de sesiones sin propuesta (R-004.31). | Acker |
| 4 | ¿Una llamada al modelo o dos? | A) Extender `ProfileUpdate` con avance, contexto y siguiente paso. Pro: una llamada, un evento; contra: esquema más grande. B) Llamada aparte solo para seguimiento. Pro: 001 no cambia; contra: doble costo y dos eventos por sesión. | A, con un prompt nuevo solo para sesiones de seguimiento. | Acker |
| 5 | ¿Dónde vive el contexto para la siguiente sesión? | A) Dentro de `Perfil` en el snapshot. Pro: hereda la RLS del coach; contra: cada "Ya no aplica" crea una versión de perfil. B) Tabla aparte. Pro: no mueve versiones del perfil; contra: una tabla y políticas más. | B. | Acker |
| 6 | ¿Dónde vive el estado de una señal? | A) Evento nuevo que produce un snapshot sin esa señal. Pro: usa el mecanismo de hoy; contra: sube la versión del perfil sin que cambie lo que ve la persona y dispara el aviso de R-004.27 sin razón. B) Campo de estado en la señal dentro del snapshot. Pro: simple; contra: obliga a editar un snapshot, que hoy no tiene `grant update`, y rompe el historial. C) Tabla aparte de estado por acompañamiento y tipo. Pro: no toca snapshots ni versiones; contra: las señales activas se arman con dos fuentes. | Propuesta (Claude), decide Acker: C. | Acker |
| 7 | ¿Se guardan detalles personales como contexto? | A) Sí, solo con cita y aprobados por el coach. Pro: es lo que hace hoy la coach (F-005, CONTEXTO §4); contra: pueden incluir datos de familiares. B) Solo como preguntas, sin el detalle. Pro: menos datos; contra: pierde parte del vínculo. | A, solo con datos sintéticos en el demo, y preguntar al partner. | Acker, con respuesta del partner |
| 8 | ¿El coach ve un aviso si pasa mucho tiempo sin sesión? | A) No. Pro: nada de alarmas; contra: se puede perder una semana. B) Sí, solo para el coach, con un plazo que fije el partner. Pro: ayuda al seguimiento semanal; contra: hay que definir el plazo. | B sin plazo inventado; hasta que el partner conteste, solo se muestra la fecha de la última sesión. | Acker |
| 9 | ¿La persona ve que su "esto no me representa" fue revisado? | Pasa a 005, dueña del ciclo de vida de "esto no me representa". | Ver 005. | Ver 005 |
| 10 | ¿Cómo se lee D-058 ("dos servicios, un pipeline por tipo de engagement")? | A) Un solo pipeline con configuración por tipo, como hoy `ENGAGEMENT_CONFIG`. Pro: no duplica código; contra: si los servicios se separan más, la configuración crece. B) Un pipeline distinto por tipo. Pro: cada servicio evoluciona solo; contra: dos rutas y dos prompts que mantener. | A, porque así está el código del sprint 1. D-058 está decidida por los tres según Acker; falta confirmar esta lectura con quien la redactó. | Acker; los tres si cambia D-058 |
| 11 | ¿Las alertas fuertes abiertas se ocultan al coach si la persona retira su consentimiento? | A) Sí, como todo lo demás (regla general de 002). Pro: una sola regla y un aviso más simple; contra: el coach deja de ver dentro de la app una alerta que quizá no ha pasado. B) La lista sigue mostrando solo tipo de señal, estado y fecha. Pro: no se pierde una alerta abierta; contra: es una excepción a la regla de 002 que el aviso tiene que explicar. | Propuesta (Claude), decide Acker: A. | Acker, junto con la decisión (b) de 002 |

## Tareas

No aplica: esta spec es de requisitos. Las tareas se escriben cuando suba a detallada.

## Verificación

- Pruebas offline para la limpieza de avance, contexto, siguiente paso, señales repetidas, banderas de participación, edición de tipo y texto, errores sin texto de la nota y el armado de los prompts (CA-004.7 a .9, .11 a .13, .15, .21, .24, .34, .36, .40, .42, .43, .46, .48, .51).
- Pruebas de RLS en `scripts/rls-check.ts` (002) con cuentas sintéticas de persona y de un segundo coach: la persona no lee ni escribe señales, alertas, avance ni contexto; ninguna cuenta fuera del coach del acompañamiento crea ni cambia alertas; nadie hace UPDATE directo sobre `engagements`; el retiro de consentimiento oculta las tablas nuevas sin borrar filas (CA-004.3, .6, .14, .16, .17, .37 a .39, .47, .49).
- Pruebas de ruta con el modelo simulado para fecha inválida, 409, 502, reintento, cambio de versión del plan y auditoría (CA-004.1 a .5, .15, .29, .30, .35, .41, .44, .45).
- Eval con pares de casos sintéticos de seguimiento en el formato de 007 (CA-004.25, .32, .33, .50), con casos y umbrales definidos en 007.
- Recorrido en el navegador del flujo de dos sesiones seguidas con el caso de demo de punta a punta de 007 (Workplace Support sintético), desde su seed de la etapa `seguimiento`, revisando el panel "Antes de esta sesión", la lista de alertas fuertes y los textos literales de esta spec.

## Preguntas para el partner

- ¿Qué consideran una alerta fuerte en el seguimiento, quién del equipo la atiende hoy y por qué canal se la pasa el coach?
- ¿Tienen un protocolo para riesgo inmediato? Necesitamos el texto exacto que mostramos junto al botón de alerta.
- En la sesión de 30 minutos con la red de apoyo, ¿qué anotan? ¿El líder y el mentor saben que se registra?
- ¿Qué parte del seguimiento va en los reportes a la empresa, cada cuánto y quién los aprueba?
- Los detalles personales que anotan para la siguiente sesión, ¿la persona sabe que se anotan? ¿Los guardan junto con el resto de las notas?
- ¿Workplace Support también dura seis meses, con una hora por semana y la sesión con la red de apoyo cada dos semanas?
- ¿Cómo notan hoy que una persona quiere renunciar o que el puesto ya no le acomoda, y con cuánto tiempo de anticipación?
- ¿La persona debería ver el avance de sus objetivos?

## Cambios

Versión 4 · 2026-10-30 · numeración de decisiones

- Solo cambia la numeración: la decisión de la plataforma para los dos servicios se citaba aquí como D-029, y en CONTEXTO v5 esa decisión es D-058, porque D-029 ya era el reparto de negocio de Rodrigo. El cambio incluye las notas de versiones anteriores de esta sección.
- Las notas que decían que estas decisiones y el handoff faltaban por registrar ahora remiten a CONTEXTO v5. Las notas de versiones anteriores de esta sección conservan lo que decían entonces.

Versión 3 · 2026-10-29 · ajustes de consistencia

- Señales activas: nuevo R-004.52 y CA-004.51. Las señales cerradas en `signal_states` se descuentan en todo lector (prompt de 001, prompt de seguimiento, página del coach, panel "Antes de esta sesión" y entrada del cierre), no solo en el prompt de seguimiento. Datos, Reglas fijas y Verificación lo citan.
- Escrituras de la persona: R-004.39 dice que 005 no le agrega escrituras (R-005.40), en lugar de "más lo que sume 005".
- Datos, avance de ítems: la llave a `plan_items` usa `restrict`, porque 003 ya prohíbe borrar ítems de un plan aprobado (R-003.32).
- Etapa `cierre`: Fuera de alcance remite a 006 lo que se bloquea de esta spec en esa etapa y lo que sigue permitido.
- Fuentes: R-004.48 cita R-002.44 y R-004.49 cita R-002.42 y R-002.43.

Versión 2 · 2026-10-29 · consolidación entre specs

- Consentimiento: R-004.2, CA-004.3 y las reglas fijas usan el consentimiento vigente de 002 (`private.app_has_consent`) en lugar de `engagements.consentimiento_en`.
- Etapas: R-004.3 y CA-004.4 quedan como caso defensivo, porque `seguimiento` implica plan aprobado. Nuevo R-004.38: esta spec no escribe en `engagements`.
- "Esto no me representa": R-004.28 y CA-004.28 retirados; pasa a 005, junto con su texto de pantalla, sus datos y la decisión abierta 9.
- Persona: nuevo R-004.39 (no escribe nada nuevo; remite a la lista de 002). El último punto de Datos apunta a `persona_plans` de 003.
- Plan: R-004.6 y R-004.9 incluyen `objetivo_equipo` y `ajuste_razonable`. Nuevos R-004.40 y R-004.41 para seguir ítems con `origen_item_id`.
- Señales: R-004.12, R-004.13 y CA-004.14 sacan el estado de la señal del snapshot. La decisión abierta 6 cambia su propuesta a una tabla aparte.
- Alertas: se mantienen los dos logins y el escalamiento ocurre fuera del sistema. R-004.16 reescrito, R-004.17, CA-004.18 y CA-004.19 retirados, nuevo R-004.42. La decisión abierta 2 cambia su propuesta y textos de pantalla.
- Huecos de 001: nuevos R-004.43 (H-5), R-004.44 (H-9) y R-004.45 a R-004.47 (H-11).
- Retiro de consentimiento, aviso de privacidad y RLS versionada: nuevos R-004.48, R-004.49 y R-004.50, y decisión abierta 11.
- Eval: nuevo R-004.51; los CA de eval remiten al formato de 007. R-004.24 aclara que una ficha sin verificar no llega al prompt.
- Nombres: `accion = 'propose_followup_update'` queda fijo en R-004.35; el prompt de 001 conserva su nombre.
- D-058 se cita como decidida por los tres según Acker, pendiente de registrar.
- Voz con Whisper queda en "What's next", igual que en 001. El caso de demo de punta a punta de 007 se usa en Verificación.
