<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# 002 · Alta y consentimiento

- Estado: Implementada · Versión 7 · 2026-10-30 (código pendiente de revisión de Acker)
- Fuentes: F-005 (00:00–12:36), F-026 (secundaria), F-027 (secundaria). D-001 y D-003 (decididas en CONTEXTO §9). D-008, D-015, D-020, D-021 y D-022 (propuestas en CONTEXTO §9; su aprobación es la decisión abierta h). D-058 y D-030 (decididas por los tres según Acker; falta que David y Rodrigo lo confirmen en CONTEXTO §9). D-032 y D-035 (propuestas en CONTEXTO §9). Decisiones de Acker para esta fase (29 oct, ver "Alcance"). REGLAS §2.5, §3, §4, §6 y §7. CONTEXTO §2, §4, §6 y §11. Reglas de la constitución: C-01, C-02, C-03, C-07, C-08, C-09, C-10, C-11, C-12, C-14, C-16, C-17, C-19.
- Depende de: 000. Toca código de 001 que hoy lee `consentimiento_en`: `app/api/engagements/[id]/sessions/route.ts`, `app/coach/engagements/[id]/page.tsx` y `app/coach/engagements/[id]/sessions/new/page.tsx`. Recibe de 001 los huecos H-7 (solo el paso de `alta` a `evaluacion_inicial`; el resto de las etapas es de 003), H-8 y H-12.
- La usan: 003, 004, 005 y 006 (consentimiento vigente, bloqueo al retirar, lista de lo que escribe la persona, aviso de privacidad y `scripts/rls-check.ts`). Orden de migraciones: 002 antes que 003, 003 antes que 004 y 005, 006 al final.

## Problema y para quién

En los proyectos de inclusión, Specialisterne pide el diagnóstico oficial de un especialista. Le basta la página que confirma el diagnóstico y muestra la cédula del profesional, y lo empezó a pedir porque aplicaban personas que no eran autistas (CONTEXTO §4, F-005). D-020 (propuesta) lo vuelve requisito de alta: diagnóstico confirmado por un profesional con cédula y verificado por el coach. REGLAS §6 y D-022 (propuesta) prohíben procesar con IA o guardar el documento médico. El estado de salud es dato sensible según la nueva LFPDPPP (F-026, fuente secundaria).

Hoy la app no tiene alta. `scripts/seed.sql` crea al coach, a la persona y al acompañamiento con `consentimiento_en = now()` y la verificación ya marcada, sin que la persona haya visto un aviso ni dado su consentimiento. Esta spec define cómo se crea el acompañamiento y cómo entra la persona.

Para quién:

- El coach de Specialisterne, que registra el alta sin tener que guardar el documento en ningún lado del sistema.
- La persona participante, que entiende qué datos se guardan, quién los ve y que puede retirar su consentimiento, antes de que el coach guarde cualquier nota.

## Alcance

Decisiones de Acker para esta fase (29 oct), citadas en esta spec por su número:

- (1) El documento de diagnóstico nunca entra a la app. El coach lo revisa fuera del sistema, consulta la cédula en el registro de la SEP (F-027) y solo registra verificado sí o no, la cédula, quién y cuándo. La empresa no recibe ni el diagnóstico ni la verificación.
- (2) El coach arranca el alta. La persona entra por invitación y da su consentimiento al entrar.
- (3) Esta spec y la 003 van detalladas con tareas; de la 004 a la 007 solo requisitos.

El flujo de alta sigue CONTEXTO §6 ("Flujo del demo", paso 1) y las decisiones (1) y (2). El orden y el detalle de cada paso son interpretación del equipo:

1. El coach crea el acompañamiento: tipo (`inclusion` o `workplace_support`), nombre de pila y correo de la persona.
2. El coach registra la verificación del diagnóstico: casillas de revisión, cédula y enlace a cedulaprofesional.sep.gob.mx (F-027). Quién y cuándo los pone la base. No existe ningún campo de archivo.
3. El coach genera la invitación de la persona.
4. La persona entra con la invitación, crea su contraseña y lee el aviso de privacidad en lenguaje claro.
5. La persona marca una casilla de consentimiento que no viene marcada.
6. Se registra el consentimiento con la versión del aviso y la fecha, y la etapa pasa a `evaluacion_inicial`.

También entran el retiro del consentimiento por parte de la persona, el bloqueo de C-10 mientras no haya consentimiento vigente y el reemplazo de `engagements.consentimiento_en`.

Esta spec también fija cinco cosas que usan las demás:

- El único chequeo de consentimiento es `private.app_has_consent(engagement_id)`, que lee el consentimiento vigente de `app.consent_events` (R-002.28). Ninguna spec usa `engagements.consentimiento_en`. Las demás specs lo citan como "consentimiento vigente (002)".
- La regla general del bloqueo al retirar el consentimiento (R-002.44). Cada spec de 003 a 006 dice qué tablas suyas entran.
- La lista completa de lo que escribe la persona en la base (R-002.45). 005 y 006 no le agregan escrituras (R-005.40, R-006.17).
- El contenido mínimo del aviso de privacidad y la regla de subir su versión antes de mandar datos nuevos al modelo (R-002.42, R-002.43).
- El script de pruebas de RLS `scripts/rls-check.ts` (R-002.46), al que 003 a 006 agregan sus casos.

El paso de `alta` a `evaluacion_inicial` se define aquí. La tabla completa de transiciones de etapa y sus tareas son de 003 (R-002.41).

**Fuera de alcance:**

- Las etapas de inclusión previas al acompañamiento: difusión, formulario propio, CV, selección, sesión práctica y capacitación (CONTEXTO §4). Quedan fuera del MVP. Es interpretación del equipo a partir de D-001 (decidida: se descarta por ahora el matching candidato–vacante) y D-008 (propuesta: el demo se centra en Workplace Support).
- El administrador de organización, que crea coaches y organizaciones. Va a "What's next" (CONTEXTO §6, "Dos logins"). Se mantienen dos logins, coach y persona. Un tercer rol para la persona de Specialisterne que recibe las alertas fuertes también queda en "What's next", como decisión de los tres (ver 004).
- La extracción automática del documento de diagnóstico, con asesoría legal. Va a "What's next" (CONTEXTO §6).
- El envío de invitaciones por correo real. Va a "What's next" si la decisión abierta (a) lo deja para después del demo.
- La solicitud de borrado de datos y la exportación de datos por parte de la persona. Dependen de la revisión legal de la decisión abierta (d).
- Una persona con más de un acompañamiento. Si el correo ya tiene cuenta, el alta se detiene (R-002.4). Esta restricción sustituye R-001.27 y CA-001.19 de 001.
- Recuperar el acceso si la persona olvida su contraseña. Con la opción B de (a), el coach no puede generar otro código después de que la persona creó su contraseña (R-002.38). Va a "What's next".

### El diagnóstico y la empresa

El diagnóstico no se guarda para la empresa ni para nadie. El documento nunca entra a la app: el coach lo revisa fuera del sistema y consulta la cédula en el sitio de la SEP (F-027). En la app solo queda el hecho de la verificación: verificado sí o no, la cédula del profesional, quién verificó y cuándo (C-02, REGLAS §6). Ese registro lo ve solo el coach de Specialisterne que lleva el acompañamiento. La empresa empleadora no recibe ni el diagnóstico ni la verificación, ni ahora ni cuando exista una salida hacia ella (C-11, decisión de Acker (1)). La verificación tampoco llega al modelo ni cambia las recomendaciones (C-03, D-021 propuesta).

## Requisitos

R-002.37 a R-002.39 se agregaron en la revisión del 29 oct y van junto a los requisitos con los que se leen, por eso no siguen el orden numérico. R-002.40 a R-002.46 se agregaron en la versión 2 y van al final de la tabla de su sección.

### Creación del acompañamiento

| ID | Requisito | Fuente |
|---|---|---|
| R-002.1 | Cuando el coach crea un acompañamiento, el sistema debe pedir solo tres datos: tipo (`inclusion` o `workplace_support`), nombre de pila de la persona y correo de la persona. No pide apellidos, teléfono, fecha de nacimiento ni datos de salud. | Decisión de Acker (2), D-058 (decidida por los tres según Acker; falta que David y Rodrigo lo confirmen en CONTEXTO §9); minimización: interpretación del equipo a partir de REGLAS §6 |
| R-002.2 | Al crear el acompañamiento, el sistema debe crear en una sola operación lógica la cuenta de Supabase Auth de la persona (sin contraseña utilizable todavía), su fila en `app.users` con rol `persona` en la organización del coach, y el registro en `app.engagements` con etapa `alta` y `coach_id` igual al coach. Si falla la parte de la base, el sistema debe borrar la cuenta de Auth que acaba de crear y mostrar el error. | Interpretación del equipo |
| R-002.3 | Mientras el prototipo use solo datos sintéticos, el sistema debe rechazar cualquier correo que no termine en `.test`. | C-07, D-003 (decidida) |
| R-002.4 | Si el correo ya tiene cuenta, el sistema no debe crear nada y debe mostrar el mensaje de la sección "Pantallas y textos". La base debe rechazar un segundo acompañamiento con el mismo `persona_id`. Este requisito sustituye R-001.27 y CA-001.19: con un solo acompañamiento por persona, la página y la ruta de la persona no tienen que elegir entre varios. | Interpretación del equipo |
| R-002.5 | Solo un usuario con rol `coach` puede crear acompañamientos, y solo en su propia organización. La base debe rechazar la inserción si `coach_id` no es quien la hace, si la etapa no es `alta` o si la persona no pertenece a la misma organización. | C-16, D-032 (propuesta) |

### Verificación del diagnóstico

| ID | Requisito | Fuente |
|---|---|---|
| R-002.6 | La pantalla de verificación no debe tener ningún campo de archivo, área de texto libre ni zona para arrastrar documentos. Solo tiene dos casillas, el campo de cédula, el enlace a cedulaprofesional.sep.gob.mx y el aviso "No subas ni copies el documento". | C-02, REGLAS §6, F-027, decisión de Acker (1) |
| R-002.7 | Para guardar la verificación, el coach debe marcar las dos casillas ("Revisé el documento fuera del sistema" y la de consulta en el sitio de la SEP) y escribir la cédula. La cédula se guarda sin espacios al inicio ni al final y solo acepta dígitos. Las casillas no se guardan por separado: juntas producen `diagnostico_verificado = true`. | Decisión de Acker (1); "solo dígitos" es suposición del equipo, confirmar con F-027 |
| R-002.8 | `diagnostico_verificado_por` y `diagnostico_verificado_en` los debe llenar la base con `auth.uid()` y `now()` al guardar. El formulario y la ruta no los envían, y el rol `authenticated` no tiene permiso de escribirlos. | Decisión de Acker (1); que los llene la base es interpretación del equipo |
| R-002.9 | La base debe rechazar cualquier fila de `engagements` con `diagnostico_verificado = true` y alguno de `cedula_profesional`, `diagnostico_verificado_por` o `diagnostico_verificado_en` en nulo. | Decisión de Acker (1) |
| R-002.10 | Solo el coach del acompañamiento puede registrar o corregir la verificación, y solo mientras la etapa sea `alta`. | C-02, interpretación del equipo |
| R-002.11 | La verificación (sí o no, cédula, quién y cuándo) solo se muestra en pantallas del coach. Las páginas y rutas de la persona no deben seleccionar esas columnas, ningún prompt las recibe y ninguna salida hacia la empresa las incluye. | C-02, C-03, C-11, D-021 (propuesta) |
| R-002.12 | `lib/engagements/config.ts` debe tener un campo `requiereDiagnostico` por tipo de acompañamiento. Vale `true` para `inclusion` y para `workplace_support` hasta que el partner responda si Workplace Support también lo pide. | CONTEXTO §11 (pregunta abierta al partner), D-020 (propuesta), D-058 (decidida por los tres según Acker; falta que David y Rodrigo lo confirmen en CONTEXTO §9) |
| R-002.40 | La persona no debe poder leer en la base `diagnostico_verificado`, `cedula_profesional`, `diagnostico_verificado_por` ni `diagnostico_verificado_en` (hueco H-12 de 001). Propuesta (Claude), decide Acker: la persona deja de tener SELECT directo sobre `app.engagements` y lee lo que necesita de su acompañamiento con la función `private.app_mi_acompanamiento()`, que solo devuelve `id`, `type` y `stage`. Mientras la función no exista, vale la regla fija en código de R-002.11. Las alternativas están en la decisión abierta (e). | C-02, C-09, C-16; interpretación del equipo a partir de H-12 (001) |

### Invitación

| ID | Requisito | Fuente |
|---|---|---|
| R-002.13 | El coach solo puede generar la invitación cuando la verificación está completa, si el tipo tiene `requiereDiagnostico = true`. | D-020 (propuesta), R-002.12 |
| R-002.14 | La invitación sigue el mecanismo que se decida en (a). Con la propuesta para el demo: el sistema genera un código aleatorio con un generador criptográfico, sin caracteres que se confunden (0 y O, 1, l e I), lo pone como contraseña temporal de la cuenta de Auth de la persona y lo muestra al coach una sola vez. El código mide 8 caracteres (decisión de Acker, 29 oct) y tiene que cumplir la política de contraseñas del proyecto de Supabase. Vence a los 7 días. La app no guarda el código en sus tablas ni en ningún log. | Decisión abierta (a); sin caracteres confundibles: interpretación del equipo a partir de C-14; sin logs: C-17 |
| R-002.15 | Cada invitación queda en `app.invitations` con su fecha de vencimiento. Generar un código nuevo cambia la contraseña temporal y marca la invitación anterior como reemplazada, así el código anterior deja de funcionar. | Interpretación del equipo |
| R-002.38 | Cuando la persona ya creó su contraseña (invitación usada), el sistema no debe dejar al coach generar otro código, porque hacerlo cambiaría la contraseña de la persona. La pantalla no muestra el botón y la Server Action lo rechaza antes de llamar a la admin API. | Interpretación del equipo |
| R-002.16 | La clave secreta de Supabase (admin API) solo vive en una variable de entorno del servidor (`SUPABASE_SECRET_KEY`), nunca con prefijo `NEXT_PUBLIC_`, nunca en el repo ni en el Drive. Solo la usa un módulo `server-only`, y solo para crear la cuenta de Auth de la persona, cambiar su contraseña temporal y borrar la cuenta si el alta falla. No se usa para leer ni escribir tablas del esquema `app`. | REGLAS §6 ("Credenciales"), C-16 |

### Entrada de la persona

| ID | Requisito | Fuente |
|---|---|---|
| R-002.17 | La persona entra por `/invitacion` con su correo y su código. Si alguno no coincide, el sistema debe mostrar el mismo mensaje para los dos casos. Si la invitación venció o fue reemplazada, el sistema debe cerrar la sesión y decirle que pida un código nuevo. | Interpretación del equipo; mismo criterio que `app/login/actions.ts` |
| R-002.39 | Supabase Auth no sabe que el código vence: la contraseña temporal sigue sirviendo en `/login` después de la fecha. Por eso la revisión del vencimiento no puede vivir solo en `/invitacion`. En cualquier pantalla privada de la persona, si su invitación más reciente no está usada y ya venció, el sistema debe cerrar la sesión y mostrar el mensaje de código vencido. | Interpretación del equipo |
| R-002.18 | Después de entrar con el código, la persona debe crear su contraseña antes de ver cualquier otra pantalla. Al guardarla, la invitación queda marcada como usada y el código deja de servir. | Decisión de Acker (2); el paso de la contraseña es interpretación del equipo |
| R-002.19 | Mientras la persona no tenga consentimiento vigente, la única pantalla privada que puede ver es la del aviso y el consentimiento. Las páginas públicas (ayuda en el pie de página y `/preferencias`) siguen disponibles. | C-10, interpretación del equipo |

### Aviso de privacidad y consentimiento

| ID | Requisito | Fuente |
|---|---|---|
| R-002.20 | El aviso de privacidad debe decir, en lenguaje claro y en segunda persona: qué datos se guardan; para qué; quién los ve; que un proveedor de IA (Anthropic, que es el que usa `lib/ai/*`) procesa las notas del coach y qué le llega; y que la persona puede retirar el consentimiento y qué pasa si lo hace. También debe decir que el documento de diagnóstico no entra al sistema y que la empresa nunca recibe el diagnóstico ni su verificación. | Decisión de Acker (1) y (2), CONTEXTO §6 ("Flujo del demo", paso 1), C-02, C-11, C-14; la lista de contenidos es interpretación del equipo |
| R-002.21 | El aviso vive versionado en el repo, en `legal/2026-10-29_aviso-privacidad.md`, con la marca "Borrador sin revisión legal" en su primera línea visible. La pantalla muestra el texto de ese archivo. La versión es la fecha del nombre del archivo y la expone una constante `AVISO_VERSION` en `lib/legal/aviso.ts`. Un cambio de texto crea un archivo nuevo con otra fecha; el anterior se queda porque hay consentimientos que apuntan a él. | Decisión abierta (d); conservar versiones: interpretación del equipo a partir de REGLAS §3 |
| R-002.22 | La casilla de consentimiento no viene marcada. Si la persona oprime el botón sin marcarla, el sistema no registra nada y muestra el error en texto junto a la casilla. | Interpretación del equipo; no afirma qué exige la LFPDPPP (decisión abierta d) |
| R-002.23 | Al confirmar, el sistema registra un evento `otorgado` en `app.consent_events` con `version_aviso = AVISO_VERSION`, el `user_id` de la persona y la fecha que pone la base. | Decisión de Acker (2); el registro con versión y fecha es interpretación del equipo |
| R-002.24 | Solo la persona del acompañamiento puede registrar su consentimiento o retirarlo. El coach no puede registrarlo por ella con su propia sesión, ni desde la app ni contra la base. Con la opción B de (a) queda un límite: el coach conoce el código y podría entrar como la persona antes que ella (ver "Límites conocidos"). | C-10, interpretación del equipo |
| R-002.37 | Si el tipo tiene `requiereDiagnostico = true`, la base debe rechazar un evento `otorgado` cuando el acompañamiento no tiene `diagnostico_verificado = true`. La persona ve el mensaje de alta incompleta. | D-020 (propuesta), R-002.12; interpretación del equipo |
| R-002.25 | Con el primer evento `otorgado`, si la etapa es `alta`, la etapa pasa a `evaluacion_inicial`. El cambio lo hace la base, en la misma transacción que el evento. | Interpretación del equipo |
| R-002.26 | La persona puede elegir "No por ahora". El sistema no registra ningún evento y le dice qué significa no dar el consentimiento. | Interpretación del equipo a partir de C-14 |
| R-002.41 | La etapa de un acompañamiento solo cambia por triggers o funciones `security definer` del esquema `private`. No existe una política genérica de UPDATE sobre `app.engagements` para ningún rol, y `authenticated` no tiene permiso de escribir `stage`. La única política de UPDATE que agrega esta spec es `engagements_update_coach_alta`, limitada por permisos a las dos columnas de la verificación y por filas a la etapa `alta` (ver la decisión abierta g). Esta spec define la transición `alta` → `evaluacion_inicial` (R-002.25). La tabla de transiciones y sus tareas son de 003. Propuesta (Claude), decide Acker. | Interpretación del equipo; hueco H-7 de 001 |
| R-002.42 | Además de lo que pide R-002.20, el aviso debe decir: qué datos llegan al modelo en cada etapa que lo usa; qué pasa con los datos cuando se cierra el acompañamiento; cuánto tiempo se guardan (pendiente de la revisión legal, decisión abierta d); y que las alertas fuertes las ve el coach en la app y él las pasa a una persona de Specialisterne fuera del sistema. Propuesta (Claude), decide Acker. | C-12, D-015 (propuesta); R-006.12 (006); el contenido es interpretación del equipo |
| R-002.43 | Antes de que una etapa mande al modelo datos que el aviso vigente no menciona, el aviso debe subir de versión (archivo nuevo en `legal/` y `AVISO_VERSION` nueva). Cada spec de 003 a 006 que mande datos nuevos al modelo lleva su propio requisito: "sube la versión del aviso (002) antes de activarse". Pedir el consentimiento otra vez con la versión nueva sigue abierto en (d). Propuesta (Claude), decide Acker. | REGLAS §3; interpretación del equipo |

### Retiro del consentimiento

| ID | Requisito | Fuente |
|---|---|---|
| R-002.27 | La persona puede retirar su consentimiento en cualquier momento desde `/persona`, con un diálogo de confirmación. El sistema registra un evento `retirado` con la versión del aviso vigente. | Interpretación del equipo; confirmación: C-14 |
| R-002.28 | El consentimiento vigente es el último evento de `app.consent_events` del acompañamiento: vigente si es `otorgado`, no vigente si es `retirado` o si no hay eventos. Los eventos no se editan ni se borran. `private.app_has_consent(engagement_id)` es el único chequeo de consentimiento del sistema, para políticas y rutas de todas las specs. | Interpretación del equipo |
| R-002.29 | Después de retirarlo, la persona puede dar su consentimiento otra vez. Eso crea un evento `otorgado` nuevo con la versión del aviso vigente en ese momento. | Interpretación del equipo |
| R-002.30 | Al retirar el consentimiento, las notas, perfiles y planes que ya existen siguen la regla que se decida en (b). Con la propuesta: nada se borra y todo deja de mostrarse, también al coach, hasta que haya un consentimiento vigente otra vez. | Decisión abierta (b) |
| R-002.44 | La regla de (b) aplica a toda tabla que guarde datos derivados de las notas, también a las que agreguen 003, 004, 005 y 006. Cada una de esas specs lleva un requisito que lista sus tablas nuevas que entran en el bloqueo, y su migración agrega la condición de consentimiento vigente (002) a las políticas de esas tablas. Las tablas de 002 son las de la sección "Datos". Propuesta (Claude), decide Acker. | C-10; interpretación del equipo |

### Bloqueo sin consentimiento (C-10)

| ID | Requisito | Fuente |
|---|---|---|
| R-002.31 | Sin consentimiento vigente, el sistema no guarda ninguna nota ni llama al modelo. La política `sessions_insert_coach` lo impide en la base, y cada ruta que llama al modelo revisa el consentimiento vigente antes de la llamada y responde 409. Hoy esa ruta es `POST /api/engagements/[id]/sessions`. Las rutas de 003, 004, 005 y 006 que llamen al modelo usan el mismo chequeo (`exigirConsentimiento`, sobre `private.app_has_consent`) y no leen ninguna otra columna ni tabla para decidir si hay consentimiento. | C-10, D-035 (propuesta) |
| R-002.32 | En la página del acompañamiento, mientras no haya consentimiento vigente, el coach no ve el botón "Nueva sesión" y ve en su lugar el texto que explica por qué. Si abre `/coach/engagements/[id]/sessions/new` directo, ve el texto de "Coach: nueva sesión sin consentimiento", que no le pide registrar el consentimiento (R-002.24). | C-10, C-14 |

### Datos existentes, seed y accesibilidad

| ID | Requisito | Fuente |
|---|---|---|
| R-002.33 | `engagements.consentimiento_en` se elimina. La migración convierte cada valor no nulo en un evento `otorgado` antes de borrar la columna. El código que la lee pasa a usar el consentimiento vigente. | Interpretación del equipo; decisión abierta (f) |
| R-002.34 | El seed deja de escribir `consentimiento_en`. El acompañamiento de demo tiene un evento `otorgado` con la versión del aviso. Se agrega un segundo acompañamiento sintético en etapa `alta`, sin verificación ni consentimiento, para las pruebas RLS y el recorrido. | C-07 |
| R-002.35 | Todas las pantallas nuevas cumplen C-14: lenguaje literal, ayuda humana en el pie de página, sin temporizadores ni cuentas regresivas (el vencimiento del código se muestra como fecha), confirmación antes de retirar el consentimiento y antes de reemplazar un código, errores en texto con el foco movido al error como en `app/login/page.tsx`. | C-14 |
| R-002.36 | Ninguna pantalla nueva usa "paciente", "debilidades", "déficit" ni "Business Profile". | C-08, REGLAS §2.5 |
| R-002.45 | La persona solo escribe en la base lo que dice esta lista: sus eventos en `app.consent_events`; el canje de su invitación (`usada_en` en `app.invitations`), siempre por una Server Action; eventos de `app.profile_events` con `tipo = 'no_me_representa'` (su ciclo de vida y su modelo los define 005); y sus propias filas de `app.audit_log`. Cualquier otro INSERT, UPDATE o DELETE de la persona lo rechaza la base. 005 y 006 remiten a esta lista y no le agregan escrituras: el "Esto no me representa" sobre el plan y sobre el cierre usa la misma fila de `profile_events` (R-005.40, R-006.17). Propuesta (Claude), decide Acker. | C-09, C-16; interpretación del equipo a partir de las políticas de `lib/db/schema.ts` |
| R-002.46 | Las pruebas de RLS viven en el repo, en `scripts/rls-check.ts`. El script incluye las comprobaciones de CA-001.8 (hueco H-8 de 001) y las de esta spec, y 003 a 006 agregan sus casos al mismo script, no a uno propio. Cada caso corre en una transacción con `rollback`. Propuesta (Claude), decide Acker. | REGLAS §3; hueco H-8 de 001 |
| R-002.47 | El código de invitación nunca va en una URL (ni en un query string, ni en un enlace, ni en un redirect), ni en `logError`, ni en `app.audit_log`, ni en ninguna tabla de la app. Solo viaja en la respuesta de la Server Action del coach que lo genera y en el cuerpo POST del formulario de `/invitacion`. El único lugar donde persiste es Supabase Auth, como contraseña temporal con hash. No se agrega un hash propio en `app.invitations`: con 8 caracteres, un SHA-256 simple se podría recuperar desde un dump probando todas las combinaciones. | Decisión de Acker (29 oct); C-17 |
| R-002.48 | Toda función nueva del esquema `private` es `SECURITY DEFINER` con `SET search_path = ''` y nombres calificados (`app.`, `auth.`), y es `STABLE` salvo las funciones de trigger. Se le quita `execute` a `public` y a `anon` y solo se da a `authenticated` cuando la usa una política o el servidor. Después de migrar, el advisor de seguridad de Supabase no marca ninguna. | Decisión de Acker (29 oct); C-16 |
| R-002.49 | Cuando una persona retira su consentimiento, sus datos se guardan ocultos y sin usarse hasta 6 meses después del retiro y después se borran. La persona puede pedir que se borren antes. El aviso lo dice en "Cuánto tiempo guardamos tus datos". El borrado lo hace `scripts/purge-retirados.ts`, un script manual: para cada acompañamiento cuyo último evento es `retirado` con más de 6 meses, borra `sessions`, `profile_events`, `profile_snapshots`, `persona_profiles` y `recommendations` (y las tablas que agreguen 003 a 006 a su lista de bloqueo), y deja `engagements` y `consent_events` para que quede el rastro del retiro y del borrado. Con `--engagement <id>` borra antes, a pedido de la persona. Un trabajo programado queda en What's next. | Decisión de Acker (29 oct), borrador sin revisión legal (decisión abierta d); qué tablas se conservan es interpretación del equipo |

## Criterios de aceptación

| ID | Dado / Cuando / Entonces | Cubre | Cómo se prueba |
|---|---|---|---|
| CA-002.1 | Dado un coach con sesión, cuando crea un acompañamiento con tipo, nombre de pila y un correo `.test`, entonces existen la cuenta de Auth, la fila en `app.users` con rol `persona` y el acompañamiento en etapa `alta` con su `coach_id`. | R-002.1, R-002.2 | navegador + consulta SQL |
| CA-002.2 | Dado el formulario de alta, cuando el correo no termina en `.test`, entonces no se crea nada y se muestra el error. | R-002.3 | prueba offline (validador) + navegador |
| CA-002.3 | Dado un correo que ya tiene cuenta, cuando el coach intenta crear el acompañamiento, entonces no se crea ninguna fila y se muestra el mensaje de correo repetido. | R-002.4 | navegador |
| CA-002.4 | Dada la sesión de la persona, cuando intenta insertar en `app.engagements` o en `app.users`, entonces la base lo rechaza. Dada la sesión del coach, cuando inserta un acompañamiento con otro `coach_id`, con etapa distinta de `alta` o con un `persona_id` que ya tiene acompañamiento, entonces la base lo rechaza. | R-002.4, R-002.5 | RLS |
| CA-002.5 | Dada la pantalla de verificación, cuando se revisa su HTML, entonces no hay ningún `input type="file"`, `textarea` ni zona de arrastre. | R-002.6 | navegador (inspección) |
| CA-002.6 | Dado el formulario de verificación, cuando falta una casilla o la cédula, o la cédula tiene letras, entonces no se guarda y se muestra el error. | R-002.7 | prueba offline (validador) + navegador |
| CA-002.7 | Dada la sesión del coach, cuando hace un UPDATE que intenta escribir `diagnostico_verificado_por` o `diagnostico_verificado_en`, entonces la base lo rechaza por permisos. Cuando guarda la verificación, esas dos columnas quedan con su id y la hora de la base. | R-002.8 | RLS |
| CA-002.8 | Dado el owner de la base, cuando intenta dejar `diagnostico_verificado = true` con `cedula_profesional` nula, entonces el check lo rechaza. | R-002.9 | consulta SQL como owner, dentro de una transacción con `rollback` |
| CA-002.9 | Dado un acompañamiento en etapa `evaluacion_inicial`, cuando su coach intenta cambiar la cédula, entonces la base no actualiza ninguna fila. Dado otro coach de la misma organización, cuando intenta verificar ese acompañamiento, entonces tampoco. | R-002.10 | RLS |
| CA-002.10 | Dado el código de `app/persona/*`, `app/bienvenida/*` y `app/api/persona/*`, cuando se busca `diagnostico` o `cedula`, entonces no aparece ninguna selección de esas columnas. Dado `lib/prompts.ts`, entonces no recibe datos de la verificación. | R-002.11 | revisión de código (grep en la verificación final) |
| CA-002.11 | Dado un acompañamiento sin verificación, cuando el coach abre la sección de invitación, entonces no puede generar el código y ve el texto que explica por qué. | R-002.12, R-002.13 | navegador |
| CA-002.12 | Dado un código generado, cuando se revisan `app.invitations`, `app.audit_log` y los logs del servidor, entonces el código no aparece en ninguno. | R-002.14 | consulta SQL + revisión de logs |
| CA-002.13 | Dado un código reemplazado, cuando la persona intenta entrar con él, entonces no puede. | R-002.15, R-002.17 | navegador |
| CA-002.14 | Dado el repo, cuando se busca `SUPABASE_SECRET_KEY`, entonces solo aparece en `.env.example` (vacía) y en el módulo `server-only`, y ninguna variable `NEXT_PUBLIC_` contiene una clave secreta. | R-002.16 | revisión de código |
| CA-002.15 | Dada una invitación vencida y no usada, cuando la persona entra con correo y código correctos por `/invitacion` y, en otro intento, por `/login`, entonces en los dos casos se cierra la sesión y ve el mensaje de código vencido sin llegar a `/persona` ni a `/bienvenida`. | R-002.17, R-002.39 | navegador (con `expira_en` en el pasado vía SQL) |
| CA-002.16 | Dada una persona que entró con código, cuando intenta abrir `/persona` antes de crear su contraseña, entonces llega a la pantalla de contraseña. Cuando ya la creó, el código deja de funcionar. | R-002.18 | navegador |
| CA-002.17 | Dada una persona sin consentimiento vigente, cuando abre `/persona`, entonces llega a la pantalla del aviso. | R-002.19 | navegador |
| CA-002.18 | Dada la pantalla del aviso, cuando se carga, entonces la casilla está desmarcada, el texto coincide con `legal/2026-10-29_aviso-privacidad.md` y la versión mostrada es `AVISO_VERSION`. Cuando se oprime el botón sin marcar la casilla, entonces no hay evento nuevo y aparece el error. | R-002.20, R-002.21, R-002.22 | prueba offline (el aviso contiene las secciones de R-002.20) + navegador |
| CA-002.19 | Dada la persona en la pantalla del aviso, cuando marca la casilla y confirma, entonces hay un evento `otorgado` con la versión del aviso y la etapa del acompañamiento es `evaluacion_inicial`. | R-002.23, R-002.25 | navegador + consulta SQL |
| CA-002.20 | Dada la sesión del coach, cuando intenta insertar un evento en `app.consent_events`, entonces la base lo rechaza. Dada la sesión de la persona, cuando intenta insertar un evento para otro acompañamiento, con otro `user_id` o con `fecha` propia, o intenta UPDATE o DELETE, entonces la base lo rechaza. | R-002.24, R-002.28 | RLS |
| CA-002.21 | Dada la persona en el aviso, cuando elige "No por ahora", entonces no hay evento nuevo y ve el texto de esa opción. | R-002.26 | navegador |
| CA-002.22 | Dado un acompañamiento con consentimiento vigente, cuando la persona lo retira y confirma, entonces el último evento es `retirado`, `private.app_has_consent` devuelve `false` y `POST /api/engagements/[id]/sessions` responde 409 sin crear fila en `sessions` ni en `audit_log`. | R-002.27, R-002.28, R-002.31 | navegador + RLS |
| CA-002.23 | Dado un consentimiento retirado, cuando la persona lo da otra vez, entonces el último evento es `otorgado` y el coach puede guardar notas de nuevo. | R-002.29 | navegador |
| CA-002.24 | Dado un consentimiento retirado y la opción propuesta de (b), cuando el coach abre el acompañamiento, entonces no ve notas, perfil ni historial, y la persona no ve su perfil. Ninguna fila se borró. | R-002.30 | RLS + consulta SQL como owner |
| CA-002.25 | Dado un acompañamiento sin consentimiento vigente, cuando el coach abre su página, entonces no ve "Nueva sesión" y ve el texto de consentimiento pendiente. Cuando abre `/coach/engagements/[id]/sessions/new` directo, ve el texto de esa pantalla y la palabra "Regístralo" no aparece. | R-002.32 | navegador |
| CA-002.26 | Dada la base migrada, cuando se consulta `app.engagements`, entonces no existe `consentimiento_en`, y el acompañamiento que la tenía tiene un evento `otorgado` con esa fecha. | R-002.33 | consulta SQL |
| CA-002.27 | Dado el seed corrido dos veces, cuando se consulta la base, entonces hay un solo evento `otorgado` para el acompañamiento de demo y existe el acompañamiento en `alta` sin verificación ni consentimiento. | R-002.34 | consulta SQL |
| CA-002.28 | Dadas las pantallas nuevas, cuando se recorren con teclado, en modo Alto contraste y con movimiento en cero, entonces todo se puede usar, cada error recibe el foco, no hay temporizadores y el retiro y el reemplazo de código piden confirmación. | R-002.35 | navegador |
| CA-002.29 | Dados los archivos nuevos de `app/`, `legal/` y `lib/legal/`, cuando se buscan "paciente", "debilidad", "déficit" y "Business Profile" sin distinguir mayúsculas, entonces no hay ningún resultado. | R-002.36 | revisión de código (grep en la verificación final) |
| CA-002.30 | Dado un fallo de la base al crear el acompañamiento (en local, quitando por un momento el `grant insert` sobre `app.users`), cuando el coach envía el formulario, entonces aparece "No se pudo crear el acompañamiento. No se guardó nada. Intenta de nuevo." y no queda ninguna cuenta en `auth.users` con ese correo. | R-002.2 | navegador + consulta SQL |
| CA-002.31 | Dado un acompañamiento en `alta` con `diagnostico_verificado = false`, cuando la sesión de la persona inserta un evento `otorgado`, entonces la base lo rechaza y la etapa sigue en `alta`. Cuando inserta un evento `retirado`, la base lo acepta. | R-002.37 | RLS |
| CA-002.32 | Dada una invitación usada, cuando el coach abre la sección "Invitación", entonces no ve "Generar un código nuevo". Dada una pestaña del coach abierta antes de que la persona creara su contraseña, cuando el coach oprime "Generar un código nuevo" en esa pestaña, entonces la action responde con error, no hay invitación nueva y la persona sigue entrando con su contraseña. | R-002.38 | navegador (dos pestañas) + consulta SQL |
| CA-002.33 | Dada la sesión de la persona y la propuesta de (e) aprobada, cuando hace SELECT sobre `app.engagements`, entonces obtiene 0 filas. Cuando llama `private.app_mi_acompanamiento()`, entonces recibe una fila con solo `id`, `type` y `stage`. Cuando inserta un evento `otorgado` con la verificación completa, la base lo acepta. Si (e) se decide distinto, este criterio se reduce a CA-002.10. | R-002.40 | RLS |
| CA-002.34 | Dada la sesión del coach, cuando hace un UPDATE que intenta escribir `stage`, entonces la base lo rechaza por permisos. Dada la sesión de la persona, cuando hace UPDATE de cualquier columna de su fila de `engagements`, entonces no se actualiza ninguna fila. Dado `lib/db/schema.ts`, la única política de UPDATE sobre `engagements` es `engagements_update_coach_alta`. | R-002.41 | RLS + revisión de código |
| CA-002.35 | Dado `legal/2026-10-29_aviso-privacidad.md`, cuando corre la prueba offline del aviso, entonces encuentra las secciones "Inteligencia artificial" (con lo que llega al modelo por etapa), "Cuando termina tu acompañamiento", "Cuánto tiempo guardamos tus datos" y "Si necesitas más apoyo". | R-002.42 | prueba offline |
| CA-002.36 | Dado un PR que manda al modelo un dato que el aviso vigente no menciona, cuando se revisa, entonces incluye un archivo nuevo en `legal/` y un `AVISO_VERSION` nuevo. | R-002.43 | revisión de código |
| CA-002.37 | Dado un consentimiento retirado y la opción propuesta de (b), cuando `scripts/rls-check.ts` lee como coach y como persona cada tabla de la sección "Datos" de esta spec y cada tabla que 003 a 006 listan en su requisito de bloqueo, entonces obtiene 0 filas. | R-002.44 | RLS |
| CA-002.38 | Dada la sesión de la persona, cuando intenta INSERT, UPDATE o DELETE en cualquier tabla del esquema `app` fuera de la lista de R-002.45, entonces la base lo rechaza. Cuando escribe lo que la lista permite, con sus reglas, la base lo acepta. | R-002.45 | RLS |
| CA-002.39 | Dado el repo, cuando se corre `scripts/rls-check.ts` con `DATABASE_URL` y el seed nuevo, entonces imprime cada caso con su ID (CA-001.8, CA-002.x y los de 003 a 006 que existan) y su resultado, y termina con error si alguno falla. | R-002.46 | ejecución del script + revisión de código |
| CA-002.40 | Dado el código del repo, cuando se busca dónde se usa el código generado, entonces no aparece en `searchParams`, `redirect`, `href`, `logError`, `console` ni en inserts de `audit_log`. Dada una invitación generada, cuando se revisan `app.invitations`, `app.audit_log` y la salida del servidor, entonces el código no aparece. | R-002.47 | revisión de código + consulta SQL + revisión de logs |
| CA-002.41 | Dada la base migrada, cuando corre el advisor de seguridad de Supabase, entonces no marca ninguna función de `private`. Dado `pg_proc`, cada función nueva de `private` es `security definer`, tiene `search_path` vacío y es `stable` salvo las de trigger. | R-002.48 | advisor de Supabase + consulta SQL |
| CA-002.42 | Dado un acompañamiento con el último evento `retirado` fechado hace más de 6 meses (fecha simulada dentro de una transacción con `rollback`), cuando corre `scripts/purge-retirados.ts` en modo de prueba, entonces no quedan filas suyas en las tablas de R-002.49 y siguen su fila de `engagements` y sus `consent_events`. Un acompañamiento retirado hace menos de 6 meses, o con un `otorgado` posterior, no se toca. | R-002.49 | ejecución del script |
| CA-002.43 | Dado `legal/2026-10-29_aviso-privacidad.md`, cuando corre la prueba offline del aviso, entonces la sección "Cuánto tiempo guardamos tus datos" menciona los 6 meses después del retiro y que la persona puede pedir el borrado antes. | R-002.49 | prueba offline |

## Datos

Cambios contra `lib/db/schema.ts`, `drizzle/0000_helpers.sql` y `drizzle/0002_permisos.sql`. El esquema sigue siendo `app` y no se expone por la Data API (C-16, D-032 propuesta).

### Tablas nuevas

`app.consent_events`, con enum `app.consent_event_type ('otorgado', 'retirado')`:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `bigserial` primary key | Da el orden: el consentimiento vigente es el evento con el `id` más alto del acompañamiento. |
| `engagement_id` | `uuid` not null, FK a `engagements`, `on delete cascade` | |
| `user_id` | `uuid` not null, FK a `users` | Siempre la persona del acompañamiento. |
| `tipo` | `consent_event_type` not null | |
| `version_aviso` | `text` not null | Fecha del archivo del aviso, p. ej. `2026-10-29`. También en `retirado`, para saber qué aviso estaba vigente. |
| `fecha` | `timestamptz` not null default `now()` | La pone la base. `authenticated` no tiene permiso de escribirla. |

`app.invitations`:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `uuid` primary key, default `gen_random_uuid()` | |
| `engagement_id` | `uuid` not null, FK a `engagements`, `on delete cascade` | |
| `persona_id` | `uuid` not null, FK a `users` | |
| `creada_por` | `uuid` not null, FK a `users` | El coach. |
| `expira_en` | `timestamptz` not null | Duración propuesta: 7 días (suposición; decide Acker en (a)). |
| `usada_en` | `timestamptz` | La persona creó su contraseña. |
| `reemplazada_en` | `timestamptz` | El coach generó otro código. |
| `created_at` | `timestamptz` not null default `now()` | |

No hay columna para el código. Con la opción B de (a), el código existe solo como contraseña temporal en Supabase Auth, que guarda su hash (dato técnico sin ID de fuente; verificar en la documentación de Supabase). La invitación pendiente de una persona es la más reciente con `usada_en` y `reemplazada_en` nulos. Si además `expira_en` ya pasó, está vencida (R-002.39).

La Server Action del paso 2 inserta la invitación con `withRls` del coach y llama a la admin API dentro de la misma transacción. Si la admin API falla, la transacción hace `rollback` y no queda invitación.

### Cambios en `app.engagements`

- Restricción `unique` nueva `engagements_persona_unica` sobre `persona_id` (R-002.4). Se quita si algún día se permite más de un acompañamiento por persona. Con ella, una persona tampoco puede tener un acompañamiento nuevo después del cierre (006); si eso hace falta, se cambia por un índice único parcial sobre los acompañamientos que no están en `cierre`.
- Sin política genérica de UPDATE (R-002.41). La etapa la cambian el trigger `private.app_on_consent` de esta spec y las funciones de 003 y 006.
- Si se aprueba la propuesta de (e), la política `engagements_select_participants` se reemplaza por `engagements_select_coach` y la persona lee su acompañamiento con `private.app_mi_acompanamiento()` (R-002.40).
- Check nuevo `engagements_verificacion_completa`: `not diagnostico_verificado or (cedula_profesional is not null and diagnostico_verificado_por is not null and diagnostico_verificado_en is not null)` (R-002.9).
- Trigger `before update` (función `private.app_on_verificacion`, `security definer`, `search_path = ''`): cuando `diagnostico_verificado` o `cedula_profesional` cambian y `diagnostico_verificado` queda en `true`, pone `diagnostico_verificado_por = auth.uid()` y `diagnostico_verificado_en = now()`. Cuando queda en `false`, pone en nulo la cédula, quién y cuándo (R-002.8).
- Se elimina `consentimiento_en` (R-002.33).

#### Qué pasa con `consentimiento_en`

Hoy hay dos lugares que dirían si hay consentimiento si se agrega la tabla de eventos sin quitar la columna. Las opciones:

- Reemplazarla. Propuesta (Claude), decide Acker. La migración crea un evento `otorgado` por cada `consentimiento_en` no nulo, con `user_id = persona_id`, `fecha = consentimiento_en` y `version_aviso = 'sin-aviso-sprint-1'`, y después borra la columna. Pro: una sola fuente de verdad; el historial de otorgado y retirado queda completo. Contra: hay que tocar los cuatro archivos que la leen o la escriben: `app/api/engagements/[id]/sessions/route.ts` (líneas 57 y 64), `app/coach/engagements/[id]/page.tsx` (líneas 41 y 113), `app/coach/engagements/[id]/sessions/new/page.tsx` (líneas 27 y 50) y `scripts/seed.sql` (línea 109). La migración también inserta `fecha` y `version_aviso`, así que corre como owner, no como `authenticated`.
- Dejarla como dato derivado, que un trigger sobre `consent_events` llena o pone en nulo. Pro: casi no cambia código. Contra: dos fuentes que se pueden desincronizar si alguien escribe la columna a mano, y el nombre dice "en" pero no distingue un consentimiento retirado de uno que nunca existió.

La versión `sin-aviso-sprint-1` deja claro que esos eventos no vienen de un aviso mostrado. Con el seed nuevo (R-002.34) el acompañamiento de demo recibe además un evento con la versión real del aviso.

### Funciones auxiliares

`private.app_has_consent(eid)` cambia de definición: devuelve `true` solo si el evento con el `id` más alto de `app.consent_events` para `eid` es `otorgado`. Sigue en el esquema `private`, `security definer`, `search_path = ''`, con los mismos permisos de ejecución. `sessions_insert_coach` no cambia: ya la usa (R-002.28, R-002.31).

`private.app_invitacion_usada(eid)` es nueva: devuelve `true` si alguna invitación de `eid` tiene `usada_en` no nulo. Mismo esquema, `security definer`, `search_path = ''` y permisos de ejecución que las demás.

Trigger `after insert` en `app.consent_events` (función `private.app_on_consent`, `security definer`, `search_path = ''`): si el evento es `otorgado`, actualiza `engagements.stage` a `evaluacion_inicial` donde `id = NEW.engagement_id and stage = 'alta'` (R-002.25). Como corre como dueño, la persona no necesita permiso de UPDATE sobre `engagements`. Es la primera fila de la tabla de transiciones de 003 (R-002.41).

`private.app_alta_verificada(eid)` es nueva: devuelve `true` si el acompañamiento tiene `diagnostico_verificado = true`. La usa `consent_events_insert_persona` (R-002.37). Hace falta como función porque, si se aprueba (e), la persona ya no puede leer `engagements` y una subconsulta en la política no vería la fila. Mismo esquema, `security definer`, `search_path = ''` y permisos de ejecución que las demás.

`private.app_mi_acompanamiento()` es nueva (solo si se aprueba la propuesta de e): devuelve `id`, `type` y `stage` del acompañamiento donde `persona_id = auth.uid()`. `security definer`, `search_path = ''`, `execute` para `authenticated`. La usan `app/persona/page.tsx` y `app/api/persona/feedback/route.ts`, que hoy seleccionan `engagements.id` directo, y las páginas de `/bienvenida` (R-002.40). Las demás políticas que miran `engagements` lo hacen a través de las funciones de `0000_helpers.sql`, que son `security definer`, así que quitarle a la persona el SELECT directo no las rompe.

### Políticas RLS nuevas

| Tabla | Política | Para | Regla |
|---|---|---|---|
| `users` | `users_insert_coach_persona` | insert | quien inserta es coach, `org_id = private.app_org_id()` y `role = 'persona'` |
| `engagements` | `engagements_insert_coach` | insert | quien inserta es coach, `coach_id = auth.uid()`, `org_id = private.app_org_id()`, `stage = 'alta'`, `diagnostico_verificado = false`, y `persona_id` es un usuario con rol `persona` de la misma organización |
| `engagements` | `engagements_update_coach_alta` | update | using y with check: `coach_id = auth.uid() and stage = 'alta'`. Los permisos solo dejan escribir `diagnostico_verificado` y `cedula_profesional` (R-002.41) |
| `engagements` | `engagements_select_coach` (si se aprueba e) | select | `coach_id = auth.uid()`. Reemplaza `engagements_select_participants` (R-002.40) |
| `consent_events` | `consent_events_select_participants` | select | `private.app_is_coach_of(engagement_id)` o (`private.app_is_persona_of(engagement_id)` y `user_id = auth.uid()`) |
| `consent_events` | `consent_events_insert_persona` | insert | `private.app_is_persona_of(engagement_id) and user_id = auth.uid()`, y si `tipo = 'otorgado'`, `private.app_alta_verificada(engagement_id)` (R-002.37) |
| `invitations` | `invitations_select_participants` | select | coach del acompañamiento, o `persona_id = auth.uid()` |
| `invitations` | `invitations_insert_coach` | insert | coach del acompañamiento, `creada_por = auth.uid()`, `persona_id` igual al `persona_id` del acompañamiento, `expira_en > now()` y ninguna invitación del acompañamiento con `usada_en` no nulo (R-002.38) |
| `invitations` | `invitations_update_coach` | update | using: coach del acompañamiento `and usada_en is null and reemplazada_en is null`; with check: coach del acompañamiento `and usada_en is null` |
| `invitations` | `invitations_update_persona` | update | using: `persona_id = auth.uid() and usada_en is null and reemplazada_en is null and expira_en > now()`; with check: `persona_id = auth.uid() and reemplazada_en is null` |

R-002.37 compara contra `diagnostico_verificado` sin leer `requiereDiagnostico`, porque esa bandera vive en TypeScript. Hoy vale `true` en los dos tipos. Si (c) cambia el valor de un tipo, esta política tiene que cambiar en la misma migración.

La revisión de "ninguna invitación usada" en `invitations_insert_coach` consulta la misma tabla. Para no depender de cómo RLS evalúa esa subconsulta, se escribe como función `private.app_invitacion_usada(eid)` con `security definer`, igual que las de `0000_helpers.sql`.

Si se aprueba la opción propuesta de (b), se agrega `and (select private.app_has_consent(engagement_id))` a las políticas de lectura de `sessions`, `profile_events`, `profile_snapshots`, `persona_profiles` y `recommendations`, para cada rol que las lee. En `recommendations` la política del coach es `for all` (`recommendations_all_coach`), así que la condición también bloquea que el coach edite o borre mientras no haya consentimiento vigente. Esta spec no toca `plans` ni `plan_items`: 003 reemplaza `plans_all_coach` y `plan_items_all_coach`, retira las políticas de la persona sobre esas dos tablas y pone ahí la condición (R-003.53). Las tablas nuevas de 003 a 006 (por ejemplo `app.persona_plans` de 003) tampoco se listan aquí: cada spec las agrega en su propia migración, con la misma condición (R-002.44).

### Lo que escribe la persona (R-002.45)

| Tabla | Qué escribe | Política | Spec dueña |
|---|---|---|---|
| `consent_events` | `otorgado` y `retirado` de su acompañamiento | `consent_events_insert_persona` | 002 |
| `invitations` | `usada_en` de su invitación pendiente, desde la Server Action de `/bienvenida/contrasena` | `invitations_update_persona` | 002 |
| `profile_events` | eventos `no_me_representa` en `proposed`, con `created_by` propio | `profile_events_insert_persona_feedback` (ya existe) | 005 (ciclo de vida y modelo de datos) |
| `audit_log` | sus propias filas | `audit_log_insert_self` (ya existe) | 002 |

Fuera de Supabase Auth (su contraseña), la persona no escribe nada más. Los permisos por columna son iguales para coach y persona, así que esta lista la sostienen las políticas, y CA-002.38 la comprueba en `scripts/rls-check.ts`.

### Orden de migraciones

Las migraciones de 002 van antes que las de 003; las de 003 antes que las de 004 y 005; las de 006 al final. Así `private.app_has_consent` con su definición nueva y `app.consent_events` ya existen cuando las otras specs agregan la condición de consentimiento vigente a sus tablas.

### Permisos (archivo nuevo de permisos, misma forma que `0002_permisos.sql`)

```sql
grant insert (id, org_id, role, nombre_pila) on app.users to authenticated;
grant insert (org_id, type, coach_id, persona_id) on app.engagements to authenticated;
grant update (diagnostico_verificado, cedula_profesional) on app.engagements to authenticated;
grant insert (engagement_id, user_id, tipo, version_aviso) on app.consent_events to authenticated;
grant usage on sequence app.consent_events_id_seq to authenticated;
grant insert (engagement_id, persona_id, creada_por, expira_en) on app.invitations to authenticated;
grant update (usada_en, reemplazada_en) on app.invitations to authenticated;
```

`grant select on all tables in schema app` de `0002_permisos.sql` solo cubrió las tablas que existían; las dos tablas nuevas necesitan su `grant select` explícito. No hay `update` ni `delete` sobre `consent_events` para nadie (R-002.28). `stage`, `diagnostico_verificado_por` y `diagnostico_verificado_en` quedan sin permiso de escritura para `authenticated`; solo los cambian los triggers y las funciones de `private` (R-002.41). Las funciones nuevas llevan su `grant execute ... to authenticated`, igual que las de `0000_helpers.sql`.

Los permisos por columna no distinguen entre coach y persona, porque los dos son `authenticated`. Por eso `update (usada_en, reemplazada_en)` sobre `invitations` es igual para los dos, y lo que cada quien puede cambiar lo limitan las políticas de arriba.

El seed actual guarda la cédula sintética como `'0000000 (sintética)'`. La validación de solo dígitos (R-002.7) vive en Zod y no en la base, así que el seed no falla, pero la pantalla mostraría una cédula que el formulario no aceptaría. Propuesta: dejar solo dígitos en el seed y la marca de sintética en un comentario.

### Límites conocidos

- Hoy la persona puede leer su fila de `engagements` (política `engagements_select_participants`), incluidas las columnas de la verificación (hueco H-12 de 001). La persona no puede consultar la base directamente (C-16), así que mientras tanto R-002.11 se cumple en el código del servidor. R-002.40 propone que la base lo garantice con `private.app_mi_acompanamiento()` y sin SELECT directo de la persona. Las alternativas están en la decisión abierta (e).
- Con la opción B de (a), el coach conoce el código. Antes de que la persona entre, el coach podría usarlo, crear la contraseña y dar el consentimiento como si fuera ella. La base no lo puede distinguir porque la sesión es la de la persona. Lo que sí pasa: la persona, al llegar, ve que su código ya no funciona y tiene que pedir ayuda. Se anota como contra de B en (a) y se evita con la opción A.

## Pantallas y textos

Todas las pantallas llevan `SiteFooter` con la ayuda humana. Los textos entre llaves se reemplazan con datos.

### Coach: lista de acompañamientos (`/coach`)

- Botón nuevo: "Nuevo acompañamiento".

### Coach: crear acompañamiento (`/coach/engagements/nuevo`)

- Título: "Nuevo acompañamiento"
- Grupo de opciones "Tipo de acompañamiento", con la etiqueta y la descripción de `ENGAGEMENT_CONFIG`:
  - "Proyecto de inclusión". Acompañamiento de 6 meses después de la contratación, con la red de apoyo (líder y mentor).
  - "Workplace Support". Coaching para una persona que ya trabaja. Evaluación corta, luego objetivos y estrategias.
- Campo "Nombre de pila de la persona". Ayuda: "Solo el nombre con el que le gusta que le llamen. Sin apellidos."
- Campo "Correo de la persona". Ayuda: "En este prototipo usa un correo de prueba que termine en .test."
- Botón: "Crear acompañamiento". Mientras se envía: "Creando…"
- Errores:
  - "Elige el tipo de acompañamiento."
  - "Escribe el nombre de pila de la persona."
  - "En este prototipo solo se aceptan correos que terminan en .test."
  - "Ya existe una cuenta con ese correo. Por ahora el sistema no permite dos acompañamientos para la misma persona."
  - "No se pudo crear el acompañamiento. No se guardó nada. Intenta de nuevo."

### Coach: sección "Alta" en la página del acompañamiento (etapa `alta`)

- Título de sección: "Alta"
- Texto: "Para empezar hay tres pasos. Los haces en este orden."

Paso 1, "Verificación del diagnóstico":

- Aviso destacado: "No subas ni copies el documento. Revísalo fuera del sistema. Aquí solo registras que lo revisaste y la cédula del profesional."
- Casilla: "Revisé el documento fuera del sistema."
- Enlace: "Consultar la cédula en el sitio de la SEP (se abre en otra pestaña)" a `https://cedulaprofesional.sep.gob.mx` (F-027).
- Casilla: "Consulté la cédula en el sitio de la SEP y coincide con el documento."
- Campo "Cédula profesional de quien firma el diagnóstico". Ayuda: "Solo números."
- Botón: "Guardar verificación"
- Errores: "Marca las dos casillas para guardar la verificación." · "Escribe la cédula profesional. Solo números."
- Estado guardado: "Diagnóstico verificado por {nombre del coach} el {fecha}. Cédula: {cédula}."
- Nota fija: "Solo tú ves este dato. La persona no lo ve en su pantalla y la empresa nunca lo recibe."
- Enlace: "Corregir la verificación" (vuelve al formulario; solo existe en etapa `alta`).

Paso 2, "Invitación":

- Sin verificación (si el tipo la pide): "Primero registra la verificación del diagnóstico. Después puedes generar la invitación."
- Botón: "Generar código de invitación"
- Resultado: "Código de invitación de {nombre}: {código}. Dáselo en persona o por teléfono, no por un chat de grupo ni por un canal que vean otras personas. Este código solo se muestra esta vez. Vence el {fecha}. {nombre} entra en {URL de la app}/invitacion."
- Invitación pendiente (ya no se ve el código): "Hay un código pendiente. Vence el {fecha}."
- Botón: "Generar un código nuevo". Diálogo: "Vas a generar un código nuevo. El código anterior deja de funcionar." Botones: "Sí, generar uno nuevo" · "Cancelar".
- Invitación usada: "{nombre} ya creó su contraseña el {fecha}." Sin botón para generar otro código (R-002.38).
- Error si la action rechaza un código nuevo: "{nombre} ya creó su contraseña. No se generó un código nuevo."

Paso 3, "Consentimiento de la persona":

- Pendiente: "Pendiente. {nombre} lo da cuando entra por primera vez. Tú no lo puedes registrar por {nombre}."
- Vigente: "Sí, desde el {fecha} (aviso versión {versión})."
- Retirado: "{nombre} retiró su consentimiento el {fecha}."

En el encabezado del acompañamiento, la línea "Consentimiento:" usa los mismos tres textos. En lugar del botón "Nueva sesión", sin consentimiento vigente: "No puedes guardar notas hasta que {nombre} dé su consentimiento."

### Coach: nueva sesión sin consentimiento (`/coach/engagements/[id]/sessions/new`)

Reemplaza el texto que 001 dejó en esa página, "Regístralo antes de escribir notas de sesión", porque el coach no puede registrar el consentimiento (R-002.24).

- Título: "Falta el consentimiento" (se queda el de 001).
- Sin eventos: "{nombre} todavía no da su consentimiento. Lo da cuando entra por primera vez y tú no lo puedes registrar por {nombre}. Mientras tanto no puedes guardar notas de sesión."
- Retirado: "{nombre} retiró su consentimiento el {fecha}. No puedes guardar notas de sesión hasta que lo dé otra vez."

### Persona: entrar con código (`/invitacion`)

- Título: "Entrar por primera vez"
- Texto: "Usa el correo que le diste a tu coach y el código que te dio. Esto es un prototipo. Todos los datos son de prueba y no corresponden a personas reales."
- Campos: "Correo" · "Código de invitación". Ayuda del código: "Lo puedes escribir con o sin guiones."
- Botón: "Entrar". Mientras se envía: "Entrando…"
- Errores: "El correo o el código no coinciden." · "Tu código ya no funciona porque venció o porque tu coach generó uno nuevo. Pide un código nuevo a tu coach."

### Persona: crear contraseña (`/bienvenida/contrasena`)

- Título: "Crea tu contraseña"
- Texto: "Hola, {nombre}. Crea una contraseña para entrar las siguientes veces. Después ya no vas a necesitar el código."
- Campos: "Contraseña nueva" · "Escríbela otra vez"
- Botón: "Guardar contraseña"
- Errores: "Las dos contraseñas no son iguales." · "La contraseña es muy corta o muy fácil. Prueba con una más larga." (el mínimo lo pone la política de contraseñas del proyecto de Supabase).

### Persona: aviso y consentimiento (`/bienvenida/aviso`)

- Título: "Aviso de privacidad"
- Texto inicial: "Hola, {nombre}. Antes de empezar, lee qué datos guarda este sistema y quién los ve. Puedes tomarte el tiempo que necesites."
- El texto completo del aviso (abajo).
- Casilla (desmarcada): "Leí el aviso y doy mi consentimiento para que mi coach guarde mis datos en este sistema y use la inteligencia artificial como dice el aviso."
- Botón: "Dar mi consentimiento". Mientras se envía: "Guardando…"
- Enlace: "No por ahora"
- Error: "Marca la casilla si estás de acuerdo. Si no lo estás, elige «No por ahora»."
- Error si la base rechaza el evento por alta incompleta (R-002.37): "Tu coach todavía no termina tu alta. No registramos nada. Habla con tu coach."
- Al terminar, en `/persona`: "Listo. Registramos tu consentimiento el {fecha}."
- Pantalla de "No por ahora": "Está bien. No registramos nada. Mientras no des tu consentimiento, tu coach no puede guardar notas sobre ti en este sistema. Si cambias de opinión, entra otra vez y elige «Dar mi consentimiento»." Botones: "Volver al aviso" · "Salir".

### Persona: sección "Tus datos y tu consentimiento" (`/persona`)

- Vigente: "Diste tu consentimiento el {fecha}. Puedes retirarlo cuando quieras." Enlace: "Leer el aviso de privacidad". Botón: "Retirar mi consentimiento".
- Diálogo: "Vas a retirar tu consentimiento. Tu coach ya no podrá guardar notas nuevas ni usar la inteligencia artificial con tu información. Lo que ya está guardado deja de mostrarse, también para tu coach, y no se borra. Puedes dar tu consentimiento otra vez cuando quieras." Botones: "Sí, retirar mi consentimiento" · "Cancelar".
- Después de retirarlo: "Retiraste tu consentimiento el {fecha}. Tu coach no puede guardar notas nuevas en el sistema." Botón: "Dar mi consentimiento otra vez".

El diálogo y la pantalla posterior cambian si (b) se decide distinto a la propuesta.

### Texto del aviso (`legal/2026-10-29_aviso-privacidad.md`)

```markdown
Borrador sin revisión legal. Versión 2026-10-29. Prototipo con datos sintéticos.

# Aviso de privacidad

## Qué datos guardamos
- Tu nombre de pila y tu correo.
- Las notas que escribe tu coach después de cada sesión contigo.
- Tu perfil y tu plan de acompañamiento. Tu coach los arma a partir de esas notas.
- Que tu coach revisó tu diagnóstico, la cédula del profesional que lo firmó, y quién lo revisó y cuándo.
- Las fechas en que das o retiras tu consentimiento, y qué versión de este aviso estaba vigente.

El documento de tu diagnóstico no se sube, no se copia y no se guarda en este sistema. Tu coach lo revisa por fuera.

## Para qué los usamos
Para que tu coach lleve el registro de tu acompañamiento, arme tu perfil con tus fortalezas y tus áreas de apoyo, y te recomiende recursos. El sistema no hace diagnósticos.

## Quién los ve
- Tu coach ve todo lo de arriba.
- Tú ves tu perfil, tu plan y tus recursos. No ves las notas de tu coach.
- La empresa donde trabajas o vas a trabajar no ve nada de este sistema sin que tu coach lo apruebe. Nunca recibe tu diagnóstico ni el dato de que fue verificado.

## Inteligencia artificial
Este sistema usa un modelo de inteligencia artificial de Anthropic. El modelo propone y tu coach revisa cada propuesta y decide qué se queda.

Qué le llega al modelo en cada etapa:
- Evaluación inicial: las notas de tu coach, tu nombre de pila, el tipo de acompañamiento y tu perfil anterior. El modelo propone cómo ordenar esa información en tu perfil.
- Las demás etapas todavía no usan el modelo. Si una empieza a usarlo, antes cambia la versión de este aviso y aquí se dice qué le llega.

Al modelo no le llega tu correo ni el registro de la verificación de tu diagnóstico.

## Si necesitas más apoyo
Algunas notas pueden mostrar que necesitas más apoyo. Esa alerta solo la ve tu coach, en este sistema. Tu coach decide si la pasa a otra persona del equipo de Specialisterne, y eso lo hace fuera del sistema. El sistema no actúa solo y no le avisa a la empresa.

## Cuando termina tu acompañamiento
Tu coach cierra el acompañamiento en el sistema. Qué pasa con tus datos después del cierre todavía no está decidido. Antes de que el sistema permita cerrar acompañamientos, este aviso cambia de versión y lo dice aquí.

## Cuánto tiempo guardamos tus datos
Si retiras tu consentimiento, tus datos se guardan ocultos y sin usarse hasta 6 meses después y luego se borran. Puedes pedirle a tu coach que se borren antes. Cuánto tiempo se guardan mientras tu acompañamiento sigue activo todavía no está definido; depende de una revisión legal que no se ha hecho.

## Tu consentimiento
Tu coach solo puede guardar notas y usar la inteligencia artificial si das tu consentimiento. Puedes no darlo.

Puedes retirarlo cuando quieras desde tu página, en "Tus datos y tu consentimiento". Si lo retiras, tu coach ya no puede guardar notas nuevas ni usar la inteligencia artificial con tu información. Lo que ya estaba guardado deja de mostrarse, también para tu coach, y no se borra. Si das tu consentimiento otra vez, se vuelve a mostrar.

## Dudas
Habla con tu coach o escribe a ayuda@caja-mex.test.
```

Lo que dice sobre Anthropic sale del código (`lib/ai/model.ts` usa `@ai-sdk/anthropic`) y de lo que recibe el prompt en `lib/prompts.ts` (`mensajeUsuarioProfileUpdate`: nombre de pila, tipo de acompañamiento, nota y perfil previo con sus citas y señales). Si 003, 004, 005 o 006 mandan más datos al modelo, el aviso sube de versión antes de que esa etapa se active (R-002.43); lo mismo pasa cuando 006 defina qué pasa al cerrar (R-006.12) y cuando 004 muestre las alertas al coach. El aviso no dice qué hace Anthropic con los datos porque no tenemos esa fuente registrada en CONTEXTO §10. `ayuda@caja-mex.test` es un correo de prueba (C-07) y el nombre del proyecto es provisional (decisión abierta i). La sección "Tu consentimiento" depende de (b), "Cuánto tiempo guardamos tus datos" depende de la revisión legal y el aviso entero depende de (d).

## Reglas fijas fuera del LLM

Nada en esta etapa usa el modelo. Todo se valida con código o en la base:

- Sin consentimiento vigente no se guarda nota ni se llama al modelo: `private.app_has_consent` en la política de `sessions` y un chequeo compartido (`exigirConsentimiento(engagementId)`) en cada ruta que llama al modelo, antes de la llamada (C-10).
- Solo la persona registra o retira su consentimiento: política de `consent_events` (R-002.24).
- No hay consentimiento `otorgado` sin verificación completa: política de `consent_events` (R-002.37).
- El coach no genera código después de que la persona creó su contraseña: Server Action y política de `invitations` (R-002.38).
- Un código vencido no abre ninguna pantalla privada: revisión en la puerta de entrada de la persona, no solo en `/invitacion` (R-002.39).
- La fecha del consentimiento y el quién y cuándo de la verificación los pone la base (R-002.8, R-002.23).
- El check de verificación completa vive en la tabla (R-002.9).
- El cambio de etapa a `evaluacion_inicial` lo hace un trigger (R-002.25).
- El dominio `.test` y el formato de la cédula se validan en el servidor con Zod, además de en el formulario (R-002.3, R-002.7).
- Ninguna pantalla tiene campo de archivo (R-002.6).
- La etapa no cambia por UPDATE directo: solo por triggers o funciones de `private` (R-002.41).
- La persona solo escribe lo que dice la lista de R-002.45, y no lee las columnas de la verificación (R-002.11; en la base, R-002.40 si se aprueba e).

## Prompts

No aplica. Esta etapa no llama al modelo, así que no tiene archivo en `prompts/` ni acción de `audit_log` para llamadas al modelo.

## Decisiones abiertas

| # | Pregunta | Opciones (pros y contras) | Propuesta | Decide |
|---|---|---|---|---|
| a | ¿Cómo entra la persona por primera vez? | Dato técnico del equipo, sin ID de fuente (verificar en la documentación de Supabase antes de implementar): crear la cuenta de otra persona requiere la clave secreta del servidor (admin API), o que la persona se registre sola con `signUp`, y Supabase pide confirmar el correo por defecto. Los dominios `.test` no reciben correo. A. Invitación por correo de Supabase. Pro: flujo estándar, el código no pasa por el coach. Contra: necesita correos reales, lo que choca con C-07 en el demo; hay que configurar el envío de correo y las plantillas; también usa la clave secreta. B. Código de un solo uso que genera el coach (contraseña temporal puesta con la admin API; la persona entra y crea su contraseña). Pro: funciona con `.test`, la app no guarda el código, todo lo demás corre con RLS. Contra: el código pasa de mano en mano y depende de que el coach lo entregue bien; el coach podría entrar como la persona antes que ella (ver "Límites conocidos"); Auth no vence el código solo, la app lo revisa (R-002.39); requiere `SUPABASE_SECRET_KEY` en el servidor. C. Registro propio con `signUp` y sin confirmación de correo. Pro: no usa la clave secreta. Contra: hay que cambiar un ajuste de Auth del proyecto y cualquiera con la URL podría crear cuentas, que luego habría que ligar a un acompañamiento por correo. | B para el demo, con vencimiento de 7 días (suposición) y la longitud del código que fije Acker. A para después del demo, en "What's next". **Decidida por Acker (2026-10-29): B.** | Acker |
| b | ¿Qué pasa con las notas, el perfil y el plan si la persona retira el consentimiento? | 1. Se quedan y el coach los sigue viendo; solo se bloquean notas nuevas y la IA. Pro: no toca otras políticas; el coach conserva el contexto. Contra: la persona puede esperar que sus datos dejen de usarse. 2. Nada se borra y todo deja de mostrarse a los dos roles hasta un nuevo consentimiento. Pro: respeta el retiro sin una acción irreversible; se puede deshacer. Contra: cambia las políticas de lectura de cinco tablas en esta spec, más `plans` y `plan_items` en 003 (R-003.53) y las tablas que agreguen 003 a 006 (R-002.44); el coach pierde el contexto mientras dure. 3. Se borran. Pro: lo más estricto. Contra: borrado permanente, se pierde el rastro del método y no sabemos qué plazos de conservación aplican. | 2, y preguntar al partner qué hace hoy. **Decidida por Acker (2026-10-29): 2.** Se revisa si el partner responde otra cosa. | Acker, con la respuesta del partner |
| c | ¿Workplace Support también pide diagnóstico? | Obligatorio en los dos tipos (`requiereDiagnostico = true`). Pro: es lo que describe D-020 (propuesta). Contra: puede no coincidir con cómo trabaja Workplace Support. Configurable por tipo desde ya, con `false` para Workplace Support. Contra: sin respuesta del partner sería una suposición. | Campo configurable por tipo en `lib/engagements/config.ts`, en `true` para los dos hasta que respondan (CONTEXTO §11). Si cambia, también cambia la política de R-002.37. | Partner responde; Acker cambia el valor |
| d | ¿Qué texto legal necesita el aviso y cómo debe registrarse el consentimiento para datos sensibles? | CONTEXTO §6 deja pendiente revisar el texto oficial de la LFPDPPP sobre el consentimiento para datos sensibles. F-026 es secundaria. Esta spec no afirma qué exige la ley. 1. Construir lo que sí podemos defender (aviso en lenguaje claro, casilla desmarcada, versión y fecha, retiro) y marcarlo "Borrador sin revisión legal". Contra: puede faltar algo que la ley pida. 2. Esperar la revisión del texto oficial antes de construir. Contra: no alcanza el calendario (meta interna 5 nov, CONTEXTO §2). También falta decidir si un cambio de versión del aviso obliga a pedir el consentimiento otra vez (esta spec no lo pide, ver R-002.43) y cuánto tiempo se guardan los datos (R-002.42). | 1, y agregar a CONTEXTO §11 el pendiente de revisar el texto oficial y quién es el responsable de los datos frente a la persona. | Los tres (afecta producto y pitch) |
| e | ¿Cómo se evita que la persona lea la verificación en la base (H-12 de 001)? | 1. Quedarse en `engagements` y cumplir R-002.11 solo en el código del servidor. Pro: sin migración extra. Contra: la base no lo garantiza; depende de que ninguna página de la persona seleccione esas columnas. 2. Quedarse en `engagements`, quitarle a la persona el SELECT directo y darle `private.app_mi_acompanamiento()` con `id`, `type` y `stage` (R-002.40). Pro: la base lo garantiza sin tabla nueva; el check de verificación sigue junto al acompañamiento. Contra: dos funciones nuevas y cambiar las dos lecturas de la persona (`app/persona/page.tsx`, `app/api/persona/feedback/route.ts`). 3. Tabla propia `app.diagnosis_verifications` con RLS solo para el coach. Pro: la base garantiza que la persona y cualquier rol futuro de empresa no la ven. Contra: otra tabla y otra migración, y el check de R-002.9 pasa a esa tabla. | 2. Mientras no se implemente, vale 1. **Decidida por Acker (2026-10-29): 2.** | Acker |
| f | ¿`consentimiento_en` se reemplaza o se deja como derivado? | Ver "Qué pasa con `consentimiento_en`" en la sección Datos. En los dos casos el único chequeo es `private.app_has_consent` y ninguna spec lee la columna. | Reemplazarla. **Decidida por Acker (2026-10-29): reemplazarla por `consent_events`.** | Acker |
| g | ¿La verificación se guarda con una política de UPDATE limitada o con una función? | 1. `engagements_update_coach_alta` con permisos solo sobre `diagnostico_verificado` y `cedula_profesional`, y filas en etapa `alta`. Pro: es como está escrita esta spec; el trigger llena quién y cuándo. Contra: queda una política de UPDATE sobre `engagements`, aunque no pueda tocar `stage`. 2. Función `private.app_guardar_verificacion(eid, cedula)`, `security definer`, sin ninguna política de UPDATE sobre `engagements`. Pro: igual que las transiciones de etapa (R-002.41); no queda ningún permiso de UPDATE sobre la tabla. Contra: la función tiene que repetir las revisiones que hoy hace RLS (coach del acompañamiento, etapa `alta`). | 1 para el demo. **Decidida por Acker (2026-10-29): 1.** | Acker |
| h | ¿Se aprueban D-020, D-021 y D-022? | Siguen como propuesta en CONTEXTO §9. Esta spec las usa como regla de trabajo (diagnóstico verificado como requisito de alta, el diagnóstico no mueve las recomendaciones, el documento no se procesa ni se guarda). 1. Aprobarlas como están. Pro: la spec no cambia. Contra: D-020 en Workplace Support sigue dependiendo de la respuesta del partner (c). 2. Cambiar alguna. Pro: se ajustan a lo que responda el partner. Contra: cambia el alta (R-002.6 a R-002.13, R-002.37) y la constitución (C-02, C-03). | 1. | Los tres |
| i | ¿Cómo se llama el proyecto? | Pendiente 4 de CONTEXTO §11 ("Definir el nombre del proyecto", los tres). El aviso usa el nombre (y el correo de ayuda, `ayuda@caja-mex.test`); 005 remite a esta decisión. Si cambia después de que haya consentimientos, el aviso necesita una versión nueva. | Decidirlo antes de escribir `legal/2026-10-29_aviso-privacidad.md`. | Los tres |

## Tareas

Cada tarea es un commit chico que dice qué R-IDs cubre, qué herramienta se usó y quién lo revisó (REGLAS §3, C-19). No se empieza ninguna antes de que esta spec esté en "revisada por Acker". Las migraciones de esta spec van antes que las de 003 (ver "Orden de migraciones").

1. Aviso en el repo. Crear `legal/2026-10-29_aviso-privacidad.md` con el texto de esta spec y su línea de atribución, con el nombre del proyecto que se decida en (i). Crear `lib/legal/aviso.ts` con `AVISO_VERSION = "2026-10-29"` y una función de servidor que lee el archivo. R-002.20, R-002.21, R-002.42.
2. Configuración por tipo. Agregar `requiereDiagnostico: true` a los dos tipos en `lib/engagements/config.ts`. R-002.12.
3. Esquema. En `lib/db/schema.ts`: enum `consent_event_type`, tablas `consentEvents` e `invitations` con sus políticas, check `engagements_verificacion_completa`, restricción `engagements_persona_unica`, políticas nuevas de `users` y `engagements`, y quitar `consentimientoEn`. Si se aprueba (e), reemplazar `engagements_select_participants` por `engagements_select_coach`. No agregar ninguna otra política de UPDATE sobre `engagements`. Correr `npm run db:generate` y editar el SQL generado para que inserte los eventos `sin-aviso-sprint-1` antes del `drop column`. R-002.4, R-002.5, R-002.9, R-002.10, R-002.23, R-002.24, R-002.28, R-002.33, R-002.37, R-002.38, R-002.40, R-002.41.
4. Funciones, triggers y permisos. Migración SQL a mano (`drizzle-kit generate --custom`): nueva `private.app_has_consent`, `private.app_invitacion_usada`, `private.app_alta_verificada`, `private.app_on_verificacion`, `private.app_on_consent`, `private.app_mi_acompanamiento` (si se aprueba e), los `grant` de la sección Datos y el `grant select` de las dos tablas nuevas. R-002.8, R-002.25, R-002.28, R-002.31, R-002.37, R-002.40, R-002.41.
5. Bloqueo al retirar (solo si se aprueba la opción 2 de b). Agregar `app_has_consent` a las políticas de lectura de `sessions`, `profile_events`, `profile_snapshots`, `persona_profiles` y `recommendations`, incluida la `for all` del coach en `recommendations`. Esta tarea no toca `plans` ni `plan_items`: sus políticas las reemplaza 003 con la condición ya puesta (R-003.53). Las tablas de 003 a 006 las agrega cada spec en su migración. R-002.30, R-002.44.
6. Seed. Quitar `consentimiento_en` de `scripts/seed.sql`; insertar el evento `otorgado` del acompañamiento de demo con `where not exists` para que siga siendo idempotente; agregar la persona sintética `persona-alta@caja-mex.test` (con sus filas en `auth.users`, `auth.identities` y `app.users`, como las del seed actual) y su acompañamiento en `alta` sin verificación ni consentimiento. Si Acker aprueba la propuesta de "Datos", dejar la cédula sintética en solo dígitos. R-002.34.
7. Pruebas RLS. Script nuevo `scripts/rls-check.ts` que corre con `DATABASE_URL`, entra con los claims de cada usuario del seed (igual que `withRls`) y comprueba CA-001.8 (hueco H-8 de 001), CA-002.4, CA-002.7, CA-002.8, CA-002.9, CA-002.20, CA-002.22, CA-002.24, CA-002.31, CA-002.33, CA-002.34, CA-002.37 y CA-002.38. Cada intento prohibido debe fallar; el script corre todo dentro de transacciones con `rollback`, imprime cada caso con su ID y termina con error si alguno falla. Se arma para que 003 a 006 agreguen sus casos en el mismo archivo. R-002.4, R-002.5, R-002.8 a R-002.10, R-002.24, R-002.28, R-002.30, R-002.31, R-002.37, R-002.40, R-002.41, R-002.44 a R-002.46.
8. Cliente admin. `lib/supabase/admin.ts` con `import "server-only"`, que lee `SUPABASE_SECRET_KEY` y expone solo tres funciones: crear la cuenta de la persona, poner su contraseña temporal y borrar la cuenta si el alta falla. La cuenta se crea con el correo marcado como confirmado, porque `.test` no recibe correo (dato técnico sin ID de fuente; verificar en la documentación de Supabase). Agregar `SUPABASE_SECRET_KEY=` vacía a `.env.example` con su comentario. R-002.16.
9. Coach: crear acompañamiento. Botón en `/coach`, página `/coach/engagements/nuevo` y Server Action con Zod (tipo, nombre de pila, correo `.test`). La action crea la cuenta con el cliente admin y después, con `withRls` del coach, inserta `users` y `engagements`; si la base falla, borra la cuenta. R-002.1 a R-002.5, R-002.35, R-002.36.
10. Coach: verificación. Formulario del paso 1 en la página del acompañamiento y Server Action que solo envía `diagnostico_verificado` y `cedula_profesional`. Mostrar el estado guardado. R-002.6 a R-002.11.
11. Coach: invitación (el código cumple R-002.47 y R-002.14: 8 caracteres, vence en 7 días). Paso 2: generador del código (crypto, alfabeto sin caracteres confundibles), Server Action que revisa la verificación según `requiereDiagnostico` y que la invitación no esté usada, inserta la invitación con `withRls` del coach y, dentro de esa transacción, pone la contraseña temporal con el cliente admin (si falla, `rollback`); reemplazo con diálogo de confirmación. El código solo viaja en la respuesta de la action y no pasa por `logError`. R-002.13 a R-002.15, R-002.35, R-002.38.
12. Coach: estado y bloqueo. Paso 3 y línea "Consentimiento:" leyendo el último evento; ocultar "Nueva sesión" sin consentimiento vigente. En `app/api/engagements/[id]/sessions/route.ts`, reemplazar la lectura de `consentimientoEn` por `exigirConsentimiento` (que usa `private.app_has_consent`); en `app/coach/engagements/[id]/sessions/new/page.tsx`, usar el mismo chequeo y cambiar el texto "Regístralo antes de escribir notas de sesión" por los de "Coach: nueva sesión sin consentimiento". R-002.24, R-002.31, R-002.32, R-002.33.
13. Persona: entrada con código. Página pública `/invitacion` y su action (normaliza el código, `signInWithPassword`, revisa la invitación pendiente y su vencimiento con `withRls` de la persona, cierra sesión si venció). Página `/bienvenida/contrasena` con `supabase.auth.updateUser` y marca `usada_en`. En `lib/supabase/proxy.ts`, agregar `/bienvenida` a las rutas privadas. Si se aprueba (e), las páginas de la persona y `app/api/persona/feedback/route.ts` leen el acompañamiento con `private.app_mi_acompanamiento()`. R-002.17, R-002.18, R-002.35, R-002.40.
14. Persona: puerta de entrada. Una función de servidor compartida que usan el layout de `/persona` y las páginas de `/bienvenida`: si la invitación más reciente no está usada y venció, cierra la sesión y manda a `/invitacion` con el mensaje de código vencido; si está pendiente, manda a `/bienvenida/contrasena`; si no hay consentimiento vigente, manda a `/bienvenida/aviso`. Así el vencimiento también se revisa cuando la persona entra por `/login`. R-002.18, R-002.19, R-002.39.
15. Persona: aviso y consentimiento. Página `/bienvenida/aviso` que muestra el archivo del aviso, la casilla desmarcada y "No por ahora"; Server Action que valida la casilla en el servidor e inserta el evento con `AVISO_VERSION`. R-002.20 a R-002.23, R-002.25, R-002.26, R-002.35.
16. Persona: retiro. Sección "Tus datos y tu consentimiento" en `/persona`, diálogo de confirmación, Server Action que inserta `retirado`, y el botón para darlo otra vez. R-002.27 a R-002.29, R-002.35.
17. Pruebas offline. Junto a `npm run eval -- --offline`: validador de correo `.test`, validador de cédula, generador de código (alfabeto y la longitud que fije Acker en a) y una prueba que confirma que el archivo del aviso tiene las secciones de R-002.20 y R-002.42 (CA-002.35) y la marca de borrador. R-002.3, R-002.7, R-002.14, R-002.20, R-002.21, R-002.42.
18. Recorrido en navegador. Con el seed recién corrido: el coach crea un acompañamiento, verifica, genera el código; la persona entra, crea su contraseña, elige "No por ahora", vuelve, da su consentimiento; el coach guarda una nota; la persona retira el consentimiento; la nota nueva responde 409; la persona lo da otra vez. Revisar CA-002.5, CA-002.15 (también por `/login`), CA-002.28, CA-002.32 y el resto de criterios marcados "navegador". Todas las R.
18b. Retención. `scripts/purge-retirados.ts` con `--dry-run` y `--engagement <id>`, y su prueba de CA-002.42. R-002.49.
19. Cierre. Actualizar el README del repo (cómo correr `rls-check`, qué hace `SUPABASE_SECRET_KEY`), revisar la atribución de cada archivo nuevo y subir el estado de esta spec a "Implementada" con la lista de R-IDs cubiertos. C-19.

## Verificación

La etapa queda lista cuando:

- `scripts/rls-check.ts` pasa completo contra la base con el seed nuevo, incluidos los casos de CA-001.8 (H-8 de 001).
- Las pruebas offline nuevas y las de `npm run eval -- --offline` pasan.
- `npm run typecheck` y `npm run lint` pasan.
- El recorrido de la tarea 18 se hizo en el navegador, con teclado y en modo Alto contraste, y cada criterio "navegador" quedó anotado con fecha y quién lo revisó.
- `grep` en el repo confirma CA-002.10, CA-002.14 y CA-002.29, y que no existe ningún `type="file"` en `app/`.
- Acker revisó el texto del aviso. Las decisiones (a), (b), (e), (f) y (g) tienen en CONTEXTO §9 el nombre de quien decidió, y (d), (h) e (i) quedaron registradas como propuesta o decididas por los tres.

## Preguntas para el partner

- ¿En Workplace Support también piden el diagnóstico? (ya está en CONTEXTO §11)
- ¿El documento de diagnóstico dice el tipo o el nivel? (ya está en CONTEXTO §11). La respuesta no cambia lo que se guarda: el sistema no registra tipo ni nivel (C-01), pero ayuda a escribir las casillas de revisión.
- ¿Quién verifica hoy el diagnóstico y la cédula: el coach que lleva el caso u otra persona del equipo? ¿Guardan el documento en algún lado o lo devuelven?
- ¿Cómo registran hoy el consentimiento de la persona y con qué texto? ¿Lo firma, lo acepta por correo o de palabra?
- Si una persona retira su consentimiento, ¿qué hacen hoy con las notas del coach y con el perfil que firmaron juntos?
- Frente a la persona, ¿quién es el responsable de sus datos: Specialisterne, la empresa que contrata el servicio o los dos?
- ¿Cómo prefieren darle el acceso a la persona: en persona, por teléfono o por correo?
- ¿Le sirve a la persona ver en su pantalla que su diagnóstico ya fue verificado, o prefieren que solo lo vea el coach? Mientras no respondan, la persona no lo ve (R-002.11, R-002.40).

## Cambios

Versión 3 · 2026-10-29 · ajustes de consistencia

- R-002.32, CA-002.25, tarea 12 y "Pantallas y textos": texto nuevo para `/coach/engagements/[id]/sessions/new` sin consentimiento. Reemplaza "Regístralo antes de escribir notas de sesión" de 001, que chocaba con R-002.24 (revisión de consistencia, R1).
- Datos (bloqueo al retirar), tarea 5 y decisión (b): esta spec ya no toca `plans` ni `plan_items`. Sus políticas las reemplaza 003 con la condición de consentimiento (R-003.53). Las tablas de 002 en el bloqueo quedan en cinco (revisión de consistencia, R7).
- Alcance y R-002.45: 005 y 006 no le agregan escrituras a la lista de la persona (R-005.40, R-006.17), en lugar de "005 suma solo lo que define ella" (revisión de consistencia, R5).
- Sin R-IDs nuevos ni retirados.

Versión 2 · 2026-10-29 · consolidación entre specs

- `private.app_has_consent` queda como único chequeo de consentimiento para todas las specs (R-002.28, R-002.31); la decisión (f) se marca como propuesta de Claude.
- Nuevo R-002.40: la persona no lee la verificación en la base (H-12 de 001), con `private.app_mi_acompanamiento()` como propuesta; la decisión (e) se reescribe con tres opciones.
- Nuevo R-002.41: la etapa solo cambia por triggers o funciones de `private`, sin política genérica de UPDATE; la tabla de transiciones es de 003. Nueva decisión (g).
- Nuevos R-002.42 y R-002.43: el aviso dice qué llega al modelo por etapa, qué pasa al cerrar, la retención y cómo se escalan las alertas, y sube de versión antes de mandar datos nuevos al modelo. Texto del aviso ampliado.
- Nuevo R-002.44: el bloqueo al retirar aplica a las tablas de 003 a 006; se agrega el orden de migraciones.
- Nuevo R-002.45: lista única de lo que escribe la persona.
- Nuevo R-002.46: `scripts/rls-check.ts` compartido, con los casos de CA-001.8 (H-8 de 001).
- R-002.4 sustituye R-001.27 y CA-001.19. Nueva función `private.app_alta_verificada` para R-002.37.
- D-058 y D-030 pasan a "decididas por los tres según Acker, pendientes de registrar". Nuevas decisiones (h) sobre D-020 a D-022 e (i) sobre el nombre del proyecto. Nueva pregunta al partner sobre tipo o nivel en el documento.
- Nuevos CA-002.33 a CA-002.39; tareas 1, 3, 4, 5, 7, 13 y 17 actualizadas.

Versión 4 · 2026-10-29 · decisiones de Acker

- Decisiones abiertas a, b, e y g quedan decididas por Acker: (a) código de un solo uso que genera el coach; (b) al retirar el consentimiento nada se borra y todo deja de mostrarse a los dos roles hasta un nuevo consentimiento; (e) la persona lee su acompañamiento solo con private.app_mi_acompanamiento(); (g) política engagements_update_coach_alta limitada para el demo.
- Decisión abierta f decidida por Acker: `consentimiento_en` se reemplaza por `consent_events` (R-002.33).
- Siguen abiertas: c (respuesta del partner), d, h e i (los tres).

Versión 5 · 2026-10-29 · ajustes de Acker antes de programar

- Nuevos R-002.47 (el código nunca en URL, logs, audit_log ni tablas; sin hash propio), R-002.48 (requisitos de las funciones de private y advisor limpio) y R-002.49 (retención de 6 meses tras el retiro y script de borrado manual).
- Nuevos CA-002.40 a CA-002.43 y tarea 18b.
- R-002.14: el código mide 8 caracteres y vence en 7 días.
- Texto del aviso: la sección "Cuánto tiempo guardamos tus datos" dice los 6 meses tras el retiro.
- Estado: Revisada por Acker.

Versión 6 · 2026-10-29 · implementación

- Implementadas las tareas 1 a 18b. Migraciones `drizzle/0003` a `0006` aplicadas con `npm run db:migrate`; seed actualizado.
- Verificado:
  - `npm run rls-check` pasa 20 de 20 casos: CA-001.8, CA-002.4, .7, .8, .9, .20, .22 (base), .24, .31, .33, .34, .37, .38 y .39.
  - `npm run purge-retirados -- --test` pasa CA-002.42.
  - 12 pruebas sin red: código, correo, cédula, aviso (CA-002.35, CA-002.43) y la regresión de inserts.
  - El advisor de Supabase no marca funciones (CA-002.41).
  - Typecheck, lint y build pasan.
- Recorrido en el navegador del 29 oct:
  - Alta con correo inválido y con correo válido (CA-002.1, CA-002.2).
  - Verificación con errores y guardada, sin campo de archivo (CA-002.5, CA-002.6).
  - Código mostrado una sola vez y ausente del HTML, de los logs, de `invitations` y de `audit_log` (CA-002.12, CA-002.40).
  - Código reemplazado rechazado (CA-002.13).
  - Contraseña y puerta (CA-002.16, CA-002.17).
  - Aviso sin casilla y "No por ahora" (CA-002.18, CA-002.21).
  - Consentimiento y paso a `evaluacion_inicial` (CA-002.19).
  - Retiro: el coach ya no ve lo guardado y la ruta responde 409 sin crear filas (CA-002.22, CA-002.24, CA-002.25).
  - Consentimiento otra vez (CA-002.23).
  - Código vencido por `/login` (CA-002.15).
- Cambios durante la implementación:
  - Los inserts a `users`, `engagements`, `consent_events` e `invitations` van por `lib/db/insertar.ts` con columnas explícitas. Drizzle pone DEFAULT en todas las columnas y Postgres pide permiso sobre cada una.
  - `logging.serverFunctions: false` en `next.config.ts`. Además, las actions del código y del alta no reciben el estado anterior, que traía el código o el correo, y Next lo registraba en desarrollo.
  - Una sesión revocada por un código nuevo se trata como código vencido.
  - La cédula acepta de 1 a 20 dígitos.
- Pendiente:
  - Recorrido con teclado y en modo Alto contraste (CA-002.28).
  - CA-002.3 (correo repetido), CA-002.30 (fallo forzado de la base), CA-002.32 (dos pestañas) y CA-002.36 (revisión de PR).
  - Revisión del código por Acker.

Versión 7 · 2026-10-30 · numeración de decisiones

- Solo cambia la numeración: la decisión de la plataforma para los dos servicios se citaba aquí como D-029, y en CONTEXTO v5 esa decisión es D-058, porque D-029 ya era el reparto de negocio de Rodrigo. El cambio incluye las notas de versiones anteriores de esta sección.
- Las notas que decían que estas decisiones y el handoff faltaban por registrar ahora remiten a CONTEXTO v5. Las notas de versiones anteriores de esta sección conservan lo que decían entonces.
