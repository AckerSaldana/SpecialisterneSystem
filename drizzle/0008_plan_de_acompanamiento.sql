-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
-- Generado por drizzle-kit desde lib/db/schema.ts (spec 003).
CREATE TYPE "app"."plan_item_origen" AS ENUM('ia', 'ia_editado', 'coach');--> statement-breakpoint
ALTER TYPE "app"."plan_item_type" ADD VALUE 'objetivo_equipo';--> statement-breakpoint
ALTER TYPE "app"."plan_item_type" ADD VALUE 'ajuste_razonable';--> statement-breakpoint
ALTER TYPE "app"."plan_status" ADD VALUE 'descartado';--> statement-breakpoint
CREATE TABLE "app"."persona_plans" (
	"plan_id" uuid PRIMARY KEY NOT NULL,
	"engagement_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"contenido" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."persona_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."plan_items" ADD COLUMN "texto_persona" text;--> statement-breakpoint
ALTER TABLE "app"."plan_items" ADD COLUMN "origen" "app"."plan_item_origen" DEFAULT 'ia' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."plan_items" ADD COLUMN "propuesta_ref" integer;--> statement-breakpoint
ALTER TABLE "app"."plan_items" ADD COLUMN "origen_item_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."plan_items" ADD COLUMN "editado_por" uuid;--> statement-breakpoint
ALTER TABLE "app"."plan_items" ADD COLUMN "editado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD COLUMN "profile_snapshot_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD COLUMN "version" integer;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD COLUMN "propuesta_ia" jsonb;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD COLUMN "created_by" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."persona_plans" ADD CONSTRAINT "persona_plans_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "app"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."persona_plans" ADD CONSTRAINT "persona_plans_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plan_items" ADD CONSTRAINT "plan_items_origen_item_id_plan_items_id_fk" FOREIGN KEY ("origen_item_id") REFERENCES "app"."plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plan_items" ADD CONSTRAINT "plan_items_editado_por_users_id_fk" FOREIGN KEY ("editado_por") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD CONSTRAINT "plans_profile_snapshot_id_profile_snapshots_id_fk" FOREIGN KEY ("profile_snapshot_id") REFERENCES "app"."profile_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plans" ADD CONSTRAINT "plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_items_origen_unico" ON "app"."plan_items" USING btree ("plan_id","origen_item_id") WHERE "app"."plan_items"."origen_item_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "plans_un_borrador" ON "app"."plans" USING btree ("engagement_id") WHERE "app"."plans"."status" = 'borrador';--> statement-breakpoint
ALTER TABLE "app"."plans" ADD CONSTRAINT "plans_engagement_version" UNIQUE("engagement_id","version");--> statement-breakpoint
CREATE POLICY "knowledge_cards_select_coach" ON "app"."knowledge_cards" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_role()) = 'coach');--> statement-breakpoint
CREATE POLICY "plan_items_select_coach" ON "app"."plan_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."plan_items"."engagement_id")) and (select private.app_has_consent("app"."plan_items"."engagement_id")));--> statement-breakpoint
CREATE POLICY "plan_items_insert_coach_borrador" ON "app"."plan_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."plan_items"."engagement_id")) and (select private.app_has_consent("app"."plan_items"."engagement_id")) and (select private.app_plan_en_borrador("app"."plan_items"."plan_id", "app"."plan_items"."engagement_id")));--> statement-breakpoint
CREATE POLICY "plan_items_update_coach_borrador" ON "app"."plan_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select private.app_is_coach_of("app"."plan_items"."engagement_id")) and (select private.app_has_consent("app"."plan_items"."engagement_id")) and (select private.app_plan_en_borrador("app"."plan_items"."plan_id", "app"."plan_items"."engagement_id"))) WITH CHECK ((select private.app_is_coach_of("app"."plan_items"."engagement_id")) and (select private.app_has_consent("app"."plan_items"."engagement_id")) and (select private.app_plan_en_borrador("app"."plan_items"."plan_id", "app"."plan_items"."engagement_id")));--> statement-breakpoint
CREATE POLICY "plan_items_delete_coach_borrador" ON "app"."plan_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select private.app_is_coach_of("app"."plan_items"."engagement_id")) and (select private.app_has_consent("app"."plan_items"."engagement_id")) and (select private.app_plan_en_borrador("app"."plan_items"."plan_id", "app"."plan_items"."engagement_id")));--> statement-breakpoint
CREATE POLICY "plans_select_coach" ON "app"."plans" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."plans"."engagement_id")) and (select private.app_has_consent("app"."plans"."engagement_id")));--> statement-breakpoint
CREATE POLICY "plans_insert_coach" ON "app"."plans" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."plans"."engagement_id")) and "app"."plans"."created_by" = (select auth.uid()) and "app"."plans"."status" = 'borrador' and "app"."plans"."version" is null and (select private.app_has_consent("app"."plans"."engagement_id")));--> statement-breakpoint
CREATE POLICY "plans_update_coach_borrador" ON "app"."plans" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select private.app_is_coach_of("app"."plans"."engagement_id")) and "app"."plans"."status" = 'borrador' and (select private.app_has_consent("app"."plans"."engagement_id"))) WITH CHECK ((select private.app_is_coach_of("app"."plans"."engagement_id")) and (select private.app_has_consent("app"."plans"."engagement_id")));--> statement-breakpoint
CREATE POLICY "persona_plans_select_participants" ON "app"."persona_plans" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((select private.app_is_coach_of("app"."persona_plans"."engagement_id")) or (select private.app_is_persona_of("app"."persona_plans"."engagement_id"))) and (select private.app_has_consent("app"."persona_plans"."engagement_id")));--> statement-breakpoint
CREATE POLICY "persona_plans_insert_coach" ON "app"."persona_plans" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."persona_plans"."engagement_id")) and (select private.app_has_consent("app"."persona_plans"."engagement_id")) and (select private.app_plan_aprobado("app"."persona_plans"."plan_id", "app"."persona_plans"."engagement_id")));