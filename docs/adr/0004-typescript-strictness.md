# 0004 · `exactOptionalPropertyTypes` stays off

**Status:** accepted · Phase 0

## Context

CLAUDE.md requires `strict: true`, `noUncheckedIndexedAccess: true` and no `any`.
`exactOptionalPropertyTypes` is the natural next flag to reach for.

## Decision

**On:** `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `noImplicitReturns`, `forceConsistentCasingInFileNames`,
`verbatimModuleSyntax`. ESLint runs `strictTypeChecked` + `stylisticTypeChecked`,
with `@typescript-eslint/no-explicit-any` as an error.

**Off: `exactOptionalPropertyTypes`.** It distinguishes `{ a?: string }` from
`{ a: string | undefined }`, which React and Radix prop types do not — every
spread of optional props into a Radix primitive becomes an error requiring a
conditional-spread workaround. The cost is friction on every component; the
benefit is close to nil here, because the bug it prevents (explicitly assigning
`undefined` to an optional property) is not one this codebase's shape produces.

Worth revisiting if the domain layer grows value objects where the distinction
carries real meaning.

## Consequences

`noUncheckedIndexedAccess` is the flag doing the real work. It has already forced
several array and record accesses to be narrowed rather than assumed — including
in the Storybook stories, where a destructured tuple would otherwise have been
typed as always-present.
