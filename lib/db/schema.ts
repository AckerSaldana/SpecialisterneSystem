// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Modelo de datos mínimo con Row Level Security definida aquí mismo.
// drizzle-kit genera las tablas y las políticas en drizzle/*.sql.
//
// Las políticas usan funciones auxiliares (security definer) que viven en
// drizzle/0000_helpers.sql, en el esquema "private" (la Data API de Supabase no lo expone):
// app_role(), app_org_id(), app_is_coach_of(uuid), app_is_persona_of(uuid), app_has_consent(uuid).
// Se usan para no repetir subconsultas y para evitar recursión de RLS sobre "users".
//
// Regla de datos (REGLAS §6): no hay columna para el documento de diagnóstico ni
// para tipo o nivel. Solo se registra que fue verificado, quién, cuándo y la cédula.

import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgSchema,
  uniqueIndex,
  type AnyPgColumn,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid, authUsers } from "drizzle-orm/supabase";
import type { Aprobacion, EvidenciaGuardada, Perfil, PerfilPersona, ProfileEventPayload } from "@/lib/profile/schema";
import type { EvidenciaPlan, PayloadPlanIA, PlanPersona } from "@/lib/plan/schema";
import type { DescartesGuia, DocumentoGuia, LineaGuia } from "@/lib/guia/schema";
import type { AjusteGuardado, ContextoDesglose, DescartadoDesglose, PasoDesglose, PasoPlantilla } from "@/lib/desglose/schema";

// Todas las tablas viven en el esquema "app". La Data API de Supabase (PostgREST) solo
// expone "public", así que nadie puede leer ni escribir estas tablas con su sesión desde
// el navegador: el único camino es el servidor (Drizzle + withRls). Los permisos de
// tabla y columna están en drizzle/0002_permisos.sql.
export const app = pgSchema("app");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const appRole = app.enum("app_role", ["coach", "persona"]);
export const engagementType = app.enum("engagement_type", ["inclusion", "workplace_support"]);
export const engagementStage = app.enum("engagement_stage", [
  "alta",
  "evaluacion_inicial",
  "perfil",
  "plan",
  "seguimiento",
  "cierre",
]);
export const profileEventType = app.enum("profile_event_type", ["propuesta_ia", "no_me_representa"]);
export const profileEventStatus = app.enum("profile_event_status", ["proposed", "approved", "rejected"]);
export const planStatus = app.enum("plan_status", ["borrador", "aprobado", "descartado"]);
export const planItemType = app.enum("plan_item_type", [
  "objetivo",
  "apoyo_fe",
  "instruccion",
  "comunicacion_lider",
  // Spec 003, decisión 10.
  "objetivo_equipo",
  "ajuste_razonable",
]);
export const planItemOrigen = app.enum("plan_item_origen", ["ia", "ia_editado", "coach"]);
export const knowledgeCardType = app.enum("knowledge_card_type", ["estrategia_fe", "ajuste_razonable", "senal"]);
export const catalogFormat = app.enum("catalog_format", ["lectura", "video", "audio", "ejercicio", "interactivo"]);
export const cognitiveLoad = app.enum("cognitive_load", ["baja", "media", "alta"]);
export const recommendationStatus = app.enum("recommendation_status", ["propuesta", "aprobada", "descartada"]);
export const consentEventType = app.enum("consent_event_type", ["otorgado", "retirado"]);
// Spec 004.
export const sessionType = app.enum("session_type", ["persona", "red_de_apoyo"]);
export const planItemEstado = app.enum("plan_item_estado", ["avanza", "sin_cambios", "necesita_ajuste", "cumplido"]);
export const followupContextTipo = app.enum("followup_context_tipo", ["pregunta", "contexto", "siguiente_paso"]);
// Los mismos cuatro de SENALES (lib/profile/schema.ts).
export const signalType = app.enum("signal_type", [
  "estres_desregulacion",
  "intencion_de_renunciar",
  "cambio_de_vida",
  "desajuste_con_rol",
]);
export const signalStatus = app.enum("signal_status", ["activa", "cerrada"]);
export const alertStatus = app.enum("alert_status", ["abierta", "escalada", "atendida"]);
// Spec 008. Los mismos nueve de DOMINIOS_FE y las mismas tres de DIRECCIONES_FE (lib/profile/schema.ts).
export const feDominio = app.enum("fe_dominio", [
  "inhibicion",
  "automonitoreo",
  "flexibilidad",
  "control_emocional",
  "iniciacion",
  "memoria_de_trabajo",
  "planeacion_organizacion",
  "monitoreo_de_tareas",
  "organizacion_de_materiales",
]);
export const feDireccion = app.enum("fe_direccion", ["apoyo", "fortaleza", "cambio"]);
export const feResumenEstado = app.enum("fe_resumen_estado", ["propuesto", "aprobado", "descartado"]);
// Spec 009.
export const sharedGuideEstado = app.enum("shared_guide_estado", ["borrador", "lista", "retirada", "descartada"]);
// Spec 010.
export const taskStepEstado = app.enum("task_step_estado", ["hecho", "atorado", "pendiente"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// Expresiones SQL reutilizadas en las políticas.
const isCoach = sql`(select private.app_role()) = 'coach'`;
const coachOf = (col: unknown) => sql`(select private.app_is_coach_of(${col}))`;
const personaOf = (col: unknown) => sql`(select private.app_is_persona_of(${col}))`;
// Consentimiento vigente (spec 002, R-002.28): el último evento de app.consent_events es "otorgado".
// Sin él no se guardan notas ni se manda nada a la IA, y lo que ya existe deja de verse (decisión b).
const hasConsent = (col: unknown) => sql`(select private.app_has_consent(${col}))`;
// Spec 003: los ítems solo se escriben mientras su plan está en borrador; persona_plans solo con el plan aprobado.
const planEnBorrador = (plan: unknown, eng: unknown) => sql`(select private.app_plan_en_borrador(${plan}, ${eng}))`;
const planAprobado = (plan: unknown, eng: unknown) => sql`(select private.app_plan_aprobado(${plan}, ${eng}))`;
// Spec 004: una fila de avance o de contexto no puede apuntar a otro acompañamiento.
const eventoDeSesion = (ev: unknown, ses: unknown, eng: unknown) =>
  sql`(select private.app_evento_de_sesion(${ev}, ${ses}, ${eng}))`;
const itemDelAcompanamiento = (item: unknown, eng: unknown) =>
  sql`(select private.app_item_del_acompanamiento(${item}, ${eng}))`;
// Spec 008: una corrección solo apunta a una propuesta aprobada de ese acompañamiento.
const eventoAprobado = (ev: unknown, eng: unknown) => sql`(select private.app_evento_aprobado(${ev}, ${eng}))`;
// Spec 009 (R-009.63): una guía no apunta a un snapshot ni a una versión de otro acompañamiento.
const snapshotDelAcompanamiento = (snap: unknown, eng: unknown) =>
  sql`(select private.app_snapshot_del_acompanamiento(${snap}, ${eng}))`;
const guiaDelAcompanamiento = (guia: unknown, eng: unknown) =>
  sql`(select private.app_guia_del_acompanamiento(${guia}, ${eng}))`;
// Spec 010: una plantilla de su organización que se pueda aplicar, un desglose de ese acompañamiento y un paso que acepta marcas.
const plantillaDeMiOrg = (plantilla: unknown) => sql`(select private.app_plantilla_de_mi_org(${plantilla}))`;
const desgloseDelAcompanamiento = (desglose: unknown, eng: unknown) =>
  sql`(select private.app_desglose_del_acompanamiento(${desglose}, ${eng}))`;
const pasoMarcable = (desglose: unknown, paso: unknown, eng: unknown) =>
  sql`(select private.app_paso_marcable(${desglose}, ${paso}, ${eng}))`;

// ---------------------------------------------------------------------------
// Organizaciones y usuarios
// ---------------------------------------------------------------------------

export const organizations = app.table(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    pgPolicy("organizations_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.id} = (select private.app_org_id())`,
    }),
  ],
);

// Perfil de aplicación de cada cuenta de Supabase Auth.
export const users = app.table(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    role: appRole("role").notNull(),
    nombrePila: text("nombre_pila").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // Cada quien se ve a sí mismo; el coach ve a las personas de su organización.
    pgPolicy("users_select_self_or_org_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.id} = ${authUid} or (${isCoach} and ${t.orgId} = (select private.app_org_id()))`,
    }),
    // Spec 002 (R-002.2): el coach da de alta a la persona en su propia organización.
    pgPolicy("users_insert_coach_persona", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${isCoach} and ${t.orgId} = (select private.app_org_id()) and ${t.role} = 'persona'`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// Engagement: un acompañamiento (inclusión o Workplace Support)
// ---------------------------------------------------------------------------

export const engagements = app.table(
  "engagements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    type: engagementType("type").notNull(),
    stage: engagementStage("stage").notNull().default("alta"),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => users.id),
    diagnosticoVerificado: boolean("diagnostico_verificado").notNull().default(false),
    cedulaProfesional: text("cedula_profesional"),
    diagnosticoVerificadoPor: uuid("diagnostico_verificado_por").references(() => users.id),
    diagnosticoVerificadoEn: timestamp("diagnostico_verificado_en", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // Una persona, un acompañamiento (R-002.4).
    unique("engagements_persona_unica").on(t.personaId),
    // Verificado implica cédula, quién y cuándo (R-002.9). El trigger private.app_on_verificacion
    // llena quién y cuándo; el check lo garantiza aunque alguien escriba como owner.
    check(
      "engagements_verificacion_completa",
      sql`not ${t.diagnosticoVerificado} or (${t.cedulaProfesional} is not null and ${t.diagnosticoVerificadoPor} is not null and ${t.diagnosticoVerificadoEn} is not null)`,
    ),
    // Solo el coach lee la fila completa. La persona lee id, tipo y etapa con
    // private.app_mi_acompanamiento(), sin la verificación del diagnóstico (R-002.40, decisión e).
    pgPolicy("engagements_select_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.coachId} = ${authUid}`,
    }),
    // El coach crea el acompañamiento en etapa alta, sin verificar, con una persona de su organización (R-002.5).
    pgPolicy("engagements_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${isCoach} and ${t.coachId} = ${authUid} and ${t.orgId} = (select private.app_org_id()) and ${t.stage} = 'alta' and not ${t.diagnosticoVerificado} and exists (select 1 from app.users u where u.id = ${t.personaId} and u.role = 'persona' and u.org_id = (select private.app_org_id()))`,
    }),
    // Única política de UPDATE (R-002.41, decisión g): solo en etapa alta. Los permisos por columna
    // solo dejan escribir diagnostico_verificado y cedula_profesional; la etapa la cambian funciones de private.
    pgPolicy("engagements_update_coach_alta", {
      for: "update",
      to: authenticatedRole,
      using: sql`${t.coachId} = ${authUid} and ${t.stage} = 'alta'`,
      withCheck: sql`${t.coachId} = ${authUid} and ${t.stage} = 'alta'`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// Sesiones: la nota original del coach (la persona no la ve)
// ---------------------------------------------------------------------------

export const sessions = app.table(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id),
    notaOriginal: text("nota_original").notNull(),
    audioPath: text("audio_path"),
    // Spec 004 (R-004.1): con la persona o con su red de apoyo.
    tipo: sessionType("tipo").notNull().default("persona"),
    realizadaEn: timestamp("realizada_en", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    pgPolicy("sessions_select_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("sessions_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${t.coachId} = ${authUid} and ${hasConsent(t.engagementId)}`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// Historial versionado por eventos
// ---------------------------------------------------------------------------

export const profileEvents = app.table(
  "profile_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id),
    tipo: profileEventType("tipo").notNull(),
    status: profileEventStatus("status").notNull().default("proposed"),
    payload: jsonb("payload").$type<ProfileEventPayload>().notNull(),
    approvedPayload: jsonb("approved_payload").$type<Aprobacion>(),
    // Quién aprobó o rechazó, y cuándo.
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    promptVersion: text("prompt_version"),
    model: text("model"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    // Spec 004: con qué versión del perfil y con qué plan se generó la propuesta (R-004.27, R-004.41).
    perfilVersionBase: integer("perfil_version_base"),
    // "set null" evita el ciclo plans → profile_snapshots → profile_events → plans, que rompería la purga.
    planBaseId: uuid("plan_base_id").references((): AnyPgColumn => plans.id, { onDelete: "set null" }),
    // Spec 005 (R-005.27, R-005.34): qué propuesta o qué versión del plan resolvió un "no me representa".
    // "set null" por lo mismo que plan_base_id: otro ciclo de llaves rompería la purga (R-002.49).
    resueltoPorEvento: uuid("resuelto_por_evento").references((): AnyPgColumn => profileEvents.id, { onDelete: "set null" }),
    resueltoPorPlan: uuid("resuelto_por_plan").references((): AnyPgColumn => plans.id, { onDelete: "set null" }),
  },
  (t) => [
    // R-004.30: una sola propuesta de la IA por sesión, aunque lleguen dos reintentos a la vez.
    uniqueIndex("profile_events_una_propuesta").on(t.sessionId).where(sql`${t.tipo} = 'propuesta_ia'`),
    pgPolicy("profile_events_select_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("profile_events_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${t.createdBy} = ${authUid} and ${t.tipo} = 'propuesta_ia' and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("profile_events_update_coach", {
      for: "update",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
      withCheck: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
    // La persona solo ve y crea sus propios "esto no me representa"; nunca las propuestas de la IA.
    pgPolicy("profile_events_select_persona_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${personaOf(t.engagementId)} and ${t.createdBy} = ${authUid} and ${t.tipo} = 'no_me_representa' and ${hasConsent(t.engagementId)}`,
    }),
    // R-005.46: también exige consentimiento vigente, igual que su lectura.
    // R-005.50: la persona solo escribe acompañamiento, tipo, estado, payload y quién lo creó. Lo demás
    // queda vacío y la fecha es la de la inserción: lo que decide el coach no se puede escribir de antemano.
    pgPolicy("profile_events_insert_persona_feedback", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${personaOf(t.engagementId)} and ${t.createdBy} = ${authUid} and ${t.tipo} = 'no_me_representa' and ${t.status} = 'proposed' and ${hasConsent(t.engagementId)} and ${t.sessionId} is null and ${t.approvedPayload} is null and ${t.decidedBy} is null and ${t.decidedAt} is null and ${t.promptVersion} is null and ${t.model} is null and ${t.perfilVersionBase} is null and ${t.planBaseId} is null and ${t.resueltoPorEvento} is null and ${t.resueltoPorPlan} is null and ${t.createdAt} = now()`,
    }),
  ],
);

export const profileSnapshots = app.table(
  "profile_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    perfil: jsonb("perfil").$type<Perfil>().notNull(),
    sourceEventId: uuid("source_event_id")
      .notNull()
      .references(() => profileEvents.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique("profile_snapshots_engagement_version").on(t.engagementId, t.version),
    // Solo el coach: el snapshot trae citas de sus notas y señales de riesgo.
    pgPolicy("profile_snapshots_select_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("profile_snapshots_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${t.createdBy} = ${authUid} and ${hasConsent(t.engagementId)}`,
    }),
  ],
);

// Versión para la persona de cada snapshot (lib/profile/schema.ts → vistaPersona).
// Se escribe en la misma transacción que el snapshot.
export const personaProfiles = app.table(
  "persona_profiles",
  {
    snapshotId: uuid("snapshot_id")
      .primaryKey()
      .references(() => profileSnapshots.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    contenido: jsonb("contenido").$type<PerfilPersona>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    pgPolicy("persona_profiles_select_participants", {
      for: "select",
      to: authenticatedRole,
      using: sql`(${coachOf(t.engagementId)} or ${personaOf(t.engagementId)}) and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("persona_profiles_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// Plan de acompañamiento
// ---------------------------------------------------------------------------

export const plans = app.table(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    status: planStatus("status").notNull().default("borrador"),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    // Spec 003 (R-003.20): perfil base, versión al aprobar y rastro inmutable de la propuesta.
    profileSnapshotId: uuid("profile_snapshot_id")
      .notNull()
      .references(() => profileSnapshots.id),
    version: integer("version"),
    propuestaIa: jsonb("propuesta_ia").$type<PayloadPlanIA>(),
    promptVersion: text("prompt_version"),
    model: text("model"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    // R-003.31: una versión por acompañamiento. R-003.3: un solo borrador a la vez.
    unique("plans_engagement_version").on(t.engagementId, t.version),
    uniqueIndex("plans_un_borrador").on(t.engagementId).where(sql`${t.status} = 'borrador'`),
    pgPolicy("plans_select_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("plans_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${t.createdBy} = ${authUid} and ${t.status} = 'borrador' and ${t.version} is null and ${hasConsent(t.engagementId)}`,
    }),
    // Un plan aprobado o descartado ya no pasa el using: queda congelado (R-003.32).
    pgPolicy("plans_update_coach_borrador", {
      for: "update",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${t.status} = 'borrador' and ${hasConsent(t.engagementId)}`,
      withCheck: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
  ],
);

export const planItems = app.table(
  "plan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    tipo: planItemType("tipo").notNull(),
    descripcion: text("descripcion").notNull(),
    dominioFe: text("dominio_fe"),
    knowledgeCardId: text("knowledge_card_id").references(() => knowledgeCards.id),
    evidencia: jsonb("evidencia").$type<EvidenciaPlan[]>().notNull().default([]),
    orden: integer("orden").notNull().default(0),
    // Spec 003: texto para la persona (solo objetivo y apoyo_fe), rastro de origen y edición.
    textoPersona: text("texto_persona"),
    origen: planItemOrigen("origen").notNull().default("ia"),
    propuestaRef: integer("propuesta_ref"),
    // R-003.50: el ítem equivalente de la versión aprobada anterior.
    origenItemId: uuid("origen_item_id").references((): AnyPgColumn => planItems.id),
    editadoPor: uuid("editado_por").references(() => users.id),
    editadoEn: timestamp("editado_en", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // R-003.51: dos ítems del mismo plan no siguen al mismo ítem anterior.
    uniqueIndex("plan_items_origen_unico").on(t.planId, t.origenItemId).where(sql`${t.origenItemId} is not null`),
    pgPolicy("plan_items_select_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("plan_items_insert_coach_borrador", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)} and ${planEnBorrador(t.planId, t.engagementId)}`,
    }),
    pgPolicy("plan_items_update_coach_borrador", {
      for: "update",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)} and ${planEnBorrador(t.planId, t.engagementId)}`,
      withCheck: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)} and ${planEnBorrador(t.planId, t.engagementId)}`,
    }),
    pgPolicy("plan_items_delete_coach_borrador", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)} and ${planEnBorrador(t.planId, t.engagementId)}`,
    }),
  ],
);

// Copia del plan aprobado para la persona (spec 003, R-003.37): solo objetivos y apoyos con su texto
// para la persona y la cadena de versiones anteriores. Sin citas, fichas, dominios ni lo del líder.
export const personaPlans = app.table(
  "persona_plans",
  {
    planId: uuid("plan_id")
      .primaryKey()
      .references(() => plans.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    contenido: jsonb("contenido").$type<PlanPersona>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    pgPolicy("persona_plans_select_participants", {
      for: "select",
      to: authenticatedRole,
      using: sql`(${coachOf(t.engagementId)} or ${personaOf(t.engagementId)}) and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("persona_plans_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)} and ${planAprobado(t.planId, t.engagementId)}`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// Corpus 1: base de conocimiento de intervención (fichas cortas verificadas)
// ---------------------------------------------------------------------------

export const knowledgeCards = app.table(
  "knowledge_cards",
  {
    id: text("id").primaryKey(), // "KC-001"
    titulo: text("titulo").notNull(),
    tipo: knowledgeCardType("tipo").notNull(),
    contenido: text("contenido").notNull(),
    dominioFe: text("dominio_fe"),
    fuente: text("fuente").notNull(), // ID de fuente de CONTEXTO §10, p. ej. "F-022"
    verificada: boolean("verificada").notNull().default(false),
    createdAt: createdAt(),
  },
  () => [
    pgPolicy("knowledge_cards_select_coach", { for: "select", to: authenticatedRole, using: isCoach }),
  ],
);

// ---------------------------------------------------------------------------
// Corpus 2: catálogo de contenido para la persona
// ---------------------------------------------------------------------------

export const catalogUnits = app.table(
  "catalog_units",
  {
    id: text("id").primaryKey(), // "CU-001"
    titulo: text("titulo").notNull(),
    competencia: text("competencia").notNull(),
    dominioFe: text("dominio_fe"),
    formato: catalogFormat("formato").notNull(),
    duracionMin: integer("duracion_min").notNull(),
    cargaCognitiva: cognitiveLoad("carga_cognitiva").notNull(),
    idioma: text("idioma").notNull().default("es"),
    fuente: text("fuente").notNull(),
    url: text("url"),
    createdAt: createdAt(),
  },
  () => [pgPolicy("catalog_units_select_all", { for: "select", to: authenticatedRole, using: sql`true` })],
);

export const recommendations = app.table(
  "recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    catalogUnitId: text("catalog_unit_id")
      .notNull()
      .references(() => catalogUnits.id),
    planItemId: uuid("plan_item_id").references(() => planItems.id),
    razon: text("razon").notNull(),
    status: recommendationStatus("status").notNull().default("propuesta"),
    approvedBy: uuid("approved_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    pgPolicy("recommendations_all_coach", {
      for: "all",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
      withCheck: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("recommendations_select_persona_approved", {
      for: "select",
      to: authenticatedRole,
      using: sql`${personaOf(t.engagementId)} and ${t.status} = 'aprobada' and ${hasConsent(t.engagementId)}`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// Alta: consentimiento e invitaciones (spec 002)
// ---------------------------------------------------------------------------

// Historial de consentimiento. Vigente = el evento con el id más alto es "otorgado" (R-002.28).
// Nadie edita ni borra eventos: no hay permiso de update ni delete para authenticated.
export const consentEvents = app.table(
  "consent_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tipo: consentEventType("tipo").notNull(),
    // Fecha del archivo del aviso vigente (lib/legal/aviso.ts, AVISO_VERSION).
    versionAviso: text("version_aviso").notNull(),
    // La pone la base; authenticated no tiene permiso de escribirla.
    fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy("consent_events_select_participants", {
      for: "select",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} or (${personaOf(t.engagementId)} and ${t.userId} = ${authUid})`,
    }),
    // Solo la persona registra o retira su consentimiento (R-002.24). Otorgar exige el alta
    // verificada (R-002.37); retirar siempre se puede.
    pgPolicy("consent_events_insert_persona", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${personaOf(t.engagementId)} and ${t.userId} = ${authUid} and (${t.tipo} = 'retirado' or (select private.app_alta_verificada(${t.engagementId})))`,
    }),
  ],
);

// Invitaciones con código de un solo uso (decisión a). No hay columna para el código: solo
// existe como contraseña temporal en Supabase Auth, que la guarda con hash (R-002.47).
// Pendiente = la más reciente con usada_en y reemplazada_en nulos; vencida si expira_en ya pasó.
export const invitations = app.table(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => users.id),
    creadaPor: uuid("creada_por")
      .notNull()
      .references(() => users.id),
    expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
    usadaEn: timestamp("usada_en", { withTimezone: true }),
    reemplazadaEn: timestamp("reemplazada_en", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    pgPolicy("invitations_select_participants", {
      for: "select",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} or ${t.personaId} = ${authUid}`,
    }),
    // Con una invitación ya usada no se generan más: cambiaría la contraseña de la persona (R-002.38).
    pgPolicy("invitations_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${t.creadaPor} = ${authUid} and ${t.expiraEn} > now() and ${t.personaId} = (select e.persona_id from app.engagements e where e.id = ${t.engagementId}) and not (select private.app_invitacion_usada(${t.engagementId}))`,
    }),
    pgPolicy("invitations_update_coach", {
      for: "update",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${t.usadaEn} is null and ${t.reemplazadaEn} is null`,
      withCheck: sql`${coachOf(t.engagementId)} and ${t.usadaEn} is null`,
    }),
    pgPolicy("invitations_update_persona", {
      for: "update",
      to: authenticatedRole,
      using: sql`${t.personaId} = ${authUid} and ${t.usadaEn} is null and ${t.reemplazadaEn} is null and ${t.expiraEn} > now()`,
      withCheck: sql`${t.personaId} = ${authUid} and ${t.reemplazadaEn} is null`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// Seguimiento (spec 004): avance del plan, contexto, estado de señales y alertas fuertes.
// Solo el coach del acompañamiento, con consentimiento vigente. La persona no tiene políticas (C-09).
// ---------------------------------------------------------------------------

// Una fila por cada estado aprobado de un ítem, sin borrar los anteriores (R-004.10).
export const planItemUpdates = app.table(
  "plan_item_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    // "restrict": un borrado que se salte R-003.32 falla en lugar de perder la historia.
    planItemId: uuid("plan_item_id")
      .notNull()
      .references(() => planItems.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => profileEvents.id),
    estado: planItemEstado("estado").notNull(),
    resumen: text("resumen").notNull(),
    evidencia: jsonb("evidencia").$type<EvidenciaGuardada[]>().notNull(),
    approvedBy: uuid("approved_by")
      .notNull()
      .references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("plan_item_updates_evento_item").on(t.eventId, t.planItemId),
    pgPolicy("plan_item_updates_select_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("plan_item_updates_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${t.approvedBy} = ${authUid} and ${hasConsent(t.engagementId)} and ${eventoDeSesion(t.eventId, t.sessionId, t.engagementId)} and ${itemDelAcompanamiento(t.planItemId, t.engagementId)}`,
    }),
  ],
);

// Preguntas, contexto y siguiente paso que el coach aprobó para la siguiente sesión (R-004.21, R-004.53).
// Nunca en persona_profiles (C-09). Quitar es una marca, no un borrado (R-004.23).
export const followupContext = app.table(
  "followup_context",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    tipo: followupContextTipo("tipo").notNull(),
    texto: text("texto").notNull(),
    evidencia: jsonb("evidencia").$type<EvidenciaGuardada[]>().notNull().default([]),
    planItemId: uuid("plan_item_id").references(() => planItems.id),
    knowledgeCardId: text("knowledge_card_id").references(() => knowledgeCards.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => profileEvents.id),
    approvedBy: uuid("approved_by")
      .notNull()
      .references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
    quitadaPor: uuid("quitada_por").references(() => users.id),
    quitadaEn: timestamp("quitada_en", { withTimezone: true }),
  },
  (t) => [
    pgPolicy("followup_context_select_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("followup_context_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${t.approvedBy} = ${authUid} and ${hasConsent(t.engagementId)} and ${t.quitadaPor} is null and ${t.quitadaEn} is null and ${eventoDeSesion(t.eventId, t.sessionId, t.engagementId)} and (${t.planItemId} is null or ${itemDelAcompanamiento(t.planItemId, t.engagementId)})`,
    }),
    // Los permisos por columna (0013) solo dejan escribir quitada_por y quitada_en. Lo ya quitado no cambia.
    pgPolicy("followup_context_update_coach", {
      for: "update",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)} and ${t.quitadaEn} is null`,
      withCheck: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)} and ${t.quitadaPor} = ${authUid}`,
    }),
  ],
);

// Una fila por cada cambio de estado de una señal (R-004.13). El estado vigente de un tipo es su
// fila más reciente; sin filas, cuenta como activa. No crea snapshots ni mueve la versión del perfil.
export const signalStates = app.table(
  "signal_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    tipo: signalType("tipo").notNull(),
    estado: signalStatus("estado").notNull(),
    motivo: text("motivo"),
    eventId: uuid("event_id").references(() => profileEvents.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    pgPolicy("signal_states_select_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("signal_states_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${t.createdBy} = ${authUid} and ${hasConsent(t.engagementId)}`,
    }),
  ],
);

// Alertas que el coach marca sobre una señal activa. La app no avisa a nadie: el coach la pasa a una
// persona de Specialisterne fuera del sistema y registra que lo hizo (R-004.16, R-004.42).
export const strongAlerts = app.table(
  "strong_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    tipoSenal: signalType("tipo_senal").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => profileEvents.id),
    marcadaPor: uuid("marcada_por")
      .notNull()
      .references(() => users.id),
    marcadaEn: timestamp("marcada_en", { withTimezone: true }).notNull().defaultNow(),
    nota: text("nota"),
    estado: alertStatus("estado").notNull().default("abierta"),
    notaEscalada: text("nota_escalada"),
    escaladaEn: timestamp("escalada_en", { withTimezone: true }),
    atendidaEn: timestamp("atendida_en", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("strong_alerts_una_vigente").on(t.engagementId, t.tipoSenal).where(sql`${t.estado} <> 'atendida'`),
    pgPolicy("strong_alerts_select_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("strong_alerts_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${t.marcadaPor} = ${authUid} and ${hasConsent(t.engagementId)} and ${t.estado} = 'abierta'`,
    }),
    pgPolicy("strong_alerts_update_coach", {
      for: "update",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
      withCheck: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// Trayectoria de función ejecutiva (spec 008): decisiones del coach, no líneas. Las líneas se calculan
// (lib/trayectoria/lineas.ts, R-008.20). Solo el coach del acompañamiento, con consentimiento vigente.
// La persona no tiene políticas: 0 filas por construcción (C-09, R-008.40).
// ---------------------------------------------------------------------------

// Una fila por corrección, sin editar ni borrar las anteriores. La vigente de una línea es la de id más
// alto (R-008.29). La propuesta de la IA sigue intacta en profile_events.payload. Permisos en 0019.
export const feCorrections = app.table(
  "fe_corrections",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => profileEvents.id),
    lineaId: text("linea_id").notNull(),
    // Nulo es "Ninguno".
    dominio: feDominio("dominio"),
    direccion: feDireccion("direccion"),
    anteriorLineaId: text("anterior_linea_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    // El lineaId empieza con el id de su evento (R-008.11).
    check("fe_corrections_linea_del_evento", sql`left(${t.lineaId}, 36) = ${t.eventId}::text`),
    check("fe_corrections_sin_dominio", sql`${t.dominio} is not null or ${t.direccion} is null`),
    check("fe_corrections_anterior", sql`coalesce(${t.direccion} = 'cambio', false) = (${t.anteriorLineaId} is not null)`),
    index("fe_corrections_engagement_linea_id_idx").on(t.engagementId, t.lineaId, t.id),
    pgPolicy("fe_corrections_select_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("fe_corrections_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)} and ${t.createdBy} = ${authUid} and ${eventoAprobado(t.eventId, t.engagementId)}`,
    }),
  ],
);

// Resumen por dominio: una oración que propone la IA y el coach aprueba o descarta (R-008.37). El texto
// no se edita: los permisos de 0019 solo dejan escribir estado, decided_by y decided_at.
export const feDomainSummaries = app.table(
  "fe_domain_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    dominio: feDominio("dominio").notNull(),
    texto: text("texto").notNull(),
    // Las líneas que usa la oración y las del bloque al generarla (R-008.38).
    lineaIds: jsonb("linea_ids").$type<string[]>().notNull(),
    bloqueIds: jsonb("bloque_ids").$type<string[]>().notNull(),
    estado: feResumenEstado("estado").notNull().default("propuesto"),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    // Una sola propuesta abierta por dominio, aunque lleguen dos pedidos a la vez (R-008.33).
    uniqueIndex("fe_domain_summaries_una_propuesta").on(t.engagementId, t.dominio).where(sql`${t.estado} = 'propuesto'`),
    pgPolicy("fe_domain_summaries_select_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("fe_domain_summaries_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)} and ${t.createdBy} = ${authUid} and ${t.estado} = 'propuesto' and ${t.decidedBy} is null`,
    }),
    // Lo ya aprobado o descartado no pasa el using: queda como está.
    pgPolicy("fe_domain_summaries_update_coach", {
      for: "update",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)} and ${t.estado} = 'propuesto'`,
      withCheck: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)} and ${t.estado} in ('aprobado', 'descartado') and ${t.decidedBy} = ${authUid}`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// "Cómo trabajar conmigo" (spec 009): la hoja que la persona escribe para su líder. shared_guides es solo
// un nombre interno (R-009.1). RLS filtra filas, no columnas: el coach lee toda la fila de una versión
// lista, por eso lineas lleva solo IDs como origen, descartes solo conteos y nada de las entradas al modelo.
// ---------------------------------------------------------------------------

export const sharedGuides = app.table(
  "shared_guides",
  {
    // Lo genera el servidor: el coach no puede usar returning (R-009.13).
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    // Nula hasta "Listo" (R-009.29).
    version: integer("version"),
    estado: sharedGuideEstado("estado").notNull().default("borrador"),
    nombreAMostrar: text("nombre_a_mostrar").notNull(),
    lineas: jsonb("lineas").$type<LineaGuia[]>().notNull(),
    documento: jsonb("documento").$type<DocumentoGuia>(),
    descartes: jsonb("descartes").$type<DescartesGuia>().notNull().default({}),
    generadaDesdeSnapshotId: uuid("generada_desde_snapshot_id")
      .notNull()
      .references(() => profileSnapshots.id),
    perfilVersion: integer("perfil_version").notNull(),
    planVersion: integer("plan_version").notNull(),
    guiaBaseId: uuid("guia_base_id").references((): AnyPgColumn => sharedGuides.id),
    generadaPor: uuid("generada_por")
      .notNull()
      .references(() => users.id),
    // Nulos si no se llamó al modelo (R-009.32, R-009.47).
    promptVersion: text("prompt_version"),
    model: text("model"),
    // R-009.46: huella de lo que el modelo ya revisó sin proponer nada. Solo una huella, nunca el texto: RLS filtra
    // filas, no columnas, y el coach lee las versiones listas.
    revisadaSinCambios: text("revisada_sin_cambios"),
    // Las pone el trigger private.app_shared_guide_transicion.
    aprobadaPorPersonaEn: timestamp("aprobada_por_persona_en", { withTimezone: true }),
    retiradaEn: timestamp("retirada_en", { withTimezone: true }),
    descartadaEn: timestamp("descartada_en", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("shared_guides_engagement_version").on(t.engagementId, t.version),
    // R-009.14: un borrador por acompañamiento, aunque lleguen dos pedidos a la vez.
    uniqueIndex("shared_guides_un_borrador").on(t.engagementId).where(sql`${t.estado} = 'borrador'`),
    check(
      "shared_guides_lista_completa",
      sql`${t.estado} <> 'lista' or (${t.version} is not null and ${t.documento} is not null and ${t.aprobadaPorPersonaEn} is not null)`,
    ),
    pgPolicy("shared_guides_select_persona", {
      for: "select",
      to: authenticatedRole,
      using: sql`${personaOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
    // R-009.34: el coach no lee borradores, versiones retiradas ni borradores descartados. Lo impide la
    // política, no la pantalla.
    pgPolicy("shared_guides_select_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)} and ${t.estado} = 'lista'`,
    }),
    pgPolicy("shared_guides_insert_persona", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${personaOf(t.engagementId)} and ${t.generadaPor} = ${authUid} and ${hasConsent(t.engagementId)} and ${t.estado} = 'borrador' and ${t.version} is null and ${t.documento} is null and ${t.aprobadaPorPersonaEn} is null and ${snapshotDelAcompanamiento(t.generadaDesdeSnapshotId, t.engagementId)} and (${t.guiaBaseId} is null or ${guiaDelAcompanamiento(t.guiaBaseId, t.engagementId)})`,
    }),
    // R-009.47: el coach solo pide el primer borrador, sin base.
    pgPolicy("shared_guides_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${coachOf(t.engagementId)} and ${t.generadaPor} = ${authUid} and ${hasConsent(t.engagementId)} and ${t.estado} = 'borrador' and ${t.version} is null and ${t.documento} is null and ${t.aprobadaPorPersonaEn} is null and ${snapshotDelAcompanamiento(t.generadaDesdeSnapshotId, t.engagementId)} and ${t.guiaBaseId} is null`,
    }),
    // Una sola política de UPDATE a propósito: con dos, Postgres junta sus condiciones con OR y una fila
    // lista podría volver a borrador. El coach no tiene ninguna, y nadie tiene DELETE. Las transiciones las
    // hace cumplir el trigger (R-009.56).
    pgPolicy("shared_guides_update_persona", {
      for: "update",
      to: authenticatedRole,
      using: sql`${personaOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
      withCheck: sql`${personaOf(t.engagementId)} and ${hasConsent(t.engagementId)}`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// Desglose de tareas (spec 010): la IA le escribe a la persona sin revisión previa (D-070), y lo que ella marca
// regresa al coach (D-071). RLS filtra filas, no columnas: pasos y ajustes llevan solo IDs como origen, y
// descartados solo la ruta y el motivo (R-010.24). Permisos por columna en 0027.
// ---------------------------------------------------------------------------

// Plantillas por organización. Sin notas, contexto ni referencia a la persona o al desglose (R-010.39).
// Decisión abierta 5, opción B: origen_engagement_id solo sirve para ocultarla con el retiro y borrarla con la
// purga. Un retiro se la quita a toda la organización (R-010.45), y ninguna lectura ni ruta lo selecciona.
export const taskTemplates = app.table(
  "task_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    origenEngagementId: uuid("origen_engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    puesto: text("puesto").notNull(),
    titulo: text("titulo").notNull(),
    tarea: text("tarea").notNull(),
    pasos: jsonb("pasos").$type<PasoPlantilla[]>().notNull(),
    creadaPor: uuid("creada_por")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    archivadaPor: uuid("archivada_por").references(() => users.id),
    archivadaEn: timestamp("archivada_en", { withTimezone: true }),
  },
  (t) => [
    pgPolicy("task_templates_select_coach", {
      for: "select",
      to: authenticatedRole,
      using: sql`${isCoach} and ${t.orgId} = (select private.app_org_id()) and ${hasConsent(t.origenEngagementId)}`,
    }),
    // R-010.41: solo la guarda el coach del acompañamiento de origen.
    pgPolicy("task_templates_insert_coach", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${isCoach} and ${t.orgId} = (select private.app_org_id()) and ${t.creadaPor} = ${authUid} and ${t.archivadaEn} is null and ${t.archivadaPor} is null and ${coachOf(t.origenEngagementId)} and ${hasConsent(t.origenEngagementId)}`,
    }),
    pgPolicy("task_templates_update_coach", {
      for: "update",
      to: authenticatedRole,
      using: sql`${isCoach} and ${t.orgId} = (select private.app_org_id()) and ${t.archivadaEn} is null and ${hasConsent(t.origenEngagementId)}`,
      withCheck: sql`${isCoach} and ${t.orgId} = (select private.app_org_id()) and ${t.archivadaPor} = ${authUid} and ${hasConsent(t.origenEngagementId)}`,
    }),
  ],
);

export const taskBreakdowns = app.table(
  "task_breakdowns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    tareaOriginal: text("tarea_original").notNull(),
    contexto: jsonb("contexto").$type<ContextoDesglose>(),
    pasos: jsonb("pasos").$type<PasoDesglose[]>().notNull(),
    // Solo el id del snapshot, nunca una copia de su contenido (R-010.9).
    generadoDesde: uuid("generado_desde")
      .notNull()
      .references(() => profileSnapshots.id),
    // Una repetición sin llamada copia los dos del origen.
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    // Decisión abierta 5, opción B: si la plantilla se borra con una purga, este desglose sigue, sin ella.
    plantillaId: uuid("plantilla_id").references(() => taskTemplates.id, { onDelete: "set null" }),
    origenBreakdownId: uuid("origen_breakdown_id").references((): AnyPgColumn => taskBreakdowns.id),
    ajustes: jsonb("ajustes").$type<AjusteGuardado[]>(),
    ajustesAceptados: jsonb("ajustes_aceptados").$type<string[]>(),
    ajustesDecididosEn: timestamp("ajustes_decididos_en", { withTimezone: true }),
    descartados: jsonb("descartados").$type<DescartadoDesglose[]>().notNull().default([]),
    creadoPor: uuid("creado_por")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    archivadoPor: uuid("archivado_por").references(() => users.id),
    archivadoEn: timestamp("archivado_en", { withTimezone: true }),
  },
  (t) => [
    // R-010.37: sin ajustes que usar, la copia se guarda con ajustes nulo; así nadie queda esperando una decisión.
    check("task_breakdowns_ajustes_no_vacio", sql`${t.ajustes} is null or jsonb_array_length(${t.ajustes}) > 0`),
    pgPolicy("task_breakdowns_select_participants", {
      for: "select",
      to: authenticatedRole,
      using: sql`(${coachOf(t.engagementId)} or ${personaOf(t.engagementId)}) and ${hasConsent(t.engagementId)}`,
    }),
    pgPolicy("task_breakdowns_insert_participants", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`(${coachOf(t.engagementId)} or ${personaOf(t.engagementId)}) and ${t.creadoPor} = ${authUid} and ${hasConsent(t.engagementId)} and ${snapshotDelAcompanamiento(t.generadoDesde, t.engagementId)} and ${t.ajustesDecididosEn} is null and ${t.archivadoEn} is null and ${t.archivadoPor} is null and (${t.plantillaId} is null or (${coachOf(t.engagementId)} and ${plantillaDeMiOrg(t.plantillaId)})) and (${t.origenBreakdownId} is null or (${personaOf(t.engagementId)} and ${desgloseDelAcompanamiento(t.origenBreakdownId, t.engagementId)}))`,
    }),
    // "Ya no la uso" (R-010.29). La persona decide sus ajustes por private.app_decidir_ajustes, no por aquí.
    pgPolicy("task_breakdowns_update_archivar", {
      for: "update",
      to: authenticatedRole,
      using: sql`(${coachOf(t.engagementId)} or ${personaOf(t.engagementId)}) and ${hasConsent(t.engagementId)} and ${t.archivadoEn} is null`,
      withCheck: sql`(${coachOf(t.engagementId)} or ${personaOf(t.engagementId)}) and ${hasConsent(t.engagementId)} and ${t.archivadoPor} = ${authUid}`,
    }),
  ],
);

// Una fila por marca, sin editar ni borrar las anteriores. El estado de un paso es la de id más alto (R-010.27).
// "Me atoré aquí" es texto literal de la persona: nunca entra a las señales (C-05, D-071, R-010.31).
export const taskStepEvents = app.table(
  "task_step_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    breakdownId: uuid("breakdown_id")
      .notNull()
      .references(() => taskBreakdowns.id),
    pasoId: uuid("paso_id").notNull(),
    estado: taskStepEstado("estado").notNull(),
    texto: text("texto"),
    creadoPor: uuid("creado_por")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    revisadoPor: uuid("revisado_por").references(() => users.id),
    revisadoEn: timestamp("revisado_en", { withTimezone: true }),
  },
  (t) => [
    check("task_step_events_texto", sql`(${t.texto} is null or ${t.estado} = 'atorado') and (${t.texto} is null or char_length(${t.texto}) <= 1000)`),
    index("task_step_events_engagement_estado_revisado_idx").on(t.engagementId, t.estado, t.revisadoEn),
    index("task_step_events_breakdown_paso_id_idx").on(t.breakdownId, t.pasoId, t.id),
    pgPolicy("task_step_events_select_participants", {
      for: "select",
      to: authenticatedRole,
      using: sql`(${coachOf(t.engagementId)} or ${personaOf(t.engagementId)}) and ${hasConsent(t.engagementId)}`,
    }),
    // R-010.26: solo la persona marca. El coach no tiene política de INSERT.
    pgPolicy("task_step_events_insert_persona", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${personaOf(t.engagementId)} and ${t.creadoPor} = ${authUid} and ${hasConsent(t.engagementId)} and ${t.revisadoPor} is null and ${t.revisadoEn} is null and ${pasoMarcable(t.breakdownId, t.pasoId, t.engagementId)}`,
    }),
    // "Ya lo revisé" (R-010.33). Los permisos de 0027 solo dejan escribir revisado_por y revisado_en.
    pgPolicy("task_step_events_update_coach", {
      for: "update",
      to: authenticatedRole,
      using: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)} and ${t.estado} = 'atorado' and ${t.revisadoEn} is null`,
      withCheck: sql`${coachOf(t.engagementId)} and ${hasConsent(t.engagementId)} and ${t.revisadoPor} = ${authUid}`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// Auditoría de llamadas al modelo
// ---------------------------------------------------------------------------

export const auditLog = app.table(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id),
    engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "set null" }),
    accion: text("accion").notNull(), // p. ej. "propose_profile_update"
    modelo: text("modelo"),
    promptVersion: text("prompt_version"),
    tokensEntrada: integer("tokens_entrada"),
    tokensSalida: integer("tokens_salida"),
    tokensCacheLectura: integer("tokens_cache_lectura"),
    latenciaMs: integer("latencia_ms"),
    ok: boolean("ok").notNull(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    pgPolicy("audit_log_insert_self", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${t.userId} = ${authUid}`,
    }),
    pgPolicy("audit_log_select_self", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.userId} = ${authUid}`,
    }),
  ],
);
