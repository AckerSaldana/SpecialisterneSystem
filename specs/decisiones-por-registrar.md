<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# Decisiones por registrar en CONTEXTO §9

Bloque para pegar en CONTEXTO §9. Sale del plan que Acker aprobó el 31 oct. D-059 a D-068 quedan reservados para las diez decisiones de 004, que todavía no están registradas.

| ID | Fecha | Quién | Decisión | Alternativa | Razón | Fuente | Estado |
|---|---|---|---|---|---|---|---|
| D-069 | 31 oct | Acker; falta que David y Rodrigo confirmen | "Cómo trabajar conmigo" lo aprueba la persona línea por línea, el coach no ve el borrador y el sistema nunca lo envía a la empresa. Cambia C-11. La empresa sigue sin recibir el diagnóstico | El coach revisa y confirma antes de compartir | La persona pasa a ser autora de cómo la gestionan | Spec 009 | Decidida por Acker, sin confirmar |
| D-070 | 31 oct | Acker; falta que David y Rodrigo confirmen | En la guía y en el desglose de tareas, la IA le escribe a la persona sin revisión previa del coach. Los filtros de código son obligatorios. Cambia C-04 | El coach aprueba cada salida antes de que la persona la vea | Una herramienta de uso diario no puede esperar a la siguiente sesión | Specs 009 y 010 | Decidida por Acker, sin confirmar |
| D-071 | 31 oct | Acker; falta que David y Rodrigo confirmen | "Me atoré" es texto literal de la persona, sin cita de nota, y nunca se guarda como señal aprobada. Cambia C-05 | Crear una señal normal | Las señales las aprueba el coach y citan sus notas | Spec 010 | Decidida por Acker, sin confirmar |
| D-072 | 31 oct | Acker | La lista única de lo que escribe la persona (002) suma guías, desgloses y sus eventos | Que todo pase por el coach | Es consecuencia de D-069 a D-071 | Specs 002, 009 y 010 | Decidida por Acker |
| D-073 | 31 oct | Acker | Se construyen completas la Trayectoria de función ejecutiva, "Cómo trabajar conmigo" y el Desglose de tareas, sobre "Tu plan" y los casos de Beta. Demo local, sin despliegue. Recursos, módulo corto y cierre quedan fuera de esta fase | Reducir las capacidades o dejarlas para "What's next" | Son los diferenciadores del demo. Claude advirtió riesgo de no terminar; hay puntos de corte por día | Specs 005, 007, 008, 009 y 010 | Decidida por Acker |

## Pendiente de Acker: decisión abierta 5 de la spec 010

Esta fila no es una decisión de Acker. Dice qué se construyó mientras falta su respuesta, para que no se lea como decidido.

| Tema | Fecha | Pregunta | Qué se construyó | Por qué | Qué cambia si Acker elige A | Estado |
|---|---|---|---|---|---|---|
| Plantillas y retiro del consentimiento | 1 nov | ¿Las plantillas son excepción a `app_has_consent` y se quedan tras un retiro? A) Sí, sin ligarlas al origen. B) Ligarlas al origen y ocultarlas con el retiro | Opción B: `task_templates.origen_engagement_id`, SELECT con `app_has_consent`, `plantilla_id` con `on delete set null`, la tabla en `TABLAS_BLOQUEO` y `TABLAS_PURGA`, y el aviso lo dice. Un retiro le quita la plantilla a toda la organización | La spec dice que sin el sí de Acker a la opción A se construye B. La instrucción de las etapas de construcción de la spec, tareas 1 a 27, fue construir B y que Acker decida después. B cumple el plan del 31 oct, Parte 5 y Verificación | Una migración nueva que quite la columna y esas condiciones, y regresar R-010.39, R-010.41, R-010.45, CA-010.39, CA-010.45, el diálogo de guardar plantilla y el aviso | Construida con B; falta la respuesta de Acker |

## Pendiente de Acker: lo que cambió la revisión de la spec 010

Estas filas tampoco son decisiones de Acker. Dicen qué quedó construido, y con la opción más estricta, mientras él no responde.

| Tema | Fecha | Pregunta | Qué se construyó | Por qué | Qué cambia si Acker decide otra cosa | Estado |
|---|---|---|---|---|---|---|
| Excepción de R-010.15 | 1 nov | ¿Qué palabras escritas por la persona se excusan en un paso? | Una lista cerrada de palabras con otro sentido en el trabajo: diagnóstico, espectro, cédula, paciente, nivel de apoyo, planeación, flexibilidad, monitoreo de tareas y organización de materiales. Una condición o una severidad nunca se excusa, ni la demás lista clínica | Escribir "TDAH" o "autismo severo" en la tarea desactivaba el filtro para esa palabra, y eso choca con C-01 | Agregar o quitar palabras de `EXCEPCION_LABORAL` en `lib/desglose/validate.ts`. Hoy "nivel 2" en soporte, "déficit" en presupuesto y "medicamento" en farmacia provocan reintento y quizá 502 | Construida; falta la respuesta de Acker |
| Otro nombre en una plantilla (R-010.40) | 1 nov | ¿El nombre de otra persona en la `tarea` de una plantilla debe bloquear? | No bloquea. El diálogo avisa de las palabras con mayúscula que no inician oración y que no dicen el puesto ni el título | El código no distingue "Luis" de "Jira", y bloquear obliga a reescribir toda herramienta | Bloquear con `palabrasConMayuscula` en `bloqueoDePlantilla` | Construida; falta la respuesta de Acker |
| Pares falsos en la comparación (R-010.43, decisión abierta 9) | 1 nov | ¿Quitar palabras vacías antes de comparar, o exigir el mismo primer verbo? | No se cambió. "Escribe el título del reporte" y "Borra el título del reporte" salen `ajustado`, cuando son otra acción. La pantalla muestra las dos versiones, así que el error está en la etiqueta | Es la decisión abierta 9, y esa no se reabre sin Acker | Cambiar `similitud` en `lib/desglose/diferencia.ts` y sumar esos pares a CA-010.43 | Sin construir; falta la respuesta de Acker |
