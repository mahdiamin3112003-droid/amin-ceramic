# AMIN CERAMIC — Database Design Document

**Phase 3 deliverable** · Version 1.0 · Pre-implementation
**Follows:** Architecture v1.0, UX Blueprint v1.0 (both approved)
**Precedes:** Phase 4 — API Architecture

---

## 0. Preamble

### 0.1 Two revisions to Phase 1

I've changed my position on two things since the approved architecture. Both are cheap now and expensive later, which is why I'm raising them rather than quietly implementing something different.

**Revision 1 — enum strategy.** Phase 1 §7.2 specified Postgres native enums for `finish`, `surface_look` and `color_family`. I now recommend **lookup tables** for those three. Reason: Amin will need to add a finish (`lappato satinato`, `bush-hammered`) or a colour family without a developer, a migration and a deploy. Native enums are correct for values the *application branches on* (`status`, `shade_variation`, `slip_rating`, `job_state`) because those are code contracts. They're wrong for vocabularies the business extends. The rule is stated in §5.3 and applied consistently.

**Revision 2 — primary keys.** I recommend **UUIDv7** for domain entities rather than UUIDv4 or bigserial. UUIDv7 is time-ordered, so it has the index locality of a sequential key while remaining globally unique — which matters for the multi-tenant path (§16), for offline-generated IDs in the ingestion pipeline, and for not leaking row counts in public URLs. High-volume append-only tables (events, audit, outbox) use `bigint identity` instead, where locality and storage size dominate and the ID is never exposed.

### 0.2 The single most important decision in this document

**Every tenant-scoped table carries a `tenant_id` from day one**, populated with a single organisation row. It costs one column, one index prefix and one RLS predicate now. Retrofitting it later means touching every table, every index, every query and every policy in the system — a multi-month project. This is the direct answer to requirement 34, and it's the reason the rest of the schema looks the way it does. Full treatment in §16.

### 0.3 Assumptions still standing

| Assumption | Consequence if wrong |
|---|---|
| ~2,000–10,000 SKUs at launch, growing to ~50,000 | Partitioning thresholds in §13 shift |
| 3 locations (mix of showroom and warehouse) | None — `location` is fully general |
| Bilingual EN/AR, more locales possible | None — translation tables are locale-general |
| Trade pricing exists, tiered not per-customer | `product_price` gains a customer dimension (§3.2.9) |
| Designer Projects confirmed for v1.1 | Tables designed now, unused until then |
| Samples are shipped, limited to 3 | `sample_request` loses address fields |
| No online payment in v1 | `payment` tables deferred, `quote` unchanged |

### 0.4 Conventions

| Convention | Rule |
|---|---|
| Naming | `snake_case`, singular table names (`product`, not `products`) |
| Primary key | `id uuid` (UUIDv7) on domain tables; `id bigint generated always as identity` on append-only tables |
| Foreign key | `<referenced_table>_id`, always indexed, explicit `ON DELETE` on every constraint |
| Tenant | `tenant_id uuid not null references tenant(id)` on every tenant-scoped table; leads every composite index |
| Timestamps | `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` maintained by trigger |
| Soft delete | `deleted_at timestamptz null` on entities users can restore; partial unique indexes exclude deleted rows |
| Money | `numeric(12,4)` + `currency char(3)`. Never float. Never a bare number without its currency |
| Physical measure | Millimetres as `integer`; areas as `numeric(10,4)` m²; weight as `numeric(10,3)` kg. One canonical unit, converted at the presentation layer only |
| Booleans | Named affirmatively (`is_rectified`, not `not_rectified`), `not null default false` |
| JSONB | Permitted only under the four rules in §5.5. Never for anything queried in a filter |
| Enum | Native enum for code contracts, lookup table for business vocabularies (§5.3) |
| Text search | `tsvector` generated column per locale-scoped translation row |
| Deletion default | `ON DELETE RESTRICT` unless there is a stated reason for CASCADE or SET NULL |

**Extensions required:** `pgcrypto` (UUID generation), `pg_uuidv7`, `vector` (pgvector ≥ 0.7 for `halfvec`), `pg_trgm`, `unaccent`, `btree_gin`, `pg_stat_statements`, `pg_cron` (rollups, retention).

---

## 1. Domain map

Twelve bounded domains. Cross-domain references are deliberate and few — this is what keeps a schema comprehensible at 80 tables.

```
┌─ IDENTITY ──────────┐   ┌─ CATALOG ────────────────────────┐
│ tenant              │   │ brand  collection  category      │
│ app_user  visitor   │   │ product ─ product_translation    │
│ role  permission    │   │   │      product_attribute_value │
│ trade_account       │   │   │      product_relation        │
└──────┬──────────────┘   │   │      product_price           │
       │                  │   └──┬───────────────────────────┘
       │                  │      │
       │           ┌──────▼──────▼────┐  ┌─ MEDIA ──────────┐
       │           │ INVENTORY        │  │ media_asset      │
       │           │ location         │  │ media_translation│
       │           │ stock_lot        │  │ product_media    │
       │           │ inventory_movement│ │ upload           │
       │           │ product_stock ▲   │  └──────────────────┘
       │           └──────┬───────────┘
       │                  │
┌──────▼──────────────────▼────────┐   ┌─ AI ─────────────────┐
│ COMMERCE                          │   │ product_embedding    │
│ quote_request ─ zone ─ item       │◄──┤ ai_conversation      │
│ sample_request  showroom_booking  │   │ ai_message           │
└──────┬────────────────────────────┘   │ ai_tool_call         │
       │                                │ finder_session       │
┌──────▼────────────────────────────┐   │ ai_interaction       │
│ ENGAGEMENT                        │   │ ai_feedback          │
│ saved_item  product_view          │   └──────────────────────┘
│ project ─ zone ─ item ─ share     │
│ stock_alert                       │   ┌─ INGESTION ──────────┐
└───────────────────────────────────┘   │ ingestion_job        │
                                        │ ingestion_document   │
┌─ ANALYTICS ─────────┐ ┌─ PLATFORM ──┐ │ staging_product      │
│ analytics_event     │ │ notification │ │ staging_field        │
│ daily_product_stat  │ │ outbox_event │ │ supplier_mapping     │
│ search_query_stat   │ │ connector_*  │ └──────────────────────┘
└─────────────────────┘ │ audit_log    │
                        │ app_setting  │
                        └──────────────┘
▲ = denormalised, trigger-maintained
```

---

## 2. Identity, authentication and authorization

### 2.1 `tenant`

The organisation. One row in v1. Present so that multi-tenancy is a configuration change rather than a rewrite.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | UUIDv7 |
| `slug` | citext UNIQUE NOT NULL | Future subdomain / path segment |
| `name` | text NOT NULL | |
| `legal_name` | text | |
| `default_locale` | text NOT NULL DEFAULT 'en' | |
| `supported_locales` | text[] NOT NULL DEFAULT '{en,ar}' | |
| `default_currency` | char(3) NOT NULL DEFAULT 'USD' | |
| `measurement_system` | enum(`metric`,`imperial`) DEFAULT 'metric' | |
| `default_wastage_pct` | numeric(5,2) NOT NULL DEFAULT 10.00 | Overridable per product and per pattern |
| `settings` | jsonb NOT NULL DEFAULT '{}' | Non-queried config only (§5.5) |
| `status` | enum(`active`,`suspended`) | |
| `created_at`, `updated_at` | timestamptz | |

### 2.2 `app_user`

Named `app_user` because Supabase owns `auth.users` and a table named `user` is a reserved-word trap in Postgres.

**Relationship to Supabase:** `auth.users` holds credentials, email verification, MFA factors and sessions. `app_user` holds everything the application needs, keyed 1:1 by `auth_user_id`. We never write to `auth.users` directly, and we never store passwords. A trigger on `auth.users` insert creates the `app_user` shell row.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK → tenant | RESTRICT |
| `auth_user_id` | uuid UNIQUE | → `auth.users.id`. Nullable for imported contacts who never logged in |
| `email` | citext NOT NULL | Case-insensitive, unique per tenant |
| `phone` | text | E.164, used for WhatsApp |
| `full_name` | text | |
| `preferred_locale` | text | |
| `preferred_currency` | char(3) | |
| `measurement_preference` | enum(`m2`,`ft2`) | |
| `user_type` | enum(`customer`,`designer`,`contractor`,`staff`) NOT NULL | Drives default UX mode (Spec mode on for contractors) |
| `marketing_opt_in` | boolean NOT NULL DEFAULT false | |
| `last_seen_at` | timestamptz | |
| `status` | enum(`active`,`invited`,`suspended`) | |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | |

```sql
CREATE UNIQUE INDEX ON app_user (tenant_id, email) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ON app_user (auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX ON app_user (tenant_id, user_type, status);
```

### 2.3 `visitor` — the anonymous identity

The UX blueprint requires that guests save tiles, build baskets and use the AI without an account (§0 of that document: "accounts are optional and never blocking"). That requires a first-class anonymous identity, not a nullable `user_id` everywhere.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Written to a first-party cookie, 1-year expiry |
| `tenant_id` | uuid FK | |
| `app_user_id` | uuid FK → app_user NULL | Set on claim; **never overwritten** |
| `first_seen_at`, `last_seen_at` | timestamptz | |
| `first_referrer`, `first_utm` | text / jsonb | Attribution, captured once |
| `locale`, `country_code` | text | |
| `merged_into_visitor_id` | uuid FK → visitor NULL | Cross-device merge trail |

**The claim flow:** on signup or login, the current `visitor.app_user_id` is set, and all `saved_item`, `product_view` and any open `quote_request` rows for that visitor become reachable from the user. If the user already had a visitor row from another device, the older row is pointed at the newer via `merged_into_visitor_id` and its dependent rows are re-parented in one transaction. **We never delete the old visitor row** — analytics history depends on it.

Every engagement table therefore carries **`visitor_id NOT NULL`** and an optional denormalised `app_user_id`. Keying on visitor rather than user is the decision that makes the whole guest experience work.

### 2.4 Roles and permissions

Roles are per-tenant and assignable in combination. Permissions are fine-grained strings; roles bundle them.

**`role`** — `id`, `tenant_id`, `key` (`owner`|`admin`|`editor`|`sales`|`viewer`|custom), `name`, `description`, `is_system` (system roles can't be deleted), `created_at`.

**`permission`** — `key` PK (`product.create`, `inventory.adjust`, `request.respond`, `ai.configure`, `user.invite`, `audit.read`, `connector.manage`, `settings.write`, `price.trade.read`, `ingestion.approve`). Global, not tenant-scoped — the vocabulary is the same everywhere.

**`role_permission`** — `(role_id, permission_key)` composite PK.

**`user_role`** — `(app_user_id, role_id)` composite PK, plus `granted_by`, `granted_at`. A user may hold several roles; effective permissions are the union.

### 2.5 Role → permission matrix

| Permission group | owner | admin | editor | sales | viewer |
|---|:--:|:--:|:--:|:--:|:--:|
| `product.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `product.create` / `.update` | ✓ | ✓ | ✓ | — | — |
| `product.publish` | ✓ | ✓ | ✓ | — | — |
| `product.delete` | ✓ | ✓ | — | — | — |
| `inventory.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `inventory.adjust` | ✓ | ✓ | — | ✓ | — |
| `price.base.write` | ✓ | ✓ | — | — | — |
| `price.trade.read` | ✓ | ✓ | ✓ | ✓ | — |
| `price.trade.write` | ✓ | ✓ | — | — | — |
| `request.read` | ✓ | ✓ | — | ✓ | ✓ |
| `request.respond` | ✓ | ✓ | — | ✓ | — |
| `media.manage` | ✓ | ✓ | ✓ | — | — |
| `content.manage` | ✓ | ✓ | ✓ | — | — |
| `ingestion.run` | ✓ | ✓ | ✓ | — | — |
| `ingestion.approve` | ✓ | ✓ | ✓ | — | — |
| `ai.configure` | ✓ | ✓ | — | — | — |
| `ai.costs.read` | ✓ | ✓ | — | — | ✓ |
| `analytics.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `connector.manage` | ✓ | ✓ | — | — | — |
| `user.invite` / `user.manage` | ✓ | ✓ | — | — | — |
| `role.manage` | ✓ | — | — | — | — |
| `audit.read` | ✓ | ✓ | — | — | — |
| `settings.write` | ✓ | ✓ | — | — | — |
| `tenant.manage` | ✓ | — | — | — | — |

Two rules worth stating: **only `owner` can manage roles** (otherwise an admin can grant themselves anything, which makes the whole matrix decorative), and **`sales` can adjust inventory** because in a showroom business the salesperson is the person who discovers a discrepancy.

### 2.6 `trade_account`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `app_user_id` | uuid FK → app_user | RESTRICT |
| `company_name` | text NOT NULL | |
| `tax_id`, `registration_no` | text | |
| `trade_type` | enum(`architect`,`designer`,`contractor`,`developer`,`retailer`) | |
| `price_tier_id` | uuid FK → price_tier | Determines pricing |
| `credit_limit`, `payment_terms_days` | numeric / int | For the future ERP connector |
| `status` | enum(`pending`,`approved`,`rejected`,`suspended`) NOT NULL | |
| `approved_by`, `approved_at`, `rejection_reason` | uuid / timestamptz / text | |
| `documents` | jsonb | References to `upload` rows for verification docs |

Trade pricing is resolved as: `trade_account.price_tier_id` → `product_price` for that tier → fall back to the product's base tier. Per-customer negotiated pricing is **not** in v1 but is a one-table addition (`customer_price`) that the resolution chain already accommodates — see §3.2.9.

### 2.7 Authentication design

- **Supabase Auth** is the sole identity provider. Email + password for all accounts; **TOTP mandatory** for any user holding a role with a `.write`, `.manage`, `.approve` or `.adjust` permission, enforced at the application layer on role grant.
- **Sessions:** JWT access token (1 hour) + refresh token in an httpOnly, secure, sameSite=lax cookie. Admin sessions idle out at 30 minutes with the countdown modal from UX §1.3.
- **JWT custom claims:** `tenant_id`, `role_keys[]`, `permissions[]` (flattened union), `app_user_id`, `trade_tier_id`. Populated by a Supabase Auth Hook on token issue. This lets RLS policies read authorisation from the token without a join on every query — the single biggest performance decision in the RLS design.
- **Claim staleness:** permissions live in a 1-hour token. On any role change we write a row to `token_revocation(app_user_id, revoked_at)`; middleware checks a Redis mirror of that table and forces a refresh. Without this, a revoked admin keeps their access for up to an hour.
- **Anonymous access** uses Supabase's anon key with RLS policies scoped by the `visitor_id` claim, set via a signed cookie the edge middleware translates into a request-scoped setting. Guests never receive a token that can read another visitor's data.
- **Service role** key is used only in server-side jobs (ingestion, embedding, rollups) and never reaches any client bundle; a build-time check fails the build if it appears in client code.

---

## 3. Catalog domain

### 3.1 Taxonomy tables

**`brand`** — `id`, `tenant_id`, `slug`, `name`, `logo_media_id` FK → media_asset, `origin_country`, `website_url`, `sort_order`, `is_active`, timestamps.
`UNIQUE (tenant_id, slug) WHERE deleted_at IS NULL`

**`collection`** — a manufacturer's product family (e.g. "Calacatta Series"). `id`, `tenant_id`, `brand_id` FK, `slug`, `hero_media_id`, `sort_order`, `is_featured`, `status`, `published_at`, timestamps. Copy lives in `collection_translation`.

**`category`** — hierarchical, self-referencing.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `parent_id` | uuid FK → category NULL | ON DELETE RESTRICT |
| `slug` | citext | Unique within parent |
| `path` | ltree | Materialised path, e.g. `floor.indoor.porcelain` |
| `depth` | smallint | |
| `sort_order` | integer | |
| `is_active` | boolean | |

**Why `ltree` and not adjacency-only:** the catalog needs "all products in this category *and its descendants*" on every category page. Recursive CTEs on adjacency lists work but cost a CTE per query; `ltree` with a GiST index answers it as an index scan. `parent_id` is retained as the editable source of truth and `path` is maintained by trigger — normalised authority, denormalised access. Depth is capped at 4 by a check constraint.

### 3.2 `product` — the central table

Locale-independent facts only. Anything that varies by language lives in `product_translation` (§3.3).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `sku` | citext NOT NULL | Unique per tenant among non-deleted rows |
| `supplier_sku` | text | The manufacturer's own code; needed for reordering |
| `ean` / `gtin` | text | Nullable; feeds Schema.org |
| `brand_id` | uuid FK → brand | RESTRICT |
| `collection_id` | uuid FK → collection NULL | SET NULL |
| `category_id` | uuid FK → category | RESTRICT |
| `width_mm`, `height_mm` | integer NOT NULL | CHECK > 0 |
| `thickness_mm` | numeric(5,2) NOT NULL | 8.5 mm is a real value |
| `nominal_format` | text | Display name, "60×120" — generated at ingest, editable |
| `format_group` | text | Normalised bucket for filtering; 598×1198 and 600×1200 both → `60x120` |
| `material_id` | uuid FK → material | Lookup |
| `finish_id` | uuid FK → finish | Lookup |
| `surface_look_id` | uuid FK → surface_look | Lookup |
| `color_family_id` | uuid FK → color_family | Lookup |
| `color_hex` | char(7) | Dominant colour, extracted at ingest; powers swatch filtering |
| `color_lab` | numeric(6,3)[3] | CIELAB — enables *perceptual* colour-distance sorting, which hex cannot do |
| `is_rectified` | boolean NOT NULL DEFAULT false | |
| `shade_variation` | enum `V1`\|`V2`\|`V3`\|`V4` | |
| `slip_rating` | enum `R9`…`R13` NULL | |
| `pei_class` | smallint NULL | CHECK 0–5 |
| `water_absorption_pct` | numeric(5,3) NULL | |
| `is_frost_resistant` | boolean | |
| `is_indoor`, `is_outdoor` | boolean NOT NULL | Separate booleans — many tiles are both |
| `application_ids` | uuid[] | See §5.4 for why this is an array |
| `pieces_per_box` | smallint NOT NULL | |
| `m2_per_box` | numeric(8,4) NOT NULL | **The quantity calculator depends on this** |
| `kg_per_box` | numeric(8,3) NOT NULL | |
| `boxes_per_pallet` | smallint | |
| `origin_country` | char(2) | ISO 3166-1 |
| `base_price` | numeric(12,4) NULL | Denormalised cache of the public tier price — see §3.2.9 |
| `currency` | char(3) NOT NULL | |
| `price_visibility` | enum(`public`,`trade_only`,`on_request`) NOT NULL | |
| `status` | enum(`draft`,`review`,`published`,`archived`,`discontinued`) NOT NULL | |
| `is_featured`, `is_new` | boolean | |
| `published_at`, `discontinued_at` | timestamptz | |
| `primary_media_id` | uuid FK → media_asset NULL | Denormalised for grid queries (§5.6) |
| `search_boost` | numeric(4,2) DEFAULT 1.0 | Manual ranking lever for the sales team |
| `created_by`, `updated_by` | uuid FK → app_user | |
| `source` | enum(`manual`,`ingestion`,`import`,`api`) | Provenance |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | |

```sql
CREATE UNIQUE INDEX ON product (tenant_id, sku) WHERE deleted_at IS NULL;
```

**Why `format_group` exists.** Manufacturers list 598×1198 mm and call it 60×120. A user filtering "60×120" expects both. Filtering on raw millimetres fragments the facet; filtering only on a display string breaks technical search. Storing both — exact dimensions for the spec table, a normalised group for the facet — is a deliberate denormalisation and it is the difference between a filter that works and one that returns 3 results instead of 412.

**Why `color_lab`.** Hex codes cannot be meaningfully sorted or distance-measured; CIELAB can. This enables "tiles closest in colour to this one" without invoking the embedding pipeline, and it makes the swatch filter group perceptually rather than arithmetically.

### 3.3 `product_translation`

| Column | Type |
|---|---|
| `product_id` | uuid FK → product, ON DELETE CASCADE |
| `locale` | text |
| `name` | text NOT NULL |
| `slug` | citext NOT NULL |
| `short_description` | text |
| `description` | text |
| `installation_notes` | text |
| `care_instructions` | text |
| `seo_title`, `seo_description` | text |
| `og_title`, `og_description` | text |
| `tags` | text[] |
| `search_vector` | tsvector GENERATED ALWAYS AS (...) STORED |
| `is_machine_translated` | boolean DEFAULT false |
| `reviewed_by`, `reviewed_at` | uuid / timestamptz |

PK `(product_id, locale)`. `UNIQUE (tenant_id, locale, slug)`.

**Why separate tables instead of `jsonb` per-locale columns.** Four reasons, and they compound: (1) `tsvector` needs a per-locale text search configuration — Arabic and English stem differently, and you cannot index a JSONB path with two different configurations; (2) a translation workflow needs per-row review state, which JSONB can't carry cleanly; (3) adding a locale is an insert, not a schema change; (4) partial indexes per locale keep the English index small when Arabic content is sparse. The cost is one join, which is trivial and cached.

`is_machine_translated` + `reviewed_by` exist because the ingestion pipeline generates Arabic copy, and the UX blueprint requires human approval before publish.

### 3.4 Lookup tables (`material`, `finish`, `surface_look`, `color_family`, `application`, `layout_pattern`)

All share one shape: `id`, `tenant_id`, `key` (stable machine identifier), `sort_order`, `is_active`, `icon`, `metadata jsonb`, plus a `*_translation(id, locale, name, description)` sibling.

`layout_pattern` additionally carries `default_wastage_pct` (grid 7%, brick 10%, herringbone 15%, chevron 18%, modular 12%) — this is what makes the layout planner from UX §8.2 produce real numbers.

**Why lookup tables here and enums elsewhere:** see §5.3.

### 3.5 `product_attribute` and `product_attribute_value` — the EAV escape hatch

Roughly 40 columns cover 95% of tiles. The remaining 5% carry supplier-specific specs (`breaking_strength_n`, `thermal_conductivity`, `chemical_resistance_class`, `led_backlit_compatible`) that don't justify a column each and will differ per supplier.

**`product_attribute`** — `id`, `tenant_id`, `key`, `data_type` enum(`text`,`number`,`boolean`,`enum`), `unit`, `is_filterable`, `is_comparable`, `display_group`, `sort_order`, plus translations.

**`product_attribute_value`** — `product_id`, `attribute_id`, `value_text`, `value_number`, `value_boolean`, `value_option_id`. PK `(product_id, attribute_id)`.

**The rule that keeps EAV from metastasising:** an attribute may be promoted to a real column the moment it becomes filterable in the main catalog UI. EAV is for the long tail displayed on the spec table, never for the hot filter path. Filterable EAV attributes get a partial GIN index; if more than ~8 exist, that's the signal the model is wrong and the attribute belongs in `product`.

### 3.6 `product_relation`

| Column | Type |
|---|---|
| `product_id`, `related_product_id` | uuid FK, CASCADE |
| `relation_type` | enum(`related`,`trim`,`complete_the_look`,`same_look_different_format`,`same_look_lower_price`,`replacement`,`variant`) |
| `rank` | smallint |
| `is_automatic` | boolean |
| `confidence` | numeric(4,3) NULL |

PK `(product_id, related_product_id, relation_type)`. A CHECK prevents self-reference.

`is_automatic` distinguishes curated relations (a merchandiser chose the bullnose trim) from vector-derived ones (the "same look, lower price" rail). Automatic rows are regenerated by a nightly job; curated rows are never touched by it. Mixing the two without this flag means a rebuild silently destroys human curation — a classic, painful bug.

### 3.7 `price_tier` and `product_price`

**`price_tier`** — `id`, `tenant_id`, `key` (`public`, `trade_1`, `trade_2`, `trade_3`), `name`, `discount_pct` (fallback when no explicit price exists), `min_annual_volume`, `sort_order`, `is_default`.

**`product_price`** — `id`, `tenant_id`, `product_id` FK CASCADE, `price_tier_id` FK, `price numeric(12,4)`, `currency`, `min_quantity_m2 numeric(10,4) DEFAULT 0`, `valid_from`, `valid_to`, `created_by`, timestamps.

`UNIQUE (product_id, price_tier_id, min_quantity_m2, valid_from)`

**Resolution chain**, in order: explicit `product_price` for the user's tier at their quantity and today's date → `product.base_price × (1 − tier.discount_pct)` → `price_visibility = on_request`. Volume breaks are expressed as multiple rows with ascending `min_quantity_m2`; the resolver takes the highest applicable.

`product.base_price` is a denormalised copy of the public-tier current price, maintained by trigger. It exists solely so the catalog grid can sort and filter by price without joining and date-filtering a temporal table for every one of 1,284 rows. **This is the most defensible denormalisation in the schema**, and its correctness is guaranteed by the trigger, not by application discipline.

**Per-customer pricing later:** add `customer_price(trade_account_id, product_id, price, valid_from, valid_to)` and insert one step at the head of the resolution chain. No existing table changes.

---

## 4. Media and file storage

### 4.1 Two storage systems, deliberately

| Storage | Holds | Why |
|---|---|---|
| **Cloudinary** | Product photography, collection heroes, project imagery, brand assets | Named transformations, automatic AVIF/WebP negotiation, per-image focal-point cropping, CDN. Content we serve millions of times and transform many ways |
| **Supabase Storage** | User uploads (tile-finder photos), ingestion source documents (supplier PDFs/XLSX), generated artefacts (quote PDFs, spec sheets, visualiser output), trade verification documents | Content that is private, access-controlled by RLS, lifecycle-expired, and served once or twice. Paying Cloudinary transformation rates for a PDF nobody transforms is waste |

Both are referenced through database rows; the application never constructs a URL from a raw path.

### 4.2 `media_asset`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `provider` | enum(`cloudinary`,`supabase`) | |
| `public_id` | text NOT NULL | Cloudinary public_id or storage object path |
| `secure_url` | text | Cached; regenerable |
| `format`, `mime_type` | text | |
| `width`, `height` | integer | Prevents CLS — the renderer always knows the aspect ratio |
| `bytes` | bigint | |
| `blurhash` | text | Placeholder before load |
| `dominant_color` | char(7) | Skeleton tint |
| `focal_point_x`, `focal_point_y` | numeric(4,3) | 0–1; art-directed cropping across breakpoints |
| `folder_path` | text | Library organisation |
| `tags` | text[] | |
| `checksum_sha256` | text | Deduplication at upload |
| `uploaded_by` | uuid FK | |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | |

**`media_translation`** — `(media_asset_id, locale)`, `alt_text`, `caption`, `is_machine_generated`, `reviewed_by`. Alt text is locale-specific and AI-drafted, human-approved (UX §7.2).

### 4.3 `product_media`

`product_id`, `media_asset_id`, `role` enum(`primary`,`gallery`,`room_scene`,`macro_detail`,`installed`,`technical_drawing`,`packaging`,`swatch`), `sort_order`, `is_active`. PK `(product_id, media_asset_id, role)`.

A partial unique index enforces exactly one `primary` per product. `product.primary_media_id` is a trigger-maintained denormalisation so the catalog grid renders 40 cards without 40 joins.

`role` is what allows the product page to sequence the gallery correctly (product → scene → macro → installed → drawing) and lets Spec mode promote the technical drawing above the lifestyle shot.

### 4.4 `upload`

Private, access-controlled, lifecycle-managed.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id`, `visitor_id`, `app_user_id` | uuid FK | Owner, for RLS |
| `purpose` | enum(`finder_query`,`ingestion_source`,`trade_document`,`floor_plan`,`visualizer_source`,`generated_pdf`,`generated_image`) | |
| `storage_bucket`, `storage_path` | text | |
| `original_filename`, `mime_type`, `bytes`, `checksum_sha256` | | |
| `scan_status` | enum(`pending`,`clean`,`infected`,`skipped`) | Malware gate before any processing |
| `expires_at` | timestamptz NULL | `pg_cron` deletes storage objects and rows past expiry |
| `metadata` | jsonb | EXIF-stripped dimensions, page count |

Retention by purpose: finder queries 90 days · visualiser sources 90 days · generated PDFs 1 year · ingestion sources retained for the life of the products they created (audit trail) · trade documents 7 years (legal).

---

## 5. Normalization decisions

### 5.1 Baseline

The schema is **3NF** throughout, with **six deliberate, trigger-enforced denormalisations** listed in §5.6. Every one exists to serve a specific hot query path, and every one is maintained by the database rather than by application code — because a denormalisation maintained by application discipline is a data-corruption bug with a delay fuse.

### 5.2 What is fully normalised, and why

- **Translations** — separate table, one row per locale (§3.3).
- **Prices** — temporal, tiered, volume-banded. A single `price` column cannot express volume breaks or scheduled changes, and both are business requirements.
- **Inventory** — lot-level rows, never a single quantity column (§6).
- **Media** — assets are independent entities because one image can serve a product, a collection hero and a project case study; duplicating it triples storage and makes alt-text correction a three-place edit.
- **Taxonomy** — brands, collections and categories as tables, not text columns, because they carry their own copy, imagery, SEO and translations.

### 5.3 Enum vs lookup table — the rule

> **Native Postgres enum** when application code branches on the value. **Lookup table** when it is a business vocabulary the admin extends.

| Native enum | Lookup table |
|---|---|
| `product.status` — routing, RLS and publish logic branch on it | `finish` — Amin adds "bush-hammered" without a deploy |
| `shade_variation` — the V1–V4 scale is an ISO standard, fixed | `surface_look` — marketing vocabulary, grows |
| `slip_rating` — DIN 51130 defines exactly R9–R13 | `color_family` — needs a hex, an icon, translations, sort order |
| `job_state`, `outbox_status` — state machines in code | `material` — needs translated names |
| `relation_type` — each value has distinct code behaviour | `application` — needs icons and translations |

Adding a value to a native enum requires `ALTER TYPE`, which in older Postgres could not run inside a transaction and still cannot be reversed. That's acceptable for a code contract changed by a developer; it's unacceptable for a vocabulary changed by a merchandiser on a Tuesday.

### 5.4 Why `application_ids` is an array

`product.application_ids uuid[]` with a GIN index, rather than a `product_application` junction table.

The junction table is the textbook answer. The array wins here because: applications are a small, bounded set (~8 values); the only query is containment (`application_ids && ARRAY[...]`), which GIN answers as fast as a junction join; and it removes a join from the hottest query in the system. The referential-integrity loss is real and is mitigated by a trigger validating that every element exists in `application`.

**This is the only place an array replaces a junction table**, and it is justified by the cardinality being permanently small. `tags text[]` on translations is similar but carries no FK obligation.

### 5.5 JSONB rules

JSONB is permitted only when **all four** hold: (1) the shape is genuinely variable or provider-defined; (2) it is never used in a WHERE clause the user can trigger; (3) it is not the source of truth for anything a report counts; (4) it is documented with a Zod schema in the application layer.

Permitted uses: `tenant.settings`, `connector_config.config`, `audit_log.before`/`after`, `ai_message.tool_payload`, `analytics_event.properties`, `staging_field.raw_value`, `upload.metadata`, `notification.data`.

Banned: product specifications, prices, stock quantities, anything filterable, anything a human will need to correct at scale.

### 5.6 The six denormalisations

| # | Column | Serves | Maintained by |
|---|---|---|---|
| 1 | `product.base_price` | Catalog sort/filter by price without a temporal join | Trigger on `product_price` |
| 2 | `product.primary_media_id` | Grid rendering without a join | Trigger on `product_media` |
| 3 | `product_stock` (whole table) | The "in stock" facet across 1,284 rows | Trigger on `inventory_movement` |
| 4 | `category.path` (ltree) | Descendant queries as an index scan | Trigger on `category.parent_id` |
| 5 | `product_translation.search_vector` | Full-text search | Generated column |
| 6 | `quote_request_item.*_snapshot` | Historical accuracy of quotes | Written once at insert, never updated |

Number 6 is not really a denormalisation but a **snapshot**, and the distinction matters: a quote must show the price and specification as they were when it was requested, even after the product changes. Joining live product data into a historical quote is a correctness bug, not an optimisation.

---

## 6. Inventory architecture

### 6.1 The model

Three layers, and the separation is the whole design:

```
inventory_movement   append-only ledger — the source of truth
        │  (trigger)
        ▼
stock_lot            current quantity per product × location × lot
        │  (trigger)
        ▼
product_stock        denormalised summary per product × location
                     + a tenant-wide roll-up for the catalog facet
```

**Why a ledger rather than a mutable quantity.** A single `quantity` column that gets `UPDATE`d cannot answer "why is this number wrong", cannot be reconciled against a physical count, and loses every adjustment the moment it's overwritten. In a business where a shade-lot discrepancy costs a re-tiled bathroom, that's unacceptable. The ledger is append-only; every quantity in the system is derivable from it, and any disagreement between layers is detectable by a nightly reconciliation job.

### 6.2 `location`

Warehouses and showrooms are the same entity with different capabilities — a Lebanese tile business typically has showrooms that also hold sellable stock.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `slug`, `name` | | |
| `location_type` | enum(`warehouse`,`showroom`,`hybrid`) | |
| `holds_sellable_stock` | boolean NOT NULL | A pure showroom holds display panels, not inventory |
| `is_public` | boolean | Shown on the site |
| `address_line1/2`, `city`, `region`, `postal_code`, `country_code` | text | |
| `latitude`, `longitude` | numeric(9,6) | Map + "nearest showroom" |
| `phone`, `whatsapp`, `email` | text | |
| `opening_hours` | jsonb | Per-day, exceptions — display only, never queried |
| `timezone` | text | |
| `accepts_bookings`, `booking_slot_minutes`, `max_concurrent_bookings` | boolean / int | |
| `sort_order`, `is_active` | | |

Plus `location_translation(location_id, locale, name, description, directions)`.

### 6.3 `stock_lot`

The unit of shade consistency. This table is what makes the lot warning in UX §3.3 possible.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id`, `product_id`, `location_id` | uuid FK | RESTRICT |
| `lot_number` | text NOT NULL | Manufacturer batch |
| `caliber` | text | Dimensional sub-batch — real tile attribute, distinct from shade |
| `shade_code` | text | Manufacturer's shade designation within the lot |
| `quantity_m2` | numeric(12,4) NOT NULL | CHECK ≥ 0 |
| `reserved_m2` | numeric(12,4) NOT NULL DEFAULT 0 | Held against open quotes |
| `available_m2` | numeric GENERATED ALWAYS AS (quantity_m2 − reserved_m2) STORED | |
| `boxes` | integer | Derived but stored — warehouse staff count boxes, not m² |
| `received_at`, `expires_at` | timestamptz | |
| `cost_per_m2`, `cost_currency` | numeric / char(3) | Margin reporting; never exposed publicly |
| `supplier_invoice_ref` | text | |
| `status` | enum(`available`,`reserved`,`quarantine`,`depleted`,`written_off`) | |
| `notes` | text | |

`UNIQUE (tenant_id, product_id, location_id, lot_number)`

**Why `caliber` and `shade_code` are separate from `lot_number`.** Manufacturers vary dimensions by up to 1 mm within a production run and label these calibers; two tiles from the same lot but different calibers will not align. A schema that collapses all three into "batch" cannot express the constraint that actually causes installation failures.

### 6.4 `inventory_movement`

Append-only. No UPDATE, no DELETE — enforced by RLS and a rule, not by convention.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity PK | High volume, never exposed |
| `tenant_id`, `product_id`, `location_id`, `stock_lot_id` | FK | |
| `movement_type` | enum(`receipt`,`sale`,`reservation`,`release`,`transfer_out`,`transfer_in`,`adjustment`,`return`,`sample`,`damage`,`write_off`,`count_correction`) | |
| `quantity_m2` | numeric(12,4) NOT NULL | Signed: negative reduces |
| `quantity_boxes` | integer | |
| `reference_type` | enum(`quote`,`order`,`sample_request`,`transfer`,`manual`,`import`,`stocktake`) | |
| `reference_id` | uuid | Polymorphic; not FK-constrained by design (§6.5) |
| `reason` | text | Required for `adjustment`, `damage`, `write_off` — CHECK enforces it |
| `performed_by` | uuid FK → app_user | |
| `occurred_at` | timestamptz NOT NULL | May differ from `created_at` for backdated corrections |
| `created_at` | timestamptz | |

**Corrections are new rows, never edits.** A mistaken receipt is reversed by a `count_correction` movement referencing the original. The ledger is thus a complete, auditable history.

### 6.5 The one polymorphic reference, and why it's acceptable

`reference_type` + `reference_id` cannot carry a foreign key. This is a real integrity compromise, accepted for one reason: the alternative is eight nullable FK columns (`quote_id`, `order_id`, `sample_request_id`, `transfer_id`…) growing with every new document type, each requiring a CHECK constraint asserting exactly one is non-null. That's worse. Integrity is maintained by an application-layer invariant plus a nightly job that reports orphaned references. It's the only polymorphic reference in the schema and it's confined to a log table where a dangling reference degrades reporting rather than corrupting state.

### 6.6 `product_stock` — the denormalised facet

| Column | Type |
|---|---|
| `tenant_id`, `product_id`, `location_id` | uuid, composite PK |
| `quantity_m2`, `reserved_m2`, `available_m2` | numeric(12,4) |
| `lot_count` | smallint |
| `largest_lot_m2` | numeric(12,4) |
| `stock_status` | enum(`in_stock`,`low_stock`,`out_of_stock`,`on_order`) |
| `restock_eta` | date |
| `updated_at` | timestamptz |

Plus a `location_id = NULL` roll-up row per product representing tenant-wide totals — that row is what the catalog's availability facet reads.

**`largest_lot_m2` is doing real work.** It answers "can this customer's 340 m² order be filled from a single lot?" without scanning every lot on the catalog page. It's the column that powers the lot warning at exactly the moment the customer needs it.

`stock_status` thresholds live in `app_setting` per tenant (default: low below 30 m², out at 0).

### 6.7 Reservation semantics

When a quote request is submitted, items are **not** reserved automatically — that would let anonymous form-fills deplete availability. Reservation happens when a salesperson accepts the quote in the admin, writing `reservation` movements against specific lots with a `reserved_until` on the quote. `pg_cron` releases expired reservations hourly by writing `release` movements. Every state change is a ledger row, so "who reserved this and when did it lapse" is always answerable.

### 6.8 Showroom display inventory

Distinct from sellable stock and deliberately so.

**`showroom_display`** — `location_id`, `product_id`, `display_type` enum(`panel`,`floor_area`,`sample_board`,`full_room`), `position_note` (e.g. "Aisle 3, panel 12"), `has_sample_available`, `is_active`.

This powers "See it in person at Baabda — Aisle 3" on the product page and lets the sales team answer "which showroom has this on display?" without walking the floor. It is not stock, is never decremented, and never appears in availability calculations.

---

## 7. Commerce: quotes, samples, bookings

### 7.1 `quote_request`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id`, `visitor_id` | uuid FK | Visitor is NOT NULL — guests quote too |
| `app_user_id` | uuid FK NULL | |
| `reference` | text UNIQUE NOT NULL | Human-facing, e.g. `AC-2026-0847` |
| `status` | enum(`draft`,`submitted`,`acknowledged`,`quoted`,`negotiating`,`won`,`lost`,`expired`,`cancelled`) | |
| `contact_name`, `contact_email`, `contact_phone`, `contact_whatsapp` | text | Snapshotted, not joined |
| `company_name` | text | |
| `project_type` | enum(`residential`,`commercial`,`hospitality`,`retail`,`renovation`,`new_build`) | |
| `project_address`, `project_city` | text | |
| `timeline` | enum(`immediate`,`1_month`,`3_months`,`6_months`,`planning`) | |
| `estimated_budget` | numeric(12,2) NULL | |
| `preferred_location_id` | uuid FK → location | Which showroom handles it |
| `floor_plan_upload_id` | uuid FK → upload NULL | |
| `notes` | text | |
| `source` | enum(`catalog`,`tile_finder`,`assistant`,`project`,`showroom`,`whatsapp`,`direct`) | **Attribution — this is how we measure AI ROI** |
| `source_session_id` | uuid | Links to `finder_session` or `ai_conversation` |
| `subtotal`, `quoted_total`, `currency` | numeric / char(3) | Indicative vs. final |
| `total_weight_kg`, `total_area_m2` | numeric | |
| `price_tier_id` | uuid FK | Tier applied at request time |
| `assigned_to` | uuid FK → app_user | |
| `submitted_at`, `responded_at`, `expires_at`, `closed_at` | timestamptz | |
| `lost_reason` | enum(`price`,`availability`,`timeline`,`competitor`,`no_response`,`other`) | |
| `created_at`, `updated_at` | timestamptz | |

`responded_at − submitted_at` is the response-time SLA metric the admin dashboard surfaces.

### 7.2 `quote_request_zone`

`id`, `quote_request_id` FK CASCADE, `name` ("Kitchen floor"), `space_type` enum, `area_m2`, `layout_pattern_id` FK NULL, `wastage_pct`, `sort_order`, `notes`.

Zones are what turn a cart into a project document (UX §3.7) and are exactly the structure a salesperson needs to produce a real quote. `wastage_pct` defaults from the layout pattern, then the product, then the tenant — cascading defaults, resolved at insert and stored.

### 7.3 `quote_request_item`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `quote_request_id`, `zone_id` | uuid FK CASCADE | |
| `product_id` | uuid FK RESTRICT | Products in a quote are never hard-deleted |
| `quantity_m2`, `quantity_boxes`, `quantity_pieces` | numeric / int | |
| **Snapshot fields** | | |
| `sku_snapshot`, `name_snapshot` | text | |
| `unit_price_snapshot`, `currency_snapshot` | numeric / char(3) | |
| `m2_per_box_snapshot`, `kg_per_box_snapshot` | numeric | |
| `spec_snapshot` | jsonb | Full spec as displayed at request time |
| `line_total` | numeric(12,4) | |
| `stock_lot_id` | uuid FK NULL | Set on reservation |
| `is_single_lot` | boolean | Whether the quantity fits one lot |
| `notes` | text | |

**The snapshot columns are the most important design decision in this domain.** A quote issued in March must render identically in September even if the price rose, the name changed, or the product was discontinued. Joining live data into historical documents is a correctness failure that surfaces as a customer dispute. The live `product_id` is retained for analytics and reordering; the snapshot is what the document renders.

### 7.4 `quote_status_history`

`id`, `quote_request_id`, `from_status`, `to_status`, `changed_by`, `note`, `changed_at`. Append-only. Powers the kanban board's cycle-time reporting and answers "who moved this to lost and why".

### 7.5 `sample_request` / `sample_request_item`

`sample_request` — `id`, `tenant_id`, `visitor_id`, `app_user_id`, `reference`, `status` enum(`requested`,`approved`,`preparing`,`shipped`,`delivered`,`collected`,`cancelled`), `fulfilment_type` enum(`ship`,`collect`), `location_id` (for collection), full shipping address, `tracking_number`, `carrier`, `requested_at`, `shipped_at`, `delivered_at`.

`sample_request_item` — `sample_request_id`, `product_id`, `quantity`, `sample_type` enum(`chip`,`full_tile`,`board`), `status`.

A trigger enforces the 3-sample limit per visitor per 30 days, and shipped samples write `sample` movements to the inventory ledger — samples come out of real stock, and pretending otherwise makes the ledger lie.

### 7.6 `showroom_booking`

`id`, `tenant_id`, `location_id`, `visitor_id`, `app_user_id`, `contact_*`, `scheduled_at`, `duration_minutes`, `party_size`, `purpose` enum(`browse`,`consultation`,`sample_collection`,`quote_review`), `quote_request_id` NULL, `project_id` NULL, `status` enum(`requested`,`confirmed`,`completed`,`no_show`,`cancelled`), `assigned_to`, `notes`, `reminder_sent_at`.

The `quote_request_id` link is the feature that matters: the customer's basket arrives at the showroom before they do.

---

## 8. Engagement: wishlist, recently viewed, projects

### 8.1 `saved_item` (wishlist)

`id`, `tenant_id`, `visitor_id` FK NOT NULL, `app_user_id` FK NULL, `product_id` FK CASCADE, `project_id` FK NULL, `note`, `created_at`.

`UNIQUE (visitor_id, product_id)`

Keyed on visitor, not user — that's what makes it work without an account. On login the rows are re-parented by the claim flow (§2.3). `project_id` lets a saved item be filed into a project without leaving the wishlist.

### 8.2 `product_view` (recently viewed) — a hybrid design

Recently-viewed is high-write, low-value-per-row, and read almost exclusively for the current visitor. Writing every page view to Postgres synchronously would make it the busiest table in the database for a feature that shows six thumbnails.

**Design:**
- **Redis is the primary store.** A capped list per visitor (`rv:{visitor_id}`, LPUSH + LTRIM 20, 30-day TTL). Reads for the "Recently viewed" strip never touch Postgres.
- **Postgres holds the durable record** for logged-in users and for analytics, written asynchronously in batches from the analytics event stream.

| Column | Type |
|---|---|
| `id` | bigint identity PK |
| `tenant_id`, `visitor_id`, `app_user_id`, `product_id` | |
| `viewed_at` | timestamptz |
| `view_duration_ms` | integer |
| `source` | enum(`catalog`,`search`,`finder`,`assistant`,`related`,`direct`,`collection`) |

Partitioned monthly, retained 13 months (see §13.3). This table also feeds the recommendation signals and the "products viewed but never quoted" report.

### 8.3 Projects (v1.1, tables designed now)

**`project`** — `id`, `tenant_id`, `visitor_id`, `app_user_id`, `name`, `slug`, `client_name`, `project_type`, `location_city`, `status` enum(`draft`,`active`,`presented`,`approved`,`completed`,`archived`), `cover_media_id`, `palette` jsonb (auto-extracted colours), `total_area_m2`, `notes`, `created_at`, `updated_at`, `archived_at`.

**`project_zone`** — mirrors `quote_request_zone`: `project_id`, `name`, `space_type`, `area_m2`, `layout_pattern_id`, `wastage_pct`, `sort_order`.

**`project_item`** — `project_id`, `zone_id`, `product_id`, `quantity_m2`, `role` enum(`floor`,`wall`,`splashback`,`trim`,`feature`,`alternative`), `sort_order`, `note`, `is_selected` (alternatives sit alongside the chosen tile).

**`project_share`** — `id`, `project_id`, `token` (random, unique, indexed), `permission` enum(`view`,`comment`), `expires_at`, `password_hash` NULL, `view_count`, `last_viewed_at`, `revoked_at`. Public read is granted by token through a `SECURITY DEFINER` function, not by opening RLS on `project`.

**`project_comment`** — `id`, `project_id`, `project_item_id` NULL, `share_id` NULL, `author_name`, `app_user_id` NULL, `body`, `is_resolved`, `created_at`. Clients comment without an account, via the share token.

**Promotion path:** a `project` converts to a `quote_request` by copying zones and items with snapshots. Because `project_zone` and `quote_request_zone` are structurally identical, this is a straightforward insert-select and not a translation layer — which is precisely why they were designed to match.

### 8.4 `stock_alert`

`id`, `tenant_id`, `visitor_id`, `app_user_id` NULL, `product_id`, `location_id` NULL, `contact_email`, `contact_phone`, `channel` enum(`email`,`whatsapp`,`both`), `min_quantity_m2` (alert only when enough arrives), `status` enum(`active`,`notified`,`expired`,`cancelled`), `notified_at`, `expires_at`.

`min_quantity_m2` matters: a contractor needing 340 m² doesn't want an alert when 12 m² arrives. The trigger on `product_stock` update evaluates it before enqueuing a notification.

---

## 9. AI domain

### 9.1 `product_embedding`

Separate from `product` for three reasons: vectors are large and would bloat every catalog `SELECT *`; embeddings are regenerated on a different cadence than product edits; and model versions change independently, requiring rows to coexist during a re-index.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id`, `product_id` | uuid FK CASCADE | |
| `visual_embedding` | `halfvec(1152)` | SigLIP 2 image encoder |
| `semantic_embedding` | `halfvec(1536)` | text-embedding-3-large, Matryoshka-truncated |
| `visual_model`, `semantic_model` | text | e.g. `siglip2-so400m-p14-384` |
| `visual_model_version`, `semantic_model_version` | text | |
| `source_media_id` | uuid FK | Which image the visual embedding came from |
| `embedding_input_hash` | text | Skip regeneration when inputs are unchanged |
| `is_current` | boolean NOT NULL | Exactly one current row per product per model family |
| `generated_at` | timestamptz | |

**Why `halfvec` and not `vector`.** pgvector's half-precision type stores 1152 dimensions in 2.3 KB instead of 4.6 KB, halving both table and HNSW index size. Recall loss on cosine similarity at this dimensionality is under 0.5% — measurable but immaterial against a doubling of index cache residency. At 10,000 products both indexes fit comfortably in memory on a small instance; at 50,000 they still do. Using full `vector` would push us to a larger instance for no user-visible benefit.

**Why two vectors and not one.** Restated from Architecture §6.2 because it drives this table's shape: text embeddings cannot distinguish one Calacatta veining pattern from another. Visual similarity requires an image encoder. Semantic search ("luxury bathroom", "warm neutral") requires a text encoder. Fusing their rankings (§9.2) beats either alone, and neither can substitute for the other.

**Re-indexing without downtime:** a new model version writes rows with `is_current = false` and a new `visual_model_version`. When coverage reaches 100%, a single transaction flips the flags. Queries always filter `is_current = true`, so the switch is atomic and instantly reversible.

```sql
CREATE INDEX ON product_embedding USING hnsw (visual_embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64) WHERE is_current;
CREATE INDEX ON product_embedding USING hnsw (semantic_embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64) WHERE is_current;
CREATE UNIQUE INDEX ON product_embedding (product_id, visual_model) WHERE is_current;
```

**Partial HNSW indexes on `is_current`** keep the index at exactly one entry per product during a migration rather than two.

**Multi-tenant note:** vector indexes cannot be filtered by `tenant_id` before the ANN scan without losing index usage. The mitigation for a future multi-tenant deployment is documented in §16.4 — it's the one place where tenancy genuinely complicates the design, and it's better to know that now.

### 9.2 `finder_session` — tile finder

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Shareable — `/tile-finder/results/[id]` |
| `tenant_id`, `visitor_id`, `app_user_id` | | |
| `upload_id` | uuid FK → upload | The user's photo |
| `image_phash` | text | Perceptual hash — cache key for repeat uploads |
| `gate_result` | enum(`accepted`,`not_a_tile`,`too_dark`,`too_angled`,`unsafe`) | Why a photo was rejected |
| `extracted_attributes` | jsonb | Colour, finish, look, format guess from the VLM |
| `user_corrections` | jsonb | The "adjust our reading" control — **this is labelled training data** |
| `query_visual_embedding` | halfvec(1152) | Stored so results are reproducible |
| `top_score`, `score_distribution` | numeric / jsonb | |
| `confidence_band` | enum(`strong`,`moderate`,`weak`,`none`) | Drives which UI state renders |
| `result_count` | smallint | |
| `latency_ms` | integer | |
| `created_at` | timestamptz | |

**`finder_result`** — `finder_session_id`, `product_id`, `rank`, `visual_score`, `semantic_score`, `fused_score`, `calibrated_percent`, `explanation`, `was_clicked`, `was_saved`, `was_quoted`.

Storing per-result outcomes is what makes match quality measurable. Without `was_clicked` / `was_quoted`, "is the tile finder any good?" is unanswerable, and the feature can degrade silently for months.

**`calibrated_percent` is stored separately from `fused_score`** because the displayed percentage comes from a monotonic calibration fitted on labelled data — raw cosine presented as a percentage is misleading (Architecture §6.3). Keeping both lets us re-calibrate historical sessions when the mapping improves.

### 9.3 Conversation history

**`ai_conversation`** — `id`, `tenant_id`, `visitor_id`, `app_user_id`, `assistant_type` enum(`interior`,`admin`,`search`), `title` (auto-summarised), `locale`, `status` enum(`active`,`completed`,`abandoned`), `message_count`, `total_tokens`, `total_cost_usd`, `resulted_in_quote` boolean, `quote_request_id` NULL, `started_at`, `last_message_at`, `expires_at`.

**`ai_message`** — `id` bigint, `conversation_id` FK CASCADE, `role` enum(`system`,`user`,`assistant`,`tool`), `sequence` int, `content` text, `content_summary` text, `tool_payload` jsonb, `referenced_product_ids` uuid[], `model`, `prompt_tokens`, `completion_tokens`, `latency_ms`, `finish_reason`, `created_at`.
`UNIQUE (conversation_id, sequence)`

**`ai_tool_call`** — `id`, `message_id` FK, `tool_name`, `arguments` jsonb, `result_summary` jsonb, `result_row_ids` uuid[], `status` enum(`success`,`error`,`timeout`), `duration_ms`, `error_message`.

**`referenced_product_ids` is not decoration.** It's the enforcement point for the grounding rule from Architecture §6.4: every product the assistant mentions must appear in a tool result. A validator compares the message's referenced IDs against the tool call's returned IDs before the response is finalised, and a mismatch is logged as a grounding violation. The array also powers the "which products does the assistant recommend most, and do they convert?" report.

**`content_summary`** exists because long conversations get summarised for context-window management; storing the summary means we never re-summarise the same history twice.

**Retention:** anonymous conversations expire after 90 days; conversations attached to a user or a quote are retained indefinitely. `expires_at` is set at creation and cleared on promotion.

### 9.4 `ai_interaction` — the cost and quality ledger

One row per model call, across every feature. This is the table that makes AI spend controllable.

| Column | Type |
|---|---|
| `id` | bigint identity PK |
| `tenant_id` | uuid |
| `feature` | enum(`tile_finder`,`assistant`,`ingestion_extract`,`ingestion_copy`,`embedding_visual`,`embedding_semantic`,`alt_text`,`translation`,`rerank`,`safety_gate`,`visualizer`) |
| `provider` | enum(`openai`,`gemini`,`siglip_host`,`local`) |
| `model`, `model_version` | text |
| `operation` | enum(`chat`,`vision`,`embed`,`rerank`,`image_gen`) |
| `input_tokens`, `output_tokens`, `image_count` | integer |
| `cost_usd` | numeric(10,6) |
| `latency_ms` | integer |
| `status` | enum(`success`,`error`,`timeout`,`rate_limited`,`filtered`) |
| `error_code`, `error_message` | text |
| `cache_hit` | boolean |
| `request_hash` | text |
| `reference_type`, `reference_id` | enum / uuid |
| `created_at` | timestamptz |

Partitioned monthly. Feeds the admin cost dashboard, the monthly spend ceiling with graceful degradation, and per-feature ROI (cost per quote generated by source).

`request_hash` + `cache_hit` prove the caching layer is working; a cache hit rate that drops is an early warning that something upstream changed.

**`ai_feedback`** — `id`, `tenant_id`, `visitor_id`, `reference_type` enum(`finder_result`,`ai_message`,`recommendation`,`generated_copy`), `reference_id`, `rating` enum(`positive`,`negative`), `reason` enum(`wrong_colour`,`wrong_size`,`wrong_finish`,`not_relevant`,`inaccurate_spec`,`other`), `comment`, `created_at`. Structured reasons rather than free text, because free-text feedback is unanalysable at volume.

### 9.5 Ingestion pipeline

**`ingestion_job`** — `id`, `tenant_id`, `created_by`, `job_type` enum(`pdf_catalog`,`spreadsheet`,`image_batch`,`url_scrape`), `supplier_id` (→ brand), `status` enum(`queued`,`parsing`,`extracting`,`enriching`,`embedding`,`review_pending`,`partially_approved`,`completed`,`failed`,`cancelled`), `total_items`, `extracted_count`, `approved_count`, `rejected_count`, `needs_review_count`, `total_cost_usd`, `error_message`, `inngest_run_id`, `started_at`, `completed_at`.

**`ingestion_document`** — `id`, `job_id`, `upload_id`, `page_count`, `parsed_layout` jsonb, `status`. One job may include several files.

**`ingestion_region`** — `id`, `document_id`, `page_number`, `bbox` (numeric[4]), `region_image_upload_id`, `staging_product_id`. This is what powers the side-by-side review screen: the exact PDF region that produced each extracted field, highlighted as the reviewer moves through fields. Without stored bounding boxes the review UI is guesswork.

**`staging_product`** — mirrors `product`'s shape but with every column nullable and no constraints, plus: `job_id`, `status` enum(`extracted`,`needs_review`,`approved`,`rejected`,`merged`), `overall_confidence`, `duplicate_of_product_id` NULL, `duplicate_score`, `promoted_product_id` NULL, `reviewed_by`, `reviewed_at`, `rejection_reason`.

**`staging_field`** — `staging_product_id`, `field_key`, `raw_value` jsonb, `normalized_value` jsonb, `confidence` numeric(4,3), `source_region_id`, `was_edited`, `edited_value`, `edited_by`.

**The design rule from the UX blueprint, enforced here:** a field with `confidence < 0.5` stores its `raw_value` but leaves `normalized_value` NULL, so the review UI renders an empty required field rather than a plausible wrong one. The `was_edited` flag captures every human correction, giving a labelled dataset for tuning extraction prompts per supplier.

**`supplier_mapping`** — `id`, `tenant_id`, `brand_id`, `document_signature` (header fingerprint), `field_mappings` jsonb, `transformation_rules` jsonb, `confidence`, `times_used`, `last_used_at`. The second catalog from the same supplier is dramatically faster than the first because the column mapping is remembered. Over a year this is the difference between a useful tool and a novelty.

---

## 10. Analytics storage

### 10.1 The split with PostHog

PostHog owns behavioural product analytics: funnels, session replay, feature flags, retention. Postgres owns **commerce-critical events** that must join to catalog and quote data and must survive a vendor change. Duplicating everything into both is the common mistake; the boundary is: *if a report needs a SQL join to `product` or `quote_request`, it lives in Postgres.*

### 10.2 `analytics_event`

| Column | Type |
|---|---|
| `id` | bigint identity |
| `tenant_id`, `visitor_id`, `app_user_id` | uuid |
| `session_id` | uuid |
| `event_type` | enum (~40 values: `product_view`, `filter_apply`, `search`, `search_no_results`, `finder_upload`, `finder_result_click`, `assistant_message`, `basket_add`, `basket_remove`, `quote_submit`, `sample_request`, `booking_request`, `share_project`, …) |
| `entity_type`, `entity_id` | enum / uuid |
| `properties` | jsonb |
| `locale`, `country_code`, `device_type`, `referrer_domain`, `utm` | |
| `occurred_at` | timestamptz |

PK `(id, occurred_at)`, **RANGE partitioned monthly** on `occurred_at`.

### 10.3 Rollups

Raw events are for investigation; dashboards read pre-aggregated tables refreshed by `pg_cron`. Querying 50 M raw rows to draw a sparkline is how analytics dashboards become the slowest page in an admin.

- **`daily_product_stat`** — `(tenant_id, product_id, date)`: views, unique visitors, basket adds, quote inclusions, finder appearances, finder clicks, saves, conversion rate.
- **`daily_search_stat`** — `(tenant_id, date, normalized_query)`: count, result count, click-through, zero-result flag. **The zero-result report is the single most commercially useful thing in this domain** — it tells Amin exactly what customers want that he doesn't stock.
- **`daily_filter_stat`** — `(tenant_id, date, filter_signature)`: applications, result counts, zero-result count. Same purpose, different angle: which *combinations* return nothing.
- **`daily_ai_stat`** — `(tenant_id, date, feature)`: calls, cost, mean latency, error rate, cache hit rate, mean confidence, positive-feedback rate.
- **`daily_quote_stat`** — `(tenant_id, date, source)`: submitted, value, won, lost, mean response hours.

Rollups run at 03:00 tenant-local, are idempotent (upsert on the composite key), and can be replayed for any date range from raw events until those partitions are dropped.

---

## 11. Platform: notifications, connectors, audit, settings

### 11.1 Notifications

**`notification_template`** — `id`, `tenant_id`, `key` (`quote.submitted`, `stock.back_in_stock`, `booking.reminder`, `ingestion.review_ready`), `channel` enum(`email`,`whatsapp`,`sms`,`in_app`,`push`), `locale`, `subject`, `body`, `variables` jsonb, `is_active`, `version`.
`UNIQUE (tenant_id, key, channel, locale)`

**`notification`** — `id`, `tenant_id`, `recipient_type` enum(`user`,`visitor`,`contact`,`role`), `recipient_id`, `recipient_email`, `recipient_phone`, `template_key`, `data` jsonb, `priority` enum(`low`,`normal`,`high`,`urgent`), `status` enum(`pending`,`queued`,`sent`,`delivered`,`failed`,`suppressed`), `scheduled_for`, `created_at`.

**`notification_delivery`** — `id`, `notification_id`, `channel`, `provider`, `provider_message_id`, `status`, `attempt`, `error_code`, `sent_at`, `delivered_at`, `opened_at`, `clicked_at`, `failed_at`.

One notification, many deliveries — the same "back in stock" event may go to both email and WhatsApp with independent outcomes. Collapsing these into one table makes per-channel deliverability unanswerable.

**`notification_preference`** — `(app_user_id | visitor_id, category, channel, is_enabled)`, plus `unsubscribe_token` and `suppressed_until`. A global suppression list (`notification_suppression`: email/phone, reason, added_at) prevents sending to hard-bounced or complained addresses regardless of preferences — a legal and deliverability requirement.

### 11.2 Connectors and the outbox

**`connector_config`** — `id`, `tenant_id`, `connector_key` (`whatsapp`, `resend`, `cloudinary`, `stripe`, `erp`, `crm`, `pos`), `name`, `is_enabled`, `config` jsonb (non-secret), `credentials_ref` text (**a reference to a secret manager, never the secret**), `capabilities` text[], `subscribed_events` text[], `health_status` enum(`healthy`,`degraded`,`failing`,`unconfigured`), `last_health_check_at`, `last_error`.

**`outbox_event`** — the transactional outbox from Architecture §8.1.

| Column | Type |
|---|---|
| `id` | bigint identity PK |
| `tenant_id` | uuid |
| `event_type` | text (`quote.submitted`, `product.published`, `stock.low`) |
| `aggregate_type`, `aggregate_id` | text / uuid |
| `payload` | jsonb |
| `status` | enum(`pending`,`processing`,`delivered`,`failed`,`dead`) |
| `attempts` | smallint |
| `available_at` | timestamptz (exponential backoff) |
| `locked_by`, `locked_until` | text / timestamptz |
| `last_error` | text |
| `created_at`, `delivered_at` | timestamptz |

```sql
CREATE INDEX ON outbox_event (status, available_at) WHERE status IN ('pending','failed');
```

**The critical property:** the outbox row is written **inside the same transaction** as the business change. A quote is never submitted without its notification event, and no event is ever emitted for a transaction that rolled back. Naive webhook calls inside request handlers fail both ways.

**`connector_event_log`** — `id`, `connector_config_id`, `outbox_event_id`, `direction` enum(`outbound`,`inbound`), `status`, `request_summary` jsonb, `response_summary` jsonb, `duration_ms`, `created_at`. Retained 90 days. Inbound rows carry `idempotency_key` with a unique index, so a webhook delivered twice is processed once.

### 11.3 `audit_log`

| Column | Type |
|---|---|
| `id` | bigint identity PK |
| `tenant_id` | uuid |
| `actor_type` | enum(`user`,`system`,`api_key`,`job`) |
| `actor_id`, `actor_email` | uuid / text (denormalised — the actor may later be deleted) |
| `action` | text (`product.publish`, `inventory.adjust`, `role.grant`, `price.update`) |
| `entity_type`, `entity_id`, `entity_label` | text / uuid / text |
| `before`, `after` | jsonb |
| `changed_fields` | text[] |
| `reason` | text |
| `ip_address` | inet |
| `user_agent`, `request_id` | text |
| `occurred_at` | timestamptz |

Partitioned monthly, retained 7 years.

**Append-only is enforced by the database, not by convention:** RLS grants `INSERT` and `SELECT` only, with no `UPDATE` or `USING` policy for either. Not even the tenant owner can rewrite history. `changed_fields` is a generated summary so the common query ("who changed prices this week") doesn't diff JSONB across millions of rows.

What is always audited: any product/price/stock mutation, role and permission changes, connector configuration, trade account approvals, quote status transitions, ingestion approvals, settings changes, and every admin login and failed login attempt.

### 11.4 Settings, flags, redirects

**`app_setting`** — `(tenant_id, key)` PK, `value` jsonb, `data_type`, `scope` enum(`public`,`private`), `description`, `updated_by`. Holds low-stock thresholds, default wastage, sample limits, quote expiry days, AI monthly budget, feature toggles per tenant.

**`feature_flag`** — `key`, `tenant_id` NULL (null = global), `is_enabled`, `rollout_percent`, `conditions` jsonb. Lets the Room Visualizer ship dark and enable per tenant.

**`url_redirect`** — `tenant_id`, `from_path`, `to_path`, `status_code`, `hit_count`, `is_active`. Needed at launch for the existing site's URLs, and thereafter whenever a product slug changes — a slug change without a redirect silently discards accumulated SEO value.

---

## 12. Indexing strategy

### 12.1 Principles

1. **Every foreign key is indexed.** Postgres does not do this automatically, and an unindexed FK turns a parent delete into a sequential scan of the child table.
2. **Composite indexes lead with `tenant_id`** — free today, essential later.
3. **Partial indexes wherever a predicate is near-universal.** `WHERE deleted_at IS NULL` and `WHERE status = 'published'` cut the catalog index roughly in half.
4. **Covering indexes (`INCLUDE`) on hot read paths** to get index-only scans.
5. **Index the query, not the column.** Every index below traces to a named query in the UX blueprint.

### 12.2 Catalog

```sql
-- Primary catalog browse: category page, published only
CREATE INDEX product_browse_idx ON product
  (tenant_id, status, category_id, published_at DESC)
  WHERE deleted_at IS NULL AND status = 'published';

-- Facet filters, most selective first
CREATE INDEX product_facet_idx ON product
  (tenant_id, format_group, finish_id, color_family_id)
  WHERE deleted_at IS NULL AND status = 'published';

CREATE INDEX product_surface_idx ON product (tenant_id, surface_look_id, material_id)
  WHERE deleted_at IS NULL AND status = 'published';

-- Technical filters (Spec mode / trade)
CREATE INDEX product_technical_idx ON product (tenant_id, slip_rating, pei_class, is_outdoor)
  WHERE deleted_at IS NULL AND status = 'published';

-- Applications containment
CREATE INDEX product_application_idx ON product USING GIN (application_ids);

-- Price sort — the denormalised column earning its keep
CREATE INDEX product_price_sort_idx ON product (tenant_id, base_price)
  WHERE deleted_at IS NULL AND status = 'published' AND base_price IS NOT NULL;

-- SKU lookup, exact and fuzzy
CREATE UNIQUE INDEX product_sku_idx ON product (tenant_id, sku) WHERE deleted_at IS NULL;
CREATE INDEX product_sku_trgm_idx ON product USING GIN (sku gin_trgm_ops);
CREATE INDEX product_supplier_sku_idx ON product (tenant_id, supplier_sku)
  WHERE supplier_sku IS NOT NULL;

-- Dimensions range (contractor searching "anything 60 wide")
CREATE INDEX product_dimension_idx ON product (tenant_id, width_mm, height_mm);

-- Full text, per locale
CREATE INDEX pt_search_en_idx ON product_translation USING GIN (search_vector)
  WHERE locale = 'en';
CREATE INDEX pt_search_ar_idx ON product_translation USING GIN (search_vector)
  WHERE locale = 'ar';
CREATE UNIQUE INDEX pt_slug_idx ON product_translation (tenant_id, locale, slug);

-- Category subtree
CREATE INDEX category_path_idx ON category USING GIST (path);
```

**Facet counts** are computed in the same query as the result set using `FILTER` aggregates over the filtered set, not as one query per facet. This is the difference between a 40 ms and a 900 ms catalog page, and it's the most common performance mistake in faceted commerce.

### 12.3 Inventory

```sql
CREATE INDEX stock_lot_lookup_idx ON stock_lot (tenant_id, product_id, location_id, status)
  INCLUDE (quantity_m2, reserved_m2, lot_number);
CREATE INDEX stock_lot_available_idx ON stock_lot (tenant_id, product_id, available_m2 DESC)
  WHERE status = 'available' AND available_m2 > 0;
CREATE INDEX movement_ledger_idx ON inventory_movement
  (tenant_id, product_id, location_id, occurred_at DESC);
CREATE INDEX movement_reference_idx ON inventory_movement (reference_type, reference_id);
CREATE INDEX product_stock_facet_idx ON product_stock (tenant_id, stock_status)
  WHERE location_id IS NULL;
```

The last one serves the catalog's availability facet against the roll-up row only — one row per product rather than one per location.

### 12.4 Commerce, engagement, AI, platform

```sql
CREATE INDEX quote_board_idx ON quote_request (tenant_id, status, submitted_at DESC);
CREATE INDEX quote_assigned_idx ON quote_request (tenant_id, assigned_to, status)
  WHERE status NOT IN ('won','lost','cancelled','expired');
CREATE INDEX quote_source_idx ON quote_request (tenant_id, source, submitted_at DESC);
CREATE UNIQUE INDEX quote_reference_idx ON quote_request (reference);

CREATE UNIQUE INDEX saved_item_idx ON saved_item (visitor_id, product_id);
CREATE INDEX saved_item_user_idx ON saved_item (app_user_id, created_at DESC)
  WHERE app_user_id IS NOT NULL;
CREATE INDEX product_view_visitor_idx ON product_view (visitor_id, viewed_at DESC);
CREATE INDEX product_view_product_idx ON product_view (tenant_id, product_id, viewed_at DESC);

CREATE INDEX conversation_visitor_idx ON ai_conversation (visitor_id, last_message_at DESC);
CREATE UNIQUE INDEX message_sequence_idx ON ai_message (conversation_id, sequence);
CREATE INDEX finder_session_visitor_idx ON finder_session (visitor_id, created_at DESC);
CREATE INDEX finder_phash_idx ON finder_session (image_phash);   -- cache lookup
CREATE INDEX ai_interaction_cost_idx ON ai_interaction (tenant_id, feature, created_at DESC);

CREATE INDEX outbox_pending_idx ON outbox_event (status, available_at)
  WHERE status IN ('pending','failed');
CREATE INDEX audit_entity_idx ON audit_log (tenant_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_actor_idx ON audit_log (tenant_id, actor_id, occurred_at DESC);
CREATE INDEX notification_queue_idx ON notification (status, scheduled_for)
  WHERE status IN ('pending','queued');
```

### 12.5 Index maintenance

Every index is built `CONCURRENTLY` in production. `pg_stat_user_indexes` is reviewed monthly and unused indexes are dropped — an unused index costs write throughput and cache space for nothing. Index bloat is monitored; `REINDEX CONCURRENTLY` runs quarterly on the high-churn tables (`product_stock`, `outbox_event`, `stock_lot`).

---

## 13. Scalability

### 13.1 Volume projections

| Table | Launch | Year 3 | Strategy |
|---|---|---|---|
| `product` | 2 K | 50 K | Indexes only; trivial at this size |
| `product_translation` | 4 K | 150 K | Partial indexes per locale |
| `product_embedding` | 2 K | 50 K | halfvec + partial HNSW ≈ 400 MB at 50 K |
| `stock_lot` | 6 K | 300 K | Indexed; archive depleted lots after 2 years |
| `inventory_movement` | 20 K | 5 M | Monthly partitions from launch |
| `product_view` | 100 K/mo | 3 M/mo | Monthly partitions, 13-month retention |
| `analytics_event` | 500 K/mo | 15 M/mo | Monthly partitions, 13-month retention |
| `ai_interaction` | 50 K/mo | 2 M/mo | Monthly partitions, 24-month retention |
| `audit_log` | 20 K/mo | 500 K/mo | Monthly partitions, 7-year retention |
| `ai_message` | 30 K/mo | 1 M/mo | Retention by expiry |

Nothing here is large by Postgres standards. The scaling work is about **keeping hot tables small**, not about handling volume.

### 13.2 Partitioning

RANGE partitioned monthly on their time column: `analytics_event`, `product_view`, `ai_interaction`, `audit_log`, `inventory_movement`, `connector_event_log`, `notification_delivery`.

`pg_partman` creates partitions 3 months ahead and detaches expired ones on schedule. Detached partitions are exported to object storage as compressed Parquet before being dropped, so a 7-year audit obligation doesn't require 7 years of hot storage.

**Why these and not others:** partitioning is only worth its complexity when a table grows unboundedly with time *and* queries are predominantly recent-window. `product` grows but is small; `quote_request` grows slowly and is queried across all time. Partitioning either would add operational cost for no benefit.

### 13.3 The scaling ladder, in order

1. **Indexes and query shape** — where 90% of the gains are, and where most of the design effort in §12 went.
2. **Redis caching** (§14) — removes the majority of repeat reads before they reach Postgres.
3. **Connection pooling** — Supabase's PgBouncer in transaction mode from day one. Serverless functions without pooling exhaust connections at surprisingly low traffic; this is not an optimisation, it's a prerequisite.
4. **Vertical scale** — Supabase instance size. Comfortably sufficient to roughly 100 K products.
5. **Read replicas** — route catalog reads, analytics and rollups to a replica; keep writes and read-after-write paths (basket, admin) on primary. The application already separates read and write use-cases, so this is a routing change.
6. **Partition pruning and archival** (§13.2).
7. **Vector scale-out** — if the HNSW index outgrows memory (roughly 500 K products), either move vectors to a dedicated instance or shard by tenant. §16.4.
8. **Materialised views** for the heaviest analytics, refreshed concurrently.

We do not need steps 5–8 at launch. They are listed so that each is a known move rather than an emergency.

### 13.4 Concurrency

Stock adjustments use `SELECT … FOR UPDATE` on the specific `stock_lot` row inside a transaction, ordered by lot ID to prevent deadlock between concurrent multi-lot reservations. Quote reference numbers come from a sequence, not a count. Outbox workers claim rows with `FOR UPDATE SKIP LOCKED`, which lets many workers drain the queue without contention. Idempotency keys on all inbound webhooks and all AI job triggers make retries safe.

---

## 14. Caching strategy

Five layers, each with an explicit invalidation trigger. A cache without a named invalidation path is a bug waiting to be reported as "the site shows old prices".

| Layer | Holds | TTL | Invalidated by |
|---|---|---|---|
| **CDN (Vercel edge)** | Static assets, ISR pages, OG images | Immutable / per-route | Deploy, on-demand revalidation |
| **ISR** | Home, collections, product pages, guides | 1–6 h | Tag-based revalidation on publish |
| **Redis — data** | Product detail payloads, facet counts by filter hash, category trees, taxonomy lookups, settings | 5 min – 24 h | Tag invalidation on write |
| **Redis — session** | Recently viewed, basket draft, filter state, rate-limit counters | 30 d / sliding | Natural expiry |
| **Redis — AI** | Embeddings by input hash, finder results by image phash, assistant tool results | 1 h – 30 d | Model version change |
| **Postgres** | Rollup tables, `product_stock`, `base_price` | — | Triggers, `pg_cron` |

**Key schema:** `{tenant}:{entity}:{id}:{version}` — e.g. `amin:product:0193f...:v3`. Every cached entity carries a version counter in Redis; bumping the counter invalidates every derived key without a scan. Tag sets (`tag:product:{id}` → key list) handle cross-entity invalidation, so republishing a product clears its detail payload, its collection listing and the facet counts that include it.

**What is never cached:** stock quantities on the product page (read live — showing a tile as available when it isn't is a commercial failure), trade prices (per-user), admin views, anything inside a quote.

**Stampede protection:** `SWR` semantics with a short lock — the first request on a miss recomputes while others serve stale for up to 10 seconds. Without this, a popular product expiring at peak sends every concurrent request to Postgres simultaneously.

---

## 15. Prisma schema architecture

### 15.1 Organisation

Prisma 6 with `prismaSchemaFolder`, split by domain to match §1 so the schema stays navigable at ~80 models:

```
prisma/
  schema.prisma          datasource, generator, extensions
  identity.prisma        tenant, app_user, visitor, role, permission, trade_account
  catalog.prisma         brand, collection, category, product, translations, lookups
  media.prisma           media_asset, product_media, upload
  inventory.prisma       location, stock_lot, inventory_movement, product_stock
  commerce.prisma        quote_*, sample_*, showroom_booking
  engagement.prisma      saved_item, product_view, project_*, stock_alert
  ai.prisma              product_embedding, ai_*, finder_*
  ingestion.prisma       ingestion_*, staging_*, supplier_mapping
  analytics.prisma       analytics_event, daily_* rollups
  platform.prisma        notification_*, connector_*, outbox_event, audit_log, app_setting
  migrations/
```

### 15.2 What Prisma owns and what it does not

Prisma is the source of truth for tables, columns, relations and standard indexes. It is **not** used for the parts of Postgres it doesn't model well. Those live in versioned SQL migrations sitting alongside Prisma's, applied in order:

| Feature | Owner |
|---|---|
| Tables, columns, relations, B-tree indexes | Prisma |
| `vector` / `halfvec` columns | SQL — declared as `Unsupported("halfvec(1152)")` in Prisma so it round-trips safely |
| HNSW, GIN, GiST, partial and covering indexes | SQL |
| Generated columns (`search_vector`, `available_m2`) | SQL |
| Triggers (denormalisation maintenance, `updated_at`) | SQL |
| RLS policies | SQL |
| Partitions and `pg_partman` | SQL |
| `ltree`, `citext`, extensions | SQL, declared in Prisma's `extensions` |
| Check constraints | SQL |

`Unsupported()` fields are excluded from Prisma's generated client, so vector reads and writes go through typed raw queries in a single repository module — one file that owns all vector SQL, rather than raw queries scattered through the codebase.

### 15.3 Conventions

`@@map` and `@map` translate `snake_case` database names to `camelCase` client fields, so the database follows Postgres convention and TypeScript follows its own. Every model gets `@@index` mirroring the SQL indexes it owns, so `prisma migrate diff` stays clean. Multi-field unique constraints are declared with `@@unique`. Enums are declared in Prisma where they're native Postgres enums, and modelled as relations where they're lookup tables (§5.3) — the schema itself thus documents the distinction.

`previewFeatures = ["postgresqlExtensions", "prismaSchemaFolder", "relationJoins", "typedSql"]`. `relationJoins` matters: it makes Prisma emit real `LATERAL` joins instead of multiple round trips, which materially improves the catalog query.

### 15.4 Repository boundary

Per Architecture §5.3, Prisma types never leave the infrastructure layer. Repositories return domain types. The practical benefit shows up in the snapshot logic: a `QuoteItem` domain object carries the snapshot values, and no component can accidentally reach through it into live product data.

### 15.5 Migration workflow

Development uses `prisma migrate dev`; production uses `prisma migrate deploy` in CI, gated behind a review step. Every migration is reviewed for lock behaviour before merge — `ALTER TABLE … ADD COLUMN` with a volatile default rewrites the table and takes an `ACCESS EXCLUSIVE` lock, which on `product` at peak is an outage. The house rules: add nullable, backfill in batches, then add the constraint; create indexes `CONCURRENTLY`; never drop a column in the same release that stops writing to it.

---

## 16. Supabase integration and Row Level Security

### 16.1 What Supabase provides and what it doesn't

**Used:** Postgres with extensions, Auth (identity, MFA, sessions), Storage (private buckets), Realtime (admin dashboard live updates on `quote_request` and `ingestion_job`), point-in-time recovery, connection pooling.

**Deliberately not used:** PostgREST as the public API — all data access goes through the Next.js application layer, where authorisation, validation and business rules live. Exposing PostgREST publicly would make RLS the *only* line of defence rather than the last one.

**RLS is defence in depth, not the primary control.** Authorisation is enforced at three layers (Architecture §8.3): middleware on the route, the `withAuth` wrapper on every server action, and RLS at the row. A bug in any one layer does not expose data.

### 16.2 The tenancy predicate

Every tenant-scoped table has RLS enabled with a base policy:

```sql
ALTER TABLE product ENABLE ROW LEVEL SECURITY;
ALTER TABLE product FORCE ROW LEVEL SECURITY;   -- applies to table owner too

CREATE POLICY tenant_isolation ON product
  USING (tenant_id = auth.tenant_id());
```

`auth.tenant_id()`, `auth.permissions()`, `auth.visitor_id()` and `auth.app_user_id()` are `STABLE` SQL functions reading the JWT claims populated by the Auth Hook (§2.7). They are `STABLE`, not `VOLATILE`, so the planner evaluates them once per query rather than per row — the difference between an index scan and a sequential scan on a large table.

### 16.3 Policy families

**Public catalog (anon + authenticated read):**
```sql
CREATE POLICY public_read ON product FOR SELECT
  USING (tenant_id = auth.tenant_id()
         AND status = 'published' AND deleted_at IS NULL);
```
Draft and archived products are invisible to the public role at the database level, not merely filtered in a query.

**Staff write, permission-scoped:**
```sql
CREATE POLICY staff_write ON product FOR ALL
  USING (tenant_id = auth.tenant_id() AND auth.has_permission('product.update'))
  WITH CHECK (tenant_id = auth.tenant_id() AND auth.has_permission('product.update'));
```
`WITH CHECK` matters as much as `USING`: without it, a user could update a row into another tenant.

**Visitor-owned data** (`saved_item`, `product_view`, `quote_request`, `finder_session`, `ai_conversation`, `project`):
```sql
CREATE POLICY own_data ON saved_item FOR ALL
  USING (visitor_id = auth.visitor_id()
         OR (app_user_id IS NOT NULL AND app_user_id = auth.app_user_id())
         OR auth.has_permission('request.read'));
```

**Trade pricing:** `product_price` is readable only for the tier matching the requester's `trade_tier_id`, or by staff with `price.trade.read`. A trade customer cannot enumerate other tiers' pricing — a real commercial concern, since tier pricing is confidential.

**Append-only tables** (`audit_log`, `inventory_movement`, `analytics_event`): `FOR INSERT` and `FOR SELECT` policies only. No `UPDATE` or `DELETE` policy exists, so those operations are denied by default for every role including owner.

**Shared projects** are read through a `SECURITY DEFINER` function that validates the share token and returns the project, rather than by adding a token predicate to the `project` policy. Keeping token logic out of RLS keeps the policy simple enough to reason about, which is the main thing that keeps RLS correct.

**Service role** bypasses RLS and is used exclusively by server-side jobs (ingestion, embeddings, rollups, outbox). Every service-role code path passes `tenant_id` explicitly, and a lint rule flags any service-role query without one.

### 16.4 Supabase Storage

Buckets: `product-media` (public read, staff write) · `user-uploads` (private, owner-scoped) · `ingestion-sources` (private, `ingestion.run` permission) · `generated` (private, signed URLs, 1-hour expiry) · `trade-documents` (private, `user.manage` only).

Storage policies mirror the `upload` table's ownership: a path is `{tenant_id}/{purpose}/{uuid}` and the policy asserts the first path segment matches `auth.tenant_id()`. Tenant prefixing from day one means storage requires no reorganisation when tenancy activates.

---

## 17. Backup and disaster recovery

| Mechanism | Frequency | Retention | Recovers from |
|---|---|---|---|
| Supabase PITR (WAL) | Continuous | 7 days (30 on Pro) | Any point-in-time; accidental mass update |
| Automated daily snapshot | Daily | 30 days | Instance failure |
| Independent `pg_dump` to object storage | Nightly, 02:00 | 90 days | **Provider failure or account loss** |
| Weekly full logical dump | Weekly | 12 months | Long-horizon restore, compliance |
| Partition exports to Parquet | Monthly | 7 years | Analytics and audit history |
| Cloudinary | Provider-replicated | — | Media |
| Supabase Storage | Daily sync to independent object storage | 30 days | User uploads, ingestion sources |

**The independent nightly dump is the one that matters most.** Provider-managed backups protect against infrastructure failure but not against losing access to the provider — a billing dispute, an account compromise or a service termination leaves you with nothing recoverable. A dump you hold in your own storage account is the only backup that survives that scenario.

**Targets:** RPO 5 minutes (PITR), RTO 1 hour for a full restore. **Restores are tested quarterly** into a scratch project, with the result recorded. An untested backup is a hypothesis, not a backup.

**Additional protections:** soft delete on all user-facing entities means the common "someone deleted it" incident is a flag flip, not a restore. Destructive admin actions require typed confirmation. Bulk operations above 50 rows require a second confirmation and are always audited.

---

## 18. Migration and evolution strategy

### 18.1 Schema change rules

Expand-migrate-contract, always, in three separate deploys:
1. **Expand** — add the new nullable column or table; write to both old and new.
2. **Migrate** — backfill in batches with `pg_cron` or a job, monitoring lock waits.
3. **Contract** — stop writing the old, add constraints, drop the old column in a later release.

Every migration is reversible or has a written rollback plan. Migrations are never combined with application deploys that depend on them in the same release; the database always ships first and remains backward compatible for at least one version.

Additional rules: no `ALTER TABLE` with a volatile default on a large table; indexes always `CONCURRENTLY`; new NOT NULL constraints added as `NOT VALID` then validated separately; enum additions are append-only and never reorder.

### 18.2 Data migrations

Kept separate from schema migrations, idempotent, resumable, batched (typically 1,000 rows with a pause), and always dry-runnable against a restored snapshot before production.

### 18.3 Anticipated evolutions, and why the schema already accommodates them

| Future need | Change required |
|---|---|
| Online payments | Add `order`, `payment`, `payment_method`. `quote_request` gains `converted_to_order_id`. No existing table changes |
| Per-customer pricing | Add `customer_price`; insert one step in the resolution chain |
| Multi-currency display | `exchange_rate` table; prices already carry a currency |
| Product variants (same tile, several sizes) | `product_group` parent; products gain `group_id`. Deliberately deferred — most tile catalogs treat sizes as separate SKUs, and forcing a variant model now would fight the data |
| Additional locales | Insert rows. No schema change |
| ERP sync | Connector + `external_reference(entity_type, entity_id, system, external_id)` |
| New embedding model | New rows with a new `model_version`, atomic flag flip (§9.1) |
| Room visualiser | `visualization` table + `upload.purpose` value |
| Installer directory | New domain, no changes elsewhere |

---

## 19. Multi-tenant / SaaS evolution

This is requirement 34 and the reason for several decisions above.

### 19.1 The model chosen

Three approaches exist: database-per-tenant (strong isolation, painful migrations and cost at scale), schema-per-tenant (moderate isolation, migration complexity grows linearly with tenants), and **shared schema with a tenant discriminator plus RLS**.

We build the third, because it's the only one where adding the hundredth tenant costs the same as the second, and because RLS makes the isolation a database-enforced property rather than an application convention. Its weakness — a policy bug leaks across tenants rather than being physically impossible — is mitigated by `FORCE ROW LEVEL SECURITY`, `WITH CHECK` on every write policy, and an automated test suite that attempts cross-tenant access on every table in CI.

### 19.2 What is already in place

- `tenant_id` on every tenant-scoped table, leading every composite index.
- Every uniqueness constraint is **already tenant-scoped** (`UNIQUE (tenant_id, sku)`, not `UNIQUE (sku)`). This is the single most expensive thing to retrofit, because fixing it later requires resolving real collisions in live data.
- RLS enabled with tenant predicates from day one, so policies are exercised continuously rather than written blind at conversion time.
- `tenant_id` in the JWT and in every service-role query.
- Storage paths prefixed by tenant.
- Cache keys prefixed by tenant.
- `connector_config`, `app_setting`, `feature_flag`, `notification_template`, `price_tier` and `role` are all per-tenant already.
- Cost attribution (`ai_interaction.tenant_id`) is per-tenant, so per-tenant AI billing needs no new data.

### 19.3 What activation would require

Genuinely additive work, none of it touching the existing schema:

1. `tenant_domain(tenant_id, hostname, is_primary)` and hostname-based tenant resolution in edge middleware.
2. `tenant_subscription`, `plan`, `plan_limit`, `usage_record` for billing and quotas.
3. Tenant provisioning: create the tenant row, seed roles and system settings, create storage prefixes, invite the owner.
4. A platform-admin role above tenants, with its own audit trail.
5. Per-tenant onboarding, branding, and a theme token set.

### 19.4 The one genuine complication: vector search

`pgvector` HNSW cannot pre-filter by `tenant_id` before the approximate scan. Adding `WHERE tenant_id = …` to a vector query forces post-filtering, so with many tenants a top-60 ANN search might return few or no rows from the requesting tenant.

Three viable answers, chosen by scale at the time:
- **Under ~20 tenants:** raise `hnsw.ef_search` and over-fetch (e.g. top 500), then filter. Simple, and entirely adequate at that scale.
- **Under ~200 tenants:** partial HNSW indexes per tenant (`WHERE tenant_id = '…'`). Postgres selects the right index automatically. Index count becomes the limiting factor.
- **Beyond that:** partition `product_embedding` by tenant with per-partition HNSW indexes, or move vectors to a dedicated store.

The table is designed so all three paths are available without a data migration. I'm flagging it explicitly because it's the only place where the multi-tenant story is more than "the column is already there."

### 19.5 What we deliberately do not build now

No tenant provisioning UI, no billing, no plan limits, no platform admin, no per-tenant theming. Building unused multi-tenant machinery is a common and expensive mistake. What we build is the part that is cheap now and prohibitive later: the discriminator column, tenant-scoped uniqueness, and RLS policies that are already correct.

---

## 20. Open questions for Phase 4

Answerable during API design; none block starting it.

1. **Trade tiers** — confirm three tiers (`trade_1/2/3`) or a different count. Volume-break thresholds per tier.
2. **Quote expiry** — how many days before a submitted quote expires and reservations release? Default assumed: 14.
3. **Reservation policy** — confirm that stock reserves on salesperson acceptance rather than on customer submission (§6.7).
4. **Sample limits** — 3 per visitor per 30 days assumed. Free, or charged and refunded against an order?
5. **Lot allocation** — when a quantity spans lots, does the system auto-allocate largest-first, or must a salesperson choose?
6. **Data retention** — 90 days for anonymous AI conversations and finder uploads. Confirm against any local requirement.
7. **Currency** — USD as the stored currency with display conversion, or dual-currency storage?
8. **Product data sample** — still outstanding from Phase 1, and now the main input to designing the ingestion field mappings.

---

## 21. Summary of decisions of record

| # | Decision | Rationale |
|---|---|---|
| 1 | `tenant_id` on every tenant-scoped table from day one | Cheap now, prohibitive later. Requirement 34 |
| 2 | Tenant-scoped uniqueness everywhere | The one constraint that cannot be retrofitted without data conflicts |
| 3 | UUIDv7 for entities, bigint for append-only logs | Index locality without leaking counts; storage efficiency where IDs are internal |
| 4 | Lookup tables for business vocabularies, native enums for code contracts | A merchandiser must add a finish without a deploy |
| 5 | Translation tables, not JSONB | Per-locale FTS configuration, review workflow, partial indexes |
| 6 | Inventory as an append-only ledger with two derived layers | Reconcilable, auditable; a mutable quantity column cannot explain itself |
| 7 | Lot, caliber and shade tracked separately | These are the attributes that cause installation failures |
| 8 | `largest_lot_m2` denormalised | Answers "can this order be filled from one lot" on the catalog page |
| 9 | Snapshot columns on quote items | A historical document must not change when the product does |
| 10 | Visitor as a first-class identity | Guests must be able to save, quote and use AI without an account |
| 11 | Recently viewed in Redis, durable copy in Postgres | High write volume for a six-thumbnail feature |
| 12 | Two vectors per product, `halfvec`, partial HNSW on `is_current` | Text embeddings cannot see veining; half precision halves the index |
| 13 | Per-result outcome tracking on the tile finder | Otherwise match quality is unmeasurable and degrades silently |
| 14 | Bounding boxes stored per extracted region | The side-by-side review screen is guesswork without them |
| 15 | Confidence below 0.5 leaves the field empty | A plausible wrong value gets accepted by pattern |
| 16 | Transactional outbox for all connector events | A quote must never be lost because WhatsApp was down |
| 17 | Audit log append-only, enforced by RLS | Not even the owner rewrites history |
| 18 | Cloudinary for served media, Supabase Storage for private files | Different access patterns, different cost profiles |
| 19 | RLS as defence in depth, not the primary control | Authorisation belongs in the application; RLS is the last line |
| 20 | Independent nightly dump outside the provider | Provider backups don't survive losing the provider |

---

**Approve, amend, or push back — then Phase 4: API Architecture.**
