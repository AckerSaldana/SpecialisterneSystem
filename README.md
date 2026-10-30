<!-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente -->

# Caja MEX (working name)

A coaching platform for Specialisterne LATAM, used in its inclusion projects and in Workplace Support.

A coach writes session notes in plain language. The AI reads the note and proposes an update to the participant's profile, citing the exact sentence from the note behind every field. The coach approves or rejects each change. The participant sees their profile in plain language and can mark any part with "this doesn't represent me".

The AI structures and proposes. The coach decides. The system does not diagnose, and it does not infer types or levels of anything.

This is a sprint 1 prototype. All data is synthetic.

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
| `npm run eval` | Runs the synthetic evaluation cases in `eval/` against the model and compares the output. |

## Folder map

| Folder | Contents |
| --- | --- |
| `app/` | Routes: pages, layouts, route handlers and Server Actions. `app/preferencias` holds the display preferences screen. |
| `components/` | Shared UI. `components/ui` holds the shadcn/ui primitives. |
| `lib/` | Profile schema, database schema and RLS helper, auth, Supabase client, API contracts, engagement config, display preferences. |
| `prompts/` | Versioned prompts sent to the model, one file per version. |
| `eval/` | Synthetic evaluation cases and the comparison script. |
| `drizzle/` | Generated SQL migrations. |
| `scripts/` | Seed data and its loader. |

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
| Body text on background | 17.01:1 | 10.44:1 | 21.00:1 |
| Secondary text on background | 7.73:1 | 6.41:1 | 17.40:1 |
| Secondary text on muted surface | 7.02:1 | 5.86:1 | 15.27:1 |
| Primary button text | 6.70:1 | 6.04:1 | 21.00:1 |
| Primary button text on hover | 8.72:1 | 8.60:1 | 12.63:1 |
| Links | 6.70:1 | 7.85:1 | 11.22:1 |
| Error text | 6.57:1 | 6.63:1 | 10.01:1 |
| Input border (non-text, 3:1 minimum) | 4.83:1 | 3.40:1 | 21.00:1 |

### Fonts and spacing

The default font is Atkinson Hyperlegible. Inter, Lexend and OpenDyslexic are available as options. The sources listed below (pending verification) suggest that fonts designed for dyslexia do not improve reading, while extra spacing may help. For that reason the preferences screen also offers text size (16 to 22 px), letter spacing, line spacing and line length, each with three or four named options instead of a slider.

### Evidence behind these decisions (pending verification)

These sources informed the design. The team has not yet checked each claim against the original text.

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

The code was written with Claude Code (Opus 5.5). Acker Saldaña's review is still pending. Each AI-assisted file starts with an attribution header that records its review status. Acker Saldaña reviews the code and is responsible for it.

The product itself uses an LLM only to propose structured profile updates from coach notes. A coach approves every change before it reaches a profile.

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

Atkinson Hyperlegible, Inter and Lexend are loaded from Google Fonts through `next/font` and are published under the SIL Open Font License 1.1.

## Out of scope for sprint 1

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
