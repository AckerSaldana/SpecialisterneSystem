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
    pgPolicy("profile_events_insert_persona_feedback", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${personaOf(t.engagementId)} and ${t.createdBy} = ${authUid} and ${t.tipo} = 'no_me_representa' and ${t.status} = 'proposed'`,
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
