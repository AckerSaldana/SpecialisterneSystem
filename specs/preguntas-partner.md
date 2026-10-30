<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# Preguntas para Specialisterne

- Estado: Borrador · Versión 1 · 2026-10-29
- Fuentes: secciones "Preguntas para el partner" y "Decisiones abiertas" de las specs 001 a 007 (versión 2, consolidadas el 29 oct); CONTEXTO §7 (sesión de validación del 2 al 4 de nov), §8 (citas candidatas), §11 (pendientes y preguntas para el partner)
- Depende de: 001, 002, 003, 004, 005, 006, 007

Esta lista junta en un solo lugar lo que solo Specialisterne puede responder. Cada pregunta dice qué requisito (R-ID) o decisión abierta de qué spec queda bloqueada hasta tener la respuesta. Mientras no contesten, cada spec sigue con la propuesta que ya tiene escrita.

## Cómo leer las tablas

- Pregunta: el texto corto en español, tal como se le haría al partner.
- Desbloquea: spec y R-ID, o número de decisión abierta ("dec. n"), que cambia con la respuesta.
- Sale de: las specs que hicieron la pregunta. Cuando dos specs preguntaban lo mismo, queda una sola fila.
- §11: "Sí" si la pregunta ya estaba en CONTEXTO §11, "Preguntas para el partner".
- Sesión: "Sí" si conviene llevarla a la sesión de 15 a 20 minutos del 2 al 4 de nov (CONTEXTO §7), porque se contesta mejor viendo perfiles o pantallas. Las demás van en el mensaje escrito al partner (pendiente de CONTEXTO §11, "Mandar al partner el agradecimiento y las preguntas", responsable por definir). Si alguna de la sesión se puede contestar antes por escrito, mejor.

Dentro de cada tema, las preguntas van en el orden en que se construyen las specs (README: 002 → 003 → 004 → 005 → 007 → 006).

## Primero

Estas bloquean lo que se construye antes, 002 y 003, o tienen fecha cercana. Conviene mandarlas en el primer mensaje: P-01 a P-08 (alta, 002), P-09 y P-10 (perfil, porque tocan los ajustes razonables del plan y los casos del 31 oct), P-12 a P-20 (plan, 003), P-42 (retención, que el aviso de 002 tiene que decir) y P-45 (pedir la sesión).

## Alta y diagnóstico

| ID | Pregunta | Desbloquea | Sale de | §11 | Sesión |
|---|---|---|---|---|---|
| P-01 | ¿En Workplace Support también piden el diagnóstico? | 002 R-002.12, R-002.13, R-002.37, dec. c; parte de la dec. h (D-020 en Workplace Support) | 002 | Sí | No |
| P-02 | ¿Cómo registran hoy el consentimiento de la persona y con qué texto? ¿Lo firma, lo acepta por correo o de palabra? | 002 R-002.20 a R-002.23, dec. d | 002 | No | No |
| P-03 | Frente a la persona, ¿quién es el responsable de sus datos: Specialisterne, la empresa que contrata el servicio o los dos? | 002 R-002.20 (qué dice el aviso), dec. d | 002 | No | No |
| P-04 | Si una persona retira su consentimiento, ¿qué hacen hoy con las notas del coach y con el perfil que firmaron juntos? | 002 dec. b, R-002.30, R-002.44; y los bloqueos que heredan de esa regla: 003 R-003.53, 004 R-004.48 y dec. 11, 005 R-005.36, 006 R-006.15 | 002 | No | No |
| P-05 | ¿Cómo prefieren darle el acceso a la persona: en persona, por teléfono o por correo? | 002 dec. a, R-002.14 | 002 | No | No |
| P-06 | ¿Quién verifica hoy el diagnóstico y la cédula: el coach que lleva el caso u otra persona del equipo? ¿Guardan el documento en algún lado o lo devuelven? | 002 R-002.10 (quién puede registrar la verificación), R-002.6 | 002 | No | No |
| P-07 | ¿El documento de diagnóstico dice el tipo o el nivel? | 002 R-002.7 (texto de las casillas de revisión). No cambia lo que se guarda: el sistema no registra tipo ni nivel (C-01) | 002 | Sí | No |
| P-08 | ¿Le sirve a la persona ver en su pantalla que su diagnóstico ya fue verificado, o prefieren que solo lo vea el coach? | 002 R-002.11, R-002.40, dec. e | 002 | No | No |

## Perfil

| ID | Pregunta | Desbloquea | Sale de | §11 | Sesión |
|---|---|---|---|---|---|
| P-09 | ¿Cuál es el título de la sección 3 del perfil y qué lleva la parte de ajustes razonables? | 001 (título provisional "Motivación y aprendizaje" en `lib/profile/schema.ts`, R-001.23); 003 R-003.49 y dec. 10 | 001 | Sí | No |
| P-10 | ¿Tienen un perfil en blanco o inventado que nos puedan compartir? | 007 R-007.9 y R-007.58 (casos y caso de demo con la forma de sus perfiles); 005 (forma de la vista); también puede contestar P-09 | 005, 007 | Sí | No |
| P-11 | En la primera evaluación de Workplace Support, ¿el coach escribe una sola nota o varias antes de armar el perfil? | 001 dec. 5; 007 R-007.58 (caso de demo) | 001 | No | No |

## Plan

| ID | Pregunta | Desbloquea | Sale de | §11 | Sesión |
|---|---|---|---|---|---|
| P-12 | ¿El plan que arman hoy tiene objetivos, apoyos, cómo darle instrucciones y qué comunicar al líder, o tiene otras partes? | 003 R-003.8 (tipos de ítem), R-003.9 | 003 | No | No |
| P-13 | ¿Los objetivos del equipo y los ajustes razonables van en el plan o en otro documento? ¿La persona ve los ajustes que se acordaron? | 003 dec. 10 (`objetivo_equipo` y `ajuste_razonable` en `plan_item_type`), R-003.49; dec. 4, opción (c) | 003 | No | No |
| P-14 | ¿La persona ve su plan? Si sí, ¿qué partes? | 003 dec. 4, R-003.11, R-003.37; 005 R-005.6 | 003 | Amplía la de §11 sobre el perfil | No |
| P-15 | ¿Tienen estrategias o ajustes que ya usen y que podamos convertir en fichas, con su permiso? ¿Alguien de su equipo podría revisarlas? | 003 dec. 1, R-003.5, R-003.42; 004 R-004.24; 005 R-005.16 | 003 | No | No |
| P-16 | ¿Qué palabras evitan en los textos que ve la persona y en lo que se habla con el líder? Por ejemplo, ¿nombran la condición o las funciones ejecutivas? | 003 dec. 9, R-003.17, R-003.47; 005 R-005.18; 006 R-006.13 | 003 | No | No |
| P-17 | Lo que se le comunica al líder, ¿lo revisa antes la persona? ¿Le llega en el reporte a la empresa o en la sesión de 30 minutos con la red de apoyo? | 003 R-003.40, R-003.18; 006 R-006.9 | 003 | No | No |
| P-18 | En Workplace Support, ¿quién pone los objetivos: la persona, el líder o el coach? | 003 R-003.9, R-003.29 | 003 | No | No |
| P-19 | ¿Cada cuánto revisan el plan: en fechas fijas o cuando algo cambia en la persona o en el trabajo? | 003 dec. 3, R-003.36 | 003 | No | No |
| P-20 | El perfil lo revisan con la persona y lo firman los dos. ¿Con el plan hacen lo mismo? | 003 R-003.28 (aprobación del plan); 005 dec. 5 | 003 | No | No |

## Seguimiento y alertas

| ID | Pregunta | Desbloquea | Sale de | §11 | Sesión |
|---|---|---|---|---|---|
| P-21 | ¿Qué consideran una alerta fuerte en el seguimiento, quién del equipo la atiende hoy y por qué canal se la pasa el coach? | 004 dec. 1 y 2, R-004.15, R-004.16, R-004.42, texto "{responsable}" del diálogo; 002 R-002.42 (el aviso dice cómo se escalan) | 004 | No | No |
| P-22 | ¿Tienen un protocolo para riesgo inmediato? Necesitamos el texto exacto que mostramos junto al botón de alerta. | 004 R-004.19 | 004 | No | No |
| P-23 | En Workplace Support, ¿cuánto dura el acompañamiento? ¿También es una hora por semana con la persona y 30 minutos cada dos semanas con la red de apoyo? | 004 R-004.4, dec. 10 (lectura de D-058); 006 (duración y cierre); 007 R-007.58 (caso de demo de Workplace Support) | 004, 006 | No | No |
| P-24 | En la sesión de 30 minutos con la red de apoyo, ¿qué anotan? ¿El líder y el mentor saben que se registra? | 004 R-004.1, R-004.5, R-004.49 | 004 | No | No |
| P-25 | Los detalles personales que anotan para la siguiente sesión, ¿la persona sabe que se anotan? ¿Los guardan junto con el resto de las notas? | 004 dec. 7, R-004.20, R-004.21 | 004 | No | No |
| P-26 | ¿Cómo notan hoy que una persona quiere renunciar o que el puesto ya no le acomoda, y con cuánto tiempo de anticipación? | 004 R-004.11 (señales `intencion_de_renunciar` y `desajuste_con_rol`), R-004.14; 007 R-007.57 (casos de seguimiento) | 004 | No | No |
| P-27 | Si pasan semanas sin sesión, ¿a partir de cuánto tiempo le serviría al coach un aviso? | 004 dec. 8, R-004.22. La pregunta sale de la decisión abierta, no de la lista de 004 | 004 | No | No |

## Vista de la persona

| ID | Pregunta | Desbloquea | Sale de | §11 | Sesión |
|---|---|---|---|---|---|
| P-28 | ¿Qué partes del perfil debería ver la persona? ¿Hay dimensiones que no deba ver, por ejemplo los indicadores de estrés? | 005 R-005.4, dec. 3 | 001, 005 | Sí | Sí |
| P-29 | Cuando revisan el perfil con la persona, ¿se lo leen en tercera persona o se lo explican en segunda? | 005 dec. 1; 001 dec. 2 (H-4) | 001, 005 | No | Sí |
| P-30 | Cuando la persona dice que algo de su perfil o de su plan no la representa, ¿cómo lo revisan hoy y cuándo lo dan por resuelto? | 005 R-005.26, R-005.28, R-005.34, dec. 13; 001 H-2 y H-10; 006 R-006.8 | 001, 005 | No | No |
| P-31 | ¿La firma del perfil es solo en el documento o les serviría que la persona confirme en el sistema? | 005 dec. 5 y dec. 2 | 005 | No | No |
| P-32 | ¿La persona debería ver el avance de sus objetivos? | 005 dec. 8; 004 (alcance: lo que ve la persona de su avance pasa a 005) | 004 | No | No |
| P-33 | ¿Les sirve que la persona marque lo que ya revisó, o prefieren hablarlo en la sesión? | 005 dec. 8 | 005 | No | No |
| P-34 | ¿Qué recursos o cursos recomiendan hoy, quién los revisa y en qué idioma están? | 005 dec. 12, R-005.8 (`verificada` e `idioma = 'es'`), R-005.13 | 005 | No | No |
| P-35 | ¿Les sirve un módulo corto escrito para la persona, o prefieren que el coach explique el material en la sesión? | 005 R-005.15 a R-005.20, dec. 6 y 7 | 005 | No | No |

## Cierre y reportes

| ID | Pregunta | Desbloquea | Sale de | §11 | Sesión |
|---|---|---|---|---|---|
| P-36 | ¿Cómo cierran hoy un acompañamiento de inclusión al terminar los 6 meses? ¿Hay sesión o documento de cierre? | 006 R-006.1, R-006.3, dec. 1 | 006 | No | No |
| P-37 | ¿Un acompañamiento puede terminar antes, por ejemplo si la persona deja el trabajo o decide no seguir? ¿Cómo lo cierran en ese caso? | 006 R-006.1 (hoy el cierre solo se inicia desde `seguimiento`); 003 R-003.60 | 006 | No | No |
| P-38 | ¿Qué llevan los reportes a la empresa, cada cuánto se mandan, quién los aprueba y quién los recibe? ¿En Workplace Support también se reporta? | 006 dec. 4, R-006.9; 004 (alcance: reportes) | 004, 006 | No | No |
| P-39 | ¿La persona ve esos reportes antes de que salgan? | 006 dec. 5 | 006 | No | No |
| P-40 | ¿El cierre incluye a la red de apoyo (líder y mentor)? | 006 (alcance) | 006 | No | No |
| P-41 | ¿La persona se queda con algo al terminar, como su perfil o sus apoyos? | 006 R-006.14, dec. 3 | 006 | No | No |
| P-42 | ¿Qué información guardan después de cerrar y por cuánto tiempo? ¿Tienen aviso de privacidad o política de retención que debamos seguir? | 002 R-002.42 (retención en el aviso) y dec. d; 006 dec. 3, R-006.12 | 006 | No | No |
| P-43 | ¿Un acompañamiento cerrado se puede reabrir? ¿La misma persona puede empezar uno nuevo? | 006 (alcance); 002 R-002.4 (un acompañamiento por persona) | 006 | No | No |
| P-44 | ¿Sus financiadores les piden indicadores al cerrar? ¿Cuáles? | 006 (alcance: métricas de impacto en "What's next"). F-005 menciona al BID antes y a una fundación en EUA | 006 | No | No |

## Evaluación y pitch

| ID | Pregunta | Desbloquea | Sale de | §11 | Sesión |
|---|---|---|---|---|---|
| P-45 | ¿Nos darían 15 a 20 minutos entre el 2 y el 4 de nov para revisar 2 o 3 perfiles sintéticos? ¿Quién de su equipo podría revisarlos? | 007 R-007.37, R-007.11 | 007 | Sí | No |
| P-46 | ¿Las notas sintéticas se parecen en estilo a las que escriben sus coaches? Podemos mandarlas antes de la sesión. | 007 R-007.9, R-007.2 (estado `revisado_partner`) | 007 | No | Sí |
| P-47 | Para ustedes, ¿qué quiere decir que un perfil "se parece a lo que haríamos"? ¿Revisan por dimensión, por sección o el perfil completo? | 007 R-007.36, R-007.37 (hoja de concordancia) | 007 | No | Sí |
| P-48 | Además de qué tan callada o expresiva es la persona y su género, ¿han visto otros rasgos por los que los líderes o los procesos juzgan mal a alguien y que debamos probar? | 007 R-007.12 (ejes de variantes), dec. 7 | 007 | No | Sí |
| P-49 | ¿Sus coaches llegan a escribir en las notas el diagnóstico o un nivel? Nos sirve para armar el caso de contención, sin datos de nadie. | 007 R-007.23, dec. 10 | 007 | No | No |
| P-50 | ¿Algún coach suyo podría consolidar un perfil sintético a mano y otro con la herramienta, para medir el tiempo? | 007 R-007.38 | 007 | No | Sí |
| P-51 | ¿Algún coach suyo podría escribir notas de observador sobre una misma escena sintética? | 007 dec. 9, R-007.35. La pregunta sale de la decisión abierta, no de la lista de 007 | 007 | No | No |
| P-52 | ¿Alguna persona participante querría probar la vista persona con un perfil inventado, sin dar datos suyos? Si sí, ¿podrían preguntarle antes y después qué apoyos puede nombrar, y con qué consentimiento lo harían? | 007 R-007.39; 005 dec. 9 | 005, 007 | No | No |
| P-53 | ¿Podemos decir en el pitch que Specialisterne revisó los casos? ¿Con qué palabras? | 007 R-007.44, R-007.2 | 007 | No | No |
| P-54 | ¿Podemos usar en el pitch algunas frases suyas de la reunión del 27 oct, atribuidas a "Specialisterne LATAM"? Les mandamos la lista. | 007 R-007.40; CONTEXTO §8 (citas candidatas) | CONTEXTO §11 | Sí | No |

## Duplicados que se juntaron

- Qué partes del perfil ve la persona: 001 y 005 (P-28).
- Tercera o segunda persona: 001 y 005 (P-29).
- Cómo se resuelve "esto no me representa": 001 y 005 (P-30).
- Perfil en blanco o inventado: 005 y 007 (P-10).
- Duración y frecuencia de Workplace Support: 004 y 006 (P-23).
- Contenido y frecuencia de los reportes, y si Workplace Support reporta: 004 y 006 (P-38).
- Persona que prueba la vista y métrica del lado persona: 005 y 007 (P-52).

## Al recibir respuestas

Propuesta (Claude), decide Acker: la respuesta se registra como fuente en CONTEXTO §10 y cada spec actualiza el requisito o la decisión que aparece en "Desbloquea", con versión nueva. Las notas con lo que dijo el partner van al Drive, en `01 Partner Specialisterne / Notas de reuniones`, y no al repo, como ya pide R-007.40 para la sesión; las citas solo se usan con permiso (P-54).
