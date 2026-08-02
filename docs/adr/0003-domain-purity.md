# 0003 · `domain/` has zero runtime dependencies, including npm packages

**Status:** accepted · Phase 0

## What the documents say

`docs/01-architecture.md` §5.3: _"The domain layer imports nothing. No Prisma, no
React, no fetch. Tile calculation logic is pure functions with unit tests. It
will outlive every other layer."_ §9 adds: _"`domain/` has an ESLint rule
forbidding imports from any other layer — enforced, not merely intended."_

## Decision

"Imports nothing" is read literally: **no npm packages either, not even Zod.**

`eslint-plugin-boundaries` enforces two rules:

- `boundaries/element-types` — `domain` may import only from `domain`.
- `boundaries/external` — `domain` may import no external package at all.

Validation belongs at the application boundary
(`docs/04-api-architecture.md` §19.1), so branded types in the domain layer
(`TenantId`, and later `Sku`, `M2`, `ProductId`) are plain TypeScript.

The other layers are constrained too:

| From             | May import                                          |
| ---------------- | --------------------------------------------------- |
| `domain`         | `domain`                                            |
| `application`    | `domain`, `application`, `infrastructure`, `shared` |
| `infrastructure` | `domain`, `application`, `infrastructure`, `shared` |
| `presentation`   | `domain`, `application`, `presentation`, `shared`   |
| `shared`         | `domain`, `shared`                                  |

Presentation reaching `infrastructure` directly is a build error: Server
Components call a use-case, which calls a repository. Separately,
`no-restricted-imports` makes `@prisma/client` importable only inside
`src/infrastructure/db/`, so Prisma types cannot leak into components
(`docs/03-database-design.md` §15.4).

## Consequences

The quantity calculator in Phase 1 — m² to boxes to weight, the number a customer
spends money against — will be pure functions testable without a database, a
browser or a mock. That is the return on this rule.

The rule bit during Phase 0: the first draft of the boundary config forbade
`application → infrastructure`, and the tenant use-case failed to lint. That was
the config being wrong rather than the code, and it was corrected — but it
demonstrates the rule is live rather than decorative.
