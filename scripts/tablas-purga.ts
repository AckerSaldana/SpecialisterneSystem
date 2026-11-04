// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Tablas con datos de un acompañamiento, en orden de borrado. Las usan scripts/purge-retirados.ts
// y scripts/seed-demo.ts (R-007.70). Vive aparte porque purge-retirados corre main al importarse.
//
// Orden de borrado según las llaves foráneas de lib/db/schema.ts:
// recommendations → plan_items → plans; persona_profiles → profile_snapshots → profile_events → sessions.
// 003 a 006 agregan aquí las tablas de su lista de bloqueo (R-002.44), respetando sus llaves.
// Todas tienen columna engagement_id, salvo las de COLUMNA_ACOMPANAMIENTO. engagements y consent_events no se tocan nunca.
// Orden por llaves foráneas: lo que apunta a otra tabla se borra antes. persona_plans y
// plan_items van antes que plans, y plans antes que profile_snapshots (plans.profile_snapshot_id).
// Spec 004: sus cuatro tablas apuntan a plan_items, sessions y profile_events, así que van primero.
// Spec 008 (R-008.42): fe_corrections apunta a profile_events; las dos van al inicio.
// Spec 009 (R-009.58): shared_guides apunta a profile_snapshots, y a sí misma con guia_base_id: un solo
// DELETE borra las de un acompañamiento y la llave se revisa al final de la sentencia.
// Spec 010 (R-010.52): task_step_events apunta a task_breakdowns, y task_breakdowns a task_templates, a
// profile_snapshots y a sí misma con origen_breakdown_id. Borrar una plantilla deja plantilla_id nulo en los
// desgloses de otros acompañamientos (on delete set null), que no se borran.
export const TABLAS_PURGA = [
  "task_step_events",
  "task_breakdowns",
  "task_templates",
  "shared_guides",
  "fe_corrections",
  "fe_domain_summaries",
  "plan_item_updates",
  "followup_context",
  "signal_states",
  "strong_alerts",
  "recommendations",
  "persona_plans",
  "plan_items",
  "plans",
  "persona_profiles",
  "profile_snapshots",
  "profile_events",
  "sessions",
] as const;

// Spec 010, decisión abierta 5, opción B: task_templates no es de un acompañamiento, se liga a su origen.
export const COLUMNA_ACOMPANAMIENTO: Readonly<Record<string, string>> = { task_templates: "origen_engagement_id" };

// La columna con la que se buscan las filas de un acompañamiento en esa tabla.
export const columnaDe = (tabla: string) => COLUMNA_ACOMPANAMIENTO[tabla] ?? "engagement_id";
