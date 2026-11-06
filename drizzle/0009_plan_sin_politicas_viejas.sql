-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
-- Generado por drizzle-kit desde lib/db/schema.ts (spec 003). Va aparte de 0008 para que drizzle-kit no lo tome como renombres de políticas.
DROP POLICY "knowledge_cards_select_all" ON "app"."knowledge_cards" CASCADE;--> statement-breakpoint
DROP POLICY "plan_items_all_coach" ON "app"."plan_items" CASCADE;--> statement-breakpoint
DROP POLICY "plan_items_select_persona_approved" ON "app"."plan_items" CASCADE;--> statement-breakpoint
DROP POLICY "plans_all_coach" ON "app"."plans" CASCADE;--> statement-breakpoint
DROP POLICY "plans_select_persona_approved" ON "app"."plans" CASCADE;