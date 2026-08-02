# 0005 · Next 15 and Prisma 6 pinned, although 16 and 7 are current

**Status:** accepted, pending your decision · Phase 0

## Context

`docs/01-architecture.md` §5.1 specifies **Next.js 15, App Router, React 19** and
**Prisma 6**. Both were current when the architecture was written. At the time of
implementation:

| Specified                 | Pinned    | Current                     |
| ------------------------- | --------- | --------------------------- |
| Next.js 15                | `15.5.22` | `16.2.12`                   |
| Prisma 6                  | `6.19.3`  | `7.9.1`                     |
| React 19                  | `19.2.x`  | `19.2.x` — unchanged        |
| Tailwind 4                | `4.3.3`   | `4.3.3` — unchanged         |
| Storybook (not specified) | `10.5.5`  | `10.5.5`                    |
| Node (22 in the plan)     | `24`      | `24` is the active LTS line |

## Decision

**Pinned as specified.** The documents name these versions, and Phase 0's job is
to build the foundation they describe, not to relitigate it.

Two consequences worth knowing:

- `eslint-config-next@15` still ships eslintrc-style config, so it is loaded
  through `FlatCompat`. Next 16 exports flat configs natively; that indirection
  goes away on upgrade.
- `prisma.config.ts` disables Prisma's own `.env` loading, so the config file
  loads `.env.local` explicitly via `process.loadEnvFile`.

**Storybook is 10, not the 9 the Phase 0 plan assumed.** Storybook 9 declares its
React peer as `^19.0.0-beta`; 10 declares `^19.0.0`. Taking the current major
here is less risk, not more.

**Node is 24, not the 22 in the plan** — 24 is the active LTS line and what the
machine runs. `engines` allows `>=22.11.0` so either works.

## Open — this one is yours to decide

Whether to move to Next 16 and Prisma 7 is a decision for you, not a default.
Both are cheap now and get expensive later:

- **Next 16** should be a smooth upgrade for this codebase: App Router, async
  params and Turbopack are already in use, and it would remove the `FlatCompat`
  indirection.
- **Prisma 7** is a larger change — client output location, ESM-first packaging
  and driver-adapter defaults all move. If it is going to happen it wants doing
  before the ~80-model schema lands in Phase 1, not after.
