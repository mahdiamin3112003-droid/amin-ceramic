# AMIN CERAMIC — Project Context

## What this is

A production-grade premium web platform for AMIN CERAMIC, a real ceramic and porcelain
tile company. Not a template, not a portfolio site. It is a commercial platform that
must serve consumers, interior designers and contractors, with AI-assisted product
discovery and a full admin back office.

## Read these before doing anything

The complete architecture is already designed and approved across four documents in
`docs/`. **They are the source of truth. Do not redesign what they specify.**

| Document | Contains |
|---|---|
| `docs/01-architecture.md` | Business analysis, logo/brand extraction, stack decisions, layered architecture, AI architecture, roadmap phases |
| `docs/02-ux-blueprint.md` | Site map, user journeys, wireframes, full design system, motion spec, responsive + accessibility design |
| `docs/03-database-design.md` | Complete PostgreSQL schema, ~80 tables, indexes, RLS, Prisma architecture, multi-tenancy |
| `docs/04-api-architecture.md` | 164 operations, transport decisions, auth/authz, error and validation strategy |

Each document ends with a "decisions of record" table. If you are about to contradict
one, stop and ask instead.

## Non-negotiable constraints

- **TypeScript strict.** `strict: true`, `noUncheckedIndexedAccess: true`. No `any`.
- **Layered architecture.** `domain/` imports nothing — no Prisma, no React, no fetch.
  Enforced by an ESLint boundary rule.
- **Prisma types never leave `infrastructure/`.** Repositories return domain types.
- **CSS logical properties everywhere** (`margin-inline-start`, not `margin-left`).
  The site is bilingual EN/AR with RTL from day one. Retrofitting costs 3-4x.
- **`tenant_id` on every tenant-scoped table**, leading every composite index.
  Every uniqueness constraint is tenant-scoped: `UNIQUE (tenant_id, sku)`, never `UNIQUE (sku)`.
- **Design tokens are the single source of truth.** No hardcoded colours, spacing,
  radii or durations anywhere in components. Ever.
- **`cyan-400` (#5FC4E4) is never a text colour on a light background** — it fails
  WCAG AA at 2.0:1. It is a surface, stroke, glow and motion colour only.
- **No browser storage in artifacts/components** beyond what the docs specify.
- **Every mutation is validated with Zod at the boundary** and authorised before it runs.

## Brand tokens (extracted from the client's logo — do not invent alternatives)

navy-950 #0C1338 · navy-900 #141F52 · navy-700 #1E2C6E (primary) · blue-500 #3560B4
cyan-400 #5FC4E4 · cyan-100 #CBE4F3 · cyan-50 #EBF5FB
white #FFFFFF · stone-50 #F6F7F9 · stone-100 #EDEFF3 · stone-300 #D8DCE3
stone-500 #8A93A3 · stone-600 #5B6472 · stone-800 #2E3441
success-600 #1B7A4B · warning-600 #A16207 · danger-600 #B42318

Display type: Marcellus (>=28px only). Body/UI: Inter Variable. Data/spec: JetBrains Mono
(tabular-nums always). Arabic: IBM Plex Sans Arabic (body), Noto Naskh Arabic (display).

House motion curve: `ease-material` = cubic-bezier(.32,.72,0,1). Nothing bounces —
tile is heavy. Exits are ~30% faster than entrances.

## How I want you to work

1. **Plan before you build.** For any task beyond a single file, propose the approach
   and wait for approval.
2. **One roadmap phase per session.** Do not start the next phase without being asked.
3. **Ask rather than assume.** If the docs are silent on something that matters,
   ask one focused question. Do not invent a decision and bury it in code.
4. **Small, reviewable commits** with conventional commit messages.
5. **Say when something in the docs is wrong.** The architecture was written before
   the code existed. If reality disagrees with it, tell me — don't silently deviate,
   and don't follow it off a cliff either.
6. **Never commit secrets.** `.env.local` is gitignored. Use `.env.example` with
   placeholder values.

## Commands

Node 24 (`.nvmrc`), pnpm 10. Keep this section updated as scripts are added.

```
pnpm dev              # dev server, http://localhost:3000 (redirects to /en)
pnpm build            # production build
pnpm start            # serve the production build

pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint + stylelint + prettier --check
pnpm lint:es          #   eslint only
pnpm lint:css         #   stylelint only
pnpm lint:format      #   prettier --check only
pnpm lint:fix         # autofix all three
pnpm format           # prettier --write

pnpm test             # vitest run — unit + the TOTP generator's RFC vectors
pnpm test:watch       # vitest
pnpm test:e2e         # playwright — real browser, real Supabase, real roles
pnpm test:e2e:ui      # playwright, interactive

pnpm storybook        # design review surface, http://localhost:6006
pnpm storybook:build  # static build, runs in CI

pnpm db:bootstrap-owner  # create the first owner — OWNER_EMAIL/OWNER_PASSWORD

pnpm db:migrate       # prisma migrate dev
pnpm db:deploy        # prisma migrate deploy (CI / production)
pnpm db:seed          # idempotent — safe to re-run
pnpm db:studio        # prisma studio
pnpm db:reset         # DESTRUCTIVE: drop, re-migrate, re-seed
pnpm db:generate      # prisma generate
```

## Where things are

- **Design tokens** — `src/app/globals.css`. The only file in the repository
  where a literal colour is allowed. `src/test/tokens.test.ts` asserts every
  value and computes every contrast rule in `docs/02` §4.1 from the real hexes.
- **House lint rules** — `tools/eslint/`. Four rules with no off-the-shelf
  equivalent: `no-raw-color`, `no-physical-properties`, `no-cyan-text`,
  `no-transition-colors`. The layer boundary is `eslint-plugin-boundaries` in
  `eslint.config.mjs`.
- **Decisions of record** — `docs/adr/`. Every place the implementation departs
  from `docs/01`–`docs/04`, with the reasoning. Fourteen so far.
- **End-to-end suite** — `e2e/`. Playwright against a production build,
  52 specs. Runs in `prefers-reduced-motion` via the shared fixture in
  `e2e/support/test.ts`, which makes every assertion double as a check that
  the reduced-motion rule holds.
  Creates throwaway `e2e-*@e2e.invalid` staff accounts per test and deletes
  them in teardown; `assertIsTestAccount` makes it structurally unable to
  delete a real one. `e2e/support/totp.ts` computes real TOTP codes, which
  is what makes the MFA paths machine-verifiable. **These caught two bugs
  no unit test could**: sign-in was impossible (RLS deadlock, migration
  0025) and auth cookies were neither httpOnly nor secure.
- **Admin authorisation** — `src/application/auth/`. `authorize.ts` is the
  permission check, `admin-mutation.ts` is the single entry point for every
  staff write: it checks the permission, stamps the RLS claims, runs the
  mutation and writes the audit row in ONE transaction. A mutation that
  doesn't return an audit entry doesn't compile. Staff claims are resolved
  per request in `src/infrastructure/auth/staff-session.ts` — that is what
  makes the Phase 1 staff RLS policies live.
- **Foundation demo route** — `src/app/[locale]/(marketing)/page.tsx`. Proves
  tokens, fonts, locale switching, RTL, focus and the Prisma read. Replaced by
  the real homepage in Phase 3.

## Phase status

| Phase | State |
|---|---|
| 0 · Foundation | Complete. Supabase is wired; Vercel deployment is still outstanding. |
| 1 · Data core | Complete — full schema, RLS, quantity calculator, repositories, seed. |
| 2 · Catalogue & quote | Complete — listing, facets, search, PDP, compare, basket, quote, samples. |
| 3 · Brand & motion | Complete — real logo, assembly intro, homepage, global chrome. |
| 4 · Admin foundation | Complete — auth + TOTP, RBAC across three layers, dashboard shell, product CRUD, media library, inventory, audit log. |
| — · Admin completion | Complete — taxonomy CRUD, quote-requests board, settings, staff/roles, trade accounts. Not a numbered phase; see below. |
| 5+ | Not started. **Do not begin the next phase without being asked.** |

**"Admin completion" is not in docs/01 §10.** The roadmap's phases 5–9 are
AI retrieval, Tile Finder, Interior Assistant, AI ingestion and launch
hardening. This slice was inserted before Phase 5 because Phase 5 needs
embeddings over REAL products plus a labelled evaluation set, and the real
catalogue is not bulk-loaded until Phase 8 — the roadmap assumes Phase 1's
"~40 real products" seed exists, and it does not. Recorded in
[ADR-0014](docs/adr/0014-admin-completion-before-ai.md).

Still deliberately unbuilt, so they are not mistaken for gaps: the AI
conversation transcript and one-click WhatsApp reply on the request detail
(phases 7 and 9), quote-PDF generation, and drag-to-move on the requests
board (the board ships with explicit move controls — see the commit).