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

(Filled in during Phase 0 — keep this section updated as scripts are added.)

```
pnpm dev          # dev server
pnpm build        # production build
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # vitest
pnpm db:migrate   # prisma migrate dev
pnpm db:studio    # prisma studio
```