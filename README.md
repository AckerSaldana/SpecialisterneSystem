<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado -->

# Shorenote

A coaching platform for Specialisterne LATAM, used in its inclusion projects and in Workplace Support.

A coach writes session notes in plain language. The AI reads the note and proposes an update to the participant's profile, citing the exact sentence from the note behind every field. The coach approves or rejects each change. The participant sees their profile in plain language and can mark any part with "this doesn't represent me".

The AI structures and proposes. The coach decides, with one exception: in "Cómo trabajar conmigo" and in task breakdowns the model writes to the participant without prior coach review, behind mandatory code filters, and the participant decides (constitution C-04, D-070, which David and Rodrigo have not confirmed yet). The system does not diagnose, and it does not infer types or levels of anything.

This is a prototype built for the AI Challenge 2026. All data is synthetic.

## Principles

- **Evidence-cited fields.** Every profile field the AI proposes carries at least one verbatim quote from the coach's note. A field without evidence fails validation.
- **Event-versioned history.** Each proposal, approval and objection is stored as an event. The current profile is a snapshot built from approved events, so any field can be traced back to the session and note it came from.
- **Coach approval.** Nothing the model writes reaches the profile until a coach approves it, change by change.
- **Plain-language persona view.** The participant reads their own profile in short, literal sentences, framed as strengths and support areas.
- **"This doesn't represent me".** The participant can object to any field. The objection is stored as an event and shown to the coach.

## Architecture

| Piece | Choice | Why |
| --- | --- | --- |
| Web app | Next.js 16 App Router | Server Components read data on the server, Server Actions handle forms. Session refresh runs in `proxy.ts` (the file Next.js 16 uses instead of `middleware.ts`). |
| Auth | Supabase Auth via `@supabase/ssr` | Cookie sessions that work in Server Components. `getClaims()` verifies the JWT signature. Supabase is used only for Auth. |
| Data access | Drizzle ORM on Supabase Postgres | RLS policies are declared next to the tables in `lib/db/schema.ts`, so the migration carries them. App code runs every query inside `withRls(claims, tx => ...)` (`lib/db/rls.ts`), which switches to the `authenticated` role with the user's claims. The raw `db` client bypasses RLS and is only used by seed scripts. The tables live in the Postgres schema `app`, which the Supabase Data API does not expose, so all data access goes through the server (Drizzle + `withRls`). |
| Profile schema | Zod 4, one file: `lib/profile/schema.ts` | The same schema produces the TypeScript types, the JSON Schema sent to the model and the validator for model output and stored data. Objects are strict, so an extra key such as `diagnosis` or `level` fails validation. |
| Model calls | Vercel AI SDK v7, `generateText` with `Output.object({ schema })` | `generateObject` is deprecated in v7. The structured result is read from `result.output`. |
| Model | Claude Haiku 5.5 by default | Set by the `LLM_MODEL` environment variable, so the model can change without code changes. |
| Post-model checks | Plain TypeScript, outside the LLM | Every quote must appear in the original note; quotes that don't are dropped and recorded. Flagged terms, such as diagnostic labels, are marked for the coach. |
| UI | Tailwind CSS 4, shadcn/ui on Radix primitives, lucide-react icons | Accessible primitives (focus management, keyboard support) that we restyle through design tokens. |

## Local setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Create `.env.local` from the example and fill in the values. `.env.example` says where each value comes from in the Supabase and Anthropic dashboards.

   ```bash
   cp .env.example .env.local
   ```

3. Apply the database migrations in `drizzle/` (tables, helper functions and RLS policies).

   ```bash
   npm run db:migrate
   ```

4. Load the synthetic data.

   ```bash
   npm run seed
   ```

5. Start the development server and open http://localhost:3000.

   ```bash
   npm run dev
   ```

## Test accounts

Synthetic accounts created by the seed. They exist only in this prototype.

| Role | Email | Password |
| --- | --- | --- |
| Coach | `coach@caja-mex.test` | `caja-mex-coach-demo` |
| Participant | `persona@caja-mex.test` | `caja-mex-persona-demo` |
| Participant in onboarding | `persona-alta@caja-mex.test` | None. Sign in at `/invitacion` with the code the coach generates. |
| Demo participant (Renata) | `renata@caja-mex.test` | `caja-mex-renata-demo`. Created by `npm run seed-demo`. |

## Onboarding and consent (spec 002)

The full requirements are in `specs/002-alta-y-consentimiento.md`.

1. **The coach creates the engagement.** Type (`inclusion` or `workplace_support`), the participant's first name and a `.test` email. The app creates the participant's Supabase Auth account, their `app.users` row and the engagement in stage `alta`. One engagement per participant.
2. **The coach records the diagnosis check.** The coach reviews the document outside the system and looks up the professional license on the SEP site. The app stores only verified yes or no and the license number; the database fills in who and when. The document never enters the app: there is no file field anywhere.
3. **The coach generates an invitation code.** Single use, 8 characters, expires after 7 days. Supabase Auth stores it as a temporary password, hashed. The app does not store the code in its tables, logs or `audit_log`, and the code never goes in a URL. The coach sees it once and hands it over in person or by phone. A new code replaces the previous one. Once the participant has set a password, no new code can be generated.
4. **The participant signs in at `/invitacion`.** They create their own password, read the privacy notice (the current one is `legal/2026-11-03_aviso-privacidad.md`, set by `AVISO_VERSION` in `lib/legal/aviso.ts`) and either give consent or choose "No por ahora". The consent checkbox starts unchecked. The first consent moves the engagement from `alta` to `evaluacion_inicial`.
5. **The participant can withdraw consent** from `/persona` at any time. Notes, profiles and recommendations are hidden from both the coach and the participant, not deleted, and no new notes or model calls are allowed. Giving consent again shows them again. Six months after a withdrawal the data is deleted with `scripts/purge-retirados.ts`, and giving consent again after that brings nothing back.

Consent is stored as events in `app.consent_events`. The current consent is the latest event, and `private.app_has_consent(engagement_id)` is the only check, used by RLS policies and by `exigirConsentimiento` in `lib/consent.ts`. The privacy notice is a draft without legal review.

### Environment variable

| Variable | Use |
| --- | --- |
| `SUPABASE_SECRET_KEY` | Server only, never with a `NEXT_PUBLIC_` prefix. Used only by `lib/supabase/admin.ts` to create the participant's Auth account, set the temporary password and delete the account if onboarding fails. It is not used to read or write tables in the `app` schema. |

### Scripts

| Command | What it does |
| --- | --- |
| `npm run rls-check` | Runs `scripts/rls-check.ts` against `DATABASE_URL`: signs in with each seed user's claims, checks the RLS cases of specs 001 to 005 and 008 to 010 inside transactions that roll back, prints each case with its ID and exits with an error if any fails. |
| `npm run purge-retirados` | Runs `scripts/purge-retirados.ts`: for each engagement whose latest consent event is a withdrawal older than 6 months, deletes its rows in the 18 tables of `TABLAS_PURGA` (`scripts/tablas-purga.ts`): sessions, profile events and snapshots, participant profiles, plans, follow-up data, executive function corrections and summaries, shared guides, task breakdowns and the templates that came from them. The engagement (with its diagnosis check and license number), its consent events, the `app.users` row and the Auth account stay. |
| `npm run purge-retirados -- --dry-run` | Lists what would be deleted without deleting anything. |
| `npm run purge-retirados -- --engagement <id>` | Deletes one engagement's data now, when the participant asks for it. |
| `npm run purge-retirados -- --test` | Test mode (CA-002.42): runs against a simulated withdrawal date inside a transaction that rolls back, so nothing is deleted. |

## Support plan (spec 003)

The full requirements are in `specs/003-plan-de-acompanamiento.md`.

1. **The AI proposes.** The coach asks for a proposal once a profile is approved and consent is current. The model receives the latest approved profile, where each quote travels with a short ID (`E-01`, `E-02`…) and the model cites by ID, and only the knowledge cards marked `verificada = true`. It receives fragments of notes, never full notes, and it does not receive risk signals or the diagnosis check. Code, not the model, turns each evidence ID back into its quote and session, and drops items that cite unknown evidence or cards.
2. **The coach edits and approves.** The draft can be edited item by item: change the text or the card, remove quotes, remove items, add the coach's own. Item types: goals, team goals, executive function supports, reasonable adjustments, how to give instructions, and what to tell the team lead. Flagged terms block approval until the coach rewrites them.
3. **Versions keep a trail.** Each approval creates a new version. The model's original proposal is stored and cannot be changed, so every version shows which items came from the AI unchanged, which the coach edited (with the original text) or wrote, which AI items were removed, and which item of the previous version each one continues. Approved and discarded plans are frozen by RLS.
4. **The participant sees only goals and supports.** On approval the app writes a copy to `app.persona_plans` with the participant-facing text of goals and supports and nothing else: no quotes, cards, executive function names or coach descriptions. The participant cannot read `app.plans`, `app.plan_items` or `app.knowledge_cards`.
5. **Lead notes and adjustments stay in the app.** Items for the team lead and reasonable adjustments are internal drafts. There is no route, export or view for the employer. The participant can print and share "Cómo trabajar conmigo" on their own (spec 009).
6. **Stages move on their own.** Database triggers advance the engagement: the first approved profile moves it to `perfil`, the first plan draft to `plan`, and the first approved plan to `seguimiento`. Stages only move forward, and no user can write `stage`.

Plans, plan items and the participant copy follow the consent block of spec 002: with consent withdrawn, neither the coach nor the participant can read them, and nothing is deleted. The privacy notice moved to version `2026-10-30` (`legal/2026-10-30_aviso-privacidad.md`) to say what this stage sends to the model. The current version is `2026-11-03`.

## Follow-up sessions and signals (spec 004)

The full requirements are in `specs/004-seguimiento-y-senales.md`.

1. **The coach logs a session.** Once an engagement is in `seguimiento`, each session has a type (with the participant, or with the support network) and a date. A panel above the note shows what the coach approved earlier: questions, context, the next step, the latest state of each plan item and the active signals.
2. **The AI proposes.** One call returns plan progress, signals, context notes and a next step, each with quotes from the note. The model sees plan items by short ID (`P-01`), never their real IDs. Code checks quotes, items and cards, and flags a signal whose only evidence is that the person speaks little.
3. **The coach decides, piece by piece.** The review page is built from what was saved, so it survives closing the tab. The coach can change the type and text of a profile change. Text that would reach the participant is checked on the server: naming a condition, an executive function or signal label, or copying a quote blocks approval. Approving only progress or context creates no profile version.
4. **Signals and strong alerts.** A signal can be closed without touching the profile. The coach can mark a signal as a strong alert. The app notifies nobody: the coach passes it to a person at Specialisterne outside the system and records that. The tool does not handle emergencies.
5. **Failures do not lose the note.** If the model fails, the note stays saved and the proposal can be requested again without rewriting it. Each model call is audited in its own transaction, and errors store only their class and code.

Of this stage's material, the participant sees only approved profile changes. The new tables are coach-only under RLS and follow the consent block of spec 002. The privacy notice moved to version `2026-10-31` to say what this stage sends to the model. The current version is `2026-11-03`. Nothing goes to the employer.

## Participant view (spec 005, the part built in this phase)

The full requirements are in `specs/005-vista-persona-y-recursos.md`. Resources, the short module and closing are out of this phase.

1. **The participant reads their profile and plan.** `/persona` shows the approved profile in plain language and the goals and supports of the plan, from `app.persona_profiles` and `app.persona_plans`. No quotes, signals or executive function names.
2. **"Esto no me representa".** The participant can comment on a profile dimension or a plan item. The comment is stored as an event and the coach reads it and closes it. It does not change the profile or the plan and it never reaches the model. The current privacy notice says so.

## Evaluation and bias (spec 007, the part built in this phase)

The full requirements are in `specs/007-evaluacion-y-sesgo.md`, and how to read each check is in `eval/README.md`.

`npm run eval` runs code checks without network, then synthetic cases against the model, and compares the output with what the case expects. Bias pairs (`eval/sesgo.ts`) run the same case with a change that should not matter, such as gender or how much the person talks, and flag a signal or support area that cites that change. It is a pilot with synthetic data, not a result about real people.

## Executive function trajectory (spec 008)

The full requirements are in `specs/008-trayectoria-fe.md`.

1. **The coach sees behaviors by domain.** `/coach/engagements/[id]/funcion-ejecutiva` lists, for each of the 9 domains, the behaviors from approved events, each with its quote and session. No scores, levels or classification: the AI orders what the coach already wrote.
2. **The coach can correct.** A line's domain or direction can be changed, with the author recorded and the AI's original kept.
3. **One-sentence summaries.** The model proposes a sentence per domain from those quotes only, and it stays a proposal until the coach approves it.

The participant sees nothing of this.

## "Cómo trabajar conmigo" (spec 009)

The full requirements are in `specs/009-como-trabajar-conmigo.md`.

1. **The model drafts, and the participant reads first.** The model receives the first name, the engagement type, the profile without quotes, the goals and supports, and the plan items only the coach sees. It does not receive notes, quotes, signals or cards. Nobody reviews its output before the participant does (constitution C-04, D-070), so code filters drop lines with a copied quote, a condition or clinical term, an internal ID or a link.
2. **The participant decides line by line.** They keep, edit or remove each line and add their own. Text with a blocked term is not saved, and the message names the words they wrote. Marking it ready freezes a version.
3. **The coach does not see drafts.** The coach sees ready versions and what changed from the AI's proposal, and stops seeing a version the participant withdraws.
4. **The system sends nothing.** The participant prints or shares the sheet if they want to (D-069). The company never receives the diagnosis or its check.

## Task breakdown (spec 010)

The full requirements are in `specs/010-desglose-de-tareas.md`.

1. **A task becomes steps.** The participant, or their coach, writes a task. The model receives the task, its context and a list of supports with short IDs (`A-01`), built from what the profile says and the plan goals and supports the participant can see. It does not receive notes, quotes, signals or the diagnosis check.
2. **Nobody reviews the steps first (D-070).** Code checks one action per step, a concrete done criterion, a concrete first step when the profile asks for it, terms, urgency words and things the input never mentioned. With problems there is one retry, only if consent is still current. A support note that does not hold up is removed and the step stays.
3. **"Me atoré aquí".** The participant can mark a step as stuck, with optional text. The coach reads it literally. It is not evidence and never becomes a signal.
4. **Repeating a task.** With stuck marks, the model proposes adjustments, and the participant chooses which to use. Nothing changes until they save their choice.
5. **Templates.** A coach can save a task and its steps as a template for the organization, without the participant's name or the support notes. It is hidden and deleted together with the data of the engagement it came from.

There are no timers or countdowns. Nothing here changes the profile, the plan or the stage.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` | Production build. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run db:generate` | Generates a SQL migration from `lib/db/schema.ts`. |
| `npm run db:migrate` | Applies pending migrations to `DATABASE_URL`. |
| `npm run seed` | Loads `scripts/seed.sql` (synthetic data). |
| `npm run seed-demo -- --hasta <etapa>` | Loads the end-to-end demo case (Renata, synthetic) up to `evaluacion_inicial`, `perfil`, `plan` or `seguimiento`. Runs after `npm run seed`, does not call the model and can be repeated. |
| `npm run eval` | Runs the synthetic evaluation cases in `eval/` against the model and compares the output. `--offline`, `--repeticiones <n>` and `--reporte` are described in `eval/README.md`. |
| `npm run followup-check` | Runs `scripts/followup-check.ts`: tests the route logic of spec 004 with a simulated model and synthetic accounts, then deletes what it created. |
| `npm run persona-check` | Runs `scripts/persona-check.ts`: tests the route logic of spec 005 ("Esto no me representa" and its close by the coach) with synthetic accounts, then deletes what it created. |
| `npm run trayectoria-check` | Runs `scripts/trayectoria-check.ts`: tests the route logic of spec 008 (corrections and domain summaries) with a simulated model and synthetic accounts, then deletes what it created. |
| `npm run guia-check` | Runs `scripts/guia-check.ts`: tests the route logic of spec 009 (asking for a draft, line decisions, marking a version as ready, regeneration) with a simulated model and synthetic accounts, then deletes what it created. |
| `npm run desglose-check` | Runs `scripts/desglose-check.ts`: tests the route logic of spec 010 (asking for a task breakdown, marking steps, archiving, "Ya lo revisé", repeating a task, deciding its adjustments, saving, archiving and applying templates, and what its screens read) with a simulated model and synthetic accounts, then deletes what it created. |

## Folder map

| Folder | Contents |
| --- | --- |
| `app/` | Routes: pages, layouts, route handlers and Server Actions. `app/preferencias` holds the display preferences screen. |
| `components/` | Shared UI. `components/ui` holds the shadcn/ui primitives. |
| `lib/` | Profile schema, database schema and RLS helper, auth, Supabase client, API contracts, engagement config, display preferences, the prompt builders and model calls (`lib/ai/`), and each stage's logic (`lib/plan/`, `lib/followup/`, `lib/trayectoria/`, `lib/guia/`, `lib/desglose/`). |
| `prompts/` | Versioned prompts sent to the model, one file per version. |
| `eval/` | Synthetic evaluation cases and the comparison script. |
| `drizzle/` | Generated SQL migrations. |
| `scripts/` | Seed data and its loaders, the purge script and the `*-check` scripts that test RLS and route logic against the database. |
| `specs/` | The requirements of each stage and the constitution. |
| `legal/` | The versions of the privacy notice. |

## Accessibility

The W3C COGA guidance (Cognitive and Learning Disabilities Accessibility) is the main reference. In practice that means: Spanish UI with short, literal text; no timers; no toasts or surprise notifications; a confirmation dialog before irreversible actions; one main action per screen; states written as text, not only shown with color or motion; visible focus; labels on every control; semantic HTML; a "skip to content" link; and a footer on every screen that points to human help.

### Display modes

Chosen at `/preferencias`, stored in a cookie for one year and applied on the server to `<html>`, so the page never flashes the default style first.

- **Calma (calm):** lower contrast that still meets WCAG AA, warm muted colors, no shadows or decoration, no animation.
- **Estándar (standard):** WCAG 2.2 AA.
- **Alto contraste (high contrast):** black on white, 2 px borders on controls, thicker focus outline. All text meets 7:1.

Reduced motion: decorative motion is removed in Calma and whenever the operating system sets `prefers-reduced-motion`. State changes still happen, instantly. The `--motion-duration` and `--motion-distance` tokens drop to 0 in both cases.

Measured contrast for the main text and background pairs (WCAG formula):

| Pair | Estándar | Calma | Alto contraste |
| --- | --- | --- | --- |
| Body text on background | 15.08:1 | 10.41:1 | 21.00:1 |
| Secondary text on background | 5.15:1 | 4.90:1 | 12.63:1 |
| Secondary text on muted surface | 4.80:1 | 4.57:1 | 11.29:1 |
| Primary button text | 4.77:1 | 4.88:1 | 8.45:1 |
| Primary button text on hover | 5.25:1 | 5.37:1 | 9.10:1 |
| Accent as text (engagement type) | 4.50:1 | 4.51:1 | 8.45:1 |
| Links (body color, underlined) | 15.08:1 | 10.41:1 | 21.00:1 |
| Error text | 5.90:1 | 6.52:1 | 10.01:1 |
| Input border (non-text, 3:1 minimum) | 3.26:1 | 3.14:1 | 21.00:1 |

The palette comes from `docs/DISENO.md` (spec 012): paper background, one terracotta accent, serif headings. Three values were darkened slightly to meet AA: the Estándar accent (`#AD5641` instead of `#B85C45`), the Calma accent (`#886659` instead of `#8F6B5E`) and Calma secondary text (`#6D6762` instead of `#7A746E`). Form fields use a darker border token than cards.

### Fonts and spacing

The body font is Atkinson Hyperlegible and headings use Source Serif 4. Lexend and OpenDyslexic are available as options; with either one chosen, headings use it too. The sources listed below suggest that fonts designed for dyslexia do not improve reading, while extra spacing may help. For that reason the preferences screen also offers text size (16 to 24 px), letter spacing, line spacing and line length, each with three to five named options instead of a slider.

### Evidence behind these decisions

These sources informed the design. The team verified each claim against the original text.

- Wery & Diliberto, 2017 (dyslexia fonts and reading).
- Kuster et al., 2018 (dyslexia fonts and reading).
- Wortmann et al., 2026.
- W3C COGA, "Making Content Usable for People with Cognitive and Learning Disabilities".
- UK Home Office, design guidance for users on the autistic spectrum.

## Data policy

- Synthetic data only. No row in this repository or its seed describes a real person.
- No medical documents are stored. For a participant, the system records only that a diagnosis was verified, who verified it, when, and the professional's license number. It never stores the diagnosis itself, a type or a level.
- Profiles describe strengths and support areas in terms of observable behavior.

## AI use

The code was written by Acker Saldaña in pair programming with Claude Code (Opus 5.5). Acker reviewed all of the code and is responsible for it. Each AI-assisted file starts with an attribution header that records its review status.

The product uses an LLM in six places: profile updates from coach notes, support plans, follow-up proposals, one-sentence executive function summaries, "Cómo trabajar conmigo" drafts, and task breakdowns with their adjustments (`lib/ai/propose-*`). In the first four, a coach approves what the model proposes before it counts. In the last two, the participant receives the output without prior coach review, behind mandatory code filters, and decides what to use (constitution C-04, D-070, which David and Rodrigo have not confirmed yet). Those two never write to the profile or the plan.

## Libraries

Versions as installed; licenses read from each package's `package.json`.

| Library | Version | License |
| --- | --- | --- |
| next | 16.4.3 | MIT |
| react, react-dom | 19.3.0 | MIT |
| ai (Vercel AI SDK) | 7.0.157 | Apache-2.0 |
| @ai-sdk/anthropic | 4.0.92 | Apache-2.0 |
| @supabase/ssr | 0.12.7 | MIT |
| @supabase/supabase-js | 2.118.0 | MIT |
| drizzle-orm | 0.45.4 | Apache-2.0 |
| drizzle-kit | 0.31.11 | MIT |
| postgres (postgres.js) | 4.0.0 | Unlicense |
| zod | 4.6.7 | MIT |
| tailwindcss | 4.3.3 | MIT |
| shadcn | 4.23.0 | MIT |
| radix-ui | 1.8.1 | MIT |
| tw-animate-css | 1.4.0 | MIT |
| lucide-react | 1.64.0 | ISC |
| class-variance-authority | 0.7.1 | Apache-2.0 |
| cn | 0.5.0 | MIT |
| server-only | 0.0.1 | MIT |
| @fontsource/opendyslexic | 5.3.0 | OFL-1.1 |
| tsx | 4.23.15 | MIT |
| dotenv | 18.0.9 | BSD-2-Clause |
| typescript | 5.9.3 | Apache-2.0 |
| eslint | 9.39.5 | MIT |

Atkinson Hyperlegible, Source Serif 4 and Lexend are loaded from Google Fonts through `next/font` and are published under the SIL Open Font License 1.1.

## Not built yet

- Closing an engagement (spec 006).
- Resource recommendations for the participant (spec 005). The "Recursos" section stays hidden until it has content.
- Notifications of any kind. Strong alerts are escalated by the coach outside the app on purpose (C-12).
- Scheduled data purge 6 months after consent is withdrawn. Today `npm run purge-retirados` is run by hand.

## Out of scope

- Microservices
- External job queues
- A dedicated vector database
- Docker
- Social OAuth sign-in
- Voice transcription

## Team

- **Acker Saldaña:** code.
- **David Betancourth:** brand, synthetic evaluation cases.
- **Rodrigo Gutiérrez Peña:** business, Business Model Canvas, pitch.
