# AMIN CERAMIC — API Architecture Document

**Phase 4 deliverable** · Version 1.0 · Pre-implementation
**Follows:** Architecture v1.0, UX Blueprint v1.0, Database Design v1.0 (all approved)
**Precedes:** Phase 5 — Implementation

---

## 1. API philosophy

### 1.1 Principles

1. **The fastest API call is the one that never happens.** Most reads on this platform are Server Components calling a use-case function directly — same process, no HTTP, no serialisation, no auth round trip. An endpoint exists only when something outside the render pass needs it. This is the single biggest performance decision in the document, and it's why the endpoint list is shorter than it would be in a conventional SPA architecture.

2. **One authorisation model, three enforcement points.** Route middleware, the use-case wrapper, and RLS. Every endpoint declares its required permission as data, not as an `if` statement buried in a handler.

3. **The transport is an implementation detail; the use-case is the API.** Every endpoint and every Server Action is a thin adapter over a use-case in the application layer. A given use-case can be reached by a Server Component, a Server Action, a REST route and a background job without duplication. When the public API arrives (§29), it's a new adapter over existing use-cases, not a new backend.

4. **Boring, predictable contracts.** Same error shape everywhere, same pagination everywhere, same date format everywhere. Cleverness in an API surface is a tax paid by every future integrator, including us in a year.

5. **Fail closed.** Missing permission declaration = deny. Unvalidated input = reject. Unknown field in a request body = reject. An endpoint that works because nobody remembered to lock it is a breach with a delay fuse.

6. **Every mutation is auditable and idempotent.** Retries are a fact of mobile networks and serverless runtimes, not an edge case.

### 1.2 What the API is *not*

It is not a generic CRUD surface over the database. Endpoints model *business operations* — `submitQuoteRequest`, `reserveStock`, `approveStagedProduct` — not table rows. The difference shows in `POST /quotes/{id}/reserve` versus a generic `PATCH /stock_lot/{id}`: the first carries the lot-allocation rules, the ledger write, the audit entry and the outbox event as one atomic operation; the second invites callers to reimplement those rules incorrectly.

PostgREST is not exposed. Supabase's auto-generated API would make RLS the *only* authorisation layer and would leak the schema as a public contract, permanently constraining our ability to refactor it.

---

## 2. Transport decisions: Server Actions vs REST vs Edge

### 2.1 The decision rule

| Use | Transport | Why |
|---|---|---|
| Reads rendered on the server | **Direct use-case call in a Server Component** | No HTTP hop. Streams into the response. Cached by ISR |
| Mutations from our own UI | **Server Action** | Progressive enhancement, typed end to end, no client fetch code, automatic revalidation |
| Reads needed by client components after hydration | **Route Handler (REST)** | Typeahead, facet recount, compare tray, admin table sorting, polling |
| Streaming responses | **Route Handler** returning a stream | Server Actions are a poor fit for token streaming |
| Anything a non-React client calls | **Route Handler (REST)** | Webhooks, connectors, future mobile app, future public API |
| File transfer | **Direct-to-storage via signed URL** | Never through the app server (§13) |
| Long-running work | **Inngest job**, triggered by an action or route | Serverless functions time out; catalog ingestion does not fit in a request |
| Cross-cutting request concerns | **Edge middleware** | Locale, visitor cookie, auth gate, coarse rate limit |

### 2.2 Server Actions — scope and constraints

Used for: all admin mutations, quote submission, basket operations, wishlist, project edits, sample and booking requests, ingestion approvals.

Every Server Action passes through one wrapper that, in fixed order: resolves the session → checks the declared permission → parses input with Zod → opens a transaction → invokes the use-case → writes the audit row and any outbox events *inside* that transaction → revalidates cache tags → returns a discriminated result.

Actions return `{ ok: true, data }` or `{ ok: false, error: { code, message, fields? } }` — never a thrown exception across the boundary, because thrown errors in Server Actions surface to the client as an opaque digest and destroy the ability to show a field-level message.

**Constraint we accept:** Server Actions are invoked by an opaque generated ID, so they are unversioned and deploy in lockstep with the client that calls them. That is correct for a first-party UI and unacceptable for a third-party integration — which is exactly the boundary at which we switch to REST.

### 2.3 REST — scope and shape

Mounted at `/api/v1/*`. Used for: streaming AI endpoints, client-side reads, upload orchestration, inbound webhooks, connector callbacks, health and status, and later the public API.

Conventions:
- Resource-oriented paths, plural nouns, kebab-case: `/api/v1/products`, `/api/v1/quote-requests/{id}`.
- Verbs only for operations that are not resource state changes: `/api/v1/quote-requests/{id}/actions/reserve`.
- `GET` is always safe and cacheable. `POST` creates or invokes. `PATCH` partially updates. `PUT` is not used — full-replacement semantics invite accidental field wipes.
- Success returns the resource or a collection envelope; there is no wrapper object on single-resource success. Errors always use the problem shape in §19.

### 2.4 Edge vs Node runtime

**Edge runtime** runs: middleware (locale negotiation, visitor cookie issue, admin auth gate, coarse IP rate limit, redirect lookup from a Redis mirror), dynamic OG image generation, and `robots`/`sitemap` variants.

**Everything that touches Postgres runs on the Node runtime.** This is a deliberate departure from the instinct to push everything to the edge: Prisma requires a TCP connection and connection pooling, and the latency saved at the edge is immediately lost re-establishing a database connection from an arbitrary region while the database sits in one. Edge is used for work that needs no database, or that reads Redis over HTTP.

**Connection management:** all Node-runtime database access goes through Supabase's pooler in transaction mode. Direct connections are reserved for migrations and background jobs.

---

## 3. Cross-cutting conventions

### 3.1 Request identity

Every request carries or is assigned: `X-Request-Id` (generated in middleware if absent, echoed in every response and every log line), `X-Tenant` (resolved server-side, never trusted from the client in v1), and a visitor cookie. `Idempotency-Key` is required on the mutating REST endpoints marked as such and optional elsewhere.

### 3.2 Pagination

**Cursor-based by default.** Offset pagination is offered only where an admin table genuinely needs page numbers, and never on tables that grow unboundedly.

Request: `?limit=24&cursor=<opaque>`. Response:
```
{ "data": [...],
  "page": { "nextCursor": "...", "hasMore": true, "limit": 24 },
  "meta": { "total": 1284, "facets": {...} } }
```
`total` is included only where it is cheap (a filtered catalog count with a bounded index) and omitted on unbounded tables — an exact count of 15 million analytics events is expensive and nobody needs it.

Cursors encode the sort key plus the row ID, are opaque and signed, and expire after 24 hours.

### 3.3 Formats

Timestamps are RFC 3339 UTC with an explicit offset (`2026-08-01T14:22:03Z`). Money is always an object: `{ "amount": "27.6000", "currency": "USD" }` — a string, never a float, and never a bare number without its currency. Measurements are objects too: `{ "value": 8.18, "unit": "m2" }`. Millimetres are integers. Enums are lowercase snake_case strings matching the database vocabulary. `null` means "absent"; a field is never omitted to mean absent, so clients can distinguish "not set" from "not requested".

### 3.4 Field selection and expansion

`?fields=id,sku,name,price` narrows the payload; `?expand=collection,primaryMedia` includes related resources inline. Expansion depth is capped at 2 and the set of expandable relations is enumerated per endpoint — unbounded expansion is how a friendly API becomes an accidental denial-of-service vector.

### 3.5 Idempotency

Mutating REST endpoints accept `Idempotency-Key`. The key, the request-body hash and the response are stored in Redis for 24 hours. A replay with the same key and same body returns the stored response; the same key with a *different* body returns `409 idempotency_key_reused`. Inbound webhooks use the provider's own delivery ID as the key, persisted in `connector_event_log` with a unique index so at-least-once delivery becomes exactly-once processing.

---

## 4. Authentication flow

### 4.1 Identity states

Three, and the API treats them as distinct principals rather than as degrees of the same one:

| State | Identifier | Can |
|---|---|---|
| **Anonymous visitor** | `visitor_id` cookie | Browse, search, use AI, save, build a basket, submit a quote |
| **Authenticated user** | Supabase session + `app_user` | The above, plus account, projects, trade pricing, history |
| **Staff** | Authenticated user holding roles | Admin surface, scoped by permission |

The anonymous visitor is a first-class principal because the UX blueprint requires guests to do almost everything. Treating them as "not logged in yet" leads to nullable-user bugs throughout.

### 4.2 Visitor issuance

Edge middleware on every request: if no `ac_vid` cookie is present, mint a UUIDv7, set it httpOnly + secure + sameSite=lax with a 1-year expiry, and sign it with an HMAC so a client cannot forge another visitor's ID. The `visitor` row is created lazily on the first write (a save, a basket add, a finder upload) — not on the first page view, which would create millions of empty rows from crawlers.

### 4.3 Sign-in

```
Client                    App (Node)              Supabase Auth        Postgres
  │  credentials             │                        │                   │
  ├─── Server Action ───────►│                        │                   │
  │                          ├── signInWithPassword ─►│                   │
  │                          │◄── session + user ─────┤                   │
  │                          │                        │                   │
  │                     [Auth Hook fires on token issue]                  │
  │                          │                        ├── read roles,  ──►│
  │                          │                        │   permissions,    │
  │                          │                        │   tenant, tier    │
  │                          │◄── JWT with claims ────┤                   │
  │                          │                                            │
  │                          ├── claim visitor: re-parent saved_item,     │
  │                          │   product_view, open quote_request ───────►│
  │                          │                                            │
  │◄── httpOnly cookies ─────┤  access (1h) + refresh (30d, rotating)     │
```

If the user holds any role carrying a `.write`, `.manage`, `.approve` or `.adjust` permission, the session is marked `mfa_required` and no privileged claim is honoured until the TOTP step completes. The first factor alone gets a session that can read nothing privileged.

### 4.4 JWT claims

`sub`, `tenant_id`, `app_user_id`, `visitor_id`, `role_keys[]`, `permissions[]` (flattened union), `trade_tier_id`, `mfa_verified`, `exp`, `iat`, `jti`.

Flattening permissions into the token is what lets RLS authorise without a join on every query (Database Design §16.2). The cost is staleness, addressed next.

### 4.5 Revocation and staleness

Permissions live in a 1-hour token, so a revoked admin would otherwise retain access for up to an hour. On any role or status change we write `token_revocation(app_user_id, revoked_at)` and mirror it to Redis. Middleware checks the Redis mirror on every admin request — a single fast lookup — and forces a token refresh when the mirror is newer than the token's `iat`. Sign-out, suspension and role changes all take effect within one request.

### 4.6 Session management

| Aspect | Public site | Admin |
|---|---|---|
| Access token | 1 hour | 1 hour |
| Refresh token | 30 days, rotating, reuse-detected | 7 days, rotating |
| Idle timeout | None | 30 minutes, with a countdown modal at 28 |
| Absolute timeout | 30 days | 12 hours |
| Concurrent sessions | Unlimited | Listed in settings, individually revocable |
| Storage | httpOnly, secure, sameSite=lax cookies | Same |

Refresh-token reuse detection is important: if a rotated token is presented twice, the entire session family is revoked and the user is notified. That converts a stolen refresh token from an open door into a single-use event that raises an alarm.

**Never in `localStorage`.** Tokens in JS-readable storage are one XSS away from full account compromise, and no CSP is perfect.

### 4.7 Machine identities

**Service role** — server-side jobs only (ingestion, embeddings, rollups, outbox drain). Bypasses RLS; every call site passes `tenant_id` explicitly and a lint rule fails the build on a service-role query without one.

**API keys** — designed now, issued later (§29). `api_key(id, tenant_id, name, key_prefix, key_hash, scopes[], last_used_at, expires_at, revoked_at)`. Only the hash is stored; the key is shown once at creation. Presented as `Authorization: Bearer ak_live_…`.

---

## 5. Authorization flow

### 5.1 Resolution order

```
Request
  │
  ├─ 1. MIDDLEWARE (edge)
  │     Is this route public / visitor / staff?
  │     Staff route + no session → 302 /admin/login
  │     Coarse IP rate limit
  │     ↓ pass
  ├─ 2. USE-CASE WRAPPER (node)
  │     Declared permission present in token?  → 403
  │     MFA required and not verified?          → 403 mfa_required
  │     Resource-scoped ownership check         → 404 (not 403 — see below)
  │     ↓ pass
  ├─ 3. DOMAIN INVARIANTS
  │     Can this quote transition submitted → won?
  │     Is there enough stock in this lot?      → 422
  │     ↓ pass
  └─ 4. RLS
        tenant_id predicate, ownership predicate
        A leak here means layers 1–3 all failed
```

**404 rather than 403 for resources the caller may not access.** Returning 403 for another tenant's product ID confirms the ID exists — an enumeration oracle. Staff acting inside their own tenant get 403 with a clear message, because there the existence of the resource is not a secret.

### 5.2 Declarative permissions

Every endpoint and action declares its requirement as metadata: a permission key, whether MFA is required, whether the caller must own the resource, and the rate-limit bucket. The wrapper reads that metadata; handlers contain no authorisation logic. A missing declaration is a build error, not a default-allow.

Ownership predicates come in three shapes: `visitor` (the row's `visitor_id` matches), `user` (the row's `app_user_id` matches), and `assignee` (staff assigned to the record). Composite ownership — "mine, or I hold `request.read`" — is expressed as a list, evaluated as OR.

### 5.3 Trade pricing authorisation

Price resolution is a server-side concern and never a client filter. The pricing use-case takes the caller's `trade_tier_id` from the token and returns exactly one price. A client cannot request another tier's pricing because no parameter for it exists in any endpoint. `price_visibility = 'on_request'` returns `price: null` with a `priceVisibility` field, so the UI knows to render the request affordance rather than a blank.

---

## 6. Product APIs

Most product reads occur inside Server Components. The REST endpoints below exist for client-side interactions, the assistant's tool calls, and the future public API.

### 6.1 `GET /api/v1/products`

**Purpose** — Faceted catalog listing. Backs client-side filter changes, the compare picker, and the assistant's `search_products` tool.

**Request**
```
?category=floor.indoor          category path (ltree prefix)
&collection=calacatta-series
&brand=<slug>
&look=marble,concrete           lookup keys, OR within a facet
&finish=matte
&color=beige,greige
&format=60x120                  format_group
&widthMin=&widthMax=            mm
&thicknessMin=&thicknessMax=
&material=porcelain
&application=floor,wall         array containment
&indoor=true&outdoor=
&slip=R10,R11
&peiMin=3
&rectified=true
&shadeVariation=V1,V2
&priceMin=&priceMax=
&availability=in_stock|low|any
&location=<locationId>          stock at a specific showroom
&q=<free text>
&sort=relevance|price_asc|price_desc|newest|name|popularity
&limit=24&cursor=<opaque>
&locale=en&fields=&expand=
```

**Response** — `data[]` of product summaries (id, sku, slug, name, collection, brand, format, thickness, finish, look, colour swatch, price object with `priceVisibility`, primary media with blurhash and dimensions, stock status, badges), plus `page` and `meta.facets`.

`meta.facets` returns every facet with per-option counts **computed in the same query** via `FILTER` aggregates, including zero-count options so the UI can disable rather than hide them (UX §3.2).

**Permissions** — Public. Only `status = 'published'`, `deleted_at IS NULL`. Trade pricing appears only if the token carries a tier.

**Validation** — Every filter value validated against the live lookup vocabulary; unknown values rejected rather than ignored, so a typo returns an error instead of silently unfiltered results. `limit` 1–60. Numeric ranges require min ≤ max. Filter count capped at 20. Free text capped at 120 characters.

**Errors** — `400 invalid_filter_value` (with the offending parameter), `400 invalid_cursor`, `422 range_invalid`, `429 rate_limited`.

**Caching** — Public, `s-maxage=300, stale-while-revalidate=3600`, keyed on the normalised filter signature. Filter parameters are sorted and canonicalised before hashing so `?look=marble&finish=matte` and `?finish=matte&look=marble` hit the same cache entry.

### 6.2 `GET /api/v1/products/{idOrSlug}`

**Purpose** — Full product detail.

**Request** — Path accepts UUID or locale-scoped slug. `?locale=`, `?expand=collection,brand,media,relations,attributes,stock`.

**Response** — Full specification, all media grouped by role, translations for the requested locale, resolved price for the caller's tier, attribute values grouped for display, related products by relation type, and stock summary per location including `largestLotM2`.

**Permissions** — Public for published. Staff with `product.read` may pass `?includeUnpublished=true` to preview drafts.

**Validation** — Slug resolved within the requested locale; a slug from another locale returns `301` to the correct locale path rather than a 404, because slugs change and inbound links persist.

**Errors** — `404 product_not_found`, `410 product_discontinued` (with a `replacement` link where `product_relation` has one — a discontinued product should route the customer somewhere, not dead-end).

**Caching** — `s-maxage=3600`, tagged `product:{id}`. **Stock is excluded from the cached payload** and fetched live by the client (§6.3), because showing a tile as available when it isn't is a commercial failure.

### 6.3 `GET /api/v1/products/{id}/availability`

**Purpose** — Live stock, deliberately separated so the product page can be aggressively cached while availability stays current.

**Response** — Per-location: `quantityM2`, `availableM2`, `lotCount`, `largestLotM2`, `stockStatus`, `restockEta`, plus `displayLocations[]` (where it can be seen in person) and a tenant-wide roll-up.

**Permissions** — Public sees status bands and available quantity. `inventory.read` additionally sees lot numbers, calibers, shade codes and reserved quantities. Cost data is never exposed on any public path.

**Caching** — `no-store` publicly; 30-second Redis micro-cache to absorb bursts.

### 6.4 `POST /api/v1/products/{id}/quantity`

**Purpose** — Server-side quantity calculation for the tile calculator. **The arithmetic never runs on the client and never runs inside an LLM.** It's the number a customer spends money against.

**Request** — `{ areaM2 }` or `{ widthM, lengthM }`, optional `layoutPatternId`, optional `wastagePct` override, optional `locationId`.

**Response** — `requiredM2`, `wastagePct` with its resolution source (pattern → product → tenant default), `totalM2`, `boxes`, `suppliedM2`, `pieces`, `weightKg`, `pallets`, price object, and `lotAdvice`: whether the quantity fits a single lot at the chosen location, with the shade-variation warning when it does not.

**Permissions** — Public.

**Validation** — Area 0.1–100,000 m². Wastage override 0–50%. Dimensions positive and finite.

**Errors** — `422 area_out_of_range`, `404 product_not_found`, `422 missing_packaging_data` when `m2_per_box` is null — an explicit, actionable error rather than a silent division by zero.

### 6.5 `GET /api/v1/products/{id}/similar`

**Purpose** — The three labelled recommendation rails.

**Request** — `?type=same_look_different_format|same_look_lower_price|complete_the_look|related&limit=8`

**Response** — Products with `relationType`, `rank`, `isAutomatic`, and `confidence` for vector-derived rows.

Curated relations are returned ahead of automatic ones at equal rank, and the response never mixes them without labelling — the UI rail titles depend on knowing which is which.

### 6.6 `POST /api/v1/products/compare`

**Purpose** — Comparison matrix for 2–4 products, computed server-side so "which rows differ" is consistent with the spec vocabulary rather than a client-side string diff.

**Request** — `{ productIds: [...], locale }`

**Response** — `rows[]` of `{ groupKey, attributeKey, label, values[], differs, unit }` plus `identicalCount`, ordered by display group.

**Validation** — 2–4 IDs, all published, all within the tenant, deduplicated.

**Errors** — `422 too_few_products`, `422 too_many_products`, `404 product_not_found` (names the offending ID).

---

## 7. Search APIs

### 7.1 `GET /api/v1/search/suggest`

**Purpose** — Typeahead for the ⌘K overlay and the header search. Latency budget: **under 80 ms at p95**, which dictates every decision below.

**Request** — `?q=cala&limit=8&locale=en&types=product,collection,category,guide`

**Response** — Grouped suggestions with `type`, `id`, `label`, `sublabel`, `thumbnail`, `href`, `matchedOn` (`name` | `sku` | `tag`), plus `didYouMean` when trigram similarity finds a near miss on a zero-result query.

**Permissions** — Public.

**Validation** — `q` 1–60 characters, trimmed, unaccented. Queries under 2 characters return the curated "popular searches" list instead of hitting the database — a one-character prefix matches everything and is pure load.

**Errors** — `400 query_too_long`, `429 rate_limited`.

**Implementation notes** — Two paths merged: exact/prefix SKU match via `pg_trgm` (contractors type SKUs), and full-text prefix match on the locale's `search_vector`. Results cached in Redis for 10 minutes keyed on the normalised query; the top ~500 queries account for the large majority of traffic, so the cache hit rate is high and the database rarely sees a suggest query at all.

### 7.2 `GET /api/v1/search`

**Purpose** — Full search results page. Same faceting contract as `/products` so the UI reuses one component.

**Request** — `?q=` plus every filter from §6.1, plus `&mode=keyword|semantic|hybrid` (default `hybrid`).

**Response** — Same shape as `/products`, with each result carrying `matchScore` and `matchedOn`, plus `meta.interpretation` when semantic mode parsed structured intent from the query ("anti-slip outdoor 60x120" → `{slip: [R11,R12,R13], outdoor: true, format: 60x120}`).

**Permissions** — Public.

**Behaviour** — Hybrid mode runs keyword and semantic retrieval in parallel and fuses with reciprocal rank fusion, the same core the AI features use (Architecture §6.1). Pure keyword is available because a contractor searching an exact SKU wants exactly that row, and semantic expansion is noise to them.

**Errors** — `400 invalid_search_mode`, `429`, `503 search_degraded` — when the embedding provider is unavailable the endpoint silently falls back to keyword and sets `meta.degraded = true` rather than failing. A search box that returns nothing because an AI provider is down is an unacceptable failure mode.

### 7.3 `POST /api/v1/search/log`

**Purpose** — Records the search outcome, including zero-result queries. Fired on results render, not on keystroke.

**Request** — `{ query, normalizedQuery, resultCount, filters, mode, latencyMs, sessionId }`

**Response** — `204`.

**Why it exists as an explicit endpoint** — the zero-result report is, per Database Design §10.3, the most commercially useful thing in the analytics domain: it tells Amin what customers want that he doesn't stock. That's too important to leave as a side effect of a generic analytics beacon.

---

## 8. AI APIs

Three surfaces over one retrieval core. All AI endpoints are Route Handlers on the Node runtime, all are rate limited more tightly than anything else, and all degrade to a non-AI path rather than failing.

### 8.1 `POST /api/v1/ai/finder/analyze`

**Purpose** — The tile finder. Accepts an already-uploaded image reference and returns ranked matches.

**Request** — `{ uploadId, locale, corrections?: { colorFamily, finish, surfaceLook, format }, filters?: { indoor, outdoor, priceMax } }`

Note it takes an `uploadId`, not an image body. Upload happens first through the pipeline in §13; the analysis endpoint never receives a file. This keeps the request small, allows the malware scan to complete before any model sees the bytes, and makes retries cheap.

**Response**
```
{ sessionId, gateResult, confidenceBand,
  extracted: { colorFamily, colorHex, finish, surfaceLook, formatGuess,
               patternScale, shadeVariation },
  results: [ { product, rank, calibratedPercent, visualScore, semanticScore,
               explanation, alternatives: { format?, price? } } ],
  meta: { latencyMs, cacheHit, modelVersions } }
```

**Permissions** — Public, visitor-scoped. The `sessionId` is shareable (`/tile-finder/results/{id}`) and readable by anyone holding the ID, since UX §1.1 requires shareable results; nothing sensitive is contained in one.

**Validation** — `uploadId` must exist, belong to the calling visitor, have `purpose = 'finder_query'` and `scan_status = 'clean'`. Corrections validated against live lookup vocabularies.

**Pipeline** — Safety and validity gate → parallel (SigLIP visual encode ‖ Gemini structured attribute extraction) → attribute pre-filter as SQL → dual kNN → RRF → cross-encoder rerank of the top 12 → grounded explanation generation → calibration to a displayed percentage.

**Error cases**
| Condition | Response |
|---|---|
| Not a tile / surface | `200` with `gateResult: 'not_a_tile'`, `results: []`, and guidance. Not an error — a designed state (UX §3.4) |
| Too dark or too angled | `200` with the specific `gateResult` and a retake suggestion |
| Unsafe content | `422 content_rejected`, logged, no model spend beyond the gate |
| No result above threshold | `200` with `confidenceBand: 'none'` and the fallback affordances |
| Vision provider down | `503 ai_unavailable` with `fallback: 'assistant'` |
| Budget ceiling reached | `503 ai_budget_exceeded`, degraded to attribute-only matching |

**Caching** — Keyed on the image perceptual hash plus the correction set. A repeat upload of the same photo costs nothing, and `finder_session.image_phash` is indexed for exactly this.

**Rate limit** — 10/hour per visitor, 30/hour per IP. Images are the most expensive requests on the platform.

### 8.2 `POST /api/v1/ai/assistant/chat`

**Purpose** — The interior assistant. Streaming, tool-calling.

**Request** — `{ conversationId?, message, locale, context?: { spaceType, areaM2, budget, productIds } }`. Omitting `conversationId` creates a conversation.

**Response** — `text/event-stream`, using a typed event protocol rather than raw tokens:

| Event | Payload |
|---|---|
| `conversation` | `{ conversationId, messageId }` — emitted first so the client can update the URL immediately |
| `tool_start` | `{ toolName, label }` — renders "Checking stock in Baabda…" |
| `tool_result` | `{ toolName, summary, productIds }` |
| `text_delta` | `{ delta }` — word chunks, not characters (UX §5.9) |
| `products` | `{ products: [...] }` — full product cards, emitted after the sentence introducing them |
| `suggestions` | `{ chips: [...] }` — tappable follow-ups |
| `done` | `{ messageId, tokens, groundingOk }` |
| `error` | `{ code, message, recoverable }` |

Emitting hydrated product objects as a distinct event, rather than expecting the client to parse product references out of prose, is what makes the grounding rule visible in the transport: **the assistant cannot mention a product that did not arrive in a `products` event.**

**Tools exposed** — `search_products`, `get_product`, `check_stock`, `calculate_quantity`, `list_showrooms`, `create_quote_draft`. Each is a use-case call, permission-checked as the calling principal. The model has no more authority than the visitor does.

**Permissions** — Public, visitor-scoped. `create_quote_draft` requires explicit user confirmation in the UI before the action is committed; the tool creates a draft, never a submitted request.

**Validation** — Message 1–2,000 characters. Conversation must belong to the caller. History capped at 20 turns, older turns summarised server-side. Tool arguments Zod-validated before execution — a malformed model output is a caught error, never a database query.

**Grounding enforcement** — Before `done`, the response text is scanned for product references and compared against the union of tool-returned IDs. A mismatch sets `groundingOk: false`, logs a grounding violation, and strips the unsupported claim. Arithmetic is never accepted from the model; `calculate_quantity` calls the domain function.

**Errors** — `429 rate_limited` (20 messages/hour per visitor), `422 message_too_long`, `404 conversation_not_found`, `503 ai_unavailable` (with the catalog as fallback), mid-stream `error` events for tool failures with `recoverable: true` so the client can offer a retry without losing the conversation.

### 8.3 Supporting AI endpoints

| Endpoint | Purpose | Permissions | Notes |
|---|---|---|---|
| `GET /api/v1/ai/conversations/{id}` | Resume a conversation | Owner or `request.read` | Returns messages with `referencedProductIds` hydrated |
| `DELETE /api/v1/ai/conversations/{id}` | Delete history | Owner | Soft delete; retained for the abuse window then purged |
| `GET /api/v1/ai/finder/sessions/{id}` | Shareable result set | Public with ID | Results re-hydrated from stored IDs, not recomputed |
| `POST /api/v1/ai/feedback` | Thumbs on a result or message | Public | `{ referenceType, referenceId, rating, reason, comment }`. Structured reasons only |
| `POST /api/v1/ai/finder/sessions/{id}/adjust` | Correct the detected attributes and re-rank | Owner of session | Writes `user_corrections` — labelled training data |

### 8.4 The AI endpoint contract

Four rules that apply to every AI endpoint and are enforced by a shared wrapper:

1. **Budget check before spend.** Each request reads the tenant's month-to-date `ai_interaction` cost against the ceiling in `app_setting`. Over budget degrades to the non-AI path and alerts; it never silently overspends.
2. **Every call writes `ai_interaction`**, including failures, with provider, model, tokens, cost, latency and cache-hit status. Cost that isn't recorded can't be controlled.
3. **Provider abstraction.** Handlers call `VisionProvider` / `EmbeddingProvider` / `ChatProvider` interfaces. Switching Gemini to another model is configuration, and a provider outage triggers automatic failover where a substitute exists.
4. **Timeout and degradation, never a hang.** 8 s on extraction, 25 s on chat completion, 3 s on embedding. On timeout the endpoint returns a degraded result with `meta.degraded = true` rather than a spinner that never resolves.

---

## 9. Media APIs

### 9.1 Read

| Endpoint | Purpose | Permissions |
|---|---|---|
| `GET /api/v1/media/{id}` | Asset metadata: dimensions, blurhash, focal point, alt text per locale | Public for product media; owner or `media.manage` otherwise |
| `GET /api/v1/media` | Library listing: `?folder=&tags=&search=&unusedOnly=&cursor=` | `media.manage` |
| `GET /api/v1/media/{id}/usages` | Where an asset is referenced | `media.manage` |

Delivery URLs are never constructed by the client. The API returns a `srcset` descriptor — an array of `{ width, url, format }` from named Cloudinary transformations — so transformation presets can change centrally without a client deploy, and so the renderer always knows the intrinsic dimensions and cannot cause layout shift.

`usages` exists because the most dangerous media operation is deleting an image that three products still reference. Delete is blocked when usages exist, with the list returned in the error.

### 9.2 Write (Server Actions)

`updateMediaMetadata` (alt text per locale, tags, folder, focal point) · `deleteMedia` (blocked if referenced) · `bulkTagMedia` · `setProductMedia` (assign role and order) · `reorderProductMedia`.

All require `media.manage`. Alt-text edits clear `is_machine_generated` and stamp `reviewed_by`, which is what makes the "AI-drafted, human-approved" rule from UX §7.2 enforceable rather than aspirational.

---

## 10. Inventory APIs

Inventory is the most authorisation-sensitive domain that isn't money. Reads are split by audience; every write goes through the ledger.

### 10.1 Reads

**`GET /api/v1/inventory/stock`** — `?productId=&locationId=&status=&lowStockOnly=&cursor=`. Returns `product_stock` rows with product summaries. Requires `inventory.read`. Public availability is served by `/products/{id}/availability` (§6.3) instead, which exposes a deliberately narrower projection.

**`GET /api/v1/inventory/lots`** — `?productId=&locationId=&status=&minAvailableM2=`. Returns lots with `lotNumber`, `caliber`, `shadeCode`, quantities, receipt date, and cost data only for `owner`/`admin`. Requires `inventory.read`.

**`GET /api/v1/inventory/movements`** — the ledger. `?productId=&locationId=&lotId=&movementType=&from=&to=&referenceId=`. Requires `inventory.read`. Cursor-paginated, never offset — this table is partitioned and grows without bound.

**`GET /api/v1/inventory/alerts`** — products below threshold, with days-of-cover where sales velocity is known. Requires `inventory.read`.

### 10.2 Writes — all Server Actions, all ledger-first

| Action | Purpose | Permission | Validation | Errors |
|---|---|---|---|---|
| `receiveStock` | Record an incoming delivery | `inventory.adjust` | Lot number required; positive quantity; location must hold sellable stock | `422 location_not_stockable`, `409 duplicate_lot` |
| `adjustStock` | Correct a discrepancy | `inventory.adjust` | **Reason mandatory**; resulting quantity ≥ 0 | `422 reason_required`, `422 negative_result` |
| `transferStock` | Move between locations | `inventory.adjust` | Two movements in one transaction; source must have availability | `422 insufficient_stock` |
| `reserveStock` | Hold against an accepted quote | `inventory.adjust` | Lot-level, `FOR UPDATE` ordered by lot ID | `409 lot_depleted`, `422 quantity_exceeds_available` |
| `releaseReservation` | Free a held quantity | `inventory.adjust` | Reservation must exist and be active | `404 reservation_not_found` |
| `recordStocktake` | Physical count reconciliation | `inventory.adjust` | Produces `count_correction` movements per lot with variance | `422 count_incomplete` |
| `writeOffStock` | Damage or loss | `inventory.adjust` + MFA | Reason mandatory; audited at high severity | `422 reason_required` |

**Invariants enforced in the domain layer, not the handler:** available never goes negative; a reservation never exceeds `available_m2` on its lot; corrections are new rows and never edits; transfers are atomic across both locations. Concurrency uses `SELECT … FOR UPDATE` on the specific lot rows, ordered by ID to prevent deadlock when two multi-lot reservations overlap.

**Every write emits an outbox event** (`stock.received`, `stock.low`, `stock.depleted`) inside the same transaction, which is what makes back-in-stock notifications reliable.

---

## 11. Quote and commerce APIs

### 11.1 Basket

The basket is a draft `quote_request` owned by the visitor — not a separate structure. This means a basket becomes a quote without translation, and an abandoned basket is analysable with the same queries.

| Action | Purpose | Notes |
|---|---|---|
| `addBasketItem` | Add a product with quantity | Creates the draft and a default zone on first add. Quantity computed server-side |
| `updateBasketItem` | Change quantity, zone, or notes | Recomputes boxes, weight, totals, and lot advice |
| `removeBasketItem` | Remove a line | |
| `addBasketZone` / `renameZone` / `removeZone` | Room-zone management | Removing a zone reassigns its items to a default zone rather than deleting them |
| `setZoneDimensions` | Area or W×L, plus layout pattern | Wastage resolves pattern → product → tenant |
| `clearBasket` | Empty | Soft-clears; recoverable within the session |

**`GET /api/v1/basket`** returns the hydrated draft: zones, items with live prices and current stock status, totals, total weight, and per-item lot advice. Called on hydration and after cross-tab changes.

**Permissions** — Visitor-owned. **Validation** — Max 50 line items, quantity 0.01–100,000 m², product must be published. **Errors** — `404 product_not_found`, `410 product_discontinued` (returns the replacement), `422 quantity_out_of_range`, `409 basket_locked` once submitted.

### 11.2 `submitQuoteRequest` (Server Action)

**Purpose** — The primary conversion event on the public site.

**Request** — Contact details, project type, timeline, budget band, preferred showroom, optional floor-plan upload ID, notes, and the source attribution captured earlier in the session.

**Behaviour, in one transaction** — validate → verify every product is still published and priced → **write snapshots** of SKU, name, unit price, packaging and full spec onto each item → compute totals → generate the human reference (`AC-2026-0847`) from a sequence → transition status `draft → submitted` → write `quote_status_history` → write the audit row → emit `quote.submitted` to the outbox → return the reference.

**Response** — `{ reference, quoteRequestId, expectedResponseHours, whatsappDeepLink }`.

**Permissions** — Public, visitor-owned draft.

**Validation** — At least one item. Contact name plus at least one of email or phone. Phone normalised to E.164. Email format plus MX presence check. Honeypot field and a timing check for bot submissions. Rate limited to 3 submissions per visitor per hour.

**Error cases** — `422 empty_basket`, `422 contact_required`, `422 invalid_phone`, `409 already_submitted` (idempotent — returns the existing reference rather than creating a duplicate), `410 product_no_longer_available` naming the items with a remove-and-resubmit path, `429 too_many_submissions`.

**Deliberately not done here:** stock is **not** reserved on submission. Reserving on an anonymous form fill would let anyone deplete availability. Reservation happens on salesperson acceptance (Database Design §6.7).

### 11.3 Quote management

| Endpoint / Action | Purpose | Permission |
|---|---|---|
| `GET /api/v1/quote-requests` | Admin list: `?status=&assignedTo=&source=&from=&to=&search=` | `request.read` |
| `GET /api/v1/quote-requests/{id}` | Full detail: items with snapshots, contact, AI transcript, prior history for this contact | `request.read` |
| `GET /api/v1/quote-requests/{id}/pdf` | Branded quote PDF | `request.read`, or the owning visitor via signed URL |
| `acknowledgeQuote` | Mark as seen, stops the SLA clock | `request.respond` |
| `assignQuote` | Route to a salesperson | `request.respond` |
| `priceQuote` | Set final line prices and total | `request.respond` |
| `transitionQuote` | Status change with a note | `request.respond` |
| `reserveQuoteStock` | Allocate lots against the quote | `inventory.adjust` |
| `closeQuote` | Won or lost, with `lostReason` | `request.respond` |

**Validation on transitions** — the status machine is explicit: `draft → submitted → acknowledged → quoted → negotiating → {won,lost}`, with `expired` and `cancelled` reachable from any non-terminal state. Illegal transitions return `422 invalid_status_transition` naming the allowed set. `lostReason` is mandatory when closing as lost — otherwise the pipeline report is meaningless within a month.

Every transition writes `quote_status_history` and emits an outbox event.

### 11.4 Samples and bookings

`requestSamples` — max 3 per visitor per 30 days (enforced by trigger *and* checked in the use-case for a clean error), address required for shipping, writes `sample` movements against real stock. Errors: `422 sample_limit_exceeded` with the reset date, `422 address_required`, `409 sample_already_requested`.

`bookShowroomVisit` — validates the slot against the location's opening hours, `booking_slot_minutes` and `max_concurrent_bookings`; optionally attaches the current basket so the selection arrives before the customer does. Errors: `409 slot_unavailable` (returns the nearest alternatives), `422 outside_opening_hours`, `422 booking_too_far_ahead`.

`GET /api/v1/showrooms/{id}/availability?date=` returns bookable slots. Public.

---

## 12. Engagement APIs

| Action / Endpoint | Purpose | Permission | Notes |
|---|---|---|---|
| `toggleSavedItem` | Wishlist heart | Visitor | Idempotent by `(visitor, product)`; returns the new state and count |
| `GET /api/v1/saved` | Wishlist listing | Owner | Hydrated with live price and stock |
| `moveSavedToProject` | File a save into a project | Owner | |
| `POST /api/v1/recently-viewed` | Record a view | Visitor | Writes Redis synchronously, Postgres asynchronously via the event stream |
| `GET /api/v1/recently-viewed` | The strip | Owner | Reads Redis only — never touches Postgres |
| `createProject` / `updateProject` / `archiveProject` | Project CRUD | Owner | v1.1 |
| `addProjectItem` / `moveProjectItem` / `setProjectItemRole` | Composition | Owner | Alternatives sit alongside the selected tile via `isSelected` |
| `createProjectShare` | Generate a client link | Owner | Returns token URL; optional password and expiry |
| `revokeProjectShare` | Kill a link | Owner | |
| `GET /api/v1/shared/projects/{token}` | Client-facing read | **Public with token** | Served by a `SECURITY DEFINER` function, not by loosening RLS on `project` |
| `POST /api/v1/shared/projects/{token}/comments` | Client comments without an account | Public with token | Rate limited per token; requires `permission = 'comment'` |
| `promoteProjectToQuote` | Convert to a quote request | Owner | Insert-select — the zone structures are identical by design |
| `createStockAlert` | Notify when available | Visitor | `minQuantityM2` respected: a contractor needing 340 m² isn't alerted at 12 |

**Share token security:** tokens are 32 bytes of CSPRNG output, unique-indexed, revocable, optionally password-protected and optionally expiring. Token endpoints are rate limited per token and per IP, and a revoked token returns `410 share_revoked` rather than `404`, so a client who bookmarked a link gets an explanation instead of confusion.

---

## 13. File upload pipeline

### 13.1 Three-step, direct-to-storage

Files never pass through the application server. Serverless request bodies are capped at a few megabytes, a 40 MB supplier PDF would fail, and proxying bytes through a function is wasteful even when it fits.

```
1. POST /api/v1/uploads/intent
   Client declares: filename, mimeType, bytes, purpose, checksum
   Server: validates, quota-checks, creates the `upload` row (status=pending),
           returns a signed PUT URL scoped to {tenant}/{purpose}/{uuid}

2. Client PUTs the bytes directly to Supabase Storage
   No app server involvement. Progress from the browser.

3. POST /api/v1/uploads/{id}/confirm
   Server: verifies the object exists and the checksum matches
           → magic-byte type verification (not the declared MIME, not the extension)
           → EXIF strip for images
           → malware scan (async for large files; scan_status gates all downstream use)
           → dimension/page-count extraction
           → sets scan_status, expires_at by purpose
           → returns the upload record
```

### 13.2 Endpoint specifications

**`POST /api/v1/uploads/intent`**
- **Purpose** — Obtain a signed upload URL.
- **Request** — `{ filename, mimeType, bytes, purpose, checksumSha256 }`
- **Response** — `{ uploadId, uploadUrl, expiresAt, maxBytes }`
- **Permissions** — Purpose-dependent: `finder_query`, `visualizer_source`, `floor_plan` are visitor-level; `ingestion_source` requires `ingestion.run`; `trade_document` requires an authenticated user.
- **Validation** — MIME must be in the purpose's allowlist. Size within the purpose's cap (images 15 MB, PDFs 50 MB, spreadsheets 20 MB). Per-visitor daily quota (20 images, 200 MB). Filename sanitised and never used as a storage path.
- **Errors** — `422 unsupported_media_type`, `413 file_too_large`, `429 upload_quota_exceeded`, `403 purpose_not_permitted`.

**`POST /api/v1/uploads/{id}/confirm`**
- **Response** — Upload record with `scanStatus`, dimensions, and for `finder_query` a precomputed perceptual hash so the analyse call can hit cache immediately.
- **Errors** — `404 upload_not_found`, `409 already_confirmed`, `422 checksum_mismatch`, `422 file_not_found_in_storage`, `422 content_type_mismatch` (declared MIME contradicts magic bytes — a real attack signature, logged at elevated severity), `422 scan_failed`.

**`DELETE /api/v1/uploads/{id}`** — owner or `media.manage`; removes the object and the row.

### 13.3 Promotion to media

User uploads live in Supabase Storage. Product photography lives in Cloudinary. `promoteUploadToMedia` (Server Action, `media.manage`) transfers an upload into Cloudinary, generates the blurhash, extracts the dominant colour and focal point, deduplicates by `checksum_sha256`, and creates the `media_asset` row. This is how ingestion-extracted product images become catalog imagery.

### 13.4 Rules

Every uploaded file gets a server-generated UUID path; the original filename is metadata only. `scan_status = 'clean'` gates every downstream use — an unscanned file is never passed to a model, rendered, or promoted. Signed URLs expire in 15 minutes for upload and 1 hour for download. Lifecycle expiry runs via `pg_cron` per the retention table in Database Design §4.4.

---

## 14. Admin APIs

### 14.1 The CRUD family

Nine resources share one contract, which is why they get one specification rather than nine: `brands`, `collections`, `categories`, `materials`, `finishes`, `surface-looks`, `color-families`, `applications`, `layout-patterns`.

| Operation | Shape | Permission |
|---|---|---|
| List | `GET /api/v1/admin/{resource}?search=&isActive=&cursor=` | `product.read` |
| Read | `GET /api/v1/admin/{resource}/{id}` | `product.read` |
| Create | Server Action | `content.manage` (taxonomy) / `product.update` |
| Update | Server Action, partial | same |
| Reorder | Server Action, batch `{id, sortOrder}[]` | same |
| Deactivate | Server Action — **never hard delete** | same |

**Shared validation** — `key` immutable after creation (it is referenced by data and by code); slug uniqueness per tenant per locale; translations required for every `supported_locale` before activation; deactivation blocked while products reference the row, with the count returned in the error.

**Shared errors** — `409 key_in_use`, `409 slug_taken`, `422 missing_translation` (names the locales), `409 referenced_by_products` (with count and a sample), `404`.

### 14.2 Product management

| Operation | Notes |
|---|---|
| `GET /api/v1/admin/products` | Full filter set including `status`, `hasImages`, `missingTranslation`, `missingSpec`, `noEmbedding`. Saved views stored per user. The "missing" filters are how a 2,000-SKU catalog gets cleaned up |
| `createProduct` | Requires SKU, brand, category, dimensions, packaging. Everything else optional at draft |
| `updateProduct` | Partial. Field-level permission: `price.base.write` gated separately from `product.update` |
| `publishProduct` | **Validation gate:** primary image, translations for all locales, packaging data, price or explicit `on_request`, embeddings present. Returns a per-field checklist on failure rather than a single message |
| `unpublishProduct` / `archiveProduct` / `discontinueProduct` | Discontinue requires a replacement suggestion where one exists |
| `duplicateProduct` | Copies specs and media, clears SKU and slugs |
| `bulkUpdateProducts` | Max 500 ids, allowlisted fields only, requires typed confirmation above 50, single transaction, one audit row per product plus one batch row |
| `deleteProduct` | Soft. Blocked if referenced by a non-terminal quote; returns the references |

**`publishProduct`'s checklist response** is a small design decision with a large effect: an editor who gets "cannot publish" learns nothing, while an editor who gets "missing: Arabic description, primary image" fixes it in a minute.

### 14.3 Translations and content

`GET /api/v1/admin/translations/missing?entityType=&locale=` — the translation queue. `updateTranslation` / `bulkApproveTranslations` — clears `is_machine_translated`, stamps `reviewed_by`. `generateTranslation` — AI draft, never auto-approved, returns with `isMachineTranslated: true`.

### 14.4 Ingestion

| Endpoint / Action | Purpose | Permission | Notes |
|---|---|---|---|
| `POST /api/v1/admin/ingestion/jobs` | Start a job from confirmed uploads | `ingestion.run` | Returns immediately with `jobId`; work runs in Inngest |
| `GET /api/v1/admin/ingestion/jobs/{id}` | Status and counts | `ingestion.run` | Polled, or pushed via Supabase Realtime |
| `GET /api/v1/admin/ingestion/jobs/{id}/items` | Review queue | `ingestion.approve` | **Sorted confidence-ascending by default** (UX §3.9) |
| `GET /api/v1/admin/ingestion/items/{id}` | One staged product with per-field confidence and source bounding boxes | `ingestion.approve` | The bboxes drive the side-by-side highlight |
| `updateStagedField` | Correct a field | `ingestion.approve` | Records `was_edited` — labelled data for prompt tuning |
| `approveStagedProduct` | Promote to `product` | `ingestion.approve` | Validates as a real product; queues embeddings; returns the next item for keyboard flow |
| `rejectStagedProduct` | Discard with a reason | `ingestion.approve` | |
| `mergeStagedProduct` | Apply to an existing product instead of creating | `ingestion.approve` | Field-level merge choices |
| `bulkApproveStaged` | Accept everything above a confidence threshold | `ingestion.approve` | Threshold min 0.90; typed confirmation; count shown before commit |
| `cancelIngestionJob` | Stop and discard | `ingestion.run` | |

**Errors** — `422 validation_failed_for_promotion` (per-field), `409 duplicate_sku` (offers merge), `409 job_not_reviewable`, `422 threshold_too_low`.

### 14.5 Users, roles, settings

`GET /api/v1/admin/users` · `inviteUser` (email invite, role assignment, requires `user.invite`) · `updateUserRoles` (`role.manage`, **owner only**, writes `token_revocation`) · `suspendUser` · `resetUserMfa` (owner only, high-severity audit) · `GET /api/v1/admin/audit` (`audit.read`, filterable by actor, entity, action, date; export to CSV) · `updateSetting` (`settings.write`).

`approveTradeAccount` / `rejectTradeAccount` — `user.manage`; approval assigns a `price_tier_id` and emits an outbox event that notifies the applicant.

---

## 15. Dashboard and analytics APIs

### 15.1 Dashboard

**`GET /api/v1/admin/dashboard`** — one call, not six. Returns the KPI tiles, the "Needs you" action list (unreviewed ingestion items, low-stock alerts, quotes unanswered beyond SLA), the week's request sparkline, top zero-result searches, and recent audit activity.

- **Permissions** — `analytics.read`; each block is additionally permission-filtered, so a `sales` user sees requests but not AI spend.
- **Caching** — 60-second Redis cache per tenant per role signature. A dashboard refreshed every 30 seconds by five admins must not run twenty aggregate queries a minute.
- **Errors** — Partial failure returns `200` with the failing block marked `{ error: true }` rather than failing the whole dashboard. One slow analytics query should not blank the operational view.

### 15.2 Analytics reads

| Endpoint | Purpose | Notes |
|---|---|---|
| `GET /api/v1/admin/analytics/overview` | Traffic, funnel, conversion over a range | Reads rollup tables, never raw events |
| `GET /api/v1/admin/analytics/products` | Views, basket adds, quote inclusions, conversion per product | `?sort=&limit=` |
| `GET /api/v1/admin/analytics/search` | Top queries, **zero-result queries**, CTR | The most commercially useful report |
| `GET /api/v1/admin/analytics/filters` | Filter combinations returning nothing | Catalog gap signal |
| `GET /api/v1/admin/analytics/ai` | Calls, cost, latency, error rate, confidence distribution, feedback rate, per feature | |
| `GET /api/v1/admin/analytics/quotes` | Pipeline by source, value, win rate, mean response time | Source attribution answers "is the AI paying for itself" |
| `GET /api/v1/admin/analytics/export` | CSV/XLSX for any of the above | Rate limited 5/hour; generated async above 50 k rows and delivered as a signed URL |

**Shared validation** — date range required, maximum 400 days, `from ≤ to`, granularity (`day`/`week`/`month`) must suit the range. **Errors** — `422 range_too_large`, `422 invalid_granularity`, `503 rollup_stale` when the nightly job hasn't run, returned with the last-successful timestamp so the number on screen is never silently out of date.

### 15.3 Event ingestion

**`POST /api/v1/events`** — batched client beacon. `{ events: [{ type, entityType, entityId, properties, occurredAt }] }`, max 20 per batch, sent via `navigator.sendBeacon` on visibility change.

- **Permissions** — Public, visitor-scoped. Server assigns `tenant_id`, `visitor_id`, `app_user_id`, `session_id`, IP-derived country and device type. **Client-supplied identity fields are ignored**, not trusted.
- **Validation** — Event type must be in the enum; unknown types are dropped with a counter rather than rejected, so a stale client can't error-loop. `occurredAt` must be within ±24 hours. Properties capped at 4 KB.
- **Response** — `202`, always. Analytics failure must never surface to a user.
- **Rate limit** — 120 batches/hour per visitor.

Commerce-critical events (quote submitted, sample requested, stock reserved) are written server-side inside their transactions, never via this beacon, because a blocked beacon must not lose them.

---

## 16. Notification APIs

Notifications are emitted by the outbox, not called directly by handlers. Business code writes an event; the notification service decides recipients, channels and templates.

| Endpoint / Action | Purpose | Permission |
|---|---|---|
| `GET /api/v1/admin/notifications` | Delivery log with per-channel status | `settings.write` |
| `GET /api/v1/admin/notification-templates` / `updateTemplate` | Template management per key, channel, locale | `settings.write` |
| `previewNotification` | Render a template with sample data | `settings.write` |
| `sendTestNotification` | Send to self only | `settings.write` |
| `GET /api/v1/notifications/preferences?token=` | Manage preferences without login | Public with signed token |
| `POST /api/v1/notifications/unsubscribe` | One-click unsubscribe | Public with signed token |
| `retryNotification` | Re-attempt a failed delivery | `settings.write` |

**Validation** — templates must declare their variables and are validated against the event payload schema on save, so a template referencing `{{customerName}}` when the event has no such field fails at edit time rather than at send time. Unsubscribe tokens are HMAC-signed, non-guessable and scoped to one recipient and category.

**Suppression is absolute:** the send path checks `notification_suppression` (hard bounces, complaints) before preferences. A suppressed address is never sent to regardless of settings — a deliverability and legal requirement.

**Errors** — `422 template_variable_mismatch`, `422 invalid_unsubscribe_token`, `409 already_unsubscribed`, `503 channel_unavailable` (queued for retry, not lost).

---

## 17. Connector APIs and webhook architecture

### 17.1 Outbound: the transactional outbox

```
Business transaction (one commit)
  ├── write domain change
  ├── write audit_log row
  └── write outbox_event row          ← same transaction
              │
              ▼
Inngest worker (every 10s, or triggered)
  ├── claim: SELECT … FOR UPDATE SKIP LOCKED
  ├── fan out to connectors subscribed to this event_type
  ├── per connector: transform → deliver → log to connector_event_log
  ├── success → status = delivered
  └── failure → attempts++, exponential backoff via available_at
                (1m, 5m, 25m, 2h, 10h), then status = dead + alert
```

The outbox row commits with the business change, so a quote is never submitted without its notification event and no event is emitted for a rolled-back transaction. This is the property that a webhook call inside a request handler cannot provide, in either direction.

**Event catalogue (v1)** — `quote.submitted`, `quote.status_changed`, `quote.won`, `quote.lost`, `sample.requested`, `sample.shipped`, `booking.requested`, `booking.confirmed`, `stock.received`, `stock.low`, `stock.depleted`, `stock.back_in_stock`, `product.published`, `product.discontinued`, `price.changed`, `trade_account.approved`, `ingestion.review_ready`, `ingestion.completed`, `ai.budget_threshold`.

Every event payload carries `{ id, type, version, tenantId, occurredAt, data, idempotencyKey }`. The `version` field exists from event one, so payload evolution never breaks a subscriber.

### 17.2 Inbound webhooks

**`POST /api/v1/webhooks/{connectorKey}`**

- **Purpose** — Receive provider callbacks: WhatsApp message status and inbound replies, Resend delivery and bounce events, Cloudinary upload notifications, and later Stripe and ERP.
- **Authentication** — Per-provider signature verification (HMAC or public-key) against the **raw request body**, before any parsing. Timestamp tolerance of 5 minutes rejects replays.
- **Idempotency** — The provider's delivery ID is stored in `connector_event_log` with a unique index. A duplicate returns `200` without reprocessing.
- **Response** — `200` immediately after persisting the raw event. **Processing is asynchronous.** Providers retry on non-2xx and on slow responses, so doing work inline turns a slow database query into a webhook storm.
- **Errors** — `401 invalid_signature` (logged at elevated severity — repeated failures indicate either a misconfiguration or an attack), `404 connector_not_configured`, `409 duplicate_delivery` (returned as `200` to stop provider retries), `422 unparseable_payload` (stored raw for inspection rather than discarded).

**Inbound WhatsApp deserves a note:** a customer replying to a quote notification produces an inbound message that must attach to the correct `quote_request`. Matching is by phone number plus the most recent open request, and ambiguous matches are surfaced in the admin inbox for a human rather than guessed.

### 17.3 Connector management

`GET /api/v1/admin/connectors` (status, health, capabilities, last error) · `updateConnectorConfig` (`connector.manage`; **secrets go to the secret manager, only a reference is stored**) · `testConnector` (live health check) · `GET /api/v1/admin/connectors/{key}/events` (delivery log) · `retryOutboxEvent` · `replayOutboxEvents` (range replay after fixing a failing integration).

**Validation** — config validated against the connector's declared Zod schema before saving; enabling a connector requires a passing health check, so a misconfigured connector cannot start silently dropping events.

---

## 18. Error handling strategy

### 18.1 One shape, everywhere

REST errors use RFC 9457 `application/problem+json`:

```
{ "type": "https://api.aminceramic.com/errors/insufficient_stock",
  "title": "Not enough stock in the selected lot",
  "status": 422,
  "code": "insufficient_stock",
  "detail": "Lot A4471 has 18.4 m² available; 340 m² requested.",
  "instance": "/api/v1/quote-requests/0193.../actions/reserve",
  "requestId": "req_0193f8...",
  "errors": [ { "field": "items[0].quantityM2", "code": "exceeds_available",
                "message": "Reduce to 18.4 m² or select another lot." } ],
  "meta": { "availableM2": 18.4, "alternativeLots": [...] } }
```

Server Actions return the same content as a discriminated union rather than throwing.

**`code` is the stable contract**, not `title` and not `status`. Clients branch on `code`; humans read `detail`. Codes are namespaced by domain, never reused with different meanings, and never removed — deprecated codes keep returning until every client is known to have moved.

**`meta` carries the recovery path.** An error that says "not enough stock" is a dead end; one that returns the available quantity and the alternative lots lets the UI offer a fix. Every 4xx that a user can act on carries what they need to act.

### 18.2 Status code discipline

| Code | Used for | Never used for |
|---|---|---|
| `400` | Malformed request, unparseable body, bad cursor | Business rule failures |
| `401` | Missing or invalid credentials | Insufficient permission |
| `403` | Authenticated but not permitted, inside the caller's own tenant | Resources the caller may not know exist |
| `404` | Not found, **or** exists but the caller may not know it does | |
| `409` | Conflict: duplicate, concurrent modification, illegal state | Validation failures |
| `410` | Discontinued product, revoked share link | |
| `413` | File too large | |
| `422` | Well-formed but semantically invalid; all business rule failures | Missing auth |
| `429` | Rate limited — always with `Retry-After` | |
| `500` | Unexpected. Never carries internal detail | Anything anticipated |
| `503` | Dependency unavailable, degraded mode, budget exceeded | |

The `403`/`404` distinction is the enumeration defence from §5.1: cross-tenant and non-owned resources return `404`, so an attacker cannot use error codes to discover which IDs exist.

### 18.3 Failure philosophy

**Degrade, don't fail.** The site must work when AI providers are down (fall back to keyword search and the catalog), when Redis is down (serve from Postgres with a latency penalty), when Cloudinary is slow (blurhash placeholders persist), when the analytics rollup is stale (label the number as stale). Only Postgres being unavailable is a genuine outage.

**Never leak internals.** A `500` returns a generic message plus a `requestId`. Stack traces, SQL, table names and provider errors go to Sentry, never to a client.

**Errors are actionable.** "Something went wrong" is banned. Every message names what happened and what to do, in the interface's voice — no apologies, no blame (UX §4.17).

---

## 19. Validation strategy

### 19.1 Four layers, four jobs

| Layer | Validates | Failure mode |
|---|---|---|
| **Client (shared Zod schema)** | Format, required, ranges — for immediate feedback | Inline field message |
| **API boundary (same schema)** | Everything again, authoritatively | `422` with field errors |
| **Domain layer** | Business invariants: stock sufficiency, status transitions, lot rules, sample limits | Typed domain error → `422` |
| **Database** | Constraints, FKs, checks, triggers | `500` if reached — a bug in the layers above |

The client and API share the *same schema module*, so they cannot drift. The client copy exists purely for responsiveness; **it is never trusted**, and the server re-validates from scratch on every request.

Reaching the database constraint layer is treated as a defect: it means a business rule leaked out of the domain layer. Those errors are alerted on, not just logged.

### 19.2 Rules

- **Strict parsing.** Unknown fields are rejected, not stripped. A client sending `pirce` gets an error instead of a silently unpriced product.
- **Parse, don't validate.** Handlers receive parsed, branded types (`ProductId`, `Sku`, `M2`), not raw strings. A function taking `M2` cannot be passed millimetres.
- **Coercion is explicit.** Query strings are coerced through declared transforms; there is no implicit `"true"` → `true` anywhere.
- **Normalisation at the boundary:** phone to E.164, email lowercased and trimmed, slugs transliterated, search text unaccented, whitespace collapsed. Downstream code never re-normalises.
- **Enum values validated against the live database vocabulary** for lookup-table enums, since those change without a deploy (Database Design §5.3). A cached vocabulary with a 5-minute TTL backs this.
- **File validation is content-based**, never extension- or declared-MIME-based (§13.1).
- **Bounded everything:** array lengths, string lengths, numeric ranges, expansion depth, batch sizes. An unbounded input is a denial-of-service vector.

---

## 20. Rate limiting

### 20.1 Tiers

Sliding-window counters in Upstash Redis, applied at the edge where possible.

| Bucket | Limit | Key | Rationale |
|---|---|---|---|
| Global read | 300 / min | IP | Absorbs scrapers without hurting real users |
| Catalog & search | 120 / min | visitor | |
| Suggest | 60 / min | visitor | High frequency by design |
| **AI: finder** | **10 / hour** | visitor | Most expensive request on the platform |
| **AI: finder** | 30 / hour | IP | Defeats cookie clearing |
| **AI: assistant** | 20 messages / hour | visitor | |
| Upload intent | 20 / day, 200 MB | visitor | |
| Quote submission | 3 / hour | visitor | Anti-spam without blocking legitimate resubmission |
| Sample request | 3 / 30 days | visitor | Business rule as well as a limit |
| Auth: login | 5 / 15 min, then exponential lockout | IP + email | |
| Auth: password reset | 3 / hour | email | |
| Share-link access | 60 / hour | token | Limits token brute-forcing |
| Analytics beacon | 120 / hour | visitor | |
| Admin API | 600 / min | user | Generous; admins are trusted, not unlimited |
| Export | 5 / hour | user | Expensive queries |
| Webhook inbound | 1000 / min | connector | Above provider peak, below abuse |

### 20.2 Behaviour

Responses carry `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` and, on `429`, `Retry-After`. The UI shows a live countdown rather than a generic error (UX §4.17).

Authenticated users get higher limits than anonymous; staff higher again. Trade accounts get elevated catalog and search limits, since a designer legitimately browses hundreds of products in a session.

**Redis unavailable → fail open** for reads and fail closed for AI and auth. A Redis outage must not take the catalog down, but it also must not become an unlimited AI budget.

Repeated limit violations escalate: warn, then temporary block, then a flag for review. Known-good crawlers (verified by reverse DNS) get a separate, generous bucket — blocking Googlebot would be self-defeating for a business whose primary acquisition channel is search.

---

## 21. Logging strategy

### 21.1 Structured, correlated, sampled

Every log line is JSON with a fixed base: `timestamp`, `level`, `requestId`, `tenantId`, `visitorId`, `userId`, `route`, `method`, `durationMs`, `statusCode`, `message`. `requestId` propagates from edge middleware through use-cases, database queries, background jobs and outbox deliveries, so a single quote submission is traceable end to end across four runtimes.

| Level | Used for |
|---|---|
| `error` | Unhandled exceptions, dependency failures, grounding violations, signature failures |
| `warn` | Degraded mode, retries, rate limits hit, slow queries above 500 ms, stale rollups |
| `info` | Request completion, mutations, job lifecycle, AI calls with cost |
| `debug` | Development only; never enabled in production |

**Sampling:** all errors and warnings, all mutations, all AI calls; successful reads at 1%. Logging every catalog read is expensive and tells you nothing that metrics don't.

### 21.2 What is never logged

Passwords, tokens, API keys, session cookies, full request bodies containing contact details, uploaded file contents, complete AI conversation text (message IDs and token counts only), payment data if it ever exists, and full IP addresses in analytics contexts (truncated to /24). A redaction allowlist is applied at the logger, not at call sites — relying on developers to remember is how credentials end up in logs.

### 21.3 Audit vs application logs

They are different things and must not be conflated. Application logs are operational, sampled, and retained 30 days. **The audit log is a database table** (Database Design §11.3), complete, append-only, retained seven years, and queryable by administrators. "Who changed this price" is answered from Postgres, not from a log aggregator.

---

## 22. Monitoring strategy

### 22.1 The four signals per endpoint

Latency (p50/p95/p99), traffic, error rate, and saturation (database connections, Redis memory, function concurrency).

### 22.2 Service level objectives

| Path | Target |
|---|---|
| Catalog listing | p95 < 300 ms |
| Product detail (cached) | p95 < 120 ms |
| Search suggest | p95 < 80 ms |
| Availability | p95 < 150 ms |
| Quote submission | p95 < 800 ms |
| Tile finder end-to-end | p95 < 4 s |
| Assistant first token | p95 < 1.2 s |
| Admin list views | p95 < 500 ms |
| Availability (site) | 99.9% monthly |

### 22.3 Alerts

**Page immediately:** site availability below SLO for 5 minutes; database connection saturation above 80%; error rate above 2% for 5 minutes; any quote submission failure (this is revenue); outbox events entering `dead` status.

**Notify within the hour:** AI spend at 80% of the monthly ceiling; embedding coverage below 99%; rollup job failure; connector health degraded; p95 latency exceeding SLO by 50%; grounding violation rate above 1%; upload scan failures.

**Daily digest:** slow query report; unused index report; zero-result search trend; quotes approaching SLA breach; ingestion items awaiting review beyond 48 hours.

### 22.4 Tooling and health

Sentry for errors and traces (with `requestId` as the correlation key), Vercel Analytics for Web Vitals, PostHog for product funnels, `pg_stat_statements` for query performance, Upstash metrics for cache hit rates, Inngest for job observability.

`GET /api/health` returns `200` with per-dependency status (database, Redis, storage, each AI provider, each connector) and is **unauthenticated but non-revealing** — it exposes up/down and latency, never versions, hostnames or configuration. `GET /api/health/deep` is authenticated and returns full diagnostics.

**Synthetic checks** every 5 minutes from three regions exercise the real user journey — homepage, catalog, product page, a search — rather than pinging a health endpoint that stays green while the site is broken.

---

## 23. API versioning

### 23.1 Policy per surface

| Surface | Versioning | Reason |
|---|---|---|
| Server Actions | **None.** Deploy in lockstep | First-party UI; the client and server ship together |
| Internal REST (`/api/v1/*`) | URL path | Consumed by our own client, but also the base for the public API |
| Webhook payloads | `version` field in the envelope from day one | Subscribers upgrade independently |
| Public API (future) | URL path + optional date header | Third parties need long deprecation windows |

### 23.2 Compatibility rules

**Non-breaking, no version bump:** adding an optional request field, adding a response field, adding an enum value to an *output* (clients must ignore unknown values), adding an endpoint, relaxing a limit.

**Breaking, requires a new version:** removing or renaming a field, changing a type, adding a required request field, adding an enum value to an *input* the client must handle, tightening validation, changing an error code's meaning, changing pagination semantics.

**Deprecation:** announce, then serve both for a minimum of 180 days on the public API (90 days internal), with `Deprecation` and `Sunset` headers on the old version and a warning in the response `meta`. Usage of a deprecated version is tracked per client so sunset is a decision informed by data rather than a hope.

### 23.3 What makes versioning survivable

Because every endpoint is a thin adapter over a use-case (§1.1), a `v2` endpoint is a new adapter shape over the same business logic, not a forked backend. Two versions of a response mapper are maintainable; two versions of the quote submission rules are not.

---

## 24. Security considerations

### 24.1 Transport and headers

TLS 1.3, HSTS with preload. Strict CSP with per-request nonces and no `unsafe-inline`. `X-Frame-Options: DENY` except on the shared-project view, which is `frame-ancestors 'none'` and same-origin only. `Referrer-Policy: strict-origin-when-cross-origin`. Permissions-Policy denying everything except camera on the tile-finder route.

### 24.2 CORS

The internal API is **same-origin only** — no CORS headers, so a browser on another origin cannot call it at all. The future public API gets its own origin with an explicit allowlist per API key, and never `Access-Control-Allow-Origin: *` alongside credentials.

### 24.3 Injection and data access

All database access is parameterised through Prisma or typed raw queries; string-concatenated SQL is banned by lint rule. Vector queries take embeddings as bound parameters. `ltree` and full-text inputs are escaped. Path parameters are UUID- or slug-validated before use. Storage paths are server-generated, never derived from user input.

### 24.4 Application-layer threats

| Threat | Mitigation |
|---|---|
| IDOR | Ownership predicates on every resource-scoped operation; `404` for non-owned |
| Enumeration | `404` over `403` cross-tenant; UUIDv7 IDs; rate limits on lookup endpoints |
| Mass assignment | Strict Zod parsing with explicit field allowlists per operation |
| CSRF | Server Actions carry framework CSRF protection; REST mutations require a custom header that a cross-origin form cannot set |
| SSRF | No user-supplied URLs are fetched server-side. The future URL-scrape ingestion runs in an isolated worker with an egress allowlist |
| Prompt injection | Model output never becomes a database query or a privileged action. Tool arguments are Zod-validated. The model holds no authority beyond the calling visitor's |
| Denial of wallet | Per-visitor and per-IP AI limits, budget ceilings with degradation, perceptual-hash caching, a safety gate that rejects non-tile images before expensive calls |
| File upload attacks | Magic-byte verification, malware scan gating all use, EXIF strip, server-generated paths, size caps, no execution context in storage |
| Credential stuffing | Login rate limits, exponential lockout, breach-password check on set, MFA for staff |
| Session theft | httpOnly cookies, rotating refresh tokens with reuse detection, short admin absolute timeout |

### 24.5 Data protection

Trade documents, cost prices and contact details are permission-gated at the API and RLS layers. Cost data never appears in a public response shape at all — it is excluded at the mapper, so it cannot leak through an `expand` parameter. PII in analytics is minimised: truncated IPs, no raw user agents in event properties, contact details never in `analytics_event.properties`.

**Data subject requests** are supported by design: `exportUserData` and `deleteUserData` (owner-only actions) walk the visitor and user graphs — saved items, views, conversations, finder sessions, quotes, projects. Quote records are retained for their legal period with contact fields redacted rather than deleted, because deleting a commercial record and deleting personal data are different obligations.

---

## 25. Caching strategy

Restating Database Design §14 at the API boundary, where the headers are actually set.

| Endpoint class | Header | Redis | Invalidation |
|---|---|---|---|
| Catalog listing | `s-maxage=300, swr=3600` | 5 min by filter signature | `tag:catalog`, `tag:product:{id}` |
| Product detail | `s-maxage=3600, swr=86400` | 1 h | `tag:product:{id}` on publish or price change |
| Availability | `no-store` | 30 s micro-cache | Trigger on `product_stock` |
| Search suggest | `s-maxage=600` | 10 min by normalised query | Time only |
| Taxonomy | `s-maxage=3600` | 24 h | On taxonomy write |
| Facet counts | Part of listing | 5 min by signature | With catalog |
| AI finder | `no-store` | 30 d by image phash | Model version change |
| Embeddings | — | 30 d by input hash | Model version change |
| Basket, account, admin | `private, no-store` | — | — |
| Trade pricing | `private, no-store` | — | Per-user, never shared |

Cache keys carry a version counter per entity (`amin:product:{id}:v3`); bumping the counter invalidates every derived key without a scan. Stampede protection uses stale-while-revalidate with a short lock so an expiring popular product doesn't send every concurrent request to Postgres at once.

**`Vary` is set correctly** on `Accept-Language`, and authenticated responses are `private` — a shared CDN cache serving one user's trade price to another is a category of bug that is easy to introduce and expensive to discover.

---

## 26. Future public API strategy

### 26.1 Why it isn't in v1

Nobody is asking for it yet, and a public contract is permanent in a way an internal one is not. Publishing prematurely freezes a schema we will still want to change during the first year of real use.

### 26.2 What v1 does to make it cheap later

Every endpoint is already a thin adapter over a use-case, already versioned at `/api/v1`, already returning stable error codes, already cursor-paginated, already rate-limited by bucket, and already tenant-scoped. `api_key` is designed (§4.7). The work remaining is packaging, not architecture.

### 26.3 The shape when it arrives

**Surface** — read-mostly: products, collections, availability, search. Writes limited to quote-request creation and stock alerts. Nothing that mutates catalog or inventory, which stay behind staff authentication.

**Authentication** — `Authorization: Bearer ak_live_…`, keys scoped (`products:read`, `inventory:read`, `quotes:write`), per-key rate limits and quotas, per-key CORS allowlist, rotation without downtime via dual active keys.

**Deliverables** — OpenAPI 3.1 specification generated from the same Zod schemas that validate requests, so documentation cannot drift from behaviour. A sandbox tenant with seeded data. Typed SDK generated from the spec. Webhook subscriptions with per-subscriber secrets and a replay endpoint.

**Likely consumers** — the client's ERP, a future mobile app, trade partners embedding the catalog, and marketplace feeds (Google Merchant, Instagram Shopping) which need a product feed endpoint anyway.

---

## 27. Endpoint index

| Group | Public REST | Admin REST | Server Actions |
|---|---|---|---|
| Products | 6 | 8 | 10 |
| Search | 3 | — | — |
| AI | 7 | 4 | 6 |
| Uploads & media | 3 | 3 | 6 |
| Inventory | 1 | 4 | 7 |
| Quotes & commerce | 4 | 6 | 14 |
| Engagement | 6 | — | 12 |
| Ingestion | — | 4 | 7 |
| Dashboard & analytics | 1 | 8 | — |
| Notifications | 2 | 5 | 3 |
| Connectors & webhooks | 1 | 4 | 4 |
| Users, roles, settings | — | 4 | 9 |
| Health | 2 | — | — |
| **Total** | **36** | **50** | **78** |

164 operations, over roughly 60 use-cases. The ratio is deliberate: many transports, few implementations.

---

## 28. Open questions for implementation

1. **Quote expiry** — 14 days assumed. Confirm, since it drives reservation release.
2. **Lot allocation** — auto-allocate largest-first, or salesperson choice? Affects whether `reserveQuoteStock` takes explicit lot IDs.
3. **WhatsApp provider** — Cloud API direct, or an aggregator? Changes the inbound webhook contract and the template approval workflow.
4. **Trade approval SLA** — is there an auto-approval path for verified tax IDs, or is every application manual?
5. **Sample charging** — free, or charged and credited against an order? Affects whether payment enters v1 by the back door.
6. **Realtime scope** — Supabase Realtime on `quote_request` and `ingestion_job` only, or a broader admin live-update surface?
7. **Product data sample** — still outstanding since Phase 1, and now the last input needed to finalise ingestion field mappings.

---

## 29. Decisions of record

| # | Decision | Rationale |
|---|---|---|
| 1 | Reads happen in Server Components, not through HTTP | The fastest call is the one that never happens |
| 2 | Server Actions for first-party mutations, REST for everything else | Versioning boundary matches the trust boundary |
| 3 | Edge for middleware and OG only; database access on Node | Edge latency gains are lost re-establishing a pooled DB connection |
| 4 | Every endpoint is an adapter over a use-case | Makes the public API a packaging exercise, not a rewrite |
| 5 | Permissions declared as metadata; missing declaration is a build error | Fail closed by construction |
| 6 | `404` not `403` for cross-tenant and non-owned resources | Prevents enumeration oracles |
| 7 | Uploads go direct to storage via signed URL, in three steps | Serverless body limits; scan gate before any use |
| 8 | Availability is a separate endpoint from product detail | Lets the product page cache hard while stock stays live |
| 9 | Quantity arithmetic is a server endpoint, never client or LLM | It's the number a customer spends money against |
| 10 | Assistant emits hydrated products as typed events | Grounding rule made visible in the transport |
| 11 | AI budget checked before spend; degrade rather than overspend | Denial of wallet is a real threat |
| 12 | Stock reserves on acceptance, not submission | Anonymous form fills must not deplete availability |
| 13 | Quote items snapshot price and spec at submission | A historical document must not change |
| 14 | Webhooks acknowledge immediately, process asynchronously | Slow handlers cause provider retry storms |
| 15 | Outbox event written in the business transaction | A quote is never submitted without its notification |
| 16 | Error `code` is the contract; `meta` carries the recovery path | Actionable errors, stable clients |
| 17 | Client and server share one validation schema; server never trusts the client | No drift, no trust |
| 18 | Unknown request fields rejected, not stripped | A typo becomes an error, not a silent data loss |
| 19 | Degrade under dependency failure; only Postgres down is an outage | AI, Redis and CDN failures must not take the site down |
| 20 | Audit log is a database table, not an application log | "Who changed this price" is a query, not a log search |

---

**Approve, amend, or push back — then Phase 5: implementation, beginning with Phase 0 of the roadmap (foundation, tokens, component library, CI).**
