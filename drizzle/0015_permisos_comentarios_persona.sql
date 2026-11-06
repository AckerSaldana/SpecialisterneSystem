-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
--
-- Spec 005 (cierre de "Esto no me representa", R-005.26, R-005.34): permiso por columna de lo que
-- resuelve un comentario. RLS (profile_events_update_coach) decide qué filas. Los grants no
-- distinguen entre coach y persona, pero la persona no tiene política de UPDATE en profile_events,
-- así que este grant no le da nada (CA-005.38). Esto solo habla de UPDATE: el INSERT de la persona lo
-- limita profile_events_insert_persona_feedback, que cubre estas columnas desde drizzle/0016 (R-005.50).

grant update (resuelto_por_evento, resuelto_por_plan) on app.profile_events to authenticated;
