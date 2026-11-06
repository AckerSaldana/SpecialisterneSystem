-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
-- Spec 009 (R-009.46). Generado con npm run db:generate. Los permisos y el trigger van en 0024.
ALTER TABLE "app"."shared_guides" ADD COLUMN "revisada_sin_cambios" text;
