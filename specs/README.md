<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# Specs de Caja MEX

Cada etapa del acompañamiento se escribe aquí antes de programarla. El código se construye contra la spec, y la spec dice de dónde sale cada requisito: de CONTEXTO.md, de REGLAS.md o de una decisión del equipo.

Las fuentes viven en `00 Admin / Lectura` del Drive. Los IDs `F-0xx` son fuentes (CONTEXTO §10) y los `D-0xx` son decisiones (CONTEXTO §9). Si una spec necesita algo que no está en esos registros, lo marca como **interpretación del equipo** o **suposición** (REGLAS §5) y lo agrega a sus decisiones abiertas.

## Índice

| Spec | Etapa | Nivel | Estado |
|---|---|---|---|
| [000](000-constitucion.md) | Reglas que ninguna spec puede romper | Completa | Revisada por Acker |
| [001](001-evaluacion-inicial.md) | Evaluación inicial (ya construida) | As-built | Borrador |
| [002](002-alta-y-consentimiento.md) | Alta y consentimiento | Detallada con tareas | Revisada por Acker |
| [003](003-plan-de-acompanamiento.md) | Plan de acompañamiento | Detallada con tareas | Borrador |
| [004](004-seguimiento-y-senales.md) | Sesiones de seguimiento y señales | Requisitos | Borrador |
| [005](005-vista-persona-y-recursos.md) | Vista de la persona y recursos | Requisitos | Borrador |
| [006](006-cierre.md) | Cierre | Requisitos | Borrador |
| [007](007-evaluacion-y-sesgo.md) | Evaluación con casos sintéticos y prueba de sesgo | Requisitos | Borrador |
| [Preguntas](preguntas-partner.md) | Lo que solo Specialisterne puede responder | Lista | Borrador |

Orden de construcción (fechas de CONTEXTO §11; meta interna 5 nov, 8 pm): 002 → 003 → 004 → 005 → 007 → 006.

## Estados

1. **Borrador:** la escribió alguien del equipo o un LLM. No se programa nada todavía.
2. **Revisada por Acker:** Acker la leyó, la entiende y puede defenderla. Ya se puede programar si no afecta a los tres.
3. **Acordada por los tres:** obligatorio cuando la spec cambia producto, alcance, marca o algo que se presenta en el pitch (REGLAS §4).
4. **Implementada:** el código existe y cita los R-IDs.
5. **Verificada:** cada criterio de aceptación pasó con la prueba que la spec indica.

Una spec que cambia después de implementada sube de versión en su encabezado y anota qué cambió. Lo que se quita no se borra: se marca como retirado con la razón (REGLAS §3).

## Reglas de trabajo

- No se programa una etapa sin que su spec esté al menos en "revisada por Acker".
- Cada commit y PR dice qué R-IDs cubre, qué herramienta se usó y quién lo revisó (REGLAS §3).
- Si el código tiene que apartarse de la spec, primero se cambia la spec.
- Ninguna spec puede contradecir [000-constitucion.md](000-constitucion.md). Si hace falta, se cambia la constitución con una decisión registrada en CONTEXTO.md.
- El LLM no decide: en "Decisiones abiertas" propone opciones con pros y contras, y anota quién decide.

## Plantilla

```markdown
<!-- AI-assisted (herramienta) · revisión de Acker: pendiente -->

# NNN · Nombre de la etapa

- Estado: Borrador · Versión 1 · AAAA-MM-DD
- Fuentes: F-0xx, D-0xx, REGLAS §n, CONTEXTO §n
- Depende de: NNN

## Problema y para quién
Qué necesidad resuelve, de quién, con la fuente que lo respalda.

## Alcance
Lo que entra. **Fuera de alcance:** lo que no, y a dónde se va (otra spec o "What's next").

## Requisitos
| ID | Requisito | Fuente |
|---|---|---|
| R-NNN.1 | Cuando <situación>, el sistema debe <comportamiento>. | D-0xx |
| R-NNN.2 | ... | Interpretación del equipo |

## Criterios de aceptación
| ID | Dado / Cuando / Entonces | Cubre | Cómo se prueba |
|---|---|---|---|
| CA-NNN.1 | Dado ..., cuando ..., entonces ... | R-NNN.1 | prueba offline / eval / RLS / navegador |

## Datos
Cambios contra `lib/db/schema.ts`, políticas RLS y `drizzle/0002_permisos.sql`.

## Pantallas y textos
Texto literal que ve cada rol.

## Reglas fijas fuera del LLM
Lo que se valida con código, no con el prompt.

## Prompts
Archivo fechado en `prompts/`, si la etapa usa IA.

## Decisiones abiertas
| # | Pregunta | Opciones (pros y contras) | Propuesta | Decide |
|---|---|---|---|---|

## Tareas
(solo en specs detalladas) Pasos pequeños y ordenados, cada uno con sus R-IDs.

## Verificación
Cómo se comprueba que la etapa quedó lista.
```
