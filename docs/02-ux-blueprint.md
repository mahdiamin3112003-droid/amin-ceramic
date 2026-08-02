# AMIN CERAMIC — UX Blueprint & Design System

**Phase 2 deliverable** · Version 1.0 · Pre-implementation
**Follows:** Platform Architecture v1.0 (approved)
**Precedes:** Phase 3 — Database Design

---

## 0. Working assumptions

Phase 1 §11 questions remain open. This blueprint assumes my recommended defaults so design can proceed. Each is marked where it materially shapes a screen — if you decide differently, the affected sections are listed here and nowhere else, so revision is cheap.

| Assumption | Affects |
|---|---|
| Bilingual EN/AR, RTL from launch | §4.2 type, §6 responsive, §7 a11y, every wireframe |
| Quote Basket, no checkout in v1 | §1 site map (no `/checkout`), §2 journeys, §3.9 |
| Prices shown per m², with a trade tier behind login | §3.6 product page, §3.11 account |
| 3 showrooms, stock tracked per location | §3.6 stock module, §3.13 showrooms |
| Restrained card hover (no 3D tilt) | §5.6 |

One more decision I'm making now and want on the record: **the site has accounts, but they are optional and never blocking.** A guest can do everything except see trade pricing and save a project. Forcing registration before a quote would cost more leads than the data is worth.

---

## 1. Site map

### 1.1 Public site

```
/[locale]                                    en · ar
│
├── /                                        HOME
│
├── /products                                CATALOG — faceted, the commercial core
│   ├── ?[filters]                           filter state in URL, shareable
│   ├── /[slug]                              PRODUCT DETAIL
│   │   ├── #specs  #calculator  #stock      in-page anchors
│   │   └── /gallery                         full-screen gallery route (deep-linkable)
│   └── /compare?ids=…                       COMPARE (2–4 products)
│
├── /collections                             COLLECTION INDEX
│   └── /[slug]                              COLLECTION STORY PAGE
│
├── /looks                                   BROWSE BY LOOK — editorial entry
│   └── /[look]                              marble · wood · concrete · terrazzo · stone
│
├── /spaces                                  BROWSE BY ROOM — consumer entry
│   └── /[space]                             kitchen · bathroom · living · outdoor ·
│                                            facade · pool · commercial
│
├── /guides                                  CURATED LANDING PAGES (SEO, indexable)
│   └── /[guide]                             e.g. anti-slip-outdoor-tiles ·
│                                            large-format-60x120 · tile-size-guide
│
├── /tile-finder                             AI — IMAGE MATCH
│   └── /results/[sessionId]                 shareable result set
│
├── /assistant                               AI — INTERIOR ASSISTANT (chat)
│   └── /c/[threadId]                        resumable conversation
│
├── /visualizer                              AI — ROOM VISUALIZER  [Phase 2 feature, §8]
│
├── /projects                                REFERENCE PROJECTS (portfolio/credibility)
│   └── /[slug]                              project case study
│
├── /basket                                  QUOTE BASKET (full page)
│   └── /request                             QUOTE REQUEST FORM
│       └── /sent/[ref]                      CONFIRMATION + reference number
│
├── /showrooms                               SHOWROOM INDEX + map
│   ├── /[slug]                              showroom detail
│   └── /book                                BOOK A SHOWROOM VISIT
│
├── /trade                                   TRADE PROGRAM landing
│   └── /apply                               trade account application
│
├── /account                                 [auth] — optional accounts
│   ├── /projects                            saved projects (named tile sets)
│   │   └── /[id]                            project detail + shared link
│   ├── /saved                               wishlist
│   ├── /quotes                              quote history + status
│   ├── /samples                             sample order history
│   └── /settings                            profile, language, units, notifications
│
├── /about                                   COMPANY
├── /contact                                 CONTACT
├── /search                                  GLOBAL SEARCH RESULTS (⌘K also opens overlay)
│
├── /legal/privacy · /legal/terms · /legal/cookies
├── /sitemap.xml · /robots.txt
├── /404 · /500 · /offline
└── /auth/{login,register,forgot,reset,verify}
```

### 1.2 Admin

```
/admin
├── /login                                   + /2fa  + /forgot
│
├── /                                        DASHBOARD HOME — KPI overview
│
├── /products
│   ├── /                                    list: table, bulk actions, saved views
│   ├── /new                                 create (manual)
│   ├── /[id]                                edit — tabbed
│   │   ├── #basics  #specs  #media  #copy  #seo  #inventory  #relations
│   └── /import                              → routes to /ingestion
│
├── /inventory
│   ├── /                                    stock across warehouses
│   ├── /lots                                lot-level view, shade batches
│   ├── /movements                           in/out ledger
│   └── /alerts                              low-stock rules
│
├── /collections   /categories   /brands     taxonomy CRUD (same pattern each)
│
├── /media                                   MEDIA LIBRARY — grid, folders, tagging,
│                                            focal point editor, alt text per locale
│
├── /requests                                CUSTOMER REQUESTS (the sales inbox)
│   ├── /[id]                                request detail + AI conversation transcript
│   └── /board                               kanban: new → contacted → quoted → won/lost
│
├── /ingestion                               AI ADMIN ASSISTANT
│   ├── /                                    job list + status
│   ├── /new                                 upload PDF / XLSX / image batch
│   └── /[jobId]/review                      side-by-side confidence review
│
├── /ai
│   ├── /playground                          test prompts, compare providers
│   ├── /quality                             match-quality review, thumbs data
│   ├── /embeddings                          coverage, reindex controls
│   └── /costs                               spend by feature, model, day
│
├── /analytics
│   ├── /                                    traffic, funnel, conversion
│   ├── /products                            views, quote-adds, no-result searches
│   ├── /search                              top queries, zero-result queries
│   └── /ai                                  finder accuracy, assistant deflection
│
├── /content
│   ├── /projects   /guides   /pages         editorial CRUD
│   └── /translations                        missing-translation queue
│
├── /connectors                              status, config, health, event log
├── /users                                   admins, roles, invitations
├── /audit                                   audit log, filterable
└── /settings                                company, showrooms, units, currencies,
                                             quote defaults, wastage %, brand assets
```

### 1.3 Modal, drawer and overlay inventory

Overlays are a design liability if uninventoried. Complete list, with the rule for each.

| Overlay | Type | Trigger | Rule |
|---|---|---|---|
| Global search | Full overlay | ⌘K / search icon | Escape closes, results keyboard-navigable |
| Quote basket | Right drawer (sheet) | Add-to-basket, header count | Auto-opens on first add only, then never again |
| Filter panel | Left rail desktop / bottom sheet mobile | Always visible ≥1024px | Mobile sheet applies on close, not per-tap |
| Gallery lightbox | Full-screen **route**, not modal | Image click | Deep-linkable, back button works |
| Tile calculator | Inline panel, expands in place | "Calculate quantity" | Never a modal — it's a tool, not an interruption |
| Sample request | Centre modal | "Order sample" | Max 3 samples, address form |
| Compare tray | Bottom bar, persistent | Compare checkbox | Collapses to pill when scrolling down |
| Product quick view | Centre modal | Card "Quick view" | Desktop only; mobile goes to the page |
| Showroom booking | Right drawer | "Book a visit" | Calendar + slot picker |
| AI explanation | Popover | "Why this match?" | Anchored, dismisses on scroll |
| Video player | Full-screen overlay | Project video | |
| Cookie consent | Bottom banner | First visit | Not a modal, never blocks content |
| Locale switch | Dropdown | Header | Preserves current route |
| Unit switch (m²/ft²) | Dropdown | Header, footer | Persists in cookie |
| Login prompt | Centre modal | Trade price reveal, save project | Always dismissible; explains *why* before asking |
| Session expiry | Centre modal | Admin idle 30 min | Countdown, extend button |
| Destructive confirm | Centre modal | Admin delete/archive | Requires typing SKU for products |
| Bulk edit | Right drawer | Admin multi-select | Shows affected count prominently |
| Media picker | Centre modal | Admin image field | Library + upload tabs |
| Ingestion field review | Split panel, not modal | Review screen | Source and extraction side by side |
| Command palette | Full overlay | ⌘K in admin | Navigate + act |
| Toast | Corner stack | Any mutation | Max 3 stacked, 5s, action-undoable where possible |

**Overlay rules, enforced across the system:** never nest more than one overlay; every overlay traps focus and restores it to the trigger on close; Escape always closes the topmost; background scroll locks without layout shift; mobile drawers are swipe-dismissible.

---

## 2. User journeys

Five personas. Each has a different *entry point*, a different *definition of a good result*, and a different *exit action*. The site fails if it optimises for only one.

### 2.1 Persona summary

| | Guest | Customer | Interior Designer | Contractor | Administrator |
|---|---|---|---|---|---|
| **Enters via** | Instagram, Google image, WhatsApp share | Google "bathroom tiles", showroom follow-up | Referral, direct, Pinterest | SKU search, spec sheet, phone follow-up | `/admin/login` |
| **Mental state** | Curious, low commitment | Deciding, comparing, anxious about cost | Composing a scheme for a client | Verifying availability against a deadline | Task-focused, repetitive work |
| **Success =** | Saw something they liked, remembers the brand | Knows what it costs and what to do next | Assembled a palette they can present | Confirmed stock, m², lot, and lead time | Fewer clicks per product processed |
| **Exit action** | Follow / share / return | Quote request or showroom visit | Saved & shared project board | Quote request with quantities | Publish, respond, approve |
| **Kill it by** | Making them wait 4s with no skip | Hiding price behind a form | No way to save or export | Missing technical specs | 15 fields of manual entry |

### 2.2 Guest — "I saw a tile on Instagram"

```
Instagram link
  → HOME (intro plays, skip always available)
      first 3 seconds decide everything
  → scrolls hero → "Browse by look" strip
  → /looks/marble
  → grid of marble-look tiles, big imagery, no filters shown yet
  → taps a tile → PRODUCT DETAIL
  → gallery: product shot → room scene → detail macro
  → sees price/m², size, "In stock at Baabda"
  ↓
  three exits, all one tap, all visible without scrolling further:
  ├─ ♡ Save            → no login required, stored locally, prompt to
  │                       claim later ("Save this to a project?")
  ├─ Add to basket     → drawer opens once, shows what a basket is for
  └─ WhatsApp          → pre-filled message with SKU + product link
```

**Design consequence:** the guest never hits a wall. No login, no form, no "sign up to see price." The only friction we add is at the moment of *sending a request*, where friction is appropriate because it qualifies the lead.

### 2.3 Customer — "I need tiles for my bathroom"

The longest and most valuable journey. Anxiety is the dominant emotion; the design's job is to convert it into confidence.

```
Google: "bathroom tiles Lebanon"
  → /spaces/bathroom  (curated landing, indexable, real copy)
  → "Not sure where to start?" → three doors:
      ┌ Browse by look         → /looks
      ├ I have a photo         → /tile-finder
      └ Describe what I want   → /assistant
  ↓
  PATH A — browse
    /products?space=bathroom
    filter: colour swatch (visual, not text) → beige
    filter: size → 60×120
    → 34 results, facet counts update live
    → hovers card: sees finish + slip rating without clicking
    → adds 3 to COMPARE tray
    → /compare — side by side, differences highlighted amber
  ↓
  PATH B — photo         PATH C — describe
    /tile-finder           /assistant
    upload → 12 matches    "beige tiles for a luxury bathroom"
    each with % and        → assistant asks: floor, wall or both?
    a plain reason         → asks room size
    "Same warm beige,      → returns 6 products with reasoning
     same matte finish,    → offers to add all to basket
     slightly larger"
  ↓
  ALL PATHS CONVERGE → PRODUCT DETAIL
    → TILE CALCULATOR (the trust moment):
        "Room 2.4m × 3.1m = 7.44 m²
         + 10% wastage      = 8.18 m²
         → 6 boxes (8.64 m²)  ·  142 kg  ·  $27.60/m² = $238.46"
      This single component removes the biggest source of anxiety:
      "how much do I actually need and what will it cost?"
    → stock: "In stock — Baabda (48 m², lot #A4471)"
    → shade warning: "Order the full quantity from one lot"
  ↓
  Add to basket → /basket
    → basket shows per-room grouping, running total, total weight
  ↓
  /basket/request
    name · phone (WhatsApp) · email · project type · timeline ·
    optional: upload a floor plan · preferred showroom
  ↓
  /basket/request/sent/[ref]
    → reference number, expected response time, WhatsApp deep link,
      "Book a showroom visit to see these in person" (secondary CTA)
    → email + WhatsApp confirmation with a PDF of the selection
```

**The three-door pattern** at the top of every space page is the most important navigational decision in this blueprint. Customers arrive not knowing whether they want to browse, match, or describe. Making all three equally available beats forcing everyone through a filter grid.

### 2.4 Interior Designer — "I'm composing a scheme"

Designers do not buy; they *specify*, then present to a client. The platform must support composition and presentation, not just selection.

```
Direct / referral → /trade → applies → approved (24h) → trade pricing unlocked
  ↓
  Working session:
  → /assistant: "warm minimalist kitchen, oak cabinets, brass fixtures"
  → results feel curated, not filtered
  → creates PROJECT: "Achrafieh Apartment — Kitchen"
  → adds tiles to the project, not the basket
      (projects = composition; basket = purchasing. Distinct.)
  ↓
  PROJECT BOARD  /account/projects/[id]
    ┌──────────────────────────────────────────────┐
    │ Achrafieh Apartment            [Share] [PDF] │
    │ ── Kitchen floor ── Kitchen wall ── Splashback│
    │ [tile] [tile]      [tile]        [tile]      │
    │                                              │
    │ PALETTE STRIP  ▮▮▮▮▮  auto-extracted colours │
    │ Total: 46.2 m² across 3 zones                │
    └──────────────────────────────────────────────┘
  ↓
  → orders SAMPLES (3 free) to the studio
  → exports SPEC PDF: images, full specs, quantities, project branding
  → shares read-only link with the client
      client can comment / heart, no account needed
  ↓
  Client approves → designer converts project → quote request
```

**Design consequence:** projects need multi-zone structure, an auto-extracted colour palette strip (proves the scheme works together), PDF export, and a shareable client-facing view. This is the feature that makes designers return, and designers bring repeat volume. See §8.

### 2.5 Contractor — "I need 340 m² of R11 by the 15th"

Speed and certainty. Zero interest in inspiration. The design should get out of the way.

```
Direct → header search: "AC-6012-MT" (SKU)
  → instant result, Enter → PRODUCT DETAIL
  ↓
  toggles SPEC MODE (persists across the session)
    card and page density change: mono type, full spec tables,
    lifestyle imagery demoted, technical imagery promoted
  ↓
  checks in this order — the page must serve it in this order:
    1. Stock per warehouse, per lot, with quantities
    2. Lead time if insufficient stock
    3. Technical: R-rating, PEI, water absorption, rectified, frost
    4. m²/box, kg/box, pieces/box
    5. Price tier at their volume
  ↓
  BULK ADD:  paste or type "AC-6012-MT × 340 m²"
    → system rounds to boxes, warns if it crosses lots
    → "340 m² requires 2 lots (#A4471: 210 m², #A4478: 130 m²).
       Shade may vary between lots. Request single-lot availability?"
  ↓
  → downloads datasheet PDF + technical drawing
  → quote request with delivery date + site address
  → receives quote reference; can check status at /account/quotes
```

**Design consequence:** Spec mode, a bulk-entry input that accepts SKUs and quantities, lot-crossing warnings, and per-product PDF datasheets. Contractors judge a supplier by whether the website respects their time.

### 2.6 Administrator — "I have 400 new SKUs from a supplier"

```
/admin/login → email + password + TOTP
  ↓
  DASHBOARD: 6 new requests · 3 low-stock alerts · 1 ingestion job pending review
  ↓
  DAILY LOOP (most common, must be fast):
    /admin/requests/board
    → new request card → detail
    → sees: contact, items, m², total, source (tile-finder),
            AI conversation transcript, prior history
    → one-click: WhatsApp reply (template), or generate quote PDF
    → drag to "Quoted"
  ↓
  BULK LOOP (highest value):
    /admin/ingestion/new → drops supplier PDF (400 products)
    → job runs in background, admin does other work
    → notification: "382 products extracted, 18 need attention"
    → /admin/ingestion/[job]/review
        ┌────────────────┬─────────────────────────────┐
        │  SOURCE PAGE   │  EXTRACTED FIELDS           │
        │  (PDF region)  │  Name      ████ 98%         │
        │                │  Size      ████ 99%         │
        │                │  Finish    ██   64% ⚠ amber │
        │                │  R-rating  █    31% ⚠ red   │
        └────────────────┴─────────────────────────────┘
        keyboard: J/K next-prev · A accept · E edit · X reject
        → accept-all-above-90% for the clean majority
        → hand-review the 18
    → publish → ISR invalidates → live in ~30 seconds
```

**Design consequence:** the review screen is keyboard-first with confidence-sorted ordering. Reviewing 400 products must take 20 minutes, not 8 hours, or the feature has failed regardless of extraction accuracy.

---

## 3. Wireframes

Notation: `▓` image · `▒` surface · `─` hairline · `[ ]` control. Described in the order the eye receives them.

### 3.1 Home

```
╔══════════════════════════════════════════════════════════════╗
║ ◈ AMIN CERAMIC   Products Collections Looks Spaces Projects  ║  sticky, transparent
║                              [⌕]  [EN|ع]  [♡ 3]  [Basket 2] ║  → solid on scroll
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  ▓▓▓▓▓▓▓▓▓▓▓▓ full-bleed room scene ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ║  1 — the image
║                                                              ║
║      Surfaces that hold their line.                          ║  2 — display serif,
║      Porcelain and ceramic for Lebanese homes,                  ║      clamp to 7rem
║      studios and sites. Since 19XX.                          ║
║                                                              ║
║      [ Explore collection ]  [ AI tile finder ]  [ Projects ]║  3 — primary/ghost/text
║                                                              ║
║      ── scroll ◈ ────────────────────────────────────────    ║  diamond indicator
╠══════════════════════════════════════════════════════════════╣
║  START WITH WHAT YOU KNOW                     ─────────────  ║  4 — the three doors
║  ┌────────────┐  ┌────────────┐  ┌────────────┐             ║
║  │ ▓ a look   │  │ ▓ a room   │  │ ▓ a photo  │             ║
║  │ Marble,    │  │ Kitchen,   │  │ Upload it, │             ║
║  │ wood,      │  │ bathroom,  │  │ we'll find │             ║
║  │ concrete   │  │ outdoor    │  │ the match  │             ║
║  └────────────┘  └────────────┘  └────────────┘             ║
╠══════════════════════════════════════════════════════════════╣
║  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ◈ diagonal split ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   ║  5 — featured collection
║  CALACATTA SERIES                                            ║      full-bleed, scroll-
║  Large-format marble-look porcelain, 60×120 and 120×260     ║      linked parallax
║  [ View collection → ]                                       ║
╠══════════════════════════════════════════════════════════════╣
║  IN STOCK NOW                                 [ All → ]      ║  6 — horizontal scroll
║  ▓ card  ▓ card  ▓ card  ▓ card  ▓ card  →                   ║      real inventory
╠══════════════════════════════════════════════════════════════╣
║  ┌─ TILE FINDER ────────────────────────────────────────┐    ║  7 — AI as a working
║  │  Drop a photo of any tile.        ▓ live demo image  │    ║      demo, not a claim
║  │  [ Upload ]  [ Use camera ]       → 3 sample results │    ║
║  └──────────────────────────────────────────────────────┘    ║
╠══════════════════════════════════════════════════════════════╣
║  RECENT PROJECTS      ▓ large   ▓ small   ▓ small            ║  8 — credibility
╠══════════════════════════════════════════════════════════════╣
║  THREE SHOWROOMS      map + cards + hours                    ║  9 — physical proof
╠══════════════════════════════════════════════════════════════╣
║  FOOTER  catalog · collections · trade · showrooms · legal   ║
║          WhatsApp · Instagram · newsletter                   ║
╚══════════════════════════════════════════════════════════════╝
```

**Order logic:** image before words (tile is chosen visually); three doors before any grid (reduces the paralysis of a 2,000-product catalog); real stock before marketing copy; the AI demonstrated rather than described; showrooms last because in this market the physical location closes the sale.

### 3.2 Catalog — `/products`

```
╔═══════════╤══════════════════════════════════════════════════╗
║ FILTERS   │ Porcelain & ceramic              1,284 products   ║
║           │ [Spec mode ○]  [Sort: Relevance ▾]  [⊞|☰ view]   ║
║ ─────────  ├──────────────────────────────────────────────────╢
║ Colour     │ Active: [Beige ×] [60×120 ×] [Matte ×]  Clear all║
║ ●●●●●●●●   ├──────────────────────────────────────────────────╢
║ swatches   │ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     ║
║            │ │ ▓▓▓▓▓▓ │ │ ▓▓▓▓▓▓ │ │ ▓▓▓▓▓▓ │ │ ▓▓▓▓▓▓ │     ║
║ Look       │ │ ▓▓▓▓▓▓ │ │ ▓▓▓▓▓▓ │ │ ▓▓▓▓▓▓ │ │ ▓▓▓▓▓▓ │     ║
║ ☐ Marble 340│ │        │ │        │ │        │ │        │     ║
║ ☐ Wood   210│ │ Calac. │ │ Onice  │ │ Travert│ │ Statua │     ║
║ ☐ Concrete  │ │ 60×120 │ │ 60×120 │ │ 60×120 │ │ 60×120 │     ║
║             │ │ Matte  │ │ Polish │ │ Matte  │ │ Matte  │     ║
║ Size        │ │ $27/m² │ │ $31/m² │ │ $24/m² │ │ $29/m² │     ║
║ ☐ 60×120 412│ │ ● Stock│ │ ● Stock│ │ ○ 2wk  │ │ ● Stock│     ║
║ ☐ 80×80  180│ │ ♡  ⇄  +│ │ ♡  ⇄  +│ │ ♡  ⇄  +│ │ ♡  ⇄  +│     ║
║             │ └────────┘ └────────┘ └────────┘ └────────┘     ║
║ Finish      │                                                 ║
║ Material    │ … 4-up desktop, 3-up laptop, 2-up tablet/mobile║
║ Application │                                                 ║
║ Indoor/Out  │ [ Load more ]   ← button, not infinite scroll  ║
║ Slip (R)  ⓘ │                   (footer must be reachable)   ║
║ Price       │                                                 ║
║ Availability│                                                 ║
║ Brand       │                                                 ║
╠═══════════╧══════════════════════════════════════════════════╣
║  COMPARE TRAY  ▓ ▓ ▓   3 selected   [ Compare → ]  [Clear]   ║  persistent bottom bar
╚══════════════════════════════════════════════════════════════╝
```

**Decisions embedded here:**
- **Colour filter is swatches, not a checkbox list.** Nobody thinks "greige"; everybody recognises it.
- **Facet counts always visible**, and options with zero results are disabled, not hidden — hiding them makes the filter feel broken.
- **Card shows finish and stock without hovering.** Hover-only information fails on touch.
- **"Load more" button, not infinite scroll.** Infinite scroll destroys back-button behaviour and makes the footer unreachable; both matter for SEO and for the trade audience.
- **Spec mode toggle** in the toolbar switches the card to a data-dense variant: SKU in mono, R-rating, PEI, m²/box, per-warehouse stock, image demoted to a thumbnail strip.

### 3.3 Product detail — `/products/[slug]`

```
╔══════════════════════════════════════════════════════════════╗
║ Home / Products / Marble look / Calacatta Oro 60×120         ║  breadcrumb (schema)
╠═════════════════════════════╤════════════════════════════════╣
║ ┌─────────────────────────┐ │ CALACATTA SERIES               ║  1 — image dominates
║ │                         │ │ Calacatta Oro                  ║      55/45 split
║ │      ▓▓▓▓▓▓▓▓▓▓▓        │ │ AC-6012-MT · Porcelain         ║
║ │      ▓▓▓▓▓▓▓▓▓▓▓        │ │                                ║  2 — identity
║ │      ▓ zoom on hover    │ │ $27.60 /m²    ($39.74 /box)    ║
║ │                         │ │ ─────────────────────────────  ║  3 — price
║ └─────────────────────────┘ │ 60 × 120 cm · 9 mm · Matte     ║
║ ▪▪▪▪▪  thumbnails           │ Rectified · V2 shade · R10     ║  4 — the five facts
║ product · scene · macro     │ Indoor: floor, wall            ║      that decide it
║ · installed · drawing       │ ─────────────────────────────  ║
║                             │ ● In stock — Baabda 48 m²      ║  5 — availability
║                             │   Lot #A4471 · more in 2 wks   ║      per warehouse
║                             │ ─────────────────────────────  ║
║                             │ ┌ HOW MUCH DO I NEED? ───────┐ ║  6 — the trust moment
║                             │ │ Room  [2.4] × [3.1] m      │ ║      inline, expands
║                             │ │ Wastage [10% ▾]            │ ║      in place
║                             │ │ ───────────────────────    │ ║
║                             │ │ 8.18 m² needed             │ ║
║                             │ │ 6 boxes (8.64 m²)          │ ║
║                             │ │ 142 kg · $238.46           │ ║
║                             │ │ ⚠ Order in one lot —       │ ║
║                             │ │   shade varies between lots│ ║
║                             │ └────────────────────────────┘ ║
║                             │ [ Add to basket ]  [♡] [⇄]     ║  7 — action
║                             │ [ Order a sample ]             ║
║                             │ [ WhatsApp about this tile ]   ║
╠═════════════════════════════╧════════════════════════════════╣
║ SPECIFICATIONS          [ Datasheet PDF ↓ ]                  ║  8 — full spec table,
║ two-column table, mono values, grouped:                      ║      always expanded
║ Dimensions · Material · Surface · Performance · Packaging    ║      (never accordion —
║                                                              ║      trade needs Ctrl+F)
╠══════════════════════════════════════════════════════════════╣
║ IN THIS SPACE     ▓▓▓ large room scenes with hotspots        ║  9 — inspiration
╠══════════════════════════════════════════════════════════════╣
║ COMPLETE THE LOOK   matching trims, bullnose, mosaic, grout  ║ 10 — attach rate
╠══════════════════════════════════════════════════════════════╣
║ SIMILAR TILES  ▓ ▓ ▓ ▓    "Same look, different format"      ║ 11 — visual-vector
║                           "Same look, lower price"           ║      powered, labelled
╠══════════════════════════════════════════════════════════════╣
║ FROM THE SAME COLLECTION  ▓ ▓ ▓ ▓                            ║ 12
╚══════════════════════════════════════════════════════════════╝
```

**Mobile reorder:** image → name/SKU → price → the five facts → **Add to basket (sticky bottom bar)** → stock → calculator → specs → the rest. The sticky action bar appears after the hero image scrolls out and contains price + Add to basket only.

### 3.4 Tile Finder — `/tile-finder`

```
STATE 1 — EMPTY
╔══════════════════════════════════════════════════════════════╗
║              Find the tile from a photo                      ║
║   Photograph any tile, floor or surface. We'll match it      ║
║   against 1,284 products.                                    ║
║                                                              ║
║        ┌────────────────────────────────────┐                ║
║        │   ◈  Drop a photo, or browse       │  dashed border ║
║        │      [ Use camera ]                │  diamond icon  ║
║        └────────────────────────────────────┘                ║
║   Works best with: flat-on shots · even light · one tile     ║
║   ▓ ▓ ▓  or try one of these examples                        ║
╚══════════════════════════════════════════════════════════════╝

STATE 2 — ANALYSING  (must feel like work, not a spinner)
        ┌──────────────┐   ✓ Reading the image
        │ ▓ user photo │   ✓ Colour: warm beige, low variation
        │  ░ scan line │   ● Finding matches…
        └──────────────┘   ○ Ranking
        each step ticks in as it completes — perceived speed

STATE 3 — RESULTS
╔═══════════════╤══════════════════════════════════════════════╗
║ YOUR PHOTO    │ 12 matches                                   ║
║ ▓▓▓▓▓▓▓       │ ┌──────────────────────────────────────────┐ ║
║ ▓▓▓▓▓▓▓       │ │ ▓▓  Calacatta Oro         94% match      │ ║
║               │ │ ▓▓  60×120 · Matte · $27.60/m²           │ ║
║ We detected:  │ │     Same warm beige and matte finish;    │ ║
║ Beige · Matte │ │     veining is slightly finer.  [Why? ⓘ] │ ║
║ Marble look   │ │     [♡] [⇄] [ Add to basket ]            │ ║
║ ~60×120       │ └──────────────────────────────────────────┘ ║
║               │ … ranked, with a visible confidence break:   ║
║ [Adjust ▾]    │ ── Close matches ────────────────────────    ║
║  correct our  │ ── Worth considering ───────────────────     ║
║  reading      │                                              ║
║               │ NOT WHAT YOU MEANT?  [ Describe it instead → ]║
╚═══════════════╧══════════════════════════════════════════════╝

STATE 4 — LOW CONFIDENCE  (designed, not an afterthought)
        "No strong match. The photo is dark and taken at an angle —
         a flat, well-lit shot works better.
         [ Try another photo ]   [ Describe it to the assistant ]
         Or send it to us directly: [ WhatsApp ]"
```

The **"Adjust our reading"** control is the honesty mechanism: users can correct the detected colour/finish/format and re-rank. It also produces labelled training data for match-quality tuning.

### 3.5 Interior Assistant — `/assistant`

```
╔══════════════════════════════════════════════════════════════╗
║  ◈ Interior assistant                        [ New chat ]    ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Tell me about the space.                                    ║
║  [ Modern white kitchen ] [ Luxury beige bathroom ]           ║  starter chips —
║  [ Anti-slip outdoor terrace ] [ Wood-look living room ]      ║  remove blank-page
║                                                              ║  paralysis
║  ─────────────────────────────────────────────────────────   ║
║  ◐ You                                                       ║
║    I want beige tiles for a luxury bathroom, about 8 m²      ║
║                                                              ║
║  ◈ Assistant                                                 ║
║    For a bathroom that size I'd stay with large formats —    ║
║    fewer grout lines makes a small room read larger.         ║
║    Floor or walls, or both?                        [Both] [Floor]║
║                                                              ║
║    ┌────────┐┌────────┐┌────────┐   inline product cards,    ║
║    │ ▓ tile ││ ▓ tile ││ ▓ tile │   scrollable, each with    ║
║    │ $27/m² ││ $31/m² ││ $24/m² │   [+ basket] and [♡]       ║
║    └────────┘└────────┘└────────┘                            ║
║    All three are R10 — safe for a wet floor.                 ║
║    [ Add all to basket ]  [ Compare these ]                  ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  [ Type here…                              ] [📎] [ Send ]   ║
║  Recommendations come from our live catalog and stock.       ║  grounding disclosure
╚══════════════════════════════════════════════════════════════╝
```

Two rules visible in the wireframe: **the assistant asks one clarifying question at a time with tappable answers** (typing on mobile is the drop-off point), and **every product claim renders as a real product card** — the assistant cannot state a spec in prose without the card that proves it.

### 3.6 Compare — `/compare`

Sticky first column of row labels; product columns scroll horizontally. **Rows where values differ are tinted `cyan-100`**; identical rows collapse under "Show identical specs (14)". Sticky header keeps product names and images visible. Bottom row: Add to basket per column. Max 4 products, 2 on mobile.

### 3.7 Quote basket — `/basket`

```
YOUR SELECTION  ·  4 products  ·  3 zones
┌ KITCHEN FLOOR ────────────────────────────────────────────┐
│ ▓  Calacatta Oro 60×120     8.18 m² → 6 boxes    $238.46 │
│    lot #A4471 ✓ single lot            [edit] [remove]     │
└──────────────────────────────────────────────────────────┘
┌ BATHROOM ─────────────────────────────────────────────────┐
│ ▓  Onice Bianco 60×120      5.20 m² → 4 boxes    $161.20 │
│ ▓  Mosaic trim              6 m      → 6 pcs      $ 54.00 │
└──────────────────────────────────────────────────────────┘
                              Subtotal (indicative)  $453.66
                              Total weight            312 kg
                              ⓘ Final price confirmed in your quote
                              [ Request a quote → ]
                              [ Save as project ]  [ Download PDF ]
```

Zone grouping is what turns a cart into a project document. It is also exactly the structure the admin needs to produce a real quote.

### 3.8 Admin dashboard home

```
╔════════╤═════════════════════════════════════════════════════╗
║ ◈      │ Good morning, Amin              [⌘K]  [+ New ▾]  ◐  ║
║        ├─────────────────────────────────────────────────────╢
║ Home   │ ┌──────────┐┌──────────┐┌──────────┐┌──────────┐   ║
║ Products│ │ Requests ││ Quote    ││ Products ││ AI spend │   ║
║ Inventory│ │    6 new ││ value    ││   1,284  ││  $34 /mo │   ║
║ Collections│ │ ▲ 2      ││ $18,400  ││ 12 draft ││ ▬▬▬▬░░░  │   ║
║ Media  │ └──────────┘└──────────┘└──────────┘└──────────┘   ║
║ Requests│                                                     ║
║ Ingestion│ NEEDS YOU                     ← action, not vanity ║
║ AI     │ ⚠ 18 extracted products awaiting review  [Review →] ║
║ Analytics│ ⚠ 3 products below 20 m² stock          [View →]   ║
║ Content│ ⚠ 2 requests unanswered > 24h            [Open →]   ║
║ Connectors│                                                    ║
║ Users  │ REQUESTS THIS WEEK    ▁▃▅▇▅▃▁    chart              ║
║ Audit  │ TOP SEARCHES WITH NO RESULTS  ← catalog gap signal  ║
║ Settings│ RECENT ACTIVITY  audit stream                       ║
╚════════╧═════════════════════════════════════════════════════╝
```

The dashboard leads with **"Needs you"**, not with charts. An admin dashboard's job is to route attention to unfinished work; analytics is a destination you visit deliberately, not a wall you're greeted by.

### 3.9 Ingestion review — the highest-leverage admin screen

```
╔══════════════════════════════════════╤═══════════════════════╗
║  SOURCE — supplier-catalog.pdf p.42  │ EXTRACTED  18 of 400  ║
║  ┌────────────────────────────────┐  │ sorted by confidence  ║
║  │                                │  │ ↑ lowest first        ║
║  │   ▓ pdf region, highlighted    │  │                       ║
║  │     for the current field      │  │ Name    ████████ 98%  ║
║  │                                │  │ Calacatta Oro         ║
║  │                                │  │                       ║
║  └────────────────────────────────┘  │ Size    ████████ 99%  ║
║  [ ⌕ − + ]  [ full page ]            │ 600 × 1200 mm         ║
║                                      │                       ║
║                                      │ Finish  ████░░░░ 64% ⚠║
║                                      │ [Matte ▾]  ← editable ║
║                                      │                       ║
║                                      │ R-rating ██░░░░░ 31% ⚠║
║                                      │ [ not found — set ▾ ] ║
║                                      │                       ║
║  J ↓  K ↑   A accept   E edit   X reject   ⌘↵ accept & next  ║
╚══════════════════════════════════════╧═══════════════════════╝
```

Confidence-ascending order means the admin spends their attention where it's needed and can bulk-accept the rest. Keyboard-first throughout. **A field below 50% confidence is never pre-filled** — an empty required field is safer than a plausible wrong one, because a pre-filled wrong value gets accepted by pattern.

---

## 4. Design system

### 4.1 Colour

Extracted from the logo in Phase 1 §2.3, now expanded into a full working scale.

**Brand ramp**

| Token | Hex | Contrast on white | Permitted use |
|---|---|---|---|
| `navy-950` | `#0C1338` | 17.8:1 | Dark section grounds |
| `navy-900` | `#141F52` | 14.2:1 | Primary text, headings |
| `navy-800` | `#1A2660` | 12.1:1 | Hover on navy surfaces |
| `navy-700` | `#1E2C6E` | 10.6:1 | **Primary brand.** Buttons, links |
| `navy-600` | `#2A3D8F` | 7.9:1 | Pressed states |
| `blue-500` | `#3560B4` | 4.9:1 | Secondary actions, active states |
| `blue-400` | `#4A79C9` | 3.6:1 | Large text only, icons |
| `cyan-400` | `#5FC4E4` | **2.0:1 ✗** | Surfaces, strokes, glows, motion — **never text on white** |
| `cyan-300` | `#8AD4EC` | 1.6:1 ✗ | Decorative only |
| `cyan-100` | `#CBE4F3` | — | Tints, hover fills, highlight rows |
| `cyan-50`  | `#EBF5FB` | — | Subtle section grounds |

**Neutrals**

| Token | Hex | Use |
|---|---|---|
| `white` | `#FFFFFF` | Page ground |
| `stone-50` | `#F6F7F9` | Alternate sections, card ground |
| `stone-100` | `#EDEFF3` | Skeletons, disabled fills |
| `stone-300` | `#D8DCE3` | Hairlines, borders, dividers |
| `stone-500` | `#8A93A3` | Placeholder, disabled text |
| `stone-600` | `#5B6472` | Secondary text — 6.1:1 on white ✓ |
| `stone-800` | `#2E3441` | Body text alternative |

**Semantic**

| Token | Hex | Text-on-white contrast | Use |
|---|---|---|---|
| `success-600` | `#1B7A4B` | 5.2:1 ✓ | In stock, published, saved |
| `success-50` | `#E8F5EE` | — | Success surface |
| `warning-600` | `#A16207` | 4.9:1 ✓ | Low stock, low confidence, lot warning |
| `warning-50` | `#FEF6E7` | — | Warning surface |
| `danger-600` | `#B42318` | 6.3:1 ✓ | Errors, destructive, out of stock |
| `danger-50` | `#FEF0EF` | — | Error surface |
| `info-600` | `#2A3D8F` | 7.9:1 ✓ | Info — reuses navy, not a new hue |

**Rules, enforced at the token layer so they cannot be violated by accident:**
1. `cyan-400` and lighter are never text colours on light grounds. On `navy-700` or darker, `cyan-400` reaches 6.4:1 and is permitted.
2. Exactly one gradient exists: `135deg, navy-700 → blue-500 55% → cyan-400`. Permitted on: intro light trails, scroll progress indicator, focus rings, one hero accent. Banned on buttons, cards, text, backgrounds, icons.
3. Shadows are tinted navy (`rgba(20,31,82,…)`), never neutral black. Makes every surface read as one material.
4. Semantic colour never carries meaning alone — always paired with an icon or text label.
5. Product photography is never tinted, overlaid or duotoned. The tile's real colour is the product; altering it is a commercial error, not just a design one.

**Dark mode:** admin only, v1.1. The public site is white — a tile showroom is lit, not dim, and product colour accuracy demands a neutral white ground.

### 4.2 Typography

| Role | Face | Weights | Notes |
|---|---|---|---|
| Display | **Marcellus** | 400 | Roman inscriptional serif matching the wordmark. ≥28px only. |
| Body / UI | **Inter Variable** | 400–700 | Optical sizing on, `cv11` for single-storey a in UI chrome |
| Data | **JetBrains Mono** | 400, 500 | SKUs, dimensions, ratings. `tabular-nums` always |
| Arabic body | **IBM Plex Sans Arabic** | 400–600 | Pairs with Inter's proportions |
| Arabic display | **Noto Naskh Arabic** | 400, 700 | Serif-equivalent weight to Marcellus |

**Scale** (fluid, 1.25 ratio)

| Token | Size | Line | Tracking | Face |
|---|---|---|---|---|
| `display-xl` | `clamp(3rem, 7vw, 7rem)` | 0.95 | -0.02em | Marcellus 400 |
| `display-lg` | `clamp(2.25rem, 4.5vw, 4.5rem)` | 1.0 | -0.015em | Marcellus 400 |
| `display-md` | `clamp(1.75rem, 3vw, 3rem)` | 1.1 | -0.01em | Marcellus 400 |
| `heading-lg` | `1.75rem` | 1.25 | -0.01em | Inter 600 |
| `heading-md` | `1.25rem` | 1.35 | -0.005em | Inter 600 |
| `heading-sm` | `1rem` | 1.4 | 0 | Inter 600 |
| `body-lg` | `1.125rem` | 1.7 | 0 | Inter 400 |
| `body` | `1rem` | 1.65 | 0 | Inter 400 |
| `body-sm` | `0.875rem` | 1.6 | 0 | Inter 400 |
| `caption` | `0.8125rem` | 1.5 | 0.06em | Inter 500, uppercase |
| `spec` | `0.875rem` | 1.5 | 0 | JetBrains Mono 400 |
| `spec-sm` | `0.75rem` | 1.45 | 0 | JetBrains Mono 400 |

**Rules:** measure caps at 68ch for body prose. Display type is never centred at more than two lines. Arabic sizes step up 8% and line-height 12% at equivalent optical weight. Never more than two display sizes on one screen.

### 4.3 Spacing

4px base. `0 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 192`

| Context | Desktop | Tablet | Mobile |
|---|---|---|---|
| Section vertical rhythm | 128 | 96 | 80 |
| Page horizontal gutter | 64 | 40 | 20 |
| Card internal padding | 24 | 20 | 16 |
| Grid gap (product) | 24 | 20 | 12 |
| Form field stack | 20 | 20 | 16 |
| Related-element gap | 8 | 8 | 8 |

Vertical rhythm inside a section: heading → 24 → subheading → 48 → content. Between subsections: 64.

### 4.4 Grid

12 columns, max content width **1440px**, gutter 24px.

| Breakpoint | Width | Columns | Product grid | Filter rail |
|---|---|---|---|---|
| `xs` | 0–479 | 4 | 1 (2 in compact toggle) | Bottom sheet |
| `sm` | 480–767 | 4 | 2 | Bottom sheet |
| `md` | 768–1023 | 8 | 3 | Bottom sheet |
| `lg` | 1024–1279 | 12 | 3 | 240px fixed rail |
| `xl` | 1280–1535 | 12 | 4 | 280px fixed rail |
| `2xl` | 1536+ | 12 | 4 (5 in compact) | 280px, content capped 1440 |

Full-bleed sections escape the container; the container never exceeds 1440 for text content. Editorial and project pages use an asymmetric 7/5 split rather than 6/6 — symmetry reads as a template.

### 4.5 Radius

`sm 6px` inputs, chips, badges · `md 12px` buttons, cards, product images · `lg 20px` panels, modals, drawers · `xl 28px` hero cards · `full` avatars and pills only.

**Product images are 12px and never more.** Tiles are square-edged; heavily rounded product imagery misrepresents the object.

### 4.6 Elevation

| Token | Value | Use |
|---|---|---|
| `shadow-xs` | `0 1px 2px rgba(20,31,82,.05)` | Inputs, chips |
| `shadow-card` | `0 1px 2px rgba(20,31,82,.04), 0 8px 24px rgba(20,31,82,.06)` | Cards at rest |
| `shadow-hover` | `0 2px 4px rgba(20,31,82,.05), 0 16px 32px rgba(20,31,82,.09)` | Card hover |
| `shadow-float` | `0 4px 8px rgba(20,31,82,.06), 0 24px 48px rgba(20,31,82,.10)` | Dropdowns, popovers |
| `shadow-overlay` | `0 8px 16px rgba(20,31,82,.08), 0 40px 80px rgba(20,31,82,.16)` | Modals, drawers |
| `ring-focus` | `0 0 0 2px #FFF, 0 0 0 4px navy-700` | Focus |

Six shadows, no more. Hairlines do most of the separation work; shadow is reserved for things that genuinely float.

### 4.7 Buttons

| Variant | Rest | Hover | Active | Disabled |
|---|---|---|---|---|
| **Primary** | `navy-700` bg, white text | `navy-800`, `shadow-hover` | `navy-600`, scale .98 | `stone-100` bg, `stone-500` text |
| **Secondary** | white bg, `navy-700` 1px border + text | `cyan-50` fill | `cyan-100` | `stone-300` border |
| **Ghost** | transparent, `navy-700` text | `stone-50` fill | `stone-100` | `stone-500` |
| **Text** | `navy-700`, underline offset 4px | underline thickens to 2px | — | `stone-500` |
| **Destructive** | `danger-600` bg, white | `#9A1E15` | scale .98 | — |
| **Icon** | 40×40, transparent | `stone-50` circle | `stone-100` | — |

Sizes: `sm` 32h / 12px pad / `body-sm` · `md` 44h / 20px / `body` · `lg` 52h / 28px / `body-lg`. **Minimum touch target 44×44 everywhere, including icon buttons.**

Loading state: label stays in place, a 16px diamond spinner replaces the leading icon slot, width does not change (prevents layout shift and accidental double-clicks). Buttons with a destructive result are never the default focus target.

### 4.8 Inputs

40px height (`md`), `sm 6px` radius, 1px `stone-300` border, 12px horizontal padding, `body` text.

| State | Treatment |
|---|---|
| Rest | `stone-300` border, white fill |
| Hover | `stone-500` border |
| Focus | `navy-700` border + `ring-focus`, 120ms |
| Filled | unchanged border, label floats to `caption` above |
| Error | `danger-600` border, `danger-50` fill, message below with ⚠ icon |
| Success | `success-600` border, ✓ trailing icon (used sparingly — only async validation) |
| Disabled | `stone-100` fill, `stone-500` text, no border change on hover |
| Read-only | no border, `stone-50` fill |

Labels are always visible above the field — never placeholder-as-label, which fails for screen readers and vanishes exactly when the user needs it. Placeholders show *format examples* only (`e.g. 2.4`). Helper text sits below and is replaced by the error message, not stacked with it.

**Specialised inputs:** dimension input (paired number fields with a `×` separator and a unit suffix) · colour swatch picker (32px circles, 2px selected ring, name on hover, `aria-label` always) · range slider (dual handle, live value bubbles, keyboard arrow steps) · SKU input (mono, uppercase transform, live validation) · image dropzone (dashed `stone-300` → solid `navy-700` + `cyan-50` fill on drag-over) · quantity stepper (m² and boxes linked bidirectionally).

### 4.9 Cards

**Product card (visual mode)** — 4:5 image ratio, `md` radius, `shadow-card`, 16px padding below image. Content order: collection name (`caption`, `stone-600`) → product name (`heading-sm`) → format + finish (`body-sm`) → price (`heading-sm`, tabular) → stock dot + label. Action row on the bottom edge: `♡` save, `⇄` compare, `+` basket — always visible, not hover-revealed.

**Product card (spec mode)** — image demoted to 96px square left, spec grid right: SKU (mono) · format · material · finish · R-rating · PEI · m²/box · stock per warehouse. Denser row height, no shadow, hairline separated. Roughly 3× more products per screen.

Other cards: collection (16:9, overlay title, count) · project (4:3, location + area) · showroom (map thumb, hours, open/closed dot) · match result (image + % ring + reason + actions) · stat (label, value, delta, sparkline) · request (contact, items count, value, source badge, age).

### 4.10 Tables

Admin and spec tables share one system. Row height 52px (`comfortable`) / 40px (`compact`, toggleable). Header: `caption` style, `stone-50` ground, sticky. Zebra striping is **not** used — hairlines only, because striping fights the shade of product thumbnails.

Sortable headers show an inactive chevron at 30% opacity that solidifies on hover. Row hover fills `stone-50`. Selected row fills `cyan-50` with a 2px `navy-700` left border. Numeric columns are right-aligned and tabular. Sticky first column on horizontal scroll. Bulk select shows a floating action bar with the count, not a header row of buttons.

Spec tables on product pages: two columns, label `stone-600` `body-sm`, value mono, 1px hairline between rows, grouped under `caption` subheads. Never inside an accordion.

### 4.11 Icons

**Lucide**, 1.5px stroke, 20px default (16 in dense contexts, 24 in nav). Consistent stroke weight is what keeps an icon set from looking assembled from three sources.

Custom icons drawn to match, all derived from the diamond: brand diamond mark · tile format · shade variation (V1–V4 as four diamonds of increasing tonal spread) · slip rating · rectified edge · box/pallet · m² area · lot batch · indoor/outdoor.

Icons never appear alone in a control unless the control is universally understood (close, search, menu) — everything else pairs with a label or has a tooltip plus `aria-label`.

### 4.12 Badges

`sm` radius, `caption` type, 4px/8px padding, always icon + text.

| Badge | Style |
|---|---|
| In stock | `success-50` fill, `success-600` text, filled dot |
| Low stock | `warning-50` / `warning-600`, half dot |
| Out of stock | `stone-100` / `stone-600`, hollow dot |
| New | `navy-700` fill, white text |
| Best seller | `cyan-100` fill, `navy-900` text |
| Outdoor | outline, `stone-600` |
| R11 anti-slip | outline + slip icon, `navy-700` |
| V3 shade | outline + four-diamond icon |
| Trade only | `navy-900` fill, white |
| Discontinued | `stone-100`, strikethrough label |
| Match % | pill with a circular progress ring, colour stepping success → warning by band |
| AI generated | `cyan-50` fill, diamond icon — used in admin on any AI-produced field until approved |

### 4.13 Forms

Single column always — multi-column forms increase completion time and error rates. Group into fieldsets with `caption` legends. Required fields marked with a red asterisk *and* a legend; optional fields labelled "(optional)" where they're the minority.

Validation on blur, not on keystroke. Re-validation on keystroke only after the first error. Submit is never disabled — clicking it with errors scrolls to and focuses the first invalid field and announces the count. Disabled submit buttons hide the reason and are a known accessibility failure.

Errors appear inline below the field, plus a summary at the top of the form for screen readers (`role="alert"`). Multi-step forms (trade application, quote request) show a step indicator with completed/current/upcoming states and allow backward navigation without data loss. Autosave for admin forms every 20s with a "saved 12s ago" indicator.

### 4.14 Charts

Admin only. **Recharts.** Palette: primary `navy-700`, comparison `cyan-400`, tertiary `blue-500`, and a 6-step categorical ramp navy→cyan. No gradients under areas beyond a 12% fade. Grid lines `stone-300` at 40% opacity, horizontal only. Axis labels `caption`, values mono tabular.

Chart types by purpose: line for time series · bar for category comparison · horizontal bar for rankings (top products, top searches) · donut only for ≤4 segments with the total in the centre · sparkline in stat cards, no axes · heatmap for showroom traffic by day/hour.

Every chart has: an accessible data table alternative behind a "View as table" toggle, a defined empty state, a loading skeleton matching its final dimensions, and a hover tooltip that follows the cursor with a crosshair. Animations on mount only, 600ms, never on data update — re-animating on every poll is nauseating.

### 4.15 Empty states

Never a bare "No results." Every empty state has an illustration (a diamond composition in `cyan-100`/`stone-300`), a plain title, one sentence of cause, and at least one action.

| Context | Title | Body | Action |
|---|---|---|---|
| Filters, no results | No tiles match these filters | The size and finish combination isn't in stock. | Remove last filter · Clear all · Describe it to the assistant |
| Search, no results | Nothing found for "cerámica" | Check spelling, or try a product name, SKU or size. | Browse all · Popular searches |
| Basket empty | Your selection is empty | Add tiles to build a quote request. | Browse catalog · Continue last session |
| Wishlist empty | Nothing saved yet | Tap ♡ on any tile to keep it here. | Browse catalog |
| Compare empty | Choose two tiles to compare | Up to four at once. | Browse catalog |
| Projects empty | No projects yet | Group tiles by room, share with clients, export a spec PDF. | Create project |
| Tile finder low confidence | No strong match | The photo is dark and angled — flat, even light works better. | Try another · Describe it · WhatsApp us |
| Admin products empty | No products yet | Import a supplier catalog and we'll extract the specs. | Import catalog · Add manually |
| Admin requests empty | No requests today | New quote requests arrive here. | View this month |
| Ingestion queue empty | Nothing to review | Every extracted product has been approved. | View products |
| Offline | You're offline | Recently viewed tiles are still available. | Retry · View saved |

### 4.16 Loading states

**Skeletons, not spinners**, for anything with a known shape. Skeletons match the final layout exactly — mismatched skeletons cause perceived layout shift even when CLS is technically zero. `stone-100` base with a 1.4s shimmer sweeping at 45° along the brand axis. Reduced motion: static `stone-100`, no shimmer.

| Context | Treatment |
|---|---|
| Product grid | 8 card skeletons, staggered 40ms |
| Product page | Image block + text lines matching real proportions |
| Filter counts | Number blurs to a 3-char block, updates in place, no reflow |
| Search overlay | Results area skeleton after 150ms only — faster than that, show nothing |
| Assistant | Three-dot pulse in a message bubble, then token streaming |
| Tile finder | The staged checklist (§3.4 State 2), not a spinner |
| Ingestion job | Progress bar with step labels and live count |
| Chart | Axes drawn, plot area shimmering |
| Button | In-place diamond spinner, fixed width |
| Route change | 2px gradient bar at the top edge, indeterminate |
| Image | Blurhash placeholder → sharp, 300ms cross-fade |

Rule: below 200ms show nothing (flashing skeletons feel *slower*). 200ms–2s show a skeleton. Beyond 2s show progress with a step description. Beyond 10s move it to the background and notify.

### 4.17 Error states

Errors state what happened and what to do. They never apologise, never blame the user, and never expose a stack trace or an error code without a human sentence attached.

| Type | Treatment |
|---|---|
| Field validation | Inline, below field, `danger-600`, icon + specific fix |
| Form submission | Summary at top, `role="alert"`, focus moves to it, fields marked |
| Network failure | Inline retry panel in the affected region, not a full-page error |
| 404 | Branded page: "That page isn't here." + search + popular collections |
| 500 | "Something broke on our side." + retry + WhatsApp contact + reference ID |
| AI provider down | "The tile finder is unavailable right now." + browse + WhatsApp — **the site never breaks when AI does** |
| AI low confidence | Not an error. A designed state (§3.4). |
| Image upload rejected | Specific cause: too large / wrong format / no tile detected — never generic |
| Out of stock mid-basket | Non-blocking notice on the basket line + alternatives |
| Session expired (admin) | Modal with countdown, extend, work preserved |
| Permission denied | "You don't have access to inventory." + who to ask |
| Rate limited | "Too many requests. Try again in 40 seconds." with a live countdown |

Every error is logged to Sentry with a reference ID shown to the user, so a support conversation can start from a fact.

### 4.18 Success states

Proportional to the effort completed. A saved wishlist item does not deserve a modal.

| Action | Feedback |
|---|---|
| Save to wishlist | Heart fills, 200ms scale bounce, header count increments. No toast. |
| Add to basket | Product image flies to the basket icon (400ms), count increments, drawer opens **on first add only** |
| Compare added | Item slides into the tray, tray lifts 4px and settles |
| Quote request sent | Full confirmation **page** with reference number, next steps, timeline, WhatsApp link. This is the biggest moment on the public site and deserves a page, not a toast. |
| Sample ordered | Modal → success panel with delivery estimate |
| Project shared | Link copied, toast with the URL and an undo |
| Admin save | Toast, 4s, with undo where reversible |
| Bulk publish | Toast with count + "View published" |
| Ingestion approved | Row animates out of the queue, counter decrements, next item focuses automatically |

Toasts: bottom-right desktop, top mobile (below the header, above content), max 3 stacked, 4–5s, pause on hover, dismissible, `role="status"`.

---

## 5. Motion design

### 5.1 Motion principles

1. **Mass.** Tile is heavy. Nothing bounces, nothing overshoots elastically. `ease-material` is front-loaded and settles hard.
2. **One theatre moment.** The intro. Everything else is functional motion.
3. **Motion explains state.** If an animation doesn't tell the user where something came from or went, it's decoration and gets cut.
4. **The diagonal is the brand's motion axis.** Wipes, shines, shimmers and reveals travel at 45°, matching the logo.
5. **Nothing exceeds 800ms** except the intro. Users repeat interactions dozens of times per session.

**Tokens**

| Token | Value | Use |
|---|---|---|
| `duration-instant` | 120ms | Hover, focus, toggle feedback |
| `duration-quick` | 240ms | State change, chip add, tooltip |
| `duration-base` | 420ms | Entrance, panel, drawer |
| `duration-slow` | 800ms | Scroll reveals, large transitions |
| `duration-cinema` | 4200ms | Intro only |
| `ease-material` | `cubic-bezier(.32,.72,0,1)` | **House curve.** Default for everything |
| `ease-out-quart` | `cubic-bezier(.25,1,.5,1)` | Entrances |
| `ease-in-out-quart` | `cubic-bezier(.76,0,.24,1)` | Two-way transitions, wipes |
| `ease-exit` | `cubic-bezier(.4,0,1,1)` | Exits — faster than entrances, always |
| `stagger-tight` | 40ms | Grid items |
| `stagger-base` | 60ms | Section children |
| `stagger-loose` | 90ms | Hero elements |

Exits are always ~30% faster than entrances. Waiting for something to leave is the most common source of "this feels slow."

### 5.2 The intro — "Assembly"

Full timeline, as specified in Architecture §4.2, with the interaction design around it.

| t | Event | Technique |
|---|---|---|
| 0.00 | Pure white. Nothing. | The half-second of silence is what makes it read as expensive rather than busy. |
| 0.00 | Skip control fades in, bottom-right, keyboard-focusable | Available from frame one. Never hidden. |
| 0.40 | 68 fragments fade in at scattered off-screen origins, pre-rotated to final angle, 0.85 scale | SVG paths, baked at build time, transform-only |
| 0.40–2.60 | Fragments travel along individual quadratic beziers. `stagger {amount: 1.6, from: "random"}`, `ease-material` | GSAP timeline |
| 0.40–3.00 | Cyan light trails follow each fragment — 14-position history, tapering stroke, additive blend | Single canvas, one draw call/frame, DPR capped at 2 |
| 2.20 | Centre mosaic squares seat first and "click": 60ms scale 1.0→1.03→1.0 | The logo locking together |
| 2.60 | Final fragments seat. Trails decay 400ms | |
| 2.90 | **Shine:** 22°-wide white band sweeps at 45° across the mark, 700ms | Masked gradient, `ease-in-out-quart` |
| 3.40 | Wordmark reveals via 45° clip-path wipe, 500ms | Same brand axis |
| 3.90 | **GSAP Flip:** lock-up transforms into the navbar position, 700ms. Hero simultaneously rises 24px and fades in | Navbar logo box reserved from t=0 → CLS 0 |
| 4.20 | Overlay unmounts, scroll unlocks | |

**Conditions under which it does not play** — all of these fall back to a 300ms logo fade:
`prefers-reduced-motion: reduce` · already played this session · any route except `/` · `saveData` enabled · `effectiveType` 2g/slow-2g · `deviceMemory < 4` · user pressed skip previously (remembered for 30 days).

**Skip behaviour:** pressing skip jumps the timeline to t=3.9 and plays only the Flip handoff over 400ms — so the user still sees the logo arrive at the navbar and never experiences a jarring cut. Escape and Enter both trigger it.

### 5.3 Hero transitions

- **Handoff:** hero content is already server-rendered beneath the overlay. At t=3.9 it rises 24px and fades 0→1 over 600ms with 90ms stagger: headline → subhead → buttons → scroll indicator.
- **Headline entrance (return visitors, no intro):** the display line reveals by a 45° clip-path wipe over 700ms, not a fade. Words don't fade in one by one — that's the AI-generated tell.
- **Background:** hero image scales 1.06 → 1.0 over 1.2s on load, then scroll-linked parallax at 0.4× scroll rate, capped at 120px of travel.
- **Scroll indicator:** a small diamond that traces its own outline as a stroke, loops every 2.4s, and fades out permanently after any scroll input.

### 5.4 Scroll animations

Framer Motion `whileInView`, `once: true`, triggered at 15% viewport entry.

| Element | Motion |
|---|---|
| Section heading | Rise 24px + fade, 600ms |
| Body paragraph | Rise 16px + fade, 600ms, +60ms |
| Card grid | Rise 32px + fade, `stagger-tight`, max 8 elements animate — beyond that the rest appear instantly |
| Full-bleed image | Scale 1.04 → 1.0 + fade, 900ms |
| Diagonal section divider | Clip-path wipe along 45°, scroll-linked (not time-based) |
| Statistics | Count-up on tabular-nums, 1.2s, `ease-out-quart` |
| Collection banner | Parallax 0.3×, image and text at different rates |
| Sticky product summary | Fades in when the hero gallery passes 60% out of view |
| Scroll progress | 2px gradient bar, top edge, transform-scaled not width-animated |

**Hard rules:** never animate more than 8 elements simultaneously. Never animate anything already in the viewport on load. Never use scroll-jacking or scroll-snapping on long pages — it breaks native scrolling, hurts accessibility, and is the single most common way premium-aspiring sites become unusable.

### 5.5 Hover

| Element | Rest → Hover |
|---|---|
| Nav link | Underline draws left→right, 2px `navy-700`, 200ms |
| Primary button | Background lightens, `shadow-hover` lifts, 180ms |
| Secondary button | `cyan-50` fills from the cursor's entry edge, 200ms |
| Text link | Underline thickens 1→2px, offset stays 4px, 150ms |
| Icon button | `stone-50` circle scales 0.8→1, 150ms |
| Colour swatch | Scales 1.0→1.15, 2px ring appears, name tooltip after 400ms |
| Table row | `stone-50` fill, 120ms |
| Filter chip | Border darkens, `×` icon fades in |
| Thumbnail | 2px `navy-700` border draws in |
| Showroom map pin | Lifts 4px, shadow grows, label expands |

All hover states are `@media (hover: hover)` guarded. On touch, hover styling on tap is a bug, not a feature.

### 5.6 Product card interaction

The signature interaction, specified precisely:

```
REST
  card: shadow-card, image scale 1.0
HOVER (240ms, ease-material, all properties in parallel)
  card       translateY -4px, shadow-card → shadow-hover
  image      scale 1.0 → 1.04 inside a fixed 12px-radius mask
  hairline   2px cyan-400 line draws along the bottom edge,
             left → right, 300ms, 40ms delay
  actions    ♡ ⇄ + rise 4px and reach full opacity (0.6 at rest)
  secondary  finish + slip badges fade in below the price
LEAVE (180ms — faster than entry)
  everything reverses; the hairline retracts right → left
PRESS
  card scales 0.99, 80ms, releases on pointerup
NAVIGATE
  card image becomes the shared element (layoutId) and expands
  into the product page gallery, 420ms — the page appears to
  grow out of the card the user tapped
```

**No 3D tilt.** Recorded in Architecture §4.4 and reaffirmed here: tilt makes a flat material read as floating plastic, and on a tile catalog it actively misrepresents the product. The shared-element navigation is the more expensive-feeling choice and it's also more useful, because it preserves the user's sense of place.

### 5.7 Gallery transitions

- **Card → product page:** shared-element expansion, 420ms.
- **Thumbnail → main:** cross-fade 240ms with the outgoing image scaling 1.0→1.02. No slide — slide implies sequence, and gallery images are alternatives, not a sequence.
- **Open full-screen gallery:** the main image expands from its position to full-screen, 380ms, background fades to `navy-950` at 96%. This is a route change, so back closes it.
- **Between full-screen images:** horizontal slide with a 12% velocity-following drag on touch, snap on release, 320ms.
- **Zoom:** on desktop, hover moves a 2.5× inset lens; on touch, pinch with momentum and a double-tap to 2× at the tap point. Zoom level persists when switching images so a user comparing veining doesn't lose their place.
- **Close:** image contracts back to its origin card if that card is still in the viewport; otherwise fades and scales to 0.96 over 260ms.

### 5.8 Dashboard animations

Restraint is the priority. Admins repeat these actions hundreds of times a day.

| Element | Motion |
|---|---|
| Sidebar nav | Active indicator — a 3px `navy-700` bar — slides between items, 240ms `ease-material` |
| Route change | Content area fades 0→1 with an 8px rise, 200ms. No wipe — wipes get tiring at work speed |
| Table row insert | Height expands from 0 with `cyan-50` flash fading over 900ms |
| Table row delete | Row collapses, 220ms, with a 5s undo toast |
| Stat card mount | Value counts up 800ms, sparkline draws left→right 1s. On mount only, never on refresh |
| Drawer open | Slides from the edge, 300ms `ease-material`; scrim fades 200ms |
| Kanban drag | Card lifts to `shadow-float` and rotates 2°; drop zones show a 2px dashed `navy-700` outline; drop settles 200ms |
| Bulk action bar | Rises from the bottom edge, 240ms, when selection > 0 |
| Ingestion queue | Approved row slides out left, remaining rows close the gap 200ms, next row auto-focuses |
| Save indicator | "Saving…" → checkmark draws in 300ms → fades to "Saved 2s ago" |
| Chart | Bars grow from baseline / lines draw left→right, 600ms, mount only |

### 5.9 AI interaction motion

Motion here does one job: make latency legible so it doesn't read as breakage.

- **Tile finder analysis:** the uploaded image gets a `cyan-400` scan line sweeping top→bottom at 45°, 1.2s loop, while the checklist ticks. Each completed step's checkmark draws in over 240ms. This makes 4 seconds feel like progress instead of waiting.
- **Result reveal:** cards enter in confidence order, `stagger-base`, rising 20px. The match-percentage ring animates from 0 to its value over 700ms with the number counting in sync.
- **"Why this match" popover:** scales 0.96→1 from the anchor with a 45° corner accent, 180ms.
- **Assistant typing indicator:** three diamonds, not dots, pulsing in sequence at 0.6s.
- **Token streaming:** text appears in word chunks, not character by character — character-level streaming reads as artificially theatrical. Cursor is a 2px `cyan-400` bar.
- **Inline product cards in chat:** slide up 16px and fade, `stagger-tight`, after the sentence introducing them completes. The order matters — the explanation lands before the evidence appears.
- **Tool-call indicator:** a subtle line of `caption` text ("Checking stock in Baabda…") that fades out when the result arrives. Users trust an AI more when they can see it working from real data.
- **Confidence bars (admin ingestion):** fill left→right on mount, 400ms, colour stepping success → warning → danger by band.

### 5.10 Page transitions

Public site: a 45° clip-path wipe in `navy-700`, 320ms out / 380ms in, with the incoming content rising 12px. Fast enough to feel instant, distinctive enough to be remembered.

Exceptions where the wipe is suppressed: filter changes on the catalog (content updates in place with a 200ms cross-fade of the grid only), pagination (grid cross-fade, scroll position preserved to the grid top not the page top), and any navigation using a shared element, where the shared element transition *is* the page transition.

`View Transitions API` where supported, with the Framer Motion path as the fallback so behaviour is identical either way.

### 5.11 Mobile motion

Mobile motion is about touch physics, not decoration.

- **Bottom sheets** are the primary overlay. Drag handle, velocity-following, snap points at 50% and 92%, dismiss below 25% or on a fast downward flick. `ease-material` on release.
- **Momentum and rubber-banding** preserved everywhere — never intercept native scroll.
- **Pull-to-refresh** on the catalog: the diamond mark rotates with pull distance and spins on release.
- **Swipe:** horizontal on gallery images and product carousels only. Never swipe-to-delete without an explicit confirm — accidental deletion on a quote basket is a real loss.
- **Sticky action bar** on product pages slides up from the bottom edge, 240ms, when the primary CTA scrolls out of view; hides on scroll-down, reappears on scroll-up.
- **Tap feedback:** 100ms scale to 0.97 with an immediate release. On Android, a subtle ripple constrained to the element's radius.
- **Haptics** (where supported): light impact on add-to-basket and filter apply; success notification on quote sent. Nothing else — over-haptic apps get their permissions revoked mentally.
- **Reduced complexity:** the intro's 68 fragments drop to 40 on mobile; the trail canvas renders at DPR 1.5 rather than 2; parallax is disabled entirely below 768px (it costs more than it gives on a small viewport).

### 5.12 Reduced motion

`prefers-reduced-motion: reduce` is honoured globally, not per-component:

| Normal | Reduced |
|---|---|
| Intro assembly | 300ms logo fade to navbar |
| Scroll reveals | Content visible immediately, no transform |
| Parallax | Disabled |
| Card hover lift | Shadow change only |
| Shared element navigation | Instant cross-fade, 120ms |
| Page wipe | 120ms opacity |
| Skeleton shimmer | Static `stone-100` |
| Count-ups | Final value immediately |
| Scan line, typing dots | Static state + text label ("Analysing…") |
| Auto-playing video | Poster frame + play control |

Nothing becomes unavailable or unclear in reduced-motion mode. Every state an animation communicates has a static equivalent.

---

## 6. Responsive UX

Not "the same page, narrower." Each breakpoint has a different *primary task assumption*.

### 6.1 Desktop (≥1280px) — comparison and evaluation

Users have a large canvas and are comparing options. Persistent filter rail, 4-up grid, hover affordances carry secondary information, compare tray always visible, product page uses the 55/45 split so imagery and decision facts are simultaneously visible. Admin tables run 8+ columns with a persistent sidebar. Keyboard shortcuts fully available (⌘K, J/K navigation, ⌘↵ submit).

### 6.2 Laptop (1024–1279px) — the most common desktop reality

3-up grid, filter rail narrows to 240px with condensed labels, compare tray collapses to a pill when scrolling down. Admin sidebar collapses to icons with tooltips at <1200px. Product page split becomes 60/40 with the calculator moving below the action buttons.

### 6.3 Tablet (768–1023px) — browsing, often in a showroom

Assume a horizontal-held device in someone's hands, possibly a salesperson showing a customer. Filter rail becomes a bottom sheet. 3-up grid portrait, 4-up landscape. Hover states are unreliable, so all card information is always visible. Touch targets 44px minimum. Product page stacks: gallery full width, then a two-column facts/calculator row. Admin tables reduce to 5 priority columns with the rest behind a row-expand. Full-screen gallery gains pinch zoom.

**Showroom mode** *(see §8)*: a tablet-optimised presentation view — larger type, no navigation chrome, swipeable collection browsing for use on the showroom floor.

### 6.4 Mobile (<768px) — decision and contact

Most traffic, and the most goal-directed. Assume one thumb, imperfect light, and impatience.

- Bottom navigation bar: Catalog · Finder · Saved · Basket · Menu. Thumb-reachable, always present.
- Filters open as a full-height bottom sheet, applied on close, with the active count on the trigger button.
- 2-up grid default; a 1-up "large" toggle for detailed looking. 12px gap.
- Product page order: image → name → price → five facts → **sticky Add to basket bar** → stock → calculator → specs.
- The calculator's number inputs use `inputmode="decimal"` and a numeric keypad.
- Camera capture is a first-class entry on the tile finder, not a secondary option behind upload.
- WhatsApp is a persistent floating action available on product and basket pages — in this market it converts better than any form.
- Admin on mobile is deliberately scoped: view and respond to requests, check stock, approve ingestion items. Not full product editing. Pretending a 20-field product form works on a phone helps nobody.
- Intro animation runs with reduced fragment count, or not at all on constrained devices.

### 6.5 Cross-cutting responsive rules

Images are served through Cloudinary with `srcset` at 6 widths and AVIF-first negotiation; the product grid requests exactly the rendered size, never a desktop image scaled down. Layout uses CSS logical properties throughout so RTL requires no separate stylesheet. Font sizes never drop below 16px for body text on mobile (prevents iOS zoom-on-focus). Every interactive element clears 44×44 with 8px minimum separation.

---

## 7. Accessibility

Target: **WCAG 2.2 AA across the site, with AAA contrast on body text.** Tested with real assistive technology, not just automated scans.

### 7.1 Keyboard

Every interactive element is reachable and operable by keyboard, in a logical order matching visual order. Specifics:

- **Skip links:** "Skip to content", "Skip to filters", "Skip to results" — visible on focus at the top of the page.
- **Focus is never lost.** Opening an overlay moves focus into it; closing returns focus to the trigger. Deleting a row moves focus to the next row, not to `<body>`.
- **Focus trap** in every modal, drawer and the search overlay. Escape closes the topmost layer only.
- **Catalog:** Tab reaches the filter rail; arrow keys move within a filter group; Space toggles; the result count is announced on change via a live region.
- **Product grid:** arrow keys move between cards in two dimensions, Enter opens, `S` saves, `C` compares.
- **Gallery:** arrow keys change image, `+`/`−` zoom, Escape closes.
- **Assistant:** Enter sends, Shift+Enter newlines, ↑ edits the last message, suggested-reply chips are Tab-reachable.
- **Admin:** ⌘K command palette, J/K row navigation, Space selects, ⌘↵ saves, `E` edits, `/` focuses search. The ingestion review screen is fully operable without a mouse — that's what makes 400 products viable.
- **No keyboard trap anywhere**, including in third-party embeds (the showroom map has a documented escape path and a text-address alternative).

### 7.2 Screen readers

Tested against NVDA/Firefox, VoiceOver/Safari, and TalkBack/Chrome each phase.

- Semantic HTML first: `<nav>`, `<main>`, `<article>`, `<button>`, real headings in order with no skipped levels. ARIA only where semantics fall short.
- **Product cards** announce as: "Calacatta Oro, Calacatta Series, 60 by 120 centimetres, matte porcelain, 27 dollars 60 per square metre, in stock. Link."
- **Filter changes** announce the new count via `aria-live="polite"`: "34 products match."
- **The calculator** announces its result on change: "8.18 square metres needed, 6 boxes, 142 kilograms."
- **Match percentages** are announced with the reason, not the ring: "94 percent match. Same warm beige and matte finish, veining slightly finer."
- **Assistant streaming** uses `aria-live="polite"` on the completed message, not on every token — streaming into a live region is unusable with a screen reader.
- **Charts** have a "View as table" toggle exposing the same data in a real `<table>` with `<caption>`.
- **Images:** every product image has locale-specific alt text describing the tile (colour, pattern, finish), not "Calacatta Oro image". Decorative images get `alt=""`. AI-drafted alt text is always human-approved before publish.
- **Icon-only buttons** always carry `aria-label`. Loading states announce "Loading" and completion announces the result.
- **Language:** `lang` and `dir` set correctly per locale; mixed-language content (an English SKU inside Arabic prose) marked with inline `lang`.

### 7.3 Colour and contrast

Audited in §4.1. Every text token meets AA; body text meets AAA (7:1) on white. `cyan-400` is structurally prevented from being used as text on light grounds. All non-text UI (borders, icons, focus indicators, chart series) meets 3:1.

Colour is never the only signal: stock uses a dot shape *and* a label; confidence uses a bar, a number *and* a warning icon; compare differences use tint *and* an "differs" marker; chart series are distinguished by pattern as well as hue. Verified against deuteranopia, protanopia and tritanopia simulations.

### 7.4 Focus states

One focus treatment across the entire system: `0 0 0 2px #FFF, 0 0 0 4px navy-700` — a white spacer ring then a navy ring, so it reads on any background. On dark grounds the outer ring becomes `cyan-400`, which reaches 6.4:1 there.

`:focus-visible` is used so mouse users don't see rings on click, but keyboard users always do. **Focus outlines are never removed.** Focus is never hidden behind sticky headers — scroll-margin is set on all focusable elements so focused items scroll clear of fixed chrome.

### 7.5 Other

Motion respects `prefers-reduced-motion` (§5.12). Nothing auto-plays with sound. Nothing flashes more than three times per second. Time limits (session expiry) are extendable and warn at 2 minutes. Forms allow correction before submission and never lose entered data on error. Target sizes meet WCAG 2.2's 24×24 minimum, and we hold to 44×44 as house standard. Text reflows to 320px width at 400% zoom without horizontal scrolling. All functionality works at 200% browser zoom.

---

## 8. Product improvements

Reviewed against the approved architecture. Ordered by value-to-effort, with the schema impact noted — several of these must be decided before Phase 3, because retrofitting them into the data model is expensive.

### 8.1 Tier 1 — build in v1, high value, low cost

**1. Wishlist / Saved tiles**
Works without an account (local, then claimable on signup). Heart on every card. `/account/saved`.
*Why:* the lowest-friction commitment a guest can make, and the strongest re-engagement hook.
**Schema:** `saved_item(user_id?, anon_id, product_id, saved_at)`.

**2. Compare (2–4 tiles)**
Persistent tray, differences highlighted, identical rows collapsible.
*Why:* tile decisions are comparative by nature and no local competitor offers this.
**Schema:** none (URL state).

**3. Recently viewed**
Horizontal strip on the catalog and product pages, persists 30 days.
*Why:* tile buyers return 4–6 times before deciding. Losing their trail is the most common reason they restart from scratch.
**Schema:** `product_view(anon_id, product_id, viewed_at)` — also feeds recommendations and analytics.

**4. Quote Builder with room zones** *(approved in Phase 1, detailed here)*
Basket grouped by zone, per-zone quantity calculation, PDF export.
*Why:* turns a cart into a project document and gives the admin exactly what they need to quote.
**Schema:** `quote_request_zone` between request and items. **Must be in Phase 3.**

**5. Sample ordering**
Up to 3 free samples, address form, tracked in `/account/samples`.
*Why:* nobody specifies a tile they haven't touched. A sample request is the highest-intent signal on the site and currently has no digital path.
**Schema:** `sample_request`, `sample_request_item`. **Must be in Phase 3.**

**6. Smart recommendations**
Three distinct, labelled rails — never a generic "you may also like":
· *Complete the look* — trims, bullnose, mosaic, coordinating grout (curated relations)
· *Same look, different format* — visual-vector neighbours filtered to a different size
· *Same look, better price* — visual neighbours in a lower price tier
*Why:* the third one converts hesitant customers and the first one raises order value.
**Schema:** `product_relation(type, product_id, related_id, rank)` — already planned; the `type` enum needs these values.

**7. Stock alerts**
"Notify me when back in stock" — email/WhatsApp, one tap, no account.
**Schema:** `stock_alert(product_id, warehouse_id?, contact, channel, created_at, notified_at)`.

**8. Showroom visit booking**
Slot picker per showroom, optionally attached to a basket so the salesperson has the selection ready.
*Why:* in this market the showroom closes the sale. Bringing the digital selection into the physical visit is the whole point.
**Schema:** `showroom_booking(showroom_id, contact, slot, basket_snapshot)`.

### 8.2 Tier 2 — v1.1, high value, moderate cost

**9. Designer Projects / mood boards** *(journey §2.4)*
Multi-zone named projects, auto-extracted colour palette strip, shareable read-only client link with commenting, branded spec PDF export.
*Why:* this is the feature that makes interior designers adopt the platform rather than merely use it, and designers bring repeat, high-value volume.
**Schema:** `project`, `project_zone`, `project_item`, `project_share(token, permissions)`, `project_comment`. **Design the tables in Phase 3 even if built in 1.1** — the quote basket should be able to promote into a project without migration.

**10. AI Room Visualizer**
Upload a room photo → segment floor/wall planes → render the selected tile in perspective with correct scale and grout lines, using a diffusion-based inpainting model with geometric constraints.
*Why:* the single highest-impact feature for consumer conversion. Also the most likely to disappoint if done badly, which is why it's Tier 2 and not Tier 1 — it needs an accuracy bar and a "this is a visualisation, not a rendering" disclosure.
**Design requirements:** show the original alongside; allow plane correction by dragging; watermark output; never hide that it's generated.
**Schema:** `visualization(anon_id, source_image, product_id, result_image, created_at)` — also a strong marketing asset when users share results.

**11. Tile layout planner**
Choose a pattern (grid, brick, herringbone, chevron, modular), enter room dimensions, get a cut plan, cut count, and a more accurate wastage figure than a flat 10%.
*Why:* herringbone genuinely needs ~15% wastage and grid needs ~7%; a flat rate over- or under-orders on every job. This is a real utility no competitor offers, and it directly improves quote accuracy.
**Schema:** `layout_pattern` reference table; pattern + wastage stored on the quote item.

**12. Trade portal**
Approved trade accounts see tier pricing, extended credit terms, order history, downloadable spec packs, and a dedicated account manager contact.
**Schema:** `trade_account(company, tax_id, tier, status, approved_by)`, `price_tier`, `product_price(product_id, tier_id, price)`. **The pricing tables must exist in Phase 3** — bolting tiered pricing onto a single `price` column later is a painful migration.

**13. Comparison-aware search**
Natural-language search on the catalog itself ("something like Calacatta but cheaper and R11") using the same retrieval core, surfaced as a second mode in the search overlay.

**14. Print / PDF spec sheet per product**
Generated on demand, branded, with full specs, imagery, and a QR code back to the page.
*Why:* contractors and architects live in PDFs. This one artefact carries the brand into meetings we're not in.

### 8.3 Tier 3 — v1.2+, strategic

**15. Showroom mode** — tablet presentation view for the sales floor: no chrome, large type, swipeable collections, one-tap "send this selection to the customer's WhatsApp."
**16. Installer directory** — vetted installers by region, with the customer's tile selection attached to the enquiry.
**17. Order tracking** — once ERP is connected, quote → order → delivery status visible to the customer.
**18. Reorder / job history** — contractors reordering the same SKU for a phase-two build.
**19. AR preview** — WebXR floor placement on supported devices. Genuinely impressive, genuinely limited in support; worth doing only after the visualizer proves demand.
**20. Content hub** — care guides, installation guides, tile size guides. Pure SEO compounding value; each guide is an indexable landing page feeding the catalog.
**21. Waste calculator with offcut optimisation** — for large commercial jobs.
**22. Multi-currency with live rates** — relevant given the market; USD primary with a display toggle.

### 8.4 Analytics — what to instrument from day one

Not a feature, but a requirement that shapes the schema. Track: catalog filter combinations that return zero results (the clearest signal of a catalog gap), search queries with no results, tile-finder confidence distribution and thumbs feedback, assistant conversations that end without a product view (failed sessions), product view → basket → quote funnel per source, basket abandonment at the request form, sample request → quote conversion, and showroom booking attribution.

**The two most valuable reports:** *zero-result searches* tells Amin what to stock next, and *quote conversion by AI source* tells us whether the AI features are worth their cost. Both need event tables in Phase 3.

### 8.5 What I recommend against

- **Public reviews and ratings.** Low volume in this category, high moderation burden, and an empty or one-star review section damages a premium brand more than no reviews at all. Use project case studies instead.
- **A blog.** Guides yes, blog no. Blogs go stale and a stale blog signals a neglected company.
- **Live chat with a human.** WhatsApp already is that channel here, and it's where customers prefer to be.
- **Loyalty points / gamification.** Wrong register for a considered, infrequent, high-value purchase.
- **3D tile rotation viewers.** Tiles are flat. A 3D viewer of a flat object is effort spent proving we own a 3D library.

---

## 9. Design deliverables and handoff

Produced during Phase 0 implementation, from this blueprint:

| Deliverable | Contents |
|---|---|
| Token file | All colour, type, spacing, radius, shadow, motion tokens as CSS custom properties — single source of truth |
| Storybook | Every component, every state (rest/hover/focus/active/disabled/loading/error/empty), both locales, both directions, light + admin dark |
| Motion reference | Each animation as an isolated, playable story with its timing values visible |
| Icon set | Lucide subset + 9 custom brand icons, as an optimised sprite |
| Photography brief | Shot list, angles, lighting spec, and the room-scene requirements — **this needs to go to the client early**, since imagery is the biggest quality risk |
| Content template | Per-product copy structure, tone guide, EN/AR terminology glossary (tile vocabulary must be translated consistently or filters break) |
| Accessibility test plan | Per-page checklist, AT test matrix, axe integration |

---

## 10. Decisions I need from you before Phase 3

The blueprint proceeds either way, but these five change the database design, so they're cheapest to answer now.

1. **Trade pricing tiers** — how many, and are they per-customer or per-tier? *(Determines whether `product_price` is a two- or three-way relation.)*
2. **Designer Projects** — confirm as v1.1. If yes, I'll design the tables in Phase 3 so the basket can promote into a project without a migration.
3. **Samples** — are they free, limited, and shipped, or showroom-collect only? *(Changes whether we need an address and fulfilment status.)*
4. **Room Visualizer** — approve for v1.1? It's the biggest consumer conversion lever and the biggest risk of underwhelming; I'd rather commit or drop it than leave it ambiguous.
5. **Layout planner wastage** — do you want pattern-based wastage percentages, or is a flat rate per product acceptable? *(Pattern-based needs a reference table and changes the quote item shape.)*

Plus the three still outstanding from Phase 1 §11 that now block Phase 3 directly: **product data sample**, **SKU count**, and **number of showrooms/warehouses**.

---

## 11. Summary of design decisions of record

| # | Decision | Rationale |
|---|---|---|
| 1 | Three doors (look / room / photo) on every entry page | Users don't know whether they want to browse, match or describe |
| 2 | Spec mode toggle, persisted per session | One catalog serving consumers and trade without becoming two sites |
| 3 | Colour filter as swatches, not checkboxes | Nobody thinks in colour names |
| 4 | Load more, not infinite scroll | Back button, footer reachability, SEO |
| 5 | Calculator inline on the product page, never a modal | It's the anxiety-resolving moment; interrupting it is wrong |
| 6 | Lot warning surfaced in the buying flow | Prevents shade-mismatch returns; no competitor does it |
| 7 | Basket grouped by room zone | Turns a cart into a project document |
| 8 | Quote confirmation is a page, not a toast | The biggest moment on the public site |
| 9 | No 3D card tilt | Flat material shouldn't read as floating plastic |
| 10 | Shared-element card → page navigation | Preserves sense of place; feels more expensive than tilt ever would |
| 11 | Full-screen gallery is a route | Back button must close it |
| 12 | Specs never in an accordion | Trade users need Ctrl+F |
| 13 | Skeletons, never spinners, matched to final layout | Perceived performance |
| 14 | Tile finder low confidence is a designed state | Confidently wrong destroys trust faster than admitting uncertainty |
| 15 | Assistant claims always render as real product cards | Grounding made visible |
| 16 | Admin dashboard leads with "Needs you" | A dashboard routes attention; analytics is a destination |
| 17 | Ingestion review sorted confidence-ascending, keyboard-first | 400 products in 20 minutes, not 8 hours |
| 18 | Fields below 50% confidence are never pre-filled | A plausible wrong value gets accepted by pattern |
| 19 | Accounts optional, never blocking | Forced registration costs more leads than the data is worth |
| 20 | Admin on mobile is scoped, not full-featured | Pretending a 20-field form works on a phone helps nobody |

---

**Approve, amend, or push back — then Phase 3: Database Design.**
