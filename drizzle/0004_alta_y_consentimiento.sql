-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
-- Generado por drizzle-kit desde lib/db/schema.ts (spec 002). Editado a mano: conversión de consentimiento_en antes del drop.
CREATE TYPE "app"."consent_event_type" AS ENUM('otorgado', 'retirado');--> statement-breakpoint
CREATE TABLE "app"."consent_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"engagement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tipo" "app"."consent_event_type" NOT NULL,
	"version_aviso" text NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."consent_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"creada_por" uuid NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"usada_en" timestamp with time zone,
	"reemplazada_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."consent_events" ADD CONSTRAINT "consent_events_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."consent_events" ADD CONSTRAINT "consent_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "app"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_persona_id_users_id_fk" FOREIGN KEY ("persona_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_creada_por_users_id_fk" FOREIGN KEY ("creada_por") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- R-002.33 (editado a mano): cada consentimiento_en no nulo pasa a un evento "otorgado" antes de borrar la columna.
INSERT INTO "app"."consent_events" ("engagement_id", "user_id", "tipo", "version_aviso", "fecha") SELECT "id", "persona_id", 'otorgado', 'sin-aviso-sprint-1', "consentimiento_en" FROM "app"."engagements" WHERE "consentimiento_en" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."engagements" DROP COLUMN "consentimiento_en";--> statement-breakpoint
ALTER TABLE "app"."engagements" ADD CONSTRAINT "engagements_persona_unica" UNIQUE("persona_id");--> statement-breakpoint
ALTER TABLE "app"."engagements" ADD CONSTRAINT "engagements_verificacion_completa" CHECK (not "app"."engagements"."diagnostico_verificado" or ("app"."engagements"."cedula_profesional" is not null and "app"."engagements"."diagnostico_verificado_por" is not null and "app"."engagements"."diagnostico_verificado_en" is not null));--> statement-breakpoint
CREATE POLICY "engagements_select_coach" ON "app"."engagements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("app"."engagements"."coach_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "engagements_insert_coach" ON "app"."engagements" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_role()) = 'coach' and "app"."engagements"."coach_id" = (select auth.uid()) and "app"."engagements"."org_id" = (select private.app_org_id()) and "app"."engagements"."stage" = 'alta' and not "app"."engagements"."diagnostico_verificado" and exists (select 1 from app.users u where u.id = "app"."engagements"."persona_id" and u.role = 'persona' and u.org_id = (select private.app_org_id())));--> statement-breakpoint
CREATE POLICY "engagements_update_coach_alta" ON "app"."engagements" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("app"."engagements"."coach_id" = (select auth.uid()) and "app"."engagements"."stage" = 'alta') WITH CHECK ("app"."engagements"."coach_id" = (select auth.uid()) and "app"."engagements"."stage" = 'alta');--> statement-breakpoint
CREATE POLICY "users_insert_coach_persona" ON "app"."users" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_role()) = 'coach' and "app"."users"."org_id" = (select private.app_org_id()) and "app"."users"."role" = 'persona');--> statement-breakpoint
CREATE POLICY "consent_events_select_participants" ON "app"."consent_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."consent_events"."engagement_id")) or ((select private.app_is_persona_of("app"."consent_events"."engagement_id")) and "app"."consent_events"."user_id" = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "consent_events_insert_persona" ON "app"."consent_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_persona_of("app"."consent_events"."engagement_id")) and "app"."consent_events"."user_id" = (select auth.uid()) and ("app"."consent_events"."tipo" = 'retirado' or (select private.app_alta_verificada("app"."consent_events"."engagement_id"))));--> statement-breakpoint
CREATE POLICY "invitations_select_participants" ON "app"."invitations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select private.app_is_coach_of("app"."invitations"."engagement_id")) or "app"."invitations"."persona_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "invitations_insert_coach" ON "app"."invitations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select private.app_is_coach_of("app"."invitations"."engagement_id")) and "app"."invitations"."creada_por" = (select auth.uid()) and "app"."invitations"."expira_en" > now() and "app"."invitations"."persona_id" = (select e.persona_id from app.engagements e where e.id = "app"."invitations"."engagement_id") and not (select private.app_invitacion_usada("app"."invitations"."engagement_id")));--> statement-breakpoint
CREATE POLICY "invitations_update_coach" ON "app"."invitations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select private.app_is_coach_of("app"."invitations"."engagement_id")) and "app"."invitations"."usada_en" is null and "app"."invitations"."reemplazada_en" is null) WITH CHECK ((select private.app_is_coach_of("app"."invitations"."engagement_id")) and "app"."invitations"."usada_en" is null);--> statement-breakpoint
CREATE POLICY "invitations_update_persona" ON "app"."invitations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("app"."invitations"."persona_id" = (select auth.uid()) and "app"."invitations"."usada_en" is null and "app"."invitations"."reemplazada_en" is null and "app"."invitations"."expira_en" > now()) WITH CHECK ("app"."invitations"."persona_id" = (select auth.uid()) and "app"."invitations"."reemplazada_en" is null);--> statement-breakpoint
ALTER POLICY "persona_profiles_select_participants" ON "app"."persona_profiles" TO authenticated USING (((select private.app_is_coach_of("app"."persona_profiles"."engagement_id")) or (select private.app_is_persona_of("app"."persona_profiles"."engagement_id"))) and (select private.app_has_consent("app"."persona_profiles"."engagement_id")));--> statement-breakpoint
ALTER POLICY "persona_profiles_insert_coach" ON "app"."persona_profiles" TO authenticated WITH CHECK ((select private.app_is_coach_of("app"."persona_profiles"."engagement_id")) and (select private.app_has_consent("app"."persona_profiles"."engagement_id")));--> statement-breakpoint
ALTER POLICY "profile_events_select_coach" ON "app"."profile_events" TO authenticated USING ((select private.app_is_coach_of("app"."profile_events"."engagement_id")) and (select private.app_has_consent("app"."profile_events"."engagement_id")));--> statement-breakpoint
ALTER POLICY "profile_events_insert_coach" ON "app"."profile_events" TO authenticated WITH CHECK ((select private.app_is_coach_of("app"."profile_events"."engagement_id")) and "app"."profile_events"."created_by" = (select auth.uid()) and "app"."profile_events"."tipo" = 'propuesta_ia' and (select private.app_has_consent("app"."profile_events"."engagement_id")));--> statement-breakpoint
ALTER POLICY "profile_events_update_coach" ON "app"."profile_events" TO authenticated USING ((select private.app_is_coach_of("app"."profile_events"."engagement_id")) and (select private.app_has_consent("app"."profile_events"."engagement_id"))) WITH CHECK ((select private.app_is_coach_of("app"."profile_events"."engagement_id")) and (select private.app_has_consent("app"."profile_events"."engagement_id")));--> statement-breakpoint
ALTER POLICY "profile_events_select_persona_own" ON "app"."profile_events" TO authenticated USING ((select private.app_is_persona_of("app"."profile_events"."engagement_id")) and "app"."profile_events"."created_by" = (select auth.uid()) and "app"."profile_events"."tipo" = 'no_me_representa' and (select private.app_has_consent("app"."profile_events"."engagement_id")));--> statement-breakpoint
ALTER POLICY "profile_snapshots_select_coach" ON "app"."profile_snapshots" TO authenticated USING ((select private.app_is_coach_of("app"."profile_snapshots"."engagement_id")) and (select private.app_has_consent("app"."profile_snapshots"."engagement_id")));--> statement-breakpoint
ALTER POLICY "profile_snapshots_insert_coach" ON "app"."profile_snapshots" TO authenticated WITH CHECK ((select private.app_is_coach_of("app"."profile_snapshots"."engagement_id")) and "app"."profile_snapshots"."created_by" = (select auth.uid()) and (select private.app_has_consent("app"."profile_snapshots"."engagement_id")));--> statement-breakpoint
ALTER POLICY "recommendations_all_coach" ON "app"."recommendations" TO authenticated USING ((select private.app_is_coach_of("app"."recommendations"."engagement_id")) and (select private.app_has_consent("app"."recommendations"."engagement_id"))) WITH CHECK ((select private.app_is_coach_of("app"."recommendations"."engagement_id")) and (select private.app_has_consent("app"."recommendations"."engagement_id")));--> statement-breakpoint
ALTER POLICY "recommendations_select_persona_approved" ON "app"."recommendations" TO authenticated USING ((select private.app_is_persona_of("app"."recommendations"."engagement_id")) and "app"."recommendations"."status" = 'aprobada' and (select private.app_has_consent("app"."recommendations"."engagement_id")));--> statement-breakpoint
ALTER POLICY "sessions_select_coach" ON "app"."sessions" TO authenticated USING ((select private.app_is_coach_of("app"."sessions"."engagement_id")) and (select private.app_has_consent("app"."sessions"."engagement_id")));