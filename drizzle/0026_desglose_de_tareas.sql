-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
-- Spec 010 (R-010.26, R-010.27, R-010.33, R-010.41, R-010.45, R-010.51; decisión abierta 5, opción B). Generado con npm run db:generate desde lib/db/schema.ts.
CREATE TYPE "app"."task_step_estado" AS ENUM('hecho', 'atorado', 'pendiente');--> statement-breakpoint
CREATE TABLE "app"."task_breakdowns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tarea_original" text NOT NULL,
	"contexto" jsonb,
	"pasos" jsonb NOT NULL,
	"generado_desde" uuid NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"plantilla_id" uuid,
	"origen_breakdown_id" uuid,
	"ajustes" jsonb,
	"ajustes_aceptados" jsonb,
	"ajustes_decididos_en" timestamp with time zone,
	"descartados" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"creado_por" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_por" uuid,
	"archivado_en" timestamp with time zone,
	CONSTRAINT "task_breakdowns_ajustes_no_vacio" CHECK ("app"."task_breakdowns"."ajustes" is null or jsonb_array_length("app"."task_breakdowns"."ajustes") > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."task_breakdowns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."task_step_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"engagement_id" uuid NOT NULL,
	"breakdown_id" uuid NOT NULL,
	"paso_id" uuid NOT NULL,
	"estado" "app"."task_step_estado" NOT NULL,
	"texto" text,
	"creado_por" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revisado_por" uuid,
	"revisado_en" timestamp with time zone,
	CONSTRAINT "task_step_events_texto" CHECK (("app"."task_step_events"."texto" is null or "app"."task_step_events"."estado" = 'atorado') and ("app"."task_step_events"."texto" is null or char_length("app"."task_step_events"."texto") <= 1000))
);
--> statement-breakpoint
ALTER TABLE "app"."task_step_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"origen_engagement_id" uuid NOT NULL,
	"puesto" text NOT NULL,
	"titulo" text NOT NULL,
	"tarea" text NOT NULL,
	"pasos" jsonb NOT NULL,
	"creada_por" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archivada_por" uuid,
	"archivada_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."task_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."task_breakdowns" ADD CONSTRAINT "task_breakdowns_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_breakdowns" ADD CONSTRAINT "task_breakdowns_generado_desde_profile_snapshots_id_fk" FOREIGN KEY ("generado_desde") REFERENCES "app"."profile_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_breakdowns" ADD CONSTRAINT "task_breakdowns_plantilla_id_task_templates_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "app"."task_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_breakdowns" ADD CONSTRAINT "task_breakdowns_origen_breakdown_id_task_breakdowns_id_fk" FOREIGN KEY ("origen_breakdown_id") REFERENCES "app"."task_breakdowns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_breakdowns" ADD CONSTRAINT "task_breakdowns_creado_por_users_id_fk" FOREIGN KEY ("creado_por") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_breakdowns" ADD CONSTRAINT "task_breakdowns_archivado_por_users_id_fk" FOREIGN KEY ("archivado_por") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_step_events" ADD CONSTRAINT "task_step_events_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_step_events" ADD CONSTRAINT "task_step_events_breakdown_id_task_breakdowns_id_fk" FOREIGN KEY ("breakdown_id") REFERENCES "app"."task_breakdowns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_step_events" ADD CONSTRAINT "task_step_events_creado_por_users_id_fk" FOREIGN KEY ("creado_por") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_step_events" ADD CONSTRAINT "task_step_events_revisado_por_users_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_templates" ADD CONSTRAINT "task_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_templates" ADD CONSTRAINT "task_templates_origen_engagement_id_engagements_id_fk" FOREIGN KEY ("origen_engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_templates" ADD CONSTRAINT "task_templates_creada_por_users_id_fk" FOREIGN KEY ("creada_por") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_templates" ADD CONSTRAINT "task_templates_archivada_por_users_id_fk" FOREIGN KEY ("archivada_por") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_step_events_engagement_estado_revisado_idx" ON "app"."task_step_events" USING btree ("engagement_id","estado","revisado_en");--> statement-breakpoint
CREATE INDEX "task_step_events_breakdown_paso_id_idx" ON "app"."task_step_events" USING btree ("breakdown_id","paso_id","id");--> statement-breakpoint
CREATE POLICY "task_breakdowns_select_participants" ON "app"."task_breakdowns" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((select private.app_is_coach_of("app"."task_breakdowns"."engagement_id")) or (select private.app_is_persona_of("app"."task_breakdowns"."engagement_id"))) and (select private.app_has_consent("app"."task_breakdowns"."engagement_id")));--> statement-breakpoint
CREATE POLICY "task_breakdowns_insert_participants" ON "app"."task_breakdowns" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((select private.app_is_coach_of("app"."task_breakdowns"."engagement_id")) or (select private.app_is_persona_of("app"."task_breakdowns"."engagement_id"))) and "app"."task_breakdowns"."creado_por" = (select auth.uid()) and (select private.app_has_consent("app"."task_breakdowns"."engagement_id")) and (select private.app_snapshot_del_acompanamiento("app"."task_breakdowns"."generado_desde", "app"."task_breakdowns"."engagement_id")) and "app"."task_breakdowns"."ajustes_decididos_en" is null and "app"."task_breakdowns"."archivado_en" is null and "app"."task_breakdowns"."archivado_por" is null and ("app"."task_breakdowns"."plantilla_id" is null or ((select private.app_is_coach_of("app"."task_breakdowns"."engagement_id")) and (select private.app_plantilla_de_mi_org("app"."task_breakdowns"."plantilla_id")))) and ("app"."task_breakdowns"."origen_breakdown_id" is null or ((select private.app_is_persona_of("app"."task_breakdowns"."engagement_id")) and (select private.app_desglose_del_acompanamiento("app"."task_breakdowns"."origen_breakdown_id", "app"."task_breakdowns"."engagement_id")))));--> statement-breakpoint
CREATE POLICY "task_breakdowns_update_archivar" ON "app"."task_breakdowns" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((select private.app_is_coach_of("app"."task_breakdowns"."engagement_id")) or (select private.app_is_persona_of("app"."task_breakdowns"."engagement_id"))) and (select private.app_has_consent("app"."task_breakdowns"."engagement_id")) and "app"."task_breakdowns"."archivado_en" is null) WITH CHECK (((select private.app_is_coach_of("app"."task_breakdowns"."engagement_id")) or (select private.app_is_persona_of("app"."task_breakdowns"."engagement_id"))) and (select private.app_has_consent("app"."task_breakdowns"."engagement_id")) and "app"."task_breakdowns"."archivado_por" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "task_step_events_select_participants" ON "app"."task_step_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((select private.app_is_coach_of("app"."task_step_events"."engagement_id")) or (select private.app_is_persona_of("app"."task_step_events"."engagement_id"))) and (select private.app_has_consent("app"."task_step_events"."engagement_id")));--> statement-breakpoint
CREATE POLICY "task_step_events_insert_persona" ON "app"."task_step_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_persona_of("app"."task_step_events"."engagement_id")) and "app"."task_step_events"."creado_por" = (select auth.uid()) and (select private.app_has_consent("app"."task_step_events"."engagement_id")) and "app"."task_step_events"."revisado_por" is null and "app"."task_step_events"."revisado_en" is null and (select private.app_paso_marcable("app"."task_step_events"."breakdown_id", "app"."task_step_events"."paso_id", "app"."task_step_events"."engagement_id")));--> statement-breakpoint
CREATE POLICY "task_step_events_update_coach" ON "app"."task_step_events" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select private.app_is_coach_of("app"."task_step_events"."engagement_id")) and (select private.app_has_consent("app"."task_step_events"."engagement_id")) and "app"."task_step_events"."estado" = 'atorado' and "app"."task_step_events"."revisado_en" is null) WITH CHECK ((select private.app_is_coach_of("app"."task_step_events"."engagement_id")) and (select private.app_has_consent("app"."task_step_events"."engagement_id")) and "app"."task_step_events"."revisado_por" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "task_templates_select_coach" ON "app"."task_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_role()) = 'coach' and "app"."task_templates"."org_id" = (select private.app_org_id()) and (select private.app_has_consent("app"."task_templates"."origen_engagement_id")));--> statement-breakpoint
CREATE POLICY "task_templates_insert_coach" ON "app"."task_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_role()) = 'coach' and "app"."task_templates"."org_id" = (select private.app_org_id()) and "app"."task_templates"."creada_por" = (select auth.uid()) and "app"."task_templates"."archivada_en" is null and "app"."task_templates"."archivada_por" is null and (select private.app_is_coach_of("app"."task_templates"."origen_engagement_id")) and (select private.app_has_consent("app"."task_templates"."origen_engagement_id")));--> statement-breakpoint
CREATE POLICY "task_templates_update_coach" ON "app"."task_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select private.app_role()) = 'coach' and "app"."task_templates"."org_id" = (select private.app_org_id()) and "app"."task_templates"."archivada_en" is null and (select private.app_has_consent("app"."task_templates"."origen_engagement_id"))) WITH CHECK ((select private.app_role()) = 'coach' and "app"."task_templates"."org_id" = (select private.app_org_id()) and "app"."task_templates"."archivada_por" = (select auth.uid()) and (select private.app_has_consent("app"."task_templates"."origen_engagement_id")));