-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
-- Spec 011 (R-011.2). Generado con npm run db:generate. El "grant insert" de 0002_permisos.sql es de toda la tabla: cubre la columna.
ALTER TABLE "app"."sessions" ADD COLUMN "observador" text;
