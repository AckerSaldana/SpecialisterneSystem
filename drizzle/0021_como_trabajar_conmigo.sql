-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
-- Spec 009 (R-009.14, R-009.34, R-009.51, R-009.56, R-009.63). Generado con npm run db:generate desde lib/db/schema.ts.
CREATE TYPE "app"."shared_guide_estado" AS ENUM('borrador', 'lista', 'retirada', 'descartada');--> statement-breakpoint
CREATE TABLE "app"."shared_guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"version" integer,
	"estado" "app"."shared_guide_estado" DEFAULT 'borrador' NOT NULL,
	"nombre_a_mostrar" text NOT NULL,
	"lineas" jsonb NOT NULL,
	"documento" jsonb,
	"descartes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generada_desde_snapshot_id" uuid NOT NULL,
	"perfil_version" integer NOT NULL,
	"plan_version" integer NOT NULL,
	"guia_base_id" uuid,
	"generada_por" uuid NOT NULL,
	"prompt_version" text,
	"model" text,
	"aprobada_por_persona_en" timestamp with time zone,
	"retirada_en" timestamp with time zone,
	"descartada_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_guides_engagement_version" UNIQUE("engagement_id","version"),
	CONSTRAINT "shared_guides_lista_completa" CHECK ("app"."shared_guides"."estado" <> 'lista' or ("app"."shared_guides"."version" is not null and "app"."shared_guides"."documento" is not null and "app"."shared_guides"."aprobada_por_persona_en" is not null))
);
--> statement-breakpoint
ALTER TABLE "app"."shared_guides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."shared_guides" ADD CONSTRAINT "shared_guides_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."shared_guides" ADD CONSTRAINT "shared_guides_generada_desde_snapshot_id_profile_snapshots_id_fk" FOREIGN KEY ("generada_desde_snapshot_id") REFERENCES "app"."profile_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."shared_guides" ADD CONSTRAINT "shared_guides_guia_base_id_shared_guides_id_fk" FOREIGN KEY ("guia_base_id") REFERENCES "app"."shared_guides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."shared_guides" ADD CONSTRAINT "shared_guides_generada_por_users_id_fk" FOREIGN KEY ("generada_por") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shared_guides_un_borrador" ON "app"."shared_guides" USING btree ("engagement_id") WHERE "app"."shared_guides"."estado" = 'borrador';--> statement-breakpoint
CREATE POLICY "shared_guides_select_persona" ON "app"."shared_guides" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_persona_of("app"."shared_guides"."engagement_id")) and (select private.app_has_consent("app"."shared_guides"."engagement_id")));--> statement-breakpoint
CREATE POLICY "shared_guides_select_coach" ON "app"."shared_guides" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."shared_guides"."engagement_id")) and (select private.app_has_consent("app"."shared_guides"."engagement_id")) and "app"."shared_guides"."estado" = 'lista');--> statement-breakpoint
CREATE POLICY "shared_guides_insert_persona" ON "app"."shared_guides" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_persona_of("app"."shared_guides"."engagement_id")) and "app"."shared_guides"."generada_por" = (select auth.uid()) and (select private.app_has_consent("app"."shared_guides"."engagement_id")) and "app"."shared_guides"."estado" = 'borrador' and "app"."shared_guides"."version" is null and "app"."shared_guides"."documento" is null and "app"."shared_guides"."aprobada_por_persona_en" is null and (select private.app_snapshot_del_acompanamiento("app"."shared_guides"."generada_desde_snapshot_id", "app"."shared_guides"."engagement_id")) and ("app"."shared_guides"."guia_base_id" is null or (select private.app_guia_del_acompanamiento("app"."shared_guides"."guia_base_id", "app"."shared_guides"."engagement_id"))));--> statement-breakpoint
CREATE POLICY "shared_guides_insert_coach" ON "app"."shared_guides" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."shared_guides"."engagement_id")) and "app"."shared_guides"."generada_por" = (select auth.uid()) and (select private.app_has_consent("app"."shared_guides"."engagement_id")) and "app"."shared_guides"."estado" = 'borrador' and "app"."shared_guides"."version" is null and "app"."shared_guides"."documento" is null and "app"."shared_guides"."aprobada_por_persona_en" is null and (select private.app_snapshot_del_acompanamiento("app"."shared_guides"."generada_desde_snapshot_id", "app"."shared_guides"."engagement_id")) and "app"."shared_guides"."guia_base_id" is null);--> statement-breakpoint
CREATE POLICY "shared_guides_update_persona" ON "app"."shared_guides" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select private.app_is_persona_of("app"."shared_guides"."engagement_id")) and (select private.app_has_consent("app"."shared_guides"."engagement_id"))) WITH CHECK ((select private.app_is_persona_of("app"."shared_guides"."engagement_id")) and (select private.app_has_consent("app"."shared_guides"."engagement_id")));