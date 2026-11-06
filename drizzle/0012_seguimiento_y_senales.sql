-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
CREATE TYPE "app"."alert_status" AS ENUM('abierta', 'escalada', 'atendida');--> statement-breakpoint
CREATE TYPE "app"."followup_context_tipo" AS ENUM('pregunta', 'contexto', 'siguiente_paso');--> statement-breakpoint
CREATE TYPE "app"."plan_item_estado" AS ENUM('avanza', 'sin_cambios', 'necesita_ajuste', 'cumplido');--> statement-breakpoint
CREATE TYPE "app"."session_type" AS ENUM('persona', 'red_de_apoyo');--> statement-breakpoint
CREATE TYPE "app"."signal_status" AS ENUM('activa', 'cerrada');--> statement-breakpoint
CREATE TYPE "app"."signal_type" AS ENUM('estres_desregulacion', 'intencion_de_renunciar', 'cambio_de_vida', 'desajuste_con_rol');--> statement-breakpoint
CREATE TABLE "app"."followup_context" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tipo" "app"."followup_context_tipo" NOT NULL,
	"texto" text NOT NULL,
	"evidencia" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plan_item_id" uuid,
	"knowledge_card_id" text,
	"session_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quitada_por" uuid,
	"quitada_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."followup_context" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."plan_item_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"plan_item_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"estado" "app"."plan_item_estado" NOT NULL,
	"resumen" text NOT NULL,
	"evidencia" jsonb NOT NULL,
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_item_updates_evento_item" UNIQUE("event_id","plan_item_id")
);
--> statement-breakpoint
ALTER TABLE "app"."plan_item_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."signal_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tipo" "app"."signal_type" NOT NULL,
	"estado" "app"."signal_status" NOT NULL,
	"motivo" text,
	"event_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."signal_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."strong_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tipo_senal" "app"."signal_type" NOT NULL,
	"event_id" uuid NOT NULL,
	"marcada_por" uuid NOT NULL,
	"marcada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nota" text,
	"estado" "app"."alert_status" DEFAULT 'abierta' NOT NULL,
	"nota_escalada" text,
	"escalada_en" timestamp with time zone,
	"atendida_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."strong_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."profile_events" ADD COLUMN "perfil_version_base" integer;--> statement-breakpoint
ALTER TABLE "app"."profile_events" ADD COLUMN "plan_base_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."sessions" ADD COLUMN "tipo" "app"."session_type" DEFAULT 'persona' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."followup_context" ADD CONSTRAINT "followup_context_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."followup_context" ADD CONSTRAINT "followup_context_plan_item_id_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "app"."plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."followup_context" ADD CONSTRAINT "followup_context_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "app"."knowledge_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."followup_context" ADD CONSTRAINT "followup_context_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "app"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."followup_context" ADD CONSTRAINT "followup_context_event_id_profile_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."profile_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."followup_context" ADD CONSTRAINT "followup_context_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."followup_context" ADD CONSTRAINT "followup_context_quitada_por_users_id_fk" FOREIGN KEY ("quitada_por") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plan_item_updates" ADD CONSTRAINT "plan_item_updates_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plan_item_updates" ADD CONSTRAINT "plan_item_updates_plan_item_id_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "app"."plan_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plan_item_updates" ADD CONSTRAINT "plan_item_updates_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "app"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plan_item_updates" ADD CONSTRAINT "plan_item_updates_event_id_profile_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."profile_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plan_item_updates" ADD CONSTRAINT "plan_item_updates_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."signal_states" ADD CONSTRAINT "signal_states_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."signal_states" ADD CONSTRAINT "signal_states_event_id_profile_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."profile_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."signal_states" ADD CONSTRAINT "signal_states_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."strong_alerts" ADD CONSTRAINT "strong_alerts_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."strong_alerts" ADD CONSTRAINT "strong_alerts_event_id_profile_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."profile_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."strong_alerts" ADD CONSTRAINT "strong_alerts_marcada_por_users_id_fk" FOREIGN KEY ("marcada_por") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "strong_alerts_una_vigente" ON "app"."strong_alerts" USING btree ("engagement_id","tipo_senal") WHERE "app"."strong_alerts"."estado" <> 'atendida';--> statement-breakpoint
ALTER TABLE "app"."profile_events" ADD CONSTRAINT "profile_events_plan_base_id_plans_id_fk" FOREIGN KEY ("plan_base_id") REFERENCES "app"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_events_una_propuesta" ON "app"."profile_events" USING btree ("session_id") WHERE "app"."profile_events"."tipo" = 'propuesta_ia';--> statement-breakpoint
CREATE POLICY "followup_context_select_coach" ON "app"."followup_context" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."followup_context"."engagement_id")) and (select private.app_has_consent("app"."followup_context"."engagement_id")));--> statement-breakpoint
CREATE POLICY "followup_context_insert_coach" ON "app"."followup_context" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."followup_context"."engagement_id")) and "app"."followup_context"."approved_by" = (select auth.uid()) and (select private.app_has_consent("app"."followup_context"."engagement_id")) and "app"."followup_context"."quitada_por" is null and "app"."followup_context"."quitada_en" is null and (select private.app_evento_de_sesion("app"."followup_context"."event_id", "app"."followup_context"."session_id", "app"."followup_context"."engagement_id")) and ("app"."followup_context"."plan_item_id" is null or (select private.app_item_del_acompanamiento("app"."followup_context"."plan_item_id", "app"."followup_context"."engagement_id"))));--> statement-breakpoint
CREATE POLICY "followup_context_update_coach" ON "app"."followup_context" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select private.app_is_coach_of("app"."followup_context"."engagement_id")) and (select private.app_has_consent("app"."followup_context"."engagement_id")) and "app"."followup_context"."quitada_en" is null) WITH CHECK ((select private.app_is_coach_of("app"."followup_context"."engagement_id")) and (select private.app_has_consent("app"."followup_context"."engagement_id")) and "app"."followup_context"."quitada_por" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "plan_item_updates_select_coach" ON "app"."plan_item_updates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."plan_item_updates"."engagement_id")) and (select private.app_has_consent("app"."plan_item_updates"."engagement_id")));--> statement-breakpoint
CREATE POLICY "plan_item_updates_insert_coach" ON "app"."plan_item_updates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."plan_item_updates"."engagement_id")) and "app"."plan_item_updates"."approved_by" = (select auth.uid()) and (select private.app_has_consent("app"."plan_item_updates"."engagement_id")) and (select private.app_evento_de_sesion("app"."plan_item_updates"."event_id", "app"."plan_item_updates"."session_id", "app"."plan_item_updates"."engagement_id")) and (select private.app_item_del_acompanamiento("app"."plan_item_updates"."plan_item_id", "app"."plan_item_updates"."engagement_id")));--> statement-breakpoint
CREATE POLICY "signal_states_select_coach" ON "app"."signal_states" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."signal_states"."engagement_id")) and (select private.app_has_consent("app"."signal_states"."engagement_id")));--> statement-breakpoint
CREATE POLICY "signal_states_insert_coach" ON "app"."signal_states" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."signal_states"."engagement_id")) and "app"."signal_states"."created_by" = (select auth.uid()) and (select private.app_has_consent("app"."signal_states"."engagement_id")));--> statement-breakpoint
CREATE POLICY "strong_alerts_select_coach" ON "app"."strong_alerts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."strong_alerts"."engagement_id")) and (select private.app_has_consent("app"."strong_alerts"."engagement_id")));--> statement-breakpoint
CREATE POLICY "strong_alerts_insert_coach" ON "app"."strong_alerts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."strong_alerts"."engagement_id")) and "app"."strong_alerts"."marcada_por" = (select auth.uid()) and (select private.app_has_consent("app"."strong_alerts"."engagement_id")) and "app"."strong_alerts"."estado" = 'abierta');--> statement-breakpoint
CREATE POLICY "strong_alerts_update_coach" ON "app"."strong_alerts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select private.app_is_coach_of("app"."strong_alerts"."engagement_id")) and (select private.app_has_consent("app"."strong_alerts"."engagement_id"))) WITH CHECK ((select private.app_is_coach_of("app"."strong_alerts"."engagement_id")) and (select private.app_has_consent("app"."strong_alerts"."engagement_id")));