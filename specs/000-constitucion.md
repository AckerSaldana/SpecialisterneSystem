<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# 000 · Constitución

- Estado: Revisada por Acker · Versión 1 · 2026-10-29
- Fuentes: REGLAS.md v4, CONTEXTO.md v3 (§4–§7, §9, §10), handoff del 29 oct
- Aplica a: todas las specs de esta carpeta

Estas reglas no se negocian dentro de una spec. Si una etapa necesita romper una, primero se cambia esta constitución con una decisión registrada en CONTEXTO.md (REGLAS §4).

Varias decisiones de CONTEXTO que aquí se citan siguen en estado **propuesta** (D-015 a D-022). Mientras los tres no las aprueben, esta constitución las toma como regla de trabajo, porque REGLAS §6 ya dice lo mismo o algo más estricto.

Las decisiones D-029 a D-035 vienen del bloque "Actualización para CONTEXTO.md" del 29 oct y todavía no están registradas en CONTEXTO. D-029 (dirección) y D-030 (stack) están **decididas por los tres, según Acker**. D-031 a D-035 son **propuestas** de Claude; decide Acker.

"Handoff del 29 oct" es el documento "Caja MEX · Handoff para Claude Code" que Acker pegó al inicio de la sesión del 29 oct. Se propone registrarlo como F-030 en CONTEXTO §10.

## Principios

| ID | Regla | Fuente | Cómo se cumple hoy |
|---|---|---|---|
| C-01 | El sistema no diagnostica. No infiere, guarda ni muestra diagnóstico, tipo, nivel, grado o severidad de ninguna condición. | D-015, D-021, REGLAS §6 | `lib/profile/schema.ts` no tiene esos campos y los objetos son estrictos; `lib/profile/validate.ts` marca los términos. |
| C-02 | El documento médico nunca entra a la app: no se sube, no se copia, no se procesa con IA y no se guarda. Solo se registra que el diagnóstico fue verificado, quién lo verificó, cuándo y la cédula del profesional. | REGLAS §6, D-020, D-022 | `engagements` solo tiene `diagnostico_verificado`, `cedula_profesional`, `diagnostico_verificado_por`, `diagnostico_verificado_en`. No hay Storage ni campo de archivo. |
| C-03 | El diagnóstico verificado no mueve las recomendaciones. Todo sale del perfil observado. | D-021 | Ningún prompt recibe datos de la verificación. |
| C-04 | La IA estructura y propone; el coach decide. Nada se aplica al perfil, al plan o a las recomendaciones sin aprobación explícita del coach. | D-015, handoff 29 oct | Toda salida del modelo se guarda como evento `proposed`; solo la ruta de decisión crea snapshots. |
| C-05 | Cada campo que propone la IA lleva evidencia citada literal de la nota. Una cita que no está en la nota se descarta con código, fuera del LLM. | D-015, D-034 (propuesta) | `sanitizeUpdate` en `lib/profile/validate.ts`. |
| C-06 | El modelo solo puede recomendar fichas y recursos que existen en nuestras tablas, citando su ID. Nunca links ni recursos inventados. | D-015 | Pendiente: se aplica en 003 y 005. |
| C-07 | Solo datos sintéticos. Ningún nombre, correo, nota o perfil de una persona real, ni datos del partner sin anonimizar. | REGLAS §6, D-003, D-010 | Seed y casos de eval sintéticos; cuentas con dominio `.test`. |
| C-08 | Lenguaje del producto: "persona", "participante" o "coachee", nunca "paciente". "Fortalezas" y "áreas de apoyo", nunca "debilidades" ni "déficit". Nunca el nombre "Business Profile". | REGLAS §2.5 y §6, D-017 | Tipos `fortaleza / area_de_apoyo / contexto`; banderas en `validate.ts`. |
| C-09 | La persona nunca ve las notas del coach, las citas, las señales de riesgo ni los nombres de funciones ejecutivas. | Interpretación del equipo a partir de CONTEXTO §6 ("el partner define qué partes ve") | Tabla `app.persona_profiles` sin citas ni señales; RLS no deja a la persona leer `sessions`, `profile_events` de IA ni `profile_snapshots`. Dos huecos conocidos, sin salida hoy porque ninguna pantalla de la persona los lee: las políticas `plans_select_persona_approved` y `plan_items_select_persona_approved` dejan leer `plan_items.evidencia` (lo cierra 003 con `persona_plans`), y la persona puede leer `cedula_profesional` en su fila de `engagements` (lo cierra 002, R-002.40). |
| C-10 | Sin consentimiento registrado no se guarda ninguna nota ni se envía nada al modelo. | D-035 (propuesta); F-026 (salud como dato sensible, fuente secundaria) | Política `sessions_insert_coach` con `private.app_has_consent`; la ruta responde 409. |
| C-11 | Nada sale a la empresa empleadora sin aprobación del coach. La empresa nunca recibe el diagnóstico ni su verificación. | D-015; la segunda parte es interpretación del equipo a partir de REGLAS §6 | Hoy no existe ninguna salida hacia la empresa. |
| C-12 | Las alertas fuertes pasan a una persona del equipo de Specialisterne; el sistema no actúa solo. | D-015 | Pendiente: se define en 004. |
| C-13 | Ser callada, reservada o poco expresiva no es un riesgo ni un área de apoyo. El resultado no puede cambiar por el género ni el nombre. | F-005 (13:12), D-016 | Regla en el prompt; prueba con pares de casos en 007. |
| C-14 | Diseño accesible: lenguaje literal, sin temporizadores ni notificaciones sorpresa, confirmación antes de acciones irreversibles, ayuda humana en cada pantalla, modos Calma, Estándar y Alto contraste, y movimiento en cero cuando se pide. | Handoff 29 oct; W3C COGA y demás fuentes de diseño **pendientes de verificar** | `app/globals.css`, `lib/preferences.ts`, `SiteFooter`, Dialog de confirmación. |
| C-15 | No se entrena un modelo propio. Se usa un LLM por API con salida estructurada y reglas fijas fuera del modelo. | D-015 | `lib/ai/*`. |
| C-16 | Los datos solo se leen y escriben desde el servidor, con RLS activa y permisos por columna. La Data API de Supabase no expone las tablas. | D-032 (propuesta) | Esquema `app`, `withRls`, `drizzle/0002_permisos.sql`. |
| C-17 | Toda llamada al modelo queda auditada con modelo, versión del prompt, tokens y latencia. Ningún log guarda datos personales. | Handoff 29 oct (audit_log) | `app.audit_log`, `lib/log.ts`. |
| C-18 | Cada prompt del producto está versionado con fecha en `prompts/`, y cada evento guarda la versión que lo produjo. | REGLAS §3 | `prompts/2026-10-29_profile-update.md`, `profile_events.prompt_version`. |
| C-19 | Cada archivo hecho con IA lleva su línea de atribución, y alguien del equipo puede explicarlo. El código no es 100 % generado por IA. | REGLAS §3, F-001 | Encabezado en cada archivo; revisión de Acker pendiente. |

## Cómo se usa

- Cada spec lista en "Fuentes" las reglas C-xx que toca.
- Un revisor de spec rechaza cualquier requisito que contradiga una regla de esta tabla.
- Si una regla cambia, se anota aquí la versión nueva y la decisión de CONTEXTO que la cambió.
