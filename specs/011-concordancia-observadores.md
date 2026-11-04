<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# 011 · Concordancia entre observadores

- Estado: Borrador · Versión 2 · 2026-11-02. Acker pidió construirla el 2 nov ("Construyela completa"); su revisión de esta spec sigue pendiente.
- Fuentes: CONTEXTO §6 (flujo del demo, paso 2.3), CONTEXTO §7 (prueba de concordancia), F-005 (20:24, "entre los coaches platicamos contrastando puntos de vista"; 13:12), D-061 (propuesta), D-084 (por registrar), `04 Prototipo / 2026-11-02_metodo-datos-sinteticos` §5 y §6, C-04, C-05, C-07, C-09, C-13, C-16, C-17, C-18
- Depende de: 001 (propuesta y aprobación de perfil), 007 (formato de casos y eval), 008 (etiquetas de evidencia)

## Problema y para quién

En inclusión, varios coaches observan a la misma persona; en Workplace Support, el coach tiene su sesión con la persona y otra con la red de apoyo (F-005, 20:24). Al armar el resumen contrastan puntos de vista. CONTEXTO §6 promete que la IA "marca coincidencias y contradicciones citando el texto".

Hoy la app procesa una nota a la vez y su relación con el perfil cita solo la nota nueva. No guarda quién observó y el eval no mide las relaciones. Para el coach, eso quiere decir que una contradicción aparece sin la otra frase y sin saber de quién viene.

## Alcance

Entra, en la etapa de evaluación inicial (la que usa el prompt de perfil):

- El coach puede anotar quién observó cada nota, por rol.
- Una relación con el perfil anterior cita la frase de la nota nueva y la frase del perfil aprobado. El código valida las dos.
- La pantalla de revisión muestra las dos frases y de quién viene cada una, y dice que el sistema no elige.
- El eval corre las notas de un caso en orden, simula al coach que aprueba, mide las contradicciones y reporta cada dimensión como "x de n" (R-007.35, R-007.36).

**Fuera de alcance:**

- Etapa de seguimiento. Sigue con el prompt de seguimiento y una sola cita (R-011.4). Se retoma en What's next.
- Cargar varias notas en una sola llamada. Ver decisión abierta 1.
- Mostrarle a la persona de quién viene una observación (C-09).
- Variantes de sesgo en los casos de concordancia: el método de David no las tiene.

## Requisitos

| ID | Requisito | Fuente |
|---|---|---|
| R-011.1 | Cuando el coach escribe una nota fuera de la etapa de seguimiento, el formulario debe ofrecer un campo opcional "Quién observó", de hasta 80 caracteres, con la ayuda de usar el rol y no el nombre. | CONTEXTO §7, C-07; interpretación del equipo |
| R-011.2 | El sistema debe guardar ese texto en `sessions.observador`. En seguimiento se ignora, como `tipo` y `fecha` en otras etapas (R-004.57). Vacío se guarda como null. | Interpretación del equipo |
| R-011.3 | `sessions.observador` nunca debe llegar al modelo. El modelo no sabe el cargo de quien observó, salvo lo que diga la nota. | C-13; interpretación del equipo |
| R-011.4 | El modelo de perfil debe devolver en cada relación `citaPrevia`: una de las citas del perfil previo, o null. El esquema de seguimiento no cambia. | CONTEXTO §6, C-05 |
| R-011.5 | Antes de guardar, el código debe buscar `citaPrevia` entre las citas de las dimensiones del perfil aprobado, con la misma normalización de `citaEnNota`: primero en la dimensión de la relación, después en las demás, y en cada grupo gana la coincidencia exacta. Si está, guarda la cita completa del perfil en `citaPrevia` y su sesión en `sesionPrevia`. Si no está, la deja en null y anota un descartado con motivo `cita_previa_no_encontrada`. | C-05, D-034 (propuesta) |
| R-011.6 | Una relación que se queda sin `citaPrevia` no se quita: su cita de la nota nueva sigue siendo evidencia, y esconder una contradicción le quitaría información al coach. | Interpretación del equipo |
| R-011.7 | El prompt debe pedir que `descripcion` diga qué dice cada frase sin decir cuál es correcta, que no le dé más peso a un cargo más alto y que el `resumen` de esa dimensión integre las dos situaciones sin elegir y sin decir quién observó. El prompt es un archivo nuevo con fecha. | C-04, C-09, C-13, C-18; método de David §5 |
| R-011.8 | En la revisión, una contradicción debe mostrar la frase de la nota nueva, la frase anterior y, cuando se conoce, quién observó cada una y su fecha, con el texto "El sistema no elige. Aclara esto con la persona." | CONTEXTO §6, C-04 |
| R-011.9 | Si una contradicción no tiene frase anterior confirmada, la revisión debe decir "No se pudo confirmar la frase anterior en el perfil." | C-05 |
| R-011.10 | En la revisión, las coincidencias también deben mostrar las dos frases cuando existen. | CONTEXTO §6 |
| R-011.11 | Las citas del perfil del coach deben decir quién observó, cuando se conoce. La vista de la persona no cambia. | C-09; método de David §6 |
| R-011.12 | Los eventos anteriores a esta spec, que no traen `citaPrevia` ni `sesionPrevia`, deben seguir leyéndose. | 008 (R-008.5, mismo patrón) |
| R-011.13 | El eval debe aceptar casos con `etapas: ["concordancia"]`, con `escena`, `observaciones[]` en orden, `rasgos[]` con fuente y `esperado`. Las notas pasan las mismas revisiones de términos y datos de contacto que un caso de perfil, y cada fragmento esperado tiene que ser literal de la nota de su observador. | R-007.1, R-007.6, R-007.7, R-007.35 |
| R-011.14 | El eval debe correr las observaciones en orden con el flujo real: propuesta, `sanitizeUpdate` con el perfil acumulado y `applyApproval` aprobando todo. | R-007.36; interpretación del equipo |
| R-011.15 | Es falla crítica que una contradicción esperada no salga como relación `contradiccion` con las dos frases citadas y validadas. Una cita cuenta si se encima con la oración del fragmento esperado, en la nota de su observador. Que salga en otra dimensión es advertencia. | Método de David §6 |
| R-011.16 | Es falla crítica que aparezca una señal de `esperado.senalesProhibidas`. Son advertencia una coincidencia esperada cuyas citas no quedaron todas en el perfil, una dimensión esperada que falta, una de `esperado.dimensionesProhibidas` que aparece y un resumen que parece decir quién observó. | C-13; R-007.24 |
| R-011.17 | El reporte debe traer una tabla por dimensión con "x de n" y los tipos; otra con cada relación: quién observó cada frase, tipo, dimensión, las dos frases y su descripción; otra con el `resumen` de cada dimensión con contradicción, y otra con las señales y sus citas. Las cuentas suman todas las corridas. Si elige una versión o le da más peso a un cargo lo juzga quien lee, y el reporte lo dice. | R-007.36; interpretación del equipo |
| R-011.18 | Los casos de concordancia se reportan como notas escritas por un solo modelo mientras no se reescriban. Lo que se diga en el pitch sale de `eval/resultados/` y se presenta como piloto con datos sintéticos. | Método de David §7, R-007.43, CONTEXTO §7 |
| R-011.19 | Cada observación debe pasar los mismos criterios de un caso de perfil (`revisarPerfil`): términos no permitidos y hablar poco como riesgo o área de apoyo son falla crítica. Sin eso, el eval no mediría lo que el caso prohíbe. | C-01, C-08, C-13, R-007.62 |
| R-011.20 | Si un `resumen` parece decir quién observó, la revisión debe avisar al coach sin bloquear, porque el código no distingue todos los casos, y el eval debe dar advertencia. Solo el prompt y la revisión del coach frenan esto; no hay filtro que lo garantice. | C-04, C-09 |

## Criterios de aceptación

| ID | Dado / Cuando / Entonces | Cubre | Cómo se prueba |
|---|---|---|---|
| CA-011.1 | Dada una relación cuya `citaPrevia` está en el perfil, cuando se limpia, entonces guarda la cita completa y su sesión. | R-011.5 | prueba offline |
| CA-011.2 | Dada una relación cuya `citaPrevia` no está en el perfil, cuando se limpia, entonces queda en null, hay un descartado y la relación se conserva. | R-011.5, R-011.6 | prueba offline |
| CA-011.3 | Dado un evento guardado sin `citaPrevia`, cuando se lee, entonces pasa el esquema. | R-011.12 | prueba offline |
| CA-011.4 | Dada una nota con observador, cuando se arma el mensaje del modelo, entonces el observador no aparece. | R-011.3 | prueba offline |
| CA-011.5 | Dadas tres observaciones con salidas fijas donde `retroalimentacion` sale dos veces como `fortaleza` y falta en la tercera, cuando se arma la concordancia, entonces dice "retroalimentacion: 2 de 3 (fortaleza 2)". | R-011.17, CA-007.18 | prueba offline |
| CA-011.6 | Dadas salidas fijas sin la contradicción esperada, o con una sola de sus frases, cuando se evalúan, entonces hay falla crítica. Con las dos frases, no la hay. | R-011.15 | prueba offline |
| CA-011.7 | Dado un fragmento esperado que no está en la nota de su observador, cuando se valida el caso, entonces es inválido. | R-011.13 | prueba offline |
| CA-011.11 | Dado un resumen con un término no permitido, o un área de apoyo cuya única cita es que la persona habla poco, cuando se evalúa una observación, entonces es falla crítica. | R-011.19 | prueba offline |
| CA-011.12 | Dado el resumen "Su líder cree que Valeria rinde más en la oficina", cuando se revisa, entonces hay aviso y advertencia. Con "Le ayuda que su líder le avise", no. | R-011.7, R-011.20 | prueba offline |
| CA-011.8 | Dados los casos de Mateo y Valeria, cuando corre `npm run eval -- --reporte`, entonces el resultado queda en `eval/resultados/`, pase o no. | R-011.14 a R-011.18 | eval con el modelo |
| CA-011.9 | Dada una persona con sesión iniciada, cuando intenta leer `sessions.observador`, entonces no puede. | C-09, C-16 | `npm run rls-check` |
| CA-011.10 | Dada una nota B que contradice a una nota A aprobada, cuando el coach abre la propuesta, entonces ve las dos frases, quién observó y el aviso de que el sistema no elige, también con teclado. | R-011.1, R-011.8 | navegador |

## Datos

- `app.sessions`: columna nueva `observador text`, nullable. Migración `0028`. No necesita grants nuevos: `drizzle/0002_permisos.sql` da insert sobre toda la tabla. RLS no cambia. La app no funciona contra una base sin esta migración, porque las lecturas y escrituras de `sessions` ya nombran la columna, así que se aplica antes de correr esta versión.
- `profile_events.payload`: `relacionesConPerfilPrevio[]` suma `citaPrevia` y `sesionPrevia`, opcionales y nulos. `Descartado.motivo` suma `cita_previa_no_encontrada`.
- La purga no cambia: `sessions` ya está en `TABLAS_PURGA`.

El aviso de privacidad no menciona este dato. Se agrega junto con el cambio de nombre, para subir la versión una sola vez (C1 del traspaso, R-002.42, R-002.43).

## Pantallas y textos

- Campo: "Quién observó (opcional)". Ayuda: "Escribe el rol, no el nombre: por ejemplo, coach del módulo técnico o líder. La IA no recibe este dato y la persona no lo ve."
- Título: "Contradicción con el perfil: {dimensión}" y "Coincide con el perfil: {dimensión}". Sustituye a "No coincide con el perfil", que decía menos.
- Encabezado de cada frase: "Esta nota" o "Nota anterior". Debajo de la frase: "Observó: {rol}" y "Sesión del {fecha}" cuando se conoce. Sin rol registrado: "Observó: sin registrar".
- Aviso en un resumen: "Este texto parece decir quién observó. La persona lo lee: revísalo."
- Aviso de contradicción, solo cuando la relación es de esta spec: "El sistema no elige. Aclara esto con la persona."
- Sin frase anterior: "No se pudo confirmar la frase anterior en el perfil."

## Reglas fijas fuera del LLM

- La frase anterior solo se muestra si está en el perfil aprobado (R-011.5). El modelo no puede inventarla.
- `sessions.observador` no pasa por `lib/prompts.ts` (R-011.3).

## Prompts

`prompts/2026-11-02_profile-update.md`, copia de `2026-11-01_profile-update` que solo cambia la sección de relaciones y sus reglas del `resumen`.

## Decisiones abiertas

| # | Pregunta | Opciones (pros y contras) | Propuesta | Decide |
|---|---|---|---|---|
| 1 | ¿Las notas se comparan en orden o todas juntas? | (a) En orden, contra el perfil aprobado: usa el flujo y la aprobación que ya existen; una frase que el coach no aprobó no se puede citar. (b) Todas en una llamada: ve las tres; pide una ruta, una pantalla y una propuesta con varias sesiones nuevas. | (a). Se construye así. | Acker |
| 2 | ¿El modelo recibe quién observó? | (a) No: evita que pese el cargo; solo sabe lo que la nota diga. (b) Sí: puede explicar de quién viene; arriesga el sesgo que el método pide evitar. | (a). Se construye así. | Acker |
| 3 | ¿Una contradicción sin frase anterior confirmada se muestra? | (a) Sí, con aviso: el coach no pierde el hallazgo. (b) Se quita: más estricto con C-05; esconde información. | (a). Se construye así. | Acker |
| 4 | ¿El cambio de `citaPrevia` entra también a seguimiento? | (a) Ahora no: evita otro prompt y repetir 7 casos. (b) Sí: cubre la sesión con la red de apoyo en esa etapa. | (a). Se construye así. | Acker |

## Tareas

1. Spec, índice y bloque de decisiones. (todas)
2. Esquemas: relación etiquetada y de lectura; motivo nuevo. (R-011.4, R-011.5, R-011.12)
3. Limpieza con el perfil previo y prueba offline. (R-011.5, R-011.6, CA-011.1 a CA-011.3)
4. Prompt nuevo, `PROMPT_VERSION` y hash fijado. (R-011.7)
5. Columna, migración sin aplicar, contrato y ruta. (R-011.1 a R-011.3)
6. Formulario, revisión y citas del perfil. (R-011.1, R-011.8 a R-011.11)
7. Eval: etapa, validador, corrida, tablas y pruebas. (R-011.13 a R-011.17, CA-011.4 a CA-011.7)
8. Casos de Mateo y Valeria. (R-011.13, R-011.18)
9. `scripts/rls-check.ts` ya revisa que la persona no lea filas de `sessions`, y eso cubre la columna: no necesita caso nuevo. Se corre con la migración aplicada. (CA-011.9)

## Verificación

- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run eval -- --offline`.
- Con la migración aplicada y `.env.local`: `npm run rls-check`, `npm run eval -- --reporte`, comparando con `2026-11-01_eval_5`, y el recorrido de CA-011.10.
- Lo no probado se anota en "Cambios".

## Cambios

2026-11-02 · sin cambiar de versión: pruebas con la base y el modelo, ya con `.env.local`.

- Migración `0028` aplicada a la base compartida: era la única pendiente (29 de 29) y no cambió las 13 sesiones que había.
- CA-011.9: `npm run rls-check` pasa 78 de 78 casos, con la columna ya creada.
- CA-011.8: `eval/resultados/2026-11-02_eval.md`, 3 corridas. Mateo y Valeria salen OK: la contradicción esperada sale con las dos frases en 3 de 3 corridas en los dos casos. En Valeria sale en `ajustes_razonables` y no en `concentracion` en 2 de 3 (advertencia). Coincidencias con todas sus citas: 7 de 12 en Mateo y 11 de 21 en Valeria. Las notas siguen siendo de un solo modelo, así que esto no mide observadores distintos (R-011.18).
- Resúmenes en dimensiones con contradicción: ninguno dice quién observó. En una corrida de Valeria el de `antecedentes_experiencia` dice "Su líder la considera…" y salió el aviso de R-011.20. Que algún resumen elija una versión no lo revisa el código: queda en la tabla para quien la lea.
- Banderas de texto copiado de la nota (R-004.59) en los resúmenes: 10 en Mateo y 19 en Valeria en 3 corridas. El filtro las detiene, pero el coach tiene que corregir el texto antes de aprobar.
- CA-011.10, recorrido en navegador del 2 nov con la cuenta de coach, en el acompañamiento de Robin (`02c34797…`), con dos notas de Mateo con el nombre cambiado. La propuesta de la nota B muestra "Contradicción con el perfil: Trato uno a uno", las dos frases, quién observó cada una, su sesión y "El sistema no elige. Aclara esto con la persona." Las notas se escribieron y enviaron solo con teclado; la sección no tiene nada que dependa del mouse. La nota B quedó pendiente, sin aprobar, porque dos resúmenes traían texto copiado. Esas dos sesiones quedan en la base.
- Vista de la persona, con la cuenta de Robin: "Tu perfil" muestra los resúmenes aprobados sin quién observó, sin citas, sin la nota, sin señales y sin nombres de dominios, tampoco en el HTML de la página.
- El aviso de privacidad sigue sin mencionar `sessions.observador`.

Versión 2 · 2026-11-02: revisión independiente. El eval aplica los criterios de perfil a cada nota (R-011.19), avisa si un resumen dice quién observó (R-011.20), y compara por oración (R-011.15). La frase anterior se busca primero en su dimensión (R-011.5) y entra a las citas que bloquean un resumen. Más tablas en el reporte (R-011.17). El aviso de "no elige" ya no sale en seguimiento ni en eventos viejos. El detalle de una cita pasa dentro de `figcaption`.

Versión 1 · 2026-11-02: primera versión.

Sin probar el 2 nov, porque este equipo no tiene `.env.local` ni la migración `0028` está aplicada: CA-011.8 (eval con el modelo), CA-011.9 (`rls-check`), CA-011.10 (navegador y teclado) y si el modelo marca de verdad las contradicciones. Pasan `typecheck`, `lint`, `build` con valores de relleno y `eval -- --offline` (CA-011.1 a CA-011.7, CA-011.11 y CA-011.12). El aviso de privacidad sigue sin mencionar `sessions.observador`.
