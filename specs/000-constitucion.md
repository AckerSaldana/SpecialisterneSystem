<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# 000 · Constitución

- Estado: Revisada por Acker · Versión 2 · 2026-10-31 (ver "Cambios"; falta que David y Rodrigo confirmen la versión 2)
- Fuentes: REGLAS.md v4, CONTEXTO.md v3 (§4–§7, §9, §10), handoff del 29 oct, D-069 a D-072
- Aplica a: todas las specs de esta carpeta

Estas reglas no se negocian dentro de una spec. Si una etapa necesita romper una, primero se cambia esta constitución con una decisión registrada en CONTEXTO.md (REGLAS §4).

Varias decisiones de CONTEXTO que aquí se citan siguen en estado **propuesta** (D-015 a D-022). Mientras los tres no las aprueben, esta constitución las toma como regla de trabajo, porque REGLAS §6 ya dice lo mismo o algo más estricto.

Las decisiones D-030 a D-035 y D-058 están registradas en CONTEXTO §9 desde la versión 5. D-058 (dirección) y D-030 (stack) están **decididas por los tres, según Acker**; falta que David y Rodrigo lo confirmen en CONTEXTO §9. D-031 a D-035 son **propuestas** de Claude; decide Acker.

"Handoff del 29 oct" es el documento "Caja MEX · Handoff para Claude Code" que Acker pegó al inicio de la sesión del 29 oct. Está registrado como F-030 en CONTEXTO §10.

## Principios

| ID | Regla | Fuente | Cómo se cumple hoy |
|---|---|---|---|
| C-01 | El sistema no diagnostica. No infiere, guarda ni muestra diagnóstico, tipo, nivel, grado o severidad de ninguna condición. | D-015, D-021, REGLAS §6 | `lib/profile/schema.ts` no tiene esos campos y los objetos son estrictos; `lib/profile/validate.ts` marca los términos. |
| C-02 | El documento médico nunca entra a la app: no se sube, no se copia, no se procesa con IA y no se guarda. Solo se registra que el diagnóstico fue verificado, quién lo verificó, cuándo y la cédula del profesional. | REGLAS §6, D-020, D-022 | `engagements` solo tiene `diagnostico_verificado`, `cedula_profesional`, `diagnostico_verificado_por`, `diagnostico_verificado_en`. No hay Storage ni campo de archivo. |
| C-03 | El diagnóstico verificado no mueve las recomendaciones. Todo sale del perfil observado. | D-021 | Ningún prompt recibe datos de la verificación. |
| C-04 | La IA estructura y propone; el coach decide. Nada se aplica al perfil, al plan o a las recomendaciones sin aprobación explícita del coach. Excepción: en "Cómo trabajar conmigo" (009) y en el desglose de tareas (010), la IA le escribe a la persona sin revisión previa del coach y decide la persona. Los filtros de código de esas salidas son obligatorios y nada de lo que ahí se decide cambia el perfil ni el plan. | D-015, handoff 29 oct, D-070 | Toda salida del modelo se guarda como evento `proposed`; solo la ruta de decisión crea snapshots. Plan, seguimiento y resúmenes siguen la misma regla. Excepción: los filtros de `lib/guia/validate.ts` y `lib/desglose/validate.ts` corren antes de que la persona lea, y nada de esas rutas escribe perfil ni plan. |
| C-05 | Cada campo que propone la IA lleva evidencia citada literal de la nota. Una cita que no está en la nota se descarta con código, fuera del LLM. "Me atoré" (010) es texto literal de la persona: no lleva cita de nota, no lo escribe la IA y nunca se guarda como señal aprobada. | D-015, D-034 (propuesta), D-071 | `sanitizeUpdate` en `lib/profile/validate.ts`. "Me atoré": `app.task_step_events.texto`, lo escribe la persona y nada lo convierte en evidencia ni en señal (R-010.28, R-010.33). |
| C-06 | El modelo solo puede recomendar fichas y recursos que existen en nuestras tablas, citando su ID. Nunca links ni recursos inventados. | D-015 | `lib/plan/validate.ts` y `lib/followup/validate.ts` descartan lo que cita una ficha fuera de la lista que recibió el modelo, que solo trae las verificadas. 009 y 010 descartan enlaces (R-009.11, R-010.17). Los recursos de 005 están fuera de esta fase. |
| C-07 | Solo datos sintéticos. Ningún nombre, correo, nota o perfil de una persona real, ni datos del partner sin anonimizar. | REGLAS §6, D-003, D-010 | Seed y casos de eval sintéticos; cuentas con dominio `.test`. |
| C-08 | Lenguaje del producto: "persona", "participante" o "coachee", nunca "paciente". "Fortalezas" y "áreas de apoyo", nunca "debilidades" ni "déficit". Nunca el nombre "Business Profile". | REGLAS §2.5 y §6, D-017 | Tipos `fortaleza / area_de_apoyo / contexto`; banderas en `validate.ts`. |
| C-09 | La persona nunca ve las notas del coach, las citas, las señales de riesgo ni los nombres de funciones ejecutivas. | Interpretación del equipo a partir de CONTEXTO §6 ("el partner define qué partes ve") | Tablas `app.persona_profiles` y `app.persona_plans` sin citas ni señales; RLS no deja a la persona leer `sessions`, `profile_events` de IA, `profile_snapshots`, `plans`, `plan_items` ni `engagements` (`drizzle/0005` y `drizzle/0009` quitaron esas políticas; lee su acompañamiento con `private.app_mi_acompanamiento()`). 009 y 010 guardan el origen solo con IDs. El eval revisa que el JavaScript de sus pantallas no traiga `lib/profile/schema`. |
| C-10 | Sin consentimiento registrado no se guarda ninguna nota ni se envía nada al modelo. | D-035 (propuesta); F-026 (salud como dato sensible, fuente secundaria) | Política `sessions_insert_coach` con `private.app_has_consent`; la ruta responde 409. |
| C-11 | Nada sale a la empresa empleadora sin aprobación del coach. Excepción: "Cómo trabajar conmigo" (009) lo aprueba la persona línea por línea, el coach no ve el borrador y el sistema nunca lo envía; lo comparte la persona. La empresa nunca recibe el diagnóstico ni su verificación, sin excepción. | D-015, D-069; la última parte es interpretación del equipo a partir de REGLAS §6 | Hoy no existe ninguna salida hacia la empresa. Excepción: la hoja de 009 la aprueba, la imprime y la comparte la persona; el sistema no envía nada. |
| C-12 | Las alertas fuertes pasan a una persona del equipo de Specialisterne; el sistema no actúa solo. | D-015 | 004: el coach marca la alerta en `app.strong_alerts` y la pasa a una persona del equipo fuera del sistema. El sistema no le avisa a nadie (R-004.15, R-004.16). |
| C-13 | Ser callada, reservada o poco expresiva no es un riesgo ni un área de apoyo. El resultado no puede cambiar por el género ni el nombre. | F-005 (13:12), D-016 | Regla en el prompt; prueba con pares de casos en 007. |
| C-14 | Diseño accesible: lenguaje literal, sin temporizadores ni notificaciones sorpresa, confirmación antes de acciones irreversibles, ayuda humana en cada pantalla, modos Calma, Estándar y Alto contraste, y movimiento en cero cuando se pide. | Handoff 29 oct; W3C COGA y demás fuentes de diseño **pendientes de verificar** | `app/globals.css`, `lib/preferences.ts`, `SiteFooter`, Dialog de confirmación. |
| C-15 | No se entrena un modelo propio. Se usa un LLM por API con salida estructurada y reglas fijas fuera del modelo. | D-015 | `lib/ai/*`. |
| C-16 | Los datos solo se leen y escriben desde el servidor, con RLS activa y permisos por columna. La Data API de Supabase no expone las tablas. | D-032 (propuesta) | Esquema `app`, `withRls`, `drizzle/0002_permisos.sql`. |
| C-17 | Toda llamada al modelo queda auditada con modelo, versión del prompt, tokens y latencia. Ningún log guarda datos personales. | Handoff 29 oct (audit_log) | `app.audit_log`, `lib/log.ts`. |
| C-18 | Cada prompt del producto está versionado con fecha en `prompts/`, y cada evento guarda la versión que lo produjo. | REGLAS §3 | Archivos fechados en `prompts/`, y las versiones vigentes en las constantes `PROMPT_VERSION*` de `lib/prompts.ts`. Cada evento guarda la suya, como `profile_events.prompt_version`. |
| C-19 | Cada archivo hecho con IA lleva su línea de atribución, y alguien del equipo puede explicarlo. El código no es 100 % generado por IA. | REGLAS §3, F-001 | Encabezado en cada archivo; revisión de Acker pendiente. |

## Cómo se usa

- Cada spec lista en "Fuentes" las reglas C-xx que toca.
- Un revisor de spec rechaza cualquier requisito que contradiga una regla de esta tabla.
- Si una regla cambia, se anota aquí la versión nueva y la decisión de CONTEXTO que la cambió.

## Cambios

| Versión | Fecha | Reglas | Decisión | Quién |
|---|---|---|---|---|
| 2 | 2026-10-31 | C-11: excepción para "Cómo trabajar conmigo". C-04: excepción para esa guía y para el desglose de tareas. C-05: "me atoré" no es evidencia ni señal. La lista de lo que escribe la persona (002) suma guías, desgloses y sus eventos. C-09 no cambia. | D-069 a D-072 | Acker. Falta que David y Rodrigo lo confirmen, porque las fuentes de C-04, C-05 y C-11 son decisiones de los tres |

El 1 nov se actualizó la columna "Cómo se cumple hoy" de C-04, C-05, C-06, C-09, C-11, C-12 y C-18, que describía un estado viejo. Ninguna regla cambia, así que la versión sigue en 2.

Los números D-069 a D-073 y D-084 a D-090 están por registrar en CONTEXTO §9: el bloque está en [decisiones-por-registrar.md](decisiones-por-registrar.md). D-074 a D-083 quedan reservados para las decisiones de 004, que tampoco se han registrado. Antes eran D-059 a D-068; cambiaron el 2 nov porque CONTEXTO v6 ya usa D-059 a D-062.
