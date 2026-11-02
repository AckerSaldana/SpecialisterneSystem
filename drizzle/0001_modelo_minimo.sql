-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TYPE "app"."app_role" AS ENUM('coach', 'persona');--> statement-breakpoint
CREATE TYPE "app"."catalog_format" AS ENUM('lectura', 'video', 'audio', 'ejercicio', 'interactivo');--> statement-breakpoint
CREATE TYPE "app"."cognitive_load" AS ENUM('baja', 'media', 'alta');--> statement-breakpoint
CREATE TYPE "app"."engagement_stage" AS ENUM('alta', 'evaluacion_inicial', 'perfil', 'plan', 'seguimiento', 'cierre');--> statement-breakpoint
CREATE TYPE "app"."engagement_type" AS ENUM('inclusion', 'workplace_support');--> statement-breakpoint
CREATE TYPE "app"."knowledge_card_type" AS ENUM('estrategia_fe', 'ajuste_razonable', 'senal');--> statement-breakpoint
CREATE TYPE "app"."plan_item_type" AS ENUM('objetivo', 'apoyo_fe', 'instruccion', 'comunicacion_lider');--> statement-breakpoint
CREATE TYPE "app"."plan_status" AS ENUM('borrador', 'aprobado');--> statement-breakpoint
CREATE TYPE "app"."profile_event_status" AS ENUM('proposed', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "app"."profile_event_type" AS ENUM('propuesta_ia', 'no_me_representa');--> statement-breakpoint
CREATE TYPE "app"."recommendation_status" AS ENUM('propuesta', 'aprobada', 'descartada');--> statement-breakpoint
CREATE TABLE "app"."audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"engagement_id" uuid,
	"accion" text NOT NULL,
	"modelo" text,
	"prompt_version" text,
	"tokens_entrada" integer,
	"tokens_salida" integer,
	"tokens_cache_lectura" integer,
	"latencia_ms" integer,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."catalog_units" (
	"id" text PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"competencia" text NOT NULL,
	"dominio_fe" text,
	"formato" "app"."catalog_format" NOT NULL,
	"duracion_min" integer NOT NULL,
	"carga_cognitiva" "app"."cognitive_load" NOT NULL,
	"idioma" text DEFAULT 'es' NOT NULL,
	"fuente" text NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."catalog_units" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" "app"."engagement_type" NOT NULL,
	"stage" "app"."engagement_stage" DEFAULT 'alta' NOT NULL,
	"coach_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"consentimiento_en" timestamp with time zone,
	"diagnostico_verificado" boolean DEFAULT false NOT NULL,
	"cedula_profesional" text,
	"diagnostico_verificado_por" uuid,
	"diagnostico_verificado_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."engagements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."knowledge_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"tipo" "app"."knowledge_card_type" NOT NULL,
	"contenido" text NOT NULL,
	"dominio_fe" text,
	"fuente" text NOT NULL,
	"verificada" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."knowledge_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."persona_profiles" (
	"snapshot_id" uuid PRIMARY KEY NOT NULL,
	"engagement_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"contenido" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."persona_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tipo" "app"."plan_item_type" NOT NULL,
	"descripcion" text NOT NULL,
	"dominio_fe" text,
	"knowledge_card_id" text,
	"evidencia" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."plan_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"status" "app"."plan_status" DEFAULT 'borrador' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."profile_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"session_id" uuid,
	"tipo" "app"."profile_event_type" NOT NULL,
	"status" "app"."profile_event_status" DEFAULT 'proposed' NOT NULL,
	"payload" jsonb NOT NULL,
	"approved_payload" jsonb,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"prompt_version" text,
	"model" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."profile_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."profile_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"perfil" jsonb NOT NULL,
	"source_event_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_snapshots_engagement_version" UNIQUE("engagement_id","version")
);
--> statement-breakpoint
ALTER TABLE "app"."profile_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"catalog_unit_id" text NOT NULL,
	"plan_item_id" uuid,
	"razon" text NOT NULL,
	"status" "app"."recommendation_status" DEFAULT 'propuesta' NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."recommendations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"nota_original" text NOT NULL,
	"audio_path" text,
	"realizada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"role" "app"."app_role" NOT NULL,
	"nombre_pila" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."audit_log" ADD CONSTRAINT "audit_log_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."engagements" ADD CONSTRAINT "engagements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."engagements" ADD CONSTRAINT "engagements_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."engagements" ADD CONSTRAINT "engagements_persona_id_users_id_fk" FOREIGN KEY ("persona_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."engagements" ADD CONSTRAINT "engagements_diagnostico_verificado_por_users_id_fk" FOREIGN KEY ("diagnostico_verificado_por") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."persona_profiles" ADD CONSTRAINT "persona_profiles_snapshot_id_profile_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "app"."profile_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."persona_profiles" ADD CONSTRAINT "persona_profiles_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plan_items" ADD CONSTRAINT "plan_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "app"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plan_items" ADD CONSTRAINT "plan_items_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plan_items" ADD CONSTRAINT "plan_items_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "app"."knowledge_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD CONSTRAINT "plans_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD CONSTRAINT "plans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."profile_events" ADD CONSTRAINT "profile_events_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."profile_events" ADD CONSTRAINT "profile_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "app"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."profile_events" ADD CONSTRAINT "profile_events_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."profile_events" ADD CONSTRAINT "profile_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."profile_snapshots" ADD CONSTRAINT "profile_snapshots_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."profile_snapshots" ADD CONSTRAINT "profile_snapshots_source_event_id_profile_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "app"."profile_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."profile_snapshots" ADD CONSTRAINT "profile_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."recommendations" ADD CONSTRAINT "recommendations_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."recommendations" ADD CONSTRAINT "recommendations_catalog_unit_id_catalog_units_id_fk" FOREIGN KEY ("catalog_unit_id") REFERENCES "app"."catalog_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."recommendations" ADD CONSTRAINT "recommendations_plan_item_id_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "app"."plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."recommendations" ADD CONSTRAINT "recommendations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sessions" ADD CONSTRAINT "sessions_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sessions" ADD CONSTRAINT "sessions_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."users" ADD CONSTRAINT "users_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "audit_log_insert_self" ON "app"."audit_log" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("app"."audit_log"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "audit_log_select_self" ON "app"."audit_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("app"."audit_log"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "catalog_units_select_all" ON "app"."catalog_units" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "engagements_select_participants" ON "app"."engagements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("app"."engagements"."coach_id" = (select auth.uid()) or "app"."engagements"."persona_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "knowledge_cards_select_all" ON "app"."knowledge_cards" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "organizations_select_own" ON "app"."organizations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("app"."organizations"."id" = (select private.app_org_id()));--> statement-breakpoint
CREATE POLICY "persona_profiles_select_participants" ON "app"."persona_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."persona_profiles"."engagement_id")) or (select private.app_is_persona_of("app"."persona_profiles"."engagement_id")));--> statement-breakpoint
CREATE POLICY "persona_profiles_insert_coach" ON "app"."persona_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."persona_profiles"."engagement_id")));--> statement-breakpoint
CREATE POLICY "plan_items_all_coach" ON "app"."plan_items" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select private.app_is_coach_of("app"."plan_items"."engagement_id"))) WITH CHECK ((select private.app_is_coach_of("app"."plan_items"."engagement_id")));--> statement-breakpoint
CREATE POLICY "plan_items_select_persona_approved" ON "app"."plan_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_persona_of("app"."plan_items"."engagement_id")) and exists (select 1 from app.plans p where p.id = "app"."plan_items"."plan_id" and p.status = 'aprobado'));--> statement-breakpoint
CREATE POLICY "plans_all_coach" ON "app"."plans" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select private.app_is_coach_of("app"."plans"."engagement_id"))) WITH CHECK ((select private.app_is_coach_of("app"."plans"."engagement_id")));--> statement-breakpoint
CREATE POLICY "plans_select_persona_approved" ON "app"."plans" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_persona_of("app"."plans"."engagement_id")) and "app"."plans"."status" = 'aprobado');--> statement-breakpoint
CREATE POLICY "profile_events_select_coach" ON "app"."profile_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."profile_events"."engagement_id")));--> statement-breakpoint
CREATE POLICY "profile_events_insert_coach" ON "app"."profile_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."profile_events"."engagement_id")) and "app"."profile_events"."created_by" = (select auth.uid()) and "app"."profile_events"."tipo" = 'propuesta_ia');--> statement-breakpoint
CREATE POLICY "profile_events_update_coach" ON "app"."profile_events" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select private.app_is_coach_of("app"."profile_events"."engagement_id"))) WITH CHECK ((select private.app_is_coach_of("app"."profile_events"."engagement_id")));--> statement-breakpoint
CREATE POLICY "profile_events_select_persona_own" ON "app"."profile_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_persona_of("app"."profile_events"."engagement_id")) and "app"."profile_events"."created_by" = (select auth.uid()) and "app"."profile_events"."tipo" = 'no_me_representa');--> statement-breakpoint
CREATE POLICY "profile_events_insert_persona_feedback" ON "app"."profile_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_persona_of("app"."profile_events"."engagement_id")) and "app"."profile_events"."created_by" = (select auth.uid()) and "app"."profile_events"."tipo" = 'no_me_representa' and "app"."profile_events"."status" = 'proposed');--> statement-breakpoint
CREATE POLICY "profile_snapshots_select_coach" ON "app"."profile_snapshots" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."profile_snapshots"."engagement_id")));--> statement-breakpoint
CREATE POLICY "profile_snapshots_insert_coach" ON "app"."profile_snapshots" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."profile_snapshots"."engagement_id")) and "app"."profile_snapshots"."created_by" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "recommendations_all_coach" ON "app"."recommendations" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select private.app_is_coach_of("app"."recommendations"."engagement_id"))) WITH CHECK ((select private.app_is_coach_of("app"."recommendations"."engagement_id")));--> statement-breakpoint
CREATE POLICY "recommendations_select_persona_approved" ON "app"."recommendations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_persona_of("app"."recommendations"."engagement_id")) and "app"."recommendations"."status" = 'aprobada');--> statement-breakpoint
CREATE POLICY "sessions_select_coach" ON "app"."sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."sessions"."engagement_id")));--> statement-breakpoint
CREATE POLICY "sessions_insert_coach" ON "app"."sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."sessions"."engagement_id")) and "app"."sessions"."coach_id" = (select auth.uid()) and (select private.app_has_consent("app"."sessions"."engagement_id")));--> statement-breakpoint
CREATE POLICY "users_select_self_or_org_coach" ON "app"."users" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("app"."users"."id" = (select auth.uid()) or ((select private.app_role()) = 'coach' and "app"."users"."org_id" = (select private.app_org_id())));