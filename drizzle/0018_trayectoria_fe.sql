-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
-- Spec 008 (R-008.28, R-008.29, R-008.37, R-008.40, R-008.42). Generado con npm run db:generate desde lib/db/schema.ts.
CREATE TYPE "app"."fe_direccion" AS ENUM('apoyo', 'fortaleza', 'cambio');--> statement-breakpoint
CREATE TYPE "app"."fe_dominio" AS ENUM('inhibicion', 'automonitoreo', 'flexibilidad', 'control_emocional', 'iniciacion', 'memoria_de_trabajo', 'planeacion_organizacion', 'monitoreo_de_tareas', 'organizacion_de_materiales');--> statement-breakpoint
CREATE TYPE "app"."fe_resumen_estado" AS ENUM('propuesto', 'aprobado', 'descartado');--> statement-breakpoint
CREATE TABLE "app"."fe_corrections" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"engagement_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"linea_id" text NOT NULL,
	"dominio" "app"."fe_dominio",
	"direccion" "app"."fe_direccion",
	"anterior_linea_id" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fe_corrections_linea_del_evento" CHECK (left("app"."fe_corrections"."linea_id", 36) = "app"."fe_corrections"."event_id"::text),
	CONSTRAINT "fe_corrections_sin_dominio" CHECK ("app"."fe_corrections"."dominio" is not null or "app"."fe_corrections"."direccion" is null),
	CONSTRAINT "fe_corrections_anterior" CHECK (coalesce("app"."fe_corrections"."direccion" = 'cambio', false) = ("app"."fe_corrections"."anterior_linea_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "app"."fe_corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."fe_domain_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"dominio" "app"."fe_dominio" NOT NULL,
	"texto" text NOT NULL,
	"linea_ids" jsonb NOT NULL,
	"bloque_ids" jsonb NOT NULL,
	"estado" "app"."fe_resumen_estado" DEFAULT 'propuesto' NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."fe_domain_summaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."fe_corrections" ADD CONSTRAINT "fe_corrections_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fe_corrections" ADD CONSTRAINT "fe_corrections_event_id_profile_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."profile_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fe_corrections" ADD CONSTRAINT "fe_corrections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fe_domain_summaries" ADD CONSTRAINT "fe_domain_summaries_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fe_domain_summaries" ADD CONSTRAINT "fe_domain_summaries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fe_domain_summaries" ADD CONSTRAINT "fe_domain_summaries_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fe_corrections_engagement_linea_id_idx" ON "app"."fe_corrections" USING btree ("engagement_id","linea_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "fe_domain_summaries_una_propuesta" ON "app"."fe_domain_summaries" USING btree ("engagement_id","dominio") WHERE "app"."fe_domain_summaries"."estado" = 'propuesto';--> statement-breakpoint
CREATE POLICY "fe_corrections_select_coach" ON "app"."fe_corrections" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."fe_corrections"."engagement_id")) and (select private.app_has_consent("app"."fe_corrections"."engagement_id")));--> statement-breakpoint
CREATE POLICY "fe_corrections_insert_coach" ON "app"."fe_corrections" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."fe_corrections"."engagement_id")) and (select private.app_has_consent("app"."fe_corrections"."engagement_id")) and "app"."fe_corrections"."created_by" = (select auth.uid()) and (select private.app_evento_aprobado("app"."fe_corrections"."event_id", "app"."fe_corrections"."engagement_id")));--> statement-breakpoint
CREATE POLICY "fe_domain_summaries_select_coach" ON "app"."fe_domain_summaries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."fe_domain_summaries"."engagement_id")) and (select private.app_has_consent("app"."fe_domain_summaries"."engagement_id")));--> statement-breakpoint
CREATE POLICY "fe_domain_summaries_insert_coach" ON "app"."fe_domain_summaries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."fe_domain_summaries"."engagement_id")) and (select private.app_has_consent("app"."fe_domain_summaries"."engagement_id")) and "app"."fe_domain_summaries"."created_by" = (select auth.uid()) and "app"."fe_domain_summaries"."estado" = 'propuesto' and "app"."fe_domain_summaries"."decided_by" is null);--> statement-breakpoint
CREATE POLICY "fe_domain_summaries_update_coach" ON "app"."fe_domain_summaries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select private.app_is_coach_of("app"."fe_domain_summaries"."engagement_id")) and (select private.app_has_consent("app"."fe_domain_summaries"."engagement_id")) and "app"."fe_domain_summaries"."estado" = 'propuesto') WITH CHECK ((select private.app_is_coach_of("app"."fe_domain_summaries"."engagement_id")) and (select private.app_has_consent("app"."fe_domain_summaries"."engagement_id")) and "app"."fe_domain_summaries"."estado" in ('aprobado', 'descartado') and "app"."fe_domain_summaries"."decided_by" = (select auth.uid()));