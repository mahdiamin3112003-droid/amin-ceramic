# Architecture decisions

One file per decision where the implementation departs from — or resolves an
ambiguity in — `docs/01`–`docs/04`.

The four design documents are the source of truth. These records exist for the
cases CLAUDE.md anticipates: _"The architecture was written before the code
existed. If reality disagrees with it, tell me — don't silently deviate, and
don't follow it off a cliff either."_

Each record states what the documents say, what was built, and why. If you
disagree with one, that is the file to argue with.

| #                                                | Decision                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| [0001](0001-no-hardcoded-colour.md)              | Literal colour is banned by three mechanisms, not one                                                                    |
| [0002](0002-logical-properties-only.md)          | Physical direction properties are banned outright                                                                        |
| [0003](0003-domain-purity.md)                    | `domain/` has zero runtime dependencies, including npm packages                                                          |
| [0004](0004-typescript-strictness.md)            | `exactOptionalPropertyTypes` stays off                                                                                   |
| [0005](0005-framework-version-pins.md)           | Next 15 and Prisma 6 pinned although 16 and 7 are current                                                                |
| [0006](0006-spacing-scale.md)                    | The declared spacing scale contradicts the table beneath it                                                              |
| [0007](0007-focus-ring.md)                       | Focus uses `outline`, not the specified `box-shadow`                                                                     |
| [0008](0008-input-height.md)                     | Inputs are 44px, not the specified 40px                                                                                  |
| [0009](0009-uuid-v7.md)                          | `uuid_generate_v7()` in SQL, because `pg_uuidv7` is not on Supabase                                                      |
| [0010](0010-rls-helper-schema.md)                | RLS helpers live in `app`, not `auth`                                                                                    |
| [0011](0011-supabase-grants-and-hardening.md)    | Live testing found missing PostgREST grants and mutable function search_path; both fixed, extension-schema move deferred |
| [0012](0012-no-token-revocation-table.md)        | No `token_revocation` table and no Redis mirror — permissions are read per request, so revocation is already immediate   |
| [0013](0013-supabase-storage-over-cloudinary.md) | Media goes to Supabase Storage with derivatives pregenerated at upload, not Cloudinary                                   |
| [0014](0014-staff-identity-resolver.md)          | A SECURITY DEFINER function breaks the sign-in RLS deadlock; the e2e suite is what caught it                             |
