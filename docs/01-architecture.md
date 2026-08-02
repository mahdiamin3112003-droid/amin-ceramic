# AMIN CERAMIC — Platform Architecture & Build Plan

**Document version:** 1.0 (pre-implementation)
**Status:** Awaiting approval before Phase 0 begins
**Prepared as:** architecture, database design, UI system, motion plan, AI design, folder structure, roadmap

---

## 0. How to read this document

Sections 1–3 are decisions about *the business and the brand* — they constrain everything after.
Sections 4–8 are the *technical* design.
Section 9 is the *roadmap*, and Section 10 lists the **open questions I need answered before Phase 0**.

Where I've made an assumption in the absence of information, it's marked **[ASSUMPTION]**. Where I disagree with something in the brief, I say so and explain why — that's what you're paying an architect for.

---

## 1. Business analysis

### 1.1 What this company actually sells

Ceramic and porcelain tile is not a normal e-commerce product. It is:

- **Sold by the square metre, not the unit.** Boxes contain a fixed m²; orders must round up to whole boxes. A customer who needs 23 m² of a tile that ships 1.44 m²/box buys 16 boxes = 23.04 m².
- **Batch-sensitive.** Tiles from different production lots differ in shade. A customer must buy the whole job from one lot, plus 10% wastage for cuts. This is a real commercial constraint that must appear in the UI, or the company will get returns.
- **Technically specified.** Slip resistance (R9–R13, DIN 51130), PEI abrasion class, water absorption (ISO 10545-3), rectified vs. non-rectified edges, frost resistance, shade variation (V1–V4). Architects and contractors filter on these. Consumers filter on colour and "look."
- **Heavy and expensive to move.** Delivery is regional, not global. Stock is per-showroom/warehouse, not global.
- **Visually chosen.** Nobody buys tile from a spec sheet. Photography and room-scene imagery drive the decision.

### 1.2 Two audiences, one platform

| | **Consumer / homeowner** | **Trade: architect, contractor, developer** |
|---|---|---|
| Enters via | Instagram, Google, showroom visit | Referral, direct, spec search |
| Searches by | "beige bathroom tile", a photo they saw | SKU, size, R-rating, brand |
| Needs | Inspiration, room visualisation, price feel | Datasheets, stock depth, lot availability, trade pricing |
| Converts by | WhatsApp / showroom visit | Quote request, PDF spec pack |

The site must serve both without becoming two sites. The resolution: **one catalog, two filter modes** — a visual/lifestyle mode (default) and a "Spec mode" toggle that exposes technical filters and switches product cards to a data-dense layout. This is the single most important product decision in the document.

### 1.3 The conversion model — I recommend *against* a shopping cart at launch

The brief lists Stripe under connectors. My recommendation: **do not build checkout in v1.**

Reasons:
1. Tile pricing depends on quantity, lot, delivery zone and trade discount. A fixed online price is either wrong or leaves money on the table.
2. **[ASSUMPTION]** Lebanon-based operation: currency volatility and payment-rail friction make card checkout a poor fit for a high-ticket, delivery-heavy product.
3. The real conversion event for this business is *a qualified inquiry* — a person with a room size, a budget and a timeline.

Instead, v1 ships a **Quote Basket**: users collect tiles, enter room dimensions, and the system calculates m² needed, wastage, boxes required, and total weight. That becomes a structured quote request delivered to the admin dashboard and to WhatsApp/email. The cart architecture (line items, quantities, persistence) is built properly so Stripe checkout is a *later feature flag*, not a rewrite.

This makes the site measurably better at its job than any competitor's brochure site.

### 1.4 Success metrics (build these into analytics from day one)

- Qualified quote requests / month (primary)
- AI Tile Finder → quote conversion rate
- Catalog search → product detail rate (measures whether filtering works)
- Time to first meaningful catalog interaction (measures whether the intro animation is helping or hurting)
- Showroom visit bookings

---

## 2. Logo analysis

I analysed the supplied mark. **The logo is not redesigned or altered anywhere in this plan.** What follows is extraction only.

### 2.1 Structure

The mark is a **square rotated 45°** (a rhombus / "diamond") composed of two triangular halves split along the vertical axis:

- **Left half:** deep navy, with fine white crackle-veining — a marble/crazed-glaze texture.
- **Right half:** light cyan, with the same veining language.
- **Centre:** a **checkerboard mosaic** of small squares — white, pale blue, mid-blue and navy — reading as a tile grid, offset diagonally through the middle of the diamond.
- **Wordmark:** "Amin Ceramic" set in a **transitional serif with small-cap treatment** — full-height capital A / C, small caps for the remainder — in the deep navy, letter-spaced generously, centred beneath the mark.
- The whole lock-up sits on a white/near-white circle.

### 2.2 What the logo tells us to build

This is the important part. The mark is *already* the answer to the brief's animation question, and it dictates the layout system:

1. **The diamond is a tile rotated 45°.** Every structural device on the site — section markers, hover states, loading indicators, the scroll progress indicator — should derive from a 45° square, not from generic circles or bars.
2. **The centre mosaic is a grid that dissolves.** The logo literally depicts tiles coming apart / coming together at the centre. The cinematic intro described in the brief isn't decoration bolted on; it's the logo's own idea. Good.
3. **The two-tone diagonal split** gives a native gradient axis: navy → cyan along a 45° line. That becomes the site's one gradient rule (used with restraint, see §3.4).
4. **The veining texture** is the brand's "material" cue — a very low-opacity marble-crackle overlay, used only on large dark surfaces, never on white.
5. **The serif wordmark** means the site's display face must be a serif. A geometric sans display face would fight the logo. This rules out the default "premium tech site" look (Inter everywhere) — which is good, because that look is the templated default.

### 2.3 Extracted palette

Sampled from the mark. Hex values are the design tokens of record.

| Token | Hex | Source in mark | Use |
|---|---|---|---|
| `navy-900` | `#141F52` | Wordmark, darkest mosaic squares | Text on light, dark section grounds |
| `navy-700` | `#1E2C6E` | Left triangle body | Primary brand, buttons, headings |
| `blue-500` | `#3560B4` | Mid-tone mosaic squares | Links, active states, chart mid-tone |
| `cyan-400` | `#5FC4E4` | Right triangle body | Accent, highlights, light trails |
| `cyan-100` | `#CBE4F3` | Pale mosaic squares | Tints, hover fills, skeleton states |
| `white` | `#FFFFFF` | Mosaic squares, circle ground | Page background |
| `stone-50` | `#F6F7F9` | Circle background | Section alternation, cards |
| `stone-300` | `#D8DCE3` | — (derived) | Hairlines, dividers, borders |
| `stone-600` | `#5B6472` | — (derived) | Secondary text, captions |

**Contrast audit (required for the accessibility target):** `cyan-400` on white is **2.0:1** — it fails WCAG AA for text at any size. This is a real constraint the brief's "Secondary: Light Blue / Cyan" instruction doesn't account for. The rule I'm setting: **cyan is a surface, a stroke, a glow and a motion colour — never a text colour on white, and never a text colour behind which text must be read.** Navy carries all text weight. On navy grounds, cyan-400 reaches 6.4:1 and is permitted for text. This is enforced in the token layer so it can't be violated by accident.

---

## 3. Design system

### 3.1 Design thesis

> **Material precision.** The site should feel like a tile showroom lit properly: enormous white space, physical-feeling surfaces, exact alignment, and one moment of theatre. Not a tech startup landing page with tile photos in it.

The risk I'm taking deliberately: **the 45° diagonal is a load-bearing structural element, not an accent.** Section transitions, the catalog's featured cells, image reveals, and the scroll indicator all use the diamond geometry from the logo. Most tile sites are rectangular grids because tiles are rectangles; using the brand's own rotation as the layout signature is what will make this unmistakable. It's disciplined: the diagonal appears in *structure and motion*, while all typography stays orthogonal and all product imagery stays square-on and honest.

### 3.2 Typography

Three roles, deliberately paired to the serif wordmark:

| Role | Face | Why |
|---|---|---|
| **Display** | **Marcellus** (or licensed **Trajan Pro** if budget allows) | A Roman inscriptional serif with true small-cap proportions — it is the closest available match to the wordmark's letterforms, so headlines feel like they came from the same studio as the logo. Used at large sizes only, never below 28px. |
| **Body / UI** | **Inter Variable** | Neutral, excellent at small sizes, superb multilingual coverage, variable-weight for smooth optical adjustment. Its neutrality is the point: it lets the display serif and the photography carry the personality. |
| **Data / spec** | **JetBrains Mono** (subset, weights 400/500 only) | SKUs, dimensions, R-ratings and lot numbers set in mono. This is the "Spec mode" voice and it signals technical credibility to the trade audience. |

**Arabic:** **IBM Plex Sans Arabic** for body, **Noto Naskh Arabic** for display equivalents. See §3.6.

Type scale (1.25 minor-third, fluid via `clamp()`):

```
display-xl   clamp(3.5rem, 7vw, 7rem)      Marcellus, 400, tracking -0.02em
display-lg   clamp(2.5rem, 4.5vw, 4.5rem)  Marcellus, 400
display-md   clamp(2rem, 3vw, 3rem)        Marcellus, 400
heading-lg   1.75rem                        Inter, 600, tracking -0.01em
heading-md   1.25rem                        Inter, 600
body-lg      1.125rem / 1.7                 Inter, 400
body         1rem / 1.65                    Inter, 400
caption      0.8125rem / 1.5                Inter, 500, tracking 0.02em, uppercase
spec         0.875rem                       JetBrains Mono, 400, tabular-nums
```

### 3.3 Spacing, radius, elevation

- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128 / 192px. Section vertical rhythm is 128px desktop, 80px mobile. The brief asks for large spacing; the discipline is that it must be *consistent*, not just large.
- **Radius:** `sm 6px` (inputs, chips) · `md 12px` (cards, buttons) · `lg 20px` (panels, modals) · `full` (avatars only). Product images are **radius 12px** — never fully rounded, because tiles are square-edged objects and rounding them lies about the product.
- **Elevation:** two shadows only. `shadow-card: 0 1px 2px rgba(20,31,82,.04), 0 8px 24px rgba(20,31,82,.06)` and `shadow-float: 0 4px 8px rgba(20,31,82,.06), 0 24px 48px rgba(20,31,82,.10)`. Shadows are tinted navy, never neutral black — a small detail that makes the whole surface feel like one material.
- **Hairlines:** 1px `stone-300`. Used generously; they're the cheapest way to make a minimal layout feel engineered rather than empty.

### 3.4 The gradient rule

One gradient exists in the system: `linear-gradient(135deg, navy-700 0%, blue-500 55%, cyan-400 100%)` — the logo's own diagonal axis. It is permitted on: the intro animation's light trails, the active scroll indicator, one hero accent element, and focus rings. **It is banned from:** buttons, cards, backgrounds, text, and icons. Gradients everywhere is the fastest way to make an expensive site look cheap.

### 3.5 Component inventory (v1)

Built on **shadcn/ui** primitives (Radix under the hood — accessible by construction), restyled entirely to the token system. Nothing ships with default shadcn styling.

**Primitives:** Button (5 variants), Input, Select, Combobox, Checkbox, RadioGroup, Slider (range, for dimensions/price), Switch, Tabs, Dialog, Sheet, Popover, Tooltip, Toast, Skeleton, Badge, Separator, Accordion, Breadcrumb, Pagination, Command (⌘K search).

**Domain components:**
`ProductCard` (visual + spec variants) · `ProductGallery` (zoom, lot swatches) · `SpecTable` · `TileCalculator` (m² → boxes → weight) · `FilterRail` + `FilterChips` + `ActiveFilterBar` · `CollectionHero` · `RoomSceneViewer` · `SimilarityResultCard` (with match % and reasoning) · `ImageDropzone` (upload/camera) · `QuoteBasketDrawer` · `ShowroomCard` · `SpecModeToggle` · `ShadeVariationIndicator` (V1–V4) · `SlipRatingBadge` · `StockIndicator` (per-warehouse) · `DiagonalDivider` · `TileGridReveal`.

### 3.6 Internationalisation — flagged as a gap in the brief

**[ASSUMPTION]** The business operates in Lebanon. The brief doesn't mention language, but shipping an English-only site would be a significant commercial error.

The plan: **`next-intl` with `en` and `ar` locales from Phase 1**, routed as `/en/...` and `/ar/...`. Full RTL support via CSS logical properties (`margin-inline-start`, not `margin-left`) used *everywhere from the first line of CSS* — retrofitting RTL later costs 3–4× more than building it in. Arabic type scale is set separately (Arabic needs ~+8% size and looser line-height at equivalent optical weight). Product content is translatable per-field in the database (§5.4), not via a translation-file hack.

The one place RTL needs a decision: the logo's diagonal runs bottom-left→top-right. Mirroring it in RTL would alter the brand mark. **Decision: the diamond and all logo-derived geometry do not mirror. Layout mirrors; brand geometry doesn't.**

---

## 4. Motion plan

### 4.1 Principle

Animation serves comprehension and materiality. The site gets **one orchestrated moment** (the intro) and otherwise uses motion to make the product feel physical. Scattered effects on every element is the tell of an over-animated site; restraint everywhere else is what makes the one moment land.

**Global motion tokens:**

```
duration-instant  120ms   hover/focus feedback
duration-quick    240ms   state changes, toggles
duration-base     420ms   entrances, panel transitions
duration-slow     800ms   scroll-linked reveals
duration-cinema   4200ms  intro sequence total

ease-out-quart    cubic-bezier(0.25, 1, 0.5, 1)      entrances
ease-in-out-quart cubic-bezier(0.76, 0, 0.24, 1)     transitions
ease-material     cubic-bezier(0.32, 0.72, 0, 1)     the house curve — weighted, settles without bounce
```

No spring bounce anywhere. Tile is heavy; bouncy easing makes it feel like plastic. `ease-material` is slightly front-loaded and settles hard — it reads as mass.

### 4.2 The intro sequence — "Assembly"

The brief describes this well; here is how it's actually built.

**Source geometry.** The logo is traced once, offline, into an SVG. From it we derive **68 tile fragments**: the mosaic centre squares are literal tiles; the two marble triangles are subdivided into a Voronoi-like shard pattern that follows the existing crackle veins in the mark. Positions, rotations and fill colours are baked into a static JSON file at build time — zero runtime path parsing.

**Timeline (GSAP, 4.2s total):**

| t | Event |
|---|---|
| 0.0s | Pure white. Nothing. (Half a second of silence — this is what makes it feel expensive rather than busy.) |
| 0.4s | 68 fragments fade in at scattered off-screen origins, each already rotated to its final angle but at 0.85 scale. Staggered 8ms, ordered from the mark's outer edge inward. |
| 0.4–2.6s | Fragments travel along individual quadratic-bezier paths to final positions. Stagger `{amount: 1.6, from: "random"}`, `ease-material`. Each carries a **light trail**: a canvas layer sampling each fragment's previous 14 positions, drawn as a tapering cyan→transparent stroke with additive blending. One canvas, 68 trails, one draw call per frame. |
| 2.2s | Centre mosaic squares land first and "click" — a 60ms scale 1.0→1.03→1.0. The sound of the logo locking together, expressed visually. |
| 2.6s | Final fragments seat. Trails decay over 400ms. |
| 2.9s | **Shine:** a 22°-wide white gradient band sweeps across the assembled mark at 45° (parallel to the brand axis), 700ms, `ease-in-out-quart`. Masked to the logo shape. |
| 3.4s | Wordmark "Amin Ceramic" reveals via a clip-path wipe along the same 45° axis, 500ms. |
| 3.9s | **GSAP Flip:** the entire assembled lock-up transforms — position, scale, and the wordmark's opacity — into its final navbar position. 700ms. Simultaneously the hero content beneath cross-fades up 24px. |
| 4.2s | Overlay unmounts. Scroll unlocks. |

**Rendering approach:** fragments are SVG `<path>` elements in a single SVG root, animated via GSAP with `transform` only (`translate3d` + `rotate` + `scale`), promoted with `will-change: transform` applied *only during the animation and removed after*. The trail layer is a separate `<canvas>` sized to `devicePixelRatio`, capped at 2. Zero layout or paint thrash — this holds 60fps on a mid-range Android.

### 4.3 The honest conflict: cinematic intro vs. Lighthouse 100

The brief asks for both a 4-second intro and 100/100/100/100. **These pull against each other**, and I'd rather say so now than quietly miss a target later.

The intro overlay risks: delaying Largest Contentful Paint, adding Total Blocking Time from the animation library, and Cumulative Layout Shift at the Flip handoff.

Mitigations, all of which are in the build plan:

1. **The hero is the LCP element and it renders server-side immediately, underneath the overlay.** The overlay is `position: fixed` on its own compositor layer. LCP is measured on the hero, not the animation.
2. **The animation bundle is dynamically imported and never blocks hydration.** GSAP core + Flip only (~28KB gzipped), loaded with `next/dynamic` and `ssr: false`.
3. **The intro plays once per session** (`sessionStorage` flag), and never on any route except `/`. Repeat visitors and every deep link from Google go straight to content.
4. **It self-disables** when: `prefers-reduced-motion: reduce`, `navigator.connection.saveData === true`, `effectiveType` is `2g`/`slow-2g`, or device memory < 4GB. In those cases the logo simply fades into the navbar over 300ms.
5. **A skip control** is present and keyboard-focusable from t=0.
6. **The Flip handoff reserves the navbar logo's box from the start**, so CLS is 0.

**Realistic commitment:** 100 on Accessibility, SEO and Best Practices across the site — those are achievable and I'll hold them. Performance: 100 on desktop, and **≥95 on mobile for the homepage, ≥90 on catalog listing pages with images**. Anyone promising a guaranteed mobile 100 on an image-dense commercial catalog is not being straight with you. We'll get as close as physics allows and I'll report the number honestly each phase.

### 4.4 Motion elsewhere

- **Scroll reveals:** Framer Motion `whileInView`, `once: true`, 24px rise + opacity, 600ms, 60ms stagger. Never on more than 6 elements at once.
- **Product card hover:** the image scales to 1.04 within a fixed-radius mask while the card itself lifts 4px and its shadow deepens. A 2px cyan hairline draws in along the bottom edge, left→right, 240ms. No 3D tilt — tilt makes flat material look like a floating card and cheapens it. *(This is a deliberate departure from the brief's "cards should react to the cursor." I recommend the restrained version and will build the tilt variant if you'd prefer to see both side by side.)*
- **Buttons:** background fills from the cursor's entry side, 200ms; press scales to 0.98 with 80ms release. Focus ring is a 2px offset ring in the brand gradient.
- **Page transitions:** the diamond geometry — a 45° clip-path wipe in navy, 320ms out / 380ms in. Fast enough to feel like the app is quick, distinct enough to be memorable.
- **Gallery zoom:** shared-element transition from card to detail page via Framer Motion `layoutId`.
- **The tile calculator** animates its box count with a rolling odometer on tabular-nums. Small, but it's the kind of detail that makes a utility feel considered.

**Reduced motion:** every one of the above degrades to opacity-only or nothing. This is tested, not assumed.

---

## 5. System architecture

### 5.1 Stack decisions

| Layer | Choice | Reasoning |
|---|---|---|
| Framework | **Next.js 15, App Router, React 19** | Server Components mean the catalog renders as HTML with near-zero client JS — the single biggest lever on both SEO and mobile performance. |
| Language | **TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess: true`** | Non-negotiable per the brief. |
| Styling | **Tailwind CSS 4 + shadcn/ui** | Tokens defined once in CSS custom properties, consumed by Tailwind theme. |
| Database | **PostgreSQL 15 on Supabase, with `pgvector`, `pg_trgm`, `unaccent`** | One database for relational data, full-text search *and* vector search. Avoids a separate vector DB entirely at this scale. |
| ORM | **Prisma 6** | Schema-as-source-of-truth, typed client, migration history. |
| Auth | **Supabase Auth** (admin only, v1) | Email+password with mandatory TOTP for admin roles. |
| Media | **Cloudinary** | Automatic AVIF/WebP negotiation, on-the-fly transforms, named transformation presets. |
| Cache / rate limit | **Upstash Redis** | Serverless-native (HTTP, no connection pooling problem on Vercel). |
| Background jobs | **Inngest** | Durable, retryable, step-based workflows — essential for the catalog ingestion pipeline, which is long-running and failure-prone by nature. |
| AI — vision & extraction | **Gemini 2.5 Flash** | Best cost/quality for high-volume structured extraction from catalog PDFs and photos. |
| AI — visual embeddings | **SigLIP 2** (hosted inference) | See §6.2 — this is the decision the brief gets wrong, and it matters. |
| AI — text embeddings | **`text-embedding-3-large`** (3072-d, stored at 1536 via Matryoshka truncation) | Semantic search over descriptions and attributes. |
| Hosting | **Vercel** | Edge middleware for i18n routing, ISR for catalog pages, image optimisation. |
| Observability | **Sentry** + **Vercel Analytics** + **PostHog** | Errors, Web Vitals, and product funnel respectively. |
| Email | **Resend** + React Email | Transactional quotes and notifications. |

### 5.2 Rendering strategy per route

This table is the performance plan. Every route has a deliberate rendering mode.

| Route | Mode | Revalidation |
|---|---|---|
| `/` | Static (ISR) | 1 hour |
| `/collections`, `/collections/[slug]` | Static (ISR) | 1 hour, on-demand on publish |
| `/products` (catalog) | Server-rendered, filters in URL searchParams | Streamed, cached per filter combo 5 min |
| `/products/[slug]` | Static (ISR) + `generateStaticParams` for top 500 SKUs | 6 hours, on-demand on edit |
| `/tile-finder` | Client island inside a static shell | — |
| `/assistant` | Streaming server route | — |
| `/admin/**` | Dynamic, `no-store`, auth-gated at middleware | — |

Filters live in the URL (`?size=60x120&finish=matte&r=R11`). This makes every filtered view shareable, back-button-correct, and server-renderable. It's more work than client-side state and it's the right call.

### 5.3 Layered architecture

```
┌─────────────────────────────────────────────────────────┐
│  Presentation   app/  ·  components/  ·  Server Components│
├─────────────────────────────────────────────────────────┤
│  Application    Server Actions · Route Handlers · use-cases│
│                 (validation, authorisation, orchestration) │
├─────────────────────────────────────────────────────────┤
│  Domain         entities · value objects · pure business   │
│                 rules (m² math, lot rules, pricing tiers)  │
├─────────────────────────────────────────────────────────┤
│  Infrastructure repositories (Prisma) · AI providers ·     │
│                 media · cache · connectors · queue         │
└─────────────────────────────────────────────────────────┘
```

The rules that make this hold up over years:

- **The domain layer imports nothing.** No Prisma, no React, no fetch. Tile calculation logic is pure functions with unit tests. It will outlive every other layer.
- **Every AI provider sits behind an interface** (`VisionProvider`, `EmbeddingProvider`, `ChatProvider`). Swapping Gemini for a future model is a config change, not a refactor. The brief says "OpenAI or Gemini" — the architecture's answer is "both, interchangeably, decided at runtime."
- **Repositories return domain types, not Prisma types.** Prevents database shape from leaking into components.
- **Server Actions are the only mutation path** from the client. Every one begins with a Zod parse and an authorisation check — enforced by a `withAuth(role)` wrapper that makes forgetting it impossible.

### 5.4 Data flow — catalog request

```
Browser
  → Edge middleware (locale detect, auth gate, rate limit)
    → Server Component: parse searchParams → Zod
      → use-case: listProducts(filters, locale)
        → Redis: check filter-hash cache
        → Prisma: filtered query + facet counts (single round trip)
        → map → domain → view model
      → stream HTML (product grid streams in Suspense boundaries)
        → Cloudinary URLs with responsive srcset, AVIF-first
```

Facet counts (how many products match each remaining filter option) are computed in the same query using conditional aggregates. Getting this wrong — issuing one query per facet — is the classic reason catalog pages get slow at scale.

---

## 6. AI architecture

### 6.1 Three AI surfaces, one shared retrieval core

```
                    ┌──────────────────────────────┐
   Tile Finder ────►│                              │
   (image in)       │      RETRIEVAL CORE          │
                    │  ┌────────────────────────┐  │
 Interior Assistant ├─►│ hybrid search:         │  │
   (text in)        │  │  · visual vector (HNSW)│  │──► ranked
                    │  │  · semantic vector     │  │    products
   Admin Assistant  │  │  · full-text (tsvector)│  │    + reasons
   (files in) ──────┤  │  · attribute filters   │  │
                    │  │  · reciprocal rank     │  │
                    │  │    fusion              │  │
                    │  └────────────────────────┘  │
                    └──────────────────────────────┘
```

All three features share one retrieval implementation. Building three separate search paths is how AI features drift out of sync with each other.

### 6.2 The correction the brief needs: visual similarity ≠ text embeddings

The brief says "compare it against the product database using embeddings." The trap: **OpenAI's and Gemini's embedding endpoints are text-only.** A common wrong implementation is to caption the uploaded photo with a vision model, embed the caption, and search text embeddings. That produces plausible-looking but weak results — it can tell beige from grey, but it cannot tell *this* Calacatta vein pattern from a different one, which is precisely what a customer holding a photo of a tile needs.

**Correct design — dual-vector.** Every product carries two embeddings:

| Vector | Model | Dim | Captures |
|---|---|---|---|
| `visual_embedding` | **SigLIP 2** (image encoder) | 1152 | Pattern, veining, texture, colour distribution, grain — genuine visual likeness |
| `semantic_embedding` | `text-embedding-3-large` | 1536 | Meaning: "modern", "luxury bathroom", "warm neutral", spec language |

Both are `vector` columns with **HNSW** indexes (`m=16, ef_construction=64`), cosine distance. HNSW over IVFFlat because our write volume is low and query latency matters more than index build time.

### 6.3 AI Tile Finder — pipeline

```
1. Upload / camera capture
2. Client-side: EXIF strip, resize to 1024px longest edge, WebP
3. Safety + validity gate: is this actually a tile/surface photo?
   (fast Gemini Flash classification — prevents garbage-in results
    and blocks abuse of the vision endpoint)
4. Parallel:
   a) SigLIP image encode        → visual_embedding
   b) Gemini Flash structured    → {colour_family, look, finish,
      attribute extraction         format_guess, pattern_scale,
                                    shade_variation, surface_texture}
5. Retrieval:
   · visual kNN, top 60
   · attribute pre-filter as SQL WHERE (indoor/outdoor, finish, size)
   · semantic kNN on the extracted description, top 60
   · reciprocal rank fusion → top 12
6. Rerank: cross-encoder pass on the top 12 for final ordering
7. Explanation: Gemini generates a one-sentence "why this matches"
   grounded ONLY in the diff between extracted attributes and each
   product's stored attributes. Never free-form — this is what stops
   the AI inventing specifications.
8. Similarity %: calibrated from cosine distance via a monotonic
   mapping fitted on a labelled validation set — NOT raw cosine
   presented as a percentage. Raw cosine shown as "%" is misleading;
   0.71 cosine is not "71% match."
9. Alternatives: same-look different-format, and same-look lower-price-tier
```

**Guardrail:** if the top result's calibrated score is below threshold, the UI says so plainly and offers the assistant instead. An AI feature that confidently returns bad matches damages trust more than one that admits uncertainty.

### 6.4 AI Interior Assistant

A streaming chat with **tool calling**, not a RAG-over-documents bot.

Tools exposed to the model:
- `search_products(filters, query, limit)` — hits the retrieval core
- `get_product(sku)` — full spec
- `calculate_quantity(area_m2, product_id, wastage_pct)` — the domain function, not the LLM's arithmetic
- `check_stock(product_id, warehouse_id)`
- `create_quote_request(items, contact)` — only after explicit user confirmation

Design rules:
- **The model never states a specification from its own knowledge.** Every spec in an answer comes from a tool result. System prompt enforces it; responses are validated against retrieved SKUs before streaming completes.
- **Never invents products.** Response post-processing checks every mentioned SKU exists.
- **Arithmetic is done in code.** LLMs are unreliable at m²-to-boxes rounding, and getting it wrong costs the customer real money.
- Conversation history capped and summarised; full transcript stored for the admin's Customer Requests view.

### 6.5 AI Admin Assistant — catalog ingestion

The highest-ROI feature in the entire brief. Manually entering 2,000 SKUs with 20 fields each is roughly 400 hours of work. This pipeline reduces it to review-and-approve.

```
Upload (PDF catalog / XLSX / image batch)
  → Inngest durable workflow:
     ├ classify document type
     ├ PDF:   layout-aware page segmentation → per-product regions
     │        → Gemini Flash vision extraction per region
     ├ XLSX:  header inference → column→field mapping proposal
     │        (shown to admin for confirmation, remembered per supplier)
     ├ Image: single-product extraction
     ├ normalise: units (mm/cm/in), formats ("60x120" → 600×1200mm),
     │            finish vocabulary, brand aliasing
     ├ deduplicate against existing SKUs (trigram + visual vector)
     ├ generate: description (EN + AR), SEO title, meta description,
     │           tags, category & collection suggestions
     ├ compute both embeddings
     └ write to STAGING table with per-field confidence scores
  → Admin review screen: side-by-side source ↔ extracted,
    low-confidence fields highlighted amber, one-click accept/edit
  → Approve → promote to products, invalidate ISR, log to audit
```

**Nothing auto-publishes.** The brief says "the AI should automatically populate the database" — I'm implementing that as *automatically prepare, human approves*. A hallucinated slip-rating on a bathroom floor tile is a liability issue. The review step costs ~15 seconds per product and eliminates that risk entirely.

### 6.6 Cost & abuse controls

- Per-IP and per-session rate limits on all AI endpoints (Upstash), stricter for image uploads.
- Response caching keyed on image perceptual hash — the same photo uploaded twice costs nothing.
- Embeddings computed once at ingest, never at query time for products.
- Monthly spend ceiling per provider with alerting; graceful degradation to keyword search if exceeded.
- Full request logging to `ai_interaction` for cost attribution and quality review.

---

## 7. Database architecture

PostgreSQL on Supabase. Prisma schema. Row-level security enabled on every table.

### 7.1 Core entities

```
brand ──┐
        ├──< product >──── product_media ──── media_asset
collection ──┤        │
             │        ├──< product_attribute (EAV for rare specs)
category ────┤        ├──< inventory >──── warehouse
             │        ├──< product_translation (locale-scoped copy)
             │        ├──< product_embedding (visual + semantic)
             │        └──< product_relation (related / alternative / same-look)
             │
             └──< collection_translation
```

### 7.2 The `product` table — ceramic-specific fields

Beyond the brief's list, these are the fields the industry actually requires. Omitting them means rebuilding the schema in year two.

| Field | Type | Note |
|---|---|---|
| `sku` | text, unique | |
| `slug` | text, unique per locale | |
| `brand_id`, `collection_id`, `category_id` | fk | |
| `width_mm`, `height_mm`, `thickness_mm` | int | Stored in mm, always. Display units are a presentation concern. |
| `nominal_format` | text | "60×120" — the marketing name |
| `material` | enum | `porcelain · ceramic · gres_porcelanato · natural_stone · mosaic` |
| `finish` | enum | `matte · polished · lappato · satin · structured · anti_slip · natural` |
| `surface_look` | enum | `marble · wood · concrete · terrazzo · stone · metal · fabric · solid` |
| `color_family` | enum | Filterable colour bucket |
| `color_hex` | text | Dominant colour, extracted at ingest — powers colour-swatch filtering |
| `rectified` | bool | |
| `shade_variation` | enum | `V1 · V2 · V3 · V4` |
| `slip_rating` | enum | `R9 · R10 · R11 · R12 · R13` |
| `pei_class` | int | 0–5 abrasion resistance |
| `water_absorption_pct` | decimal | |
| `frost_resistant` | bool | |
| `indoor`, `outdoor` | bool | Separate booleans, not an enum — many tiles are both |
| `applications` | enum[] | `floor · wall · facade · pool · commercial · heavy_traffic` |
| `pieces_per_box`, `m2_per_box`, `kg_per_box` | decimal | **The quantity calculator depends on these** |
| `origin_country` | text | Spain/Italy origin is a selling point |
| `price_per_m2`, `currency`, `price_tier` | decimal/enum | Nullable — supports "price on request" |
| `status` | enum | `draft · published · archived · discontinued` |
| `search_vector` | tsvector | Generated column, GIN indexed |
| `published_at`, `created_at`, `updated_at`, `deleted_at` | timestamptz | Soft delete throughout |

### 7.3 Supporting tables

`inventory` (product × warehouse × lot: `quantity_m2`, `lot_number`, `restock_eta`) — **lot-level tracking is what lets the site warn a customer that only 18 m² remain in the current lot.** No competitor site in this market does this.

`quote_request` · `quote_request_item` · `customer_contact` — the conversion pipeline, with source attribution (`tile_finder` / `assistant` / `catalog` / `direct`).

`ai_interaction` — every AI call: input hash, provider, model, tokens, latency, cost, result IDs, user feedback. Without this table you cannot improve the AI features or control spend.

`ingestion_job` · `staging_product` — the admin assistant pipeline, with per-field confidence.

`admin_user` · `role` · `permission` · `audit_log` — §8.3.

`connector_config` · `outbox_event` — §8.1.

`media_asset` — Cloudinary public_id, dimensions, blurhash, alt text per locale, focal point.

### 7.4 Indexing plan

```sql
-- Catalog filtering (the hot path)
CREATE INDEX ON product (status, category_id, published_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX ON product (width_mm, height_mm);
CREATE INDEX ON product USING GIN (applications);
CREATE INDEX ON product USING GIN (search_vector);
CREATE INDEX ON product USING GIN (name gin_trgm_ops);   -- fuzzy SKU/name

-- Vector search
CREATE INDEX ON product_embedding
  USING hnsw (visual_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX ON product_embedding
  USING hnsw (semantic_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Inventory lookups
CREATE INDEX ON inventory (product_id, warehouse_id)
  INCLUDE (quantity_m2, lot_number);
```

**Scale check:** at 10,000 products the HNSW indexes total roughly 120 MB — entirely in memory on Supabase's smallest paid tier. Vector search returns in under 20 ms. This design comfortably exceeds the brief's "thousands of products."

### 7.5 Data integrity

- Every enum is a real Postgres enum, mirrored in TypeScript via Prisma — invalid values are impossible.
- Check constraints on physical dimensions (`width_mm > 0`), percentages, and rating ranges.
- `updated_at` maintained by trigger, not application code.
- Soft delete everywhere; a nightly job hard-deletes rows older than 90 days.
- Nightly `pg_dump` to object storage in addition to Supabase PITR.

---

## 8. Cross-cutting concerns

### 8.1 Connector architecture

The brief asks that future integrations be easy. The mechanism:

**Every connector implements a narrow interface and registers itself.** The application never imports a connector directly — it publishes domain events, and connectors subscribe.

```ts
interface Connector<TConfig> {
  readonly key: string;              // 'whatsapp' | 'stripe' | 'erp'
  readonly capabilities: Capability[];
  configSchema: ZodSchema<TConfig>;
  healthCheck(config: TConfig): Promise<HealthStatus>;
  handle(event: DomainEvent, config: TConfig): Promise<void>;
}
```

**Transactional outbox pattern:** domain events are written to an `outbox_event` table *inside the same transaction* as the business change. An Inngest worker drains the outbox and dispatches to subscribed connectors with retries and dead-lettering. This guarantees that a quote request is never lost because WhatsApp was down at that moment — the standard failure mode of naive webhook integrations.

Adding a connector later = one file implementing the interface + a config row. No changes to business logic. That's the whole point.

**v1 ships:** WhatsApp Business (quote handoff — the primary channel for this market), Resend (email), Cloudinary (media).
**Interfaces defined, implementations deferred:** Stripe, Google Drive, ERP, CRM, POS.

### 8.2 SEO

- **Metadata** via Next.js `generateMetadata` per route, locale-aware, with `hreflang` alternates for en/ar.
- **Schema.org JSON-LD:** `Product` (with `offers`, `brand`, `sku`, `gtin` where known, `additionalProperty` for every technical spec), `BreadcrumbList`, `Organization`, `LocalBusiness` per showroom, `ItemList` on collections, `FAQPage` where applicable. Technical specs as `additionalProperty` is how the trade audience's long-tail queries ("60x120 R11 anti slip porcelain") get found.
- **Sitemaps:** generated, split by type, `<lastmod>` from `updated_at`, image sitemap entries for product photography.
- **Open Graph / Twitter:** dynamic OG images generated at the edge via `next/og` — product shot, name, format, brand mark. Distinctive OG cards materially lift click-through from WhatsApp shares, which is how this product gets recommended in this market.
- **Canonical URLs** with filter combinations correctly `noindex`ed except for a curated set of high-value filtered pages (e.g. `/products/outdoor-anti-slip`) which are indexable landing pages with unique copy.
- **robots.txt**, `llms.txt`, and AI-crawler policy set deliberately.

### 8.3 Security

- **Auth:** Supabase Auth, admin-only in v1. Mandatory TOTP for `admin` and `owner` roles. Sessions in httpOnly, secure, sameSite=lax cookies.
- **RBAC:** roles `owner` · `admin` · `editor` · `sales` · `viewer`, with granular permissions. Enforced in **three** places: middleware (route), server action wrapper (mutation), and Postgres RLS (data). Defence in depth — a bug in one layer doesn't expose data.
- **Validation:** Zod at every boundary. No `any`, no unvalidated `request.json()`.
- **Rate limiting:** Upstash sliding window on all public API routes, tighter on AI and upload endpoints.
- **Uploads:** magic-byte type verification (not extension), size caps, EXIF stripping, malware scan hook, Cloudinary signed uploads only.
- **Headers:** strict CSP with nonces, HSTS, `X-Frame-Options`, `Referrer-Policy`, Permissions-Policy.
- **Audit log:** every admin mutation records actor, action, entity, before/after diff, IP, timestamp. Append-only, RLS-protected against modification even by owners.
- **Secrets:** environment-scoped, never in the repo, rotated on a schedule. No service-role key ever reaches the client bundle — enforced by a build-time check.
- **Dependencies:** Dependabot + `npm audit` gate in CI.

### 8.4 Accessibility (target: 100, and genuinely usable)

Radix primitives give correct semantics and focus management by default. On top of that: visible focus rings everywhere, full keyboard operation of the catalog filters and gallery, `prefers-reduced-motion` honoured throughout, all imagery with locale-aware alt text (AI-drafted, human-approved), colour never the sole carrier of meaning (the shade-variation and slip-rating badges use text + icon), and screen-reader testing with NVDA and VoiceOver each phase — not just an axe scan.

### 8.5 Testing & CI

| Layer | Tool | Coverage target |
|---|---|---|
| Domain logic (m² math, pricing, lot rules) | Vitest | 100% |
| Components | Vitest + Testing Library | Critical paths |
| Server actions & API | Vitest, Testcontainers Postgres | All mutations |
| E2E | Playwright | Catalog → tile finder → quote request |
| Visual regression | Playwright screenshots | Key pages, both locales, both directions |
| Accessibility | axe-core in Playwright | Every page, zero violations |
| Performance | Lighthouse CI, budgets enforced | Fails the build on regression |

CI on every PR: typecheck → lint → unit → build → E2E → Lighthouse → preview deploy.

---

## 9. Folder structure

```
amin-ceramic/
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── (marketing)/
│   │   │   │   ├── page.tsx                  # home
│   │   │   │   ├── collections/[slug]/
│   │   │   │   ├── projects/
│   │   │   │   ├── showrooms/
│   │   │   │   └── about/
│   │   │   ├── (catalog)/
│   │   │   │   ├── products/
│   │   │   │   │   ├── page.tsx              # listing + filters
│   │   │   │   │   └── [slug]/page.tsx
│   │   │   │   └── compare/
│   │   │   ├── (ai)/
│   │   │   │   ├── tile-finder/
│   │   │   │   └── assistant/
│   │   │   ├── (quote)/basket/
│   │   │   └── layout.tsx
│   │   ├── admin/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── products/
│   │   │   │   ├── inventory/
│   │   │   │   ├── collections/
│   │   │   │   ├── media/
│   │   │   │   ├── requests/
│   │   │   │   ├── ingestion/                # AI admin assistant
│   │   │   │   ├── analytics/
│   │   │   │   ├── connectors/
│   │   │   │   └── settings/
│   │   │   └── login/
│   │   ├── api/
│   │   │   ├── ai/{tile-finder,assistant}/route.ts
│   │   │   ├── webhooks/[connector]/route.ts
│   │   │   └── inngest/route.ts
│   │   ├── sitemap.ts · robots.ts · opengraph-image.tsx
│   │   └── globals.css                       # design tokens live here
│   │
│   ├── components/
│   │   ├── ui/                               # shadcn primitives, restyled
│   │   ├── brand/                            # Logo, DiamondMark, IntroSequence
│   │   ├── catalog/                          # ProductCard, FilterRail, SpecTable…
│   │   ├── ai/                               # ImageDropzone, MatchCard, ChatStream
│   │   ├── quote/                            # BasketDrawer, TileCalculator
│   │   ├── motion/                           # Reveal, DiagonalWipe, useMotionSafe
│   │   └── admin/
│   │
│   ├── domain/                               # ← imports nothing
│   │   ├── product/{entity,value-objects,rules}.ts
│   │   ├── quantity/calculator.ts            # m² → boxes → weight
│   │   ├── inventory/lot-rules.ts
│   │   └── pricing/tiers.ts
│   │
│   ├── application/
│   │   ├── use-cases/{catalog,tile-finder,assistant,ingestion,quote}/
│   │   └── actions/                          # server actions, all wrapped in withAuth
│   │
│   ├── infrastructure/
│   │   ├── db/{client.ts,repositories/}
│   │   ├── ai/
│   │   │   ├── providers/{gemini,openai,siglip}.ts
│   │   │   ├── interfaces.ts                 # VisionProvider, EmbeddingProvider…
│   │   │   ├── retrieval/{hybrid-search,rrf,rerank,calibration}.ts
│   │   │   └── prompts/                      # versioned, tested
│   │   ├── media/cloudinary.ts
│   │   ├── cache/redis.ts
│   │   ├── queue/inngest/
│   │   └── connectors/{registry.ts,whatsapp/,email/,stripe/…}
│   │
│   ├── lib/{utils,seo,analytics,validation}/
│   ├── i18n/{routing.ts,messages/{en.json,ar.json}}
│   └── types/
│
├── prisma/{schema.prisma,migrations/,seed.ts}
├── e2e/
├── public/brand/{logo.svg,fragments.json}    # baked intro geometry
├── docs/{architecture.md,adr/,runbook.md}
└── .github/workflows/ci.yml
```

Two conventions that keep this maintainable for years: **feature-first grouping inside each layer** (not type-first), and **`domain/` has an ESLint rule forbidding imports from any other layer** — enforced, not merely intended.

---

## 10. Roadmap

Ten phases. Each ends with something deployable and reviewable. Estimates assume the AI-assisted development pace we'll actually be working at, not traditional team-week estimates.

| # | Phase | Deliverable | Est. |
|---|---|---|---|
| **0** | **Foundation** | Repo, TypeScript strict, Tailwind + full token system, shadcn restyled, i18n routing (en/ar + RTL), Prisma + Supabase connected, CI green, deployed to Vercel. **Design tokens and the component library are visually reviewable in Storybook.** | 3–4 d |
| **1** | **Data core** | Complete Prisma schema, migrations, RLS policies, seed data (~40 real products from your catalog), repositories, domain layer with the quantity calculator at 100% test coverage. | 4–5 d |
| **2** | **Catalog** | Product listing with full faceted filtering, Spec mode, search, product detail pages, gallery, related products, quantity calculator, quote basket. **This is the commercial heart of the site.** | 6–8 d |
| **3** | **Brand & motion** | Homepage, the Assembly intro sequence, collection pages, scroll choreography, page transitions, all micro-interactions, reduced-motion paths. | 5–7 d |
| **4** | **Admin foundation** | Auth + TOTP, RBAC across all three enforcement layers, dashboard shell, product CRUD, media library, inventory with lot tracking, audit log. | 6–7 d |
| **5** | **AI retrieval core** | Embedding pipeline, pgvector + HNSW, hybrid search with RRF, score calibration, provider abstraction, evaluation harness with a labelled test set. | 5–6 d |
| **6** | **Tile Finder** | Upload + camera, safety gate, dual-vector matching, grounded explanations, calibrated similarity, alternatives, the full result experience. | 4–5 d |
| **7** | **Interior Assistant** | Streaming chat, tool calling, grounding guarantees, quote handoff, conversation storage in the admin's request view. | 4–5 d |
| **8** | **Admin AI ingestion** | PDF/XLSX/image pipeline, Inngest workflows, normalisation, dedup, staging + confidence-scored review UI, bulk approve. **Then: bulk-load the real catalog.** | 7–9 d |
| **9** | **Launch hardening** | Connectors (WhatsApp, email), analytics, full SEO pass, Lighthouse tuning to target, security review, load test, accessibility audit with real screen readers, runbook, handover. | 5–6 d |

**Roughly 9–12 weeks to launch**, with a usable, demonstrable site from the end of Phase 2 (~3 weeks in).

**Phase ordering rationale:** the catalog ships before the cinematic homepage, and both ship before the AI. If we build the intro animation first, we spend a week on theatre before the site can sell anything. Business value first, brand theatre second, AI third — even though the AI is the most interesting part to build.

---

## 11. What I need from you before Phase 0

These are genuine blockers or decisions, not formalities.

**Business**
1. **Market and language.** Is the primary market Lebanon? Should the site launch bilingual English/Arabic, or English only with Arabic in Phase 2? *(This affects Phase 0 directly — RTL must be in from the first CSS rule.)*
2. **Quote Basket vs. checkout.** Do you agree with deferring Stripe (§1.3)? If you want online payment at launch, it needs to move into Phase 2 and the pricing model needs defining now.
3. **Prices on the site:** public per-m², "price on request", or trade-login-gated?
4. Showrooms/warehouses: how many locations, and is stock tracked per location?

**Content — the real constraint on quality**
5. **Product data:** how many SKUs, and in what form? (Supplier PDFs, Excel, existing website, ERP export?) A sample file would let me tune the ingestion pipeline against the real thing rather than a guess.
6. **Photography:** do you have professional product shots and room scenes, or do we need a plan for that? *No amount of engineering compensates for weak imagery on a tile site* — this is the single biggest risk to the "premium" goal.
7. Brand assets: is a vector (SVG/AI/EPS) version of the logo available? I can trace the raster for the intro geometry, but vector gives a materially crisper result at large sizes.

**Technical**
8. **Accounts:** who provisions Supabase, Vercel, Cloudinary, Upstash, Resend, and the AI provider keys? Estimated infrastructure cost at launch is **$80–200/month** depending on traffic and AI volume.
9. **Domain and existing site:** is there a current site whose URLs need redirect mapping for SEO?

**Design**
10. **Product card interaction:** the restrained version I recommend, or the cursor-tilt version in the brief (§4.4)? I can build both for comparison in Phase 0 if you'd rather decide by looking.

---

## 12. Where I've deviated from the brief, and why

Stated plainly, so you can overrule any of it:

| Brief says | I propose | Why |
|---|---|---|
| Stripe / e-commerce implied | Quote Basket first, checkout behind a flag | Tile pricing is quantity- and lot-dependent; a fixed online price is wrong or costly |
| "Compare using embeddings" | Dual-vector: SigLIP visual + text semantic | Text-only embeddings can't distinguish veining patterns — the exact thing users photograph |
| "AI automatically populates the database" | AI prepares, human approves | A hallucinated slip rating on a bathroom floor is a liability, and review costs 15 seconds |
| 100 Lighthouse across the board | 100 on A11y/SEO/Best Practices; ≥95 mobile perf on home, ≥90 on catalog | Honest numbers for an image-dense catalog with a 4s intro |
| "Cards should react to the cursor" | Restrained lift + hairline, no 3D tilt | Tilt makes flat material read as floating plastic; both buildable for comparison |
| Three.js "if it improves UX" | **Not used in v1** | Nothing in this brief needs WebGL. Adding it costs ~500KB and a class of mobile bugs for no user benefit. Revisit only for a genuine 3D room visualiser in v2. |
| (not mentioned) | Bilingual EN/AR with RTL from Phase 0 | Retrofitting RTL costs 3–4× more later |
| (not mentioned) | Lot-level inventory tracking | Prevents shade-mismatch returns; no competitor does it |

---

**Approve this, adjust it, or push back on any of it — then I'll start Phase 0.**
