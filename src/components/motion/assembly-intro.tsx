"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DIAMOND_LEFT_PATH,
  DIAMOND_LEFT_VEINING,
  DIAMOND_RIGHT_PATH,
  DIAMOND_RIGHT_VEINING,
  LOGO_VIEW_BOX,
  MOSAIC_CLIP_PATH,
  MOSAIC_TILES,
  tileFillVar,
} from "@/components/brand/logo-data";
import {
  buildFragments,
  easeInOutQuart,
  easeMaterial,
  pointAt,
  progressOf,
  T,
  type Fragment,
} from "@/components/motion/assembly-timeline";
import { MarbleSurface } from "@/components/brand/marble-surface";
import { cn } from "@/lib/utils";

/**
 * "Assembly" — the intro. docs/01-architecture.md §4.2, docs/02-ux-blueprint.md §5.2.
 *
 * All 38 fragments of the real mark — 36 mosaic tiles plus the two veined
 * triangle halves — fly in from scattered off-screen origins along
 * individual quadratic beziers, tiles trailing tapering cyan light trails;
 * the centre seats first and "clicks"; a shine sweeps the 45° brand axis;
 * the wordmark wipes in along the same axis; the lock-up holds for a beat,
 * then FLIPS — physically travels and scales, at full opacity — into the
 * navbar's logo slot, where the real navbar mark is revealed beneath it in
 * the same frame, pixel-aligned. The mark never disappears; it comes to
 * rest as the permanent site logo. Only then does the overlay unmount and
 * scroll unlock.
 *
 * ONE rAF CLOCK drives everything, and every phase renders as a pure
 * function of `t` — which is what makes skip a CLOCK JUMP (docs §5.2:
 * "pressing skip jumps the timeline to [flipStart] and plays only the Flip
 * handoff over 400ms") instead of a fade past a blank frame.
 *
 * Fragment transforms are composed into a single SVG `transform` ATTRIBUTE
 * (translate → rotate-about-pivot → scale-about-pivot). Never split across
 * the attribute and CSS `style.transform`: in SVG2 they are the same
 * property and the CSS declaration silently overrides the attribute, which
 * is exactly the bug that froze the flight paths in the previous version.
 *
 * WHETHER IT PLAYS AT ALL is not decided here — `IntroGate` settles that
 * before first paint and stamps `data-intro` on <html> (once per session,
 * homepage route only, reduced-motion/saveData/2g/low-memory → the logo
 * simply appears already docked). This component only reads the stamp.
 */

const SKIP_UNTIL_KEY = "ac_intro_skip_until";
const SKIP_REMEMBER_DAYS = 30;
const SKIP_FLIP_MS = 400;

const MAX_DPR = 2;
/** Below this viewport width, half the tiles fade in at rest instead of flying (mobile fragment reduction). */
const REDUCED_BELOW_PX = 768;

/** viewBox "80 85 240 150" — parsed once so the canvas can map user units to pixels. */
const [VB_X, VB_Y, VB_W, VB_H] = LOGO_VIEW_BOX.split(" ").map(Number) as [
  number,
  number,
  number,
  number,
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Review aid: `?introSpeed=0.25` runs the sequence at quarter speed so it
 * can actually be watched and judged — a 5s animation is otherwise
 * impossible to inspect frame by frame, on a phone or in a test harness.
 * Only honoured alongside `?intro=1` (the forced-replay flag), so it can
 * never affect a real visitor, and clamped to a sane range.
 */
function clockScale(): number {
  const params = new URLSearchParams(window.location.search);
  if (params.get("intro") !== "1") return 1;
  const raw = Number(params.get("introSpeed"));
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(1, Math.max(0.1, raw));
}

export function AssemblyIntro({ skipLabel }: { skipLabel: string }) {
  // Rendered into the server HTML unconditionally; globals.css keeps it
  // `display: none` unless IntroGate stamped `data-intro="playing"` before
  // first paint. React state never decides first-frame visibility — it
  // arrives after paint, which is too late.
  const [visible, setVisible] = useState(true);
  const [closing, setClosing] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const lockupRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mosaicRef = useRef<SVGGElement>(null);
  const shineRef = useRef<SVGRectElement>(null);
  const wordmarkRef = useRef<HTMLParagraphElement>(null);
  const skipButtonRef = useRef<HTMLButtonElement>(null);
  const bloomRef = useRef<SVGSVGElement>(null);
  /** Index-aligned with the fragments array: rects 0–35, halves 36–37. */
  const fragmentNodeRefs = useRef<(SVGGraphicsElement | null)[]>([]);

  const fragmentsRef = useRef<readonly Fragment[]>([]);
  const trailsRef = useRef<{ x: number; y: number }[][]>([]);
  const trailLengthRef = useRef(22);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  /** Set by skip: next frame teleports the clock to flipStart. */
  const jumpRef = useRef(false);
  const flipDurationRef = useRef<number>(T.flipEnd - T.flipStart);
  const handoffFiredRef = useRef(false);
  const dockedRef = useRef(false);
  const doneRef = useRef(false);

  const [playing, setPlaying] = useState(false);

  /**
   * Skip — docs §5.2: jump the clock to flipStart and play only the flip,
   * compressed to 400ms. The visitor still watches the mark arrive in the
   * navbar; there is never a cut to a blank frame. Idempotent once the
   * flip has begun.
   */
  const skip = useCallback(() => {
    window.localStorage.setItem(
      SKIP_UNTIL_KEY,
      String(Date.now() + SKIP_REMEMBER_DAYS * 24 * 60 * 60 * 1000),
    );
    jumpRef.current = true;
  }, []);

  // Arm only when the pre-paint gate said "playing".
  useEffect(() => {
    if (document.documentElement.getAttribute("data-intro") !== "playing") {
      setVisible(false);
      return;
    }
    const reduced = window.innerWidth < REDUCED_BELOW_PX;
    fragmentsRef.current = buildFragments(reduced);
    trailsRef.current = fragmentsRef.current.map(() => []);
    trailLengthRef.current = reduced ? 12 : 22;
    setPlaying(true);
  }, []);

  // Scroll locked while the overlay is up — docs §4.2: "Overlay unmounts.
  // Scroll unlocks."
  //
  // `visible` is in the dep list, not just `playing`: rendering `null` does
  // NOT unmount this component, so relying on unmount cleanup would leave
  // the body scroll-locked for the rest of the visit.
  useEffect(() => {
    if (!playing || !visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [playing, visible]);

  useEffect(() => {
    if (!playing) return;

    const svgEl = svgRef.current;
    const canvasEl = canvasRef.current;
    const lockupEl = lockupRef.current;
    const rootEl = rootRef.current;
    if (!svgEl || !canvasEl || !lockupEl || !rootEl) return;

    // Non-null aliases: the rAF/resize closures outlive the narrowing above.
    const svg: SVGSVGElement = svgEl;
    const canvas: HTMLCanvasElement = canvasEl;
    const lockup: HTMLDivElement = lockupEl;
    const root: HTMLDivElement = rootEl;

    const ctx = canvas.getContext("2d");
    const fragments = fragmentsRef.current;
    const trails = trailsRef.current;
    const trailLength = trailLengthRef.current;

    // Trail colour comes from the token layer — canvas has no class names,
    // so the value is read off the document once.
    const trailColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-cyan-400")
      .trim();

    let scale = 1;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    function sizeCanvas() {
      const rect = svg.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${String(rect.width)}px`;
      canvas.style.height = `${String(rect.height)}px`;
      scale = rect.width / VB_W;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);

    // Promote only for the duration; released in cleanup (docs §4.2).
    lockup.style.willChange = "transform";

    // Scale the lock-up about the MARK's centre, not the lock-up's own.
    // The lock-up is taller than the mark (the wordmark sits below it), so
    // its default 50% 50% origin is ~26px lower — and since the flip's
    // translate is measured from the mark's centre, scaling about anything
    // else lands the mark low by (1 - finalScale) × that offset. This is
    // exactly the 27.5px vertical miss the first measured run showed.
    {
      const l = lockup.getBoundingClientRect();
      const m = svg.getBoundingClientRect();
      lockup.style.transformOrigin = `${String(m.left + m.width / 2 - l.left)}px ${String(m.top + m.height / 2 - l.top)}px`;
    }

    // Measured FLIP target: the real navbar mark's reserved box. Its box is
    // live from t=0 (held at opacity 0, never display:none), so the handoff
    // cannot disagree with where the logo actually is → CLS 0.
    function measureFlipTarget(): { dx: number; dy: number; scale: number } | null {
      const dest = document.querySelector("#site-logo-mark");
      if (!dest) return null;
      const from = svg.getBoundingClientRect();
      const to = dest.getBoundingClientRect();
      if (from.width === 0 || to.width === 0) return null;
      return {
        dx: to.left + to.width / 2 - (from.left + from.width / 2),
        dy: to.top + to.height / 2 - (from.top + from.height / 2),
        scale: to.width / from.width,
      };
    }
    const target = measureFlipTarget();

    /** Composed SVG transform attribute — see the header note on why never CSS. */
    function fragmentTransform(f: Fragment, t: number): string {
      const p = progressOf(f, t);
      const pos = pointAt(f, p);
      const dx = pos.x - f.x;
      const dy = pos.y - f.y;
      const rot = f.startRotation * (1 - p);
      const s = 0.85 + 0.15 * p;
      // Pivot is expressed in the pre-translate frame, so rotate/scale act
      // about the fragment's own CURRENT centre as it travels.
      return (
        `translate(${String(dx)} ${String(dy)}) ` +
        `rotate(${String(rot)} ${String(f.pivotX)} ${String(f.pivotY)}) ` +
        `translate(${String(f.pivotX)} ${String(f.pivotY)}) scale(${String(s)}) ` +
        `translate(${String(-f.pivotX)} ${String(-f.pivotY)})`
      );
    }

    const timeScale = clockScale();

    function frame(now: number) {
      startedAtRef.current ??= now;

      // Skip: teleport the clock to flipStart with the compressed duration.
      if (jumpRef.current) {
        jumpRef.current = false;
        if ((now - startedAtRef.current) * timeScale < T.flipStart) {
          startedAtRef.current = now - T.flipStart / timeScale;
          flipDurationRef.current = SKIP_FLIP_MS;
        }
      }

      const t = (now - startedAtRef.current) * timeScale;
      const flipDuration = flipDurationRef.current;
      const flipEndAt = T.flipStart + flipDuration;
      const endAt = flipEndAt + (T.end - T.flipEnd);

      // ── Fragments (36 tiles + 2 halves) ────────────────────────────
      for (let i = 0; i < fragments.length; i++) {
        const f = fragments[i];
        const node = fragmentNodeRefs.current[i];
        if (!f || !node) continue;

        if (f.fly) {
          const p = progressOf(f, t);
          node.setAttribute("transform", fragmentTransform(f, t));
          node.style.opacity = p > 0 ? "1" : "0";

          if (f.trail) {
            const history = trails[i];
            if (history) {
              if (p > 0 && p < 1) {
                const pos = pointAt(f, p);
                history.push({
                  x: f.pivotX + (pos.x - f.x),
                  y: f.pivotY + (pos.y - f.y),
                });
                if (history.length > trailLength) history.shift();
              } else if (history.length > 0) {
                history.shift();
              }
            }
          }
        } else {
          // Mobile-reduced fragment: fades in AT REST on its arrival beat.
          const arrival = f.delay + f.duration;
          node.style.opacity = String(clamp01((t - (arrival - 300)) / 300));
        }
      }

      // ── The click — centre mosaic seats: 1.0 → 1.03 → 1.0 ─────────
      if (mosaicRef.current) {
        const since = t - T.click;
        const pulse =
          since >= 0 && since < 160 ? Math.sin((since / 160) * Math.PI) * 0.03 : 0;
        mosaicRef.current.setAttribute(
          "transform",
          `translate(200 161) scale(${String(1 + pulse)}) translate(-200 -161)`,
        );
      }

      // ── Bloom: the surface ignites as the mark completes ───────────
      // Ramps from a dim ground during flight to full just as the last
      // fragments seat, so the finished logo reads as the thing that lit
      // the room. Decays gently through the hold.
      if (bloomRef.current) {
        const rise = easeMaterial(clamp01((t - (T.fragmentsSeated - 700)) / 700));
        const settle = 1 - 0.25 * clamp01((t - T.shineEnd) / 600);
        bloomRef.current.style.opacity = String((0.25 + 0.75 * rise) * settle);
      }

      // ── Shine — 45° band, masked to the diamond ────────────────────
      if (shineRef.current) {
        if (t >= T.shineStart && t <= T.shineEnd) {
          const sp = easeInOutQuart(
            (t - T.shineStart) / (T.shineEnd - T.shineStart),
          );
          shineRef.current.style.opacity = "1";
          shineRef.current.setAttribute("x", String(VB_X - VB_W + sp * VB_W * 2.1));
        } else {
          shineRef.current.style.opacity = "0";
        }
      }

      // ── Wordmark: wipe in along the 45° axis; fades during the flip
      //    (the navbar sets its own wordmark in real type) ─────────────
      if (wordmarkRef.current) {
        const wp = easeInOutQuart(
          clamp01((t - T.wordmarkStart) / (T.wordmarkEnd - T.wordmarkStart)),
        );
        wordmarkRef.current.style.clipPath = `inset(0 ${String((1 - wp) * 100)}% 0 0)`;
        wordmarkRef.current.style.opacity = String(
          1 - clamp01((t - T.flipStart) / Math.min(300, flipDuration)),
        );
      }

      // ── Hold (holdStart→flipStart: the finished mark stands still),
      //    then the FLIP: travel and scale into the navbar slot at FULL
      //    OPACITY. The mark does not fade — it lands. ─────────────────
      if (t >= T.flipStart && target) {
        if (!handoffFiredRef.current) {
          handoffFiredRef.current = true;
          // The opaque ground dissolves (globals.css transition), revealing
          // the live page beneath while the mark keeps flying above it —
          // and the hero starts its rise (docs §4.2 t=3.9: "Simultaneously
          // the hero content beneath cross-fades up").
          root.classList.add("intro-docking");
          window.dispatchEvent(new CustomEvent("ac:intro-handoff"));
        }
        // `ease-in-out-quart`, not the house material curve: the descent
        // should leave slowly and arrive slowly. `ease-material` is
        // front-loaded — it lurches off the mark and coasts, which reads as
        // a snap. Easing both ends makes it a considered descent.
        const fp = easeInOutQuart(clamp01((t - T.flipStart) / flipDuration));
        const s = 1 + (target.scale - 1) * fp;
        lockup.style.transform = `translate(${String(target.dx * fp)}px, ${String(target.dy * fp)}px) scale(${String(s)})`;

        // Landed: reveal the real navbar mark BENEATH the pixel-aligned
        // intro mark, same frame. The swap is invisible — the logo simply
        // is now the navbar's.
        if (fp >= 1 && !dockedRef.current) {
          dockedRef.current = true;
          // Measured one frame BEFORE the stamp: flipping `data-intro` to
          // "done" drops the overlay to `display: none` via CSS, after
          // which the intro mark has no box left to compare. Exposed only
          // when the review flag is on.
          if (new URLSearchParams(window.location.search).get("intro") === "1") {
            const dest = document.querySelector("#site-logo-mark");
            if (dest) {
              const a = svg.getBoundingClientRect();
              const b = dest.getBoundingClientRect();
              (window as unknown as Record<string, unknown>).__acDockAlignment = {
                introCentre: [a.left + a.width / 2, a.top + a.height / 2],
                navCentre: [b.left + b.width / 2, b.top + b.height / 2],
                dxPx: a.left + a.width / 2 - (b.left + b.width / 2),
                dyPx: a.top + a.height / 2 - (b.top + b.height / 2),
                introW: a.width,
                navW: b.width,
              };
            }
          }
          document.documentElement.setAttribute("data-intro", "done");
        }
      }

      // No-target fallback (navbar mark missing — should never happen):
      // never trap the visitor; hand the page over with the plain fade.
      if (!target && t >= T.holdEnd && !doneRef.current) {
        doneRef.current = true;
        document.documentElement.setAttribute("data-intro", "done");
        setClosing(true);
        window.setTimeout(() => {
          setVisible(false);
        }, 340);
        return;
      }

      // ── Trails — one canvas, one pass per frame, additive ──────────
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        for (const history of trails) {
          if (history.length < 2) continue;
          for (let j = 1; j < history.length; j++) {
            const a = history[j - 1];
            const b = history[j];
            if (!a || !b) continue;
            const fade = j / history.length;
            ctx.globalAlpha = fade * 0.62;
            ctx.strokeStyle = trailColor;
            ctx.lineWidth = fade * 3.8;
            ctx.beginPath();
            ctx.moveTo((a.x - VB_X) * scale, (a.y - VB_Y) * scale);
            ctx.lineTo((b.x - VB_X) * scale, (b.y - VB_Y) * scale);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      if (target && t >= endAt) {
        // Docked and buffered — the navbar mark is already showing beneath.
        // Unmounting cleans up scroll lock and listeners via effect cleanup.
        doneRef.current = true;
        setVisible(false);
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", sizeCanvas);
      lockup.style.willChange = "";
    };
  }, [playing]);

  // Focus the skip control once mounted. NOT via the `autoFocus` prop:
  // React does not emit `autofocus` in server HTML, so the prop is a
  // guaranteed hydration mismatch on an SSR'd component.
  useEffect(() => {
    if (!playing) return;
    skipButtonRef.current?.focus();
  }, [playing]);

  // Escape and Enter both skip (docs §5.2).
  useEffect(() => {
    if (!playing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        skip();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [playing, skip]);

  if (!visible) return null;

  return (
    <div
      id="assembly-intro"
      ref={rootRef}
      role="presentation"
      className={cn(
        // `inset-0`, NOT `inset-inline-0` + top/bottom: Tailwind generates
        // no rule for `inset-inline-0`, so the fixed element collapsed to
        // its content width (480px) and the overlay only covered the left
        // of the screen — the mark stranded in a white strip with the hero
        // showing through beside it. `inset-0` is symmetric, so it is
        // direction-neutral and the logical-property rule is satisfied.
        //
        // `display` is owned by globals.css keyed to <html data-intro>, so
        // the correct state paints on frame one — no `flex` class here, it
        // would override that and show the overlay to everyone.
        "fixed inset-0 z-[100] items-center justify-center bg-navy-950",
        closing && "opacity-0",
      )}
    >
      {/* Ground. White read as unfinished — "dead". The mark now assembles
          on the SAME navy marble the hero uses, which does two things: it
          is the material the company actually sells, and it makes the
          docking a continuous space rather than a cut, because the surface
          revealed beneath the overlay is the same surface. On top of it a
          cyan bloom behind the mark separates the navy half from the navy
          ground and gives the assembly something to catch light against. */}
      <div
        className="intro-ground pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <MarbleSurface className="absolute inset-0" seed={3} veinOpacity={0.6} />
        {/* The bloom is driven per-frame: near-dark while fragments are still
            in flight, then swelling as the mark seats so the completed logo
            appears to ignite the surface behind it. */}
        <svg
          ref={bloomRef}
          className="absolute inset-0 size-full"
          preserveAspectRatio="xMidYMid slice"
          viewBox="0 0 1200 800"
          style={{ opacity: 0.25 }}
        >
          <defs>
            {/* Tight, not diffuse. The mark's left half is navy-700 on a
                navy ground — without a real pool of light behind it that
                half disappears. This lifts the centre enough to separate
                it, and doubles as the glow the assembly catches. */}
            <radialGradient id="intro-bloom" cx="50%" cy="50%" r="30%">
              <stop
                offset="0%"
                stopColor="var(--color-cyan-300)"
                stopOpacity="0.5"
              />
              <stop
                offset="45%"
                stopColor="var(--color-cyan-400)"
                stopOpacity="0.2"
              />
              <stop
                offset="100%"
                stopColor="var(--color-cyan-400)"
                stopOpacity="0"
              />
            </radialGradient>
            <radialGradient id="intro-edge" cx="50%" cy="50%" r="72%">
              <stop
                offset="45%"
                stopColor="var(--color-navy-950)"
                stopOpacity="0"
              />
              <stop
                offset="100%"
                stopColor="var(--color-navy-950)"
                stopOpacity="0.85"
              />
            </radialGradient>
          </defs>
          <rect width="1200" height="800" fill="url(#intro-bloom)" />
          <rect width="1200" height="800" fill="url(#intro-edge)" />
        </svg>
      </div>

      <button
        ref={skipButtonRef}
        type="button"
        onClick={skip}
        // Visible from frame one per docs §5.2 ("available from frame one,
        // never hidden"); focused by the effect above, not `autoFocus`.
        // eslint-disable-next-line amin/no-cyan-text -- on navy-950: 14.9:1, far past AA
        className="absolute end-6 bottom-6 z-10 rounded-md px-4 py-2 text-body-sm tracking-[0.2em] text-cyan-100/70 uppercase transition-surface duration-instant hover:text-cyan-100"
      >
        {skipLabel}
      </button>

      <div ref={lockupRef} className="relative flex flex-col items-center">
        <div
          // The mark and the wordmark below it are sized as ONE lock-up:
          // this width and the wordmark's `clamp()` are tuned against each
          // other, so changing one without the other breaks the
          // proportion. Both scale on vw, so the relationship holds from
          // phone to desktop.
          className="relative w-[min(84vw,40rem)]"
          style={{ aspectRatio: `${String(VB_W)} / ${String(VB_H)}` }}
        >
          <svg
            ref={svgRef}
            viewBox={LOGO_VIEW_BOX}
            className="absolute inset-0 size-full overflow-visible"
          >
            <defs>
              <clipPath id="intro-clip-left">
                <path d={DIAMOND_LEFT_PATH} />
              </clipPath>
              <clipPath id="intro-clip-right">
                <path d={DIAMOND_RIGHT_PATH} />
              </clipPath>
              <clipPath id="intro-clip-mosaic">
                <path d={MOSAIC_CLIP_PATH} />
              </clipPath>
              <linearGradient id="intro-shine" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--color-white)" stopOpacity="0" />
                <stop
                  offset="42%"
                  stopColor="var(--color-cyan-100)"
                  stopOpacity="0.55"
                />
                <stop offset="50%" stopColor="var(--color-white)" stopOpacity="1" />
                <stop
                  offset="58%"
                  stopColor="var(--color-cyan-100)"
                  stopOpacity="0.55"
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-white)"
                  stopOpacity="0"
                />
              </linearGradient>
              <clipPath id="intro-clip-mark">
                <path d={DIAMOND_LEFT_PATH} />
                <path d={DIAMOND_RIGHT_PATH} />
              </clipPath>
            </defs>

            {/* Halves — fragments 36 and 37, beneath the mosaic. */}
            <g
              ref={(el) => {
                fragmentNodeRefs.current[36] = el;
              }}
              style={{ opacity: 0 }}
            >
              <path d={DIAMOND_LEFT_PATH} className="fill-navy-700" />
              <g
                clipPath="url(#intro-clip-left)"
                className="stroke-white"
                strokeWidth={0.6}
                strokeLinecap="round"
                fill="none"
                opacity={0.22}
              >
                {DIAMOND_LEFT_VEINING.map((d) => (
                  <path key={d} d={d} />
                ))}
              </g>
            </g>

            <g
              ref={(el) => {
                fragmentNodeRefs.current[37] = el;
              }}
              style={{ opacity: 0 }}
            >
              <path d={DIAMOND_RIGHT_PATH} className="fill-cyan-400" />
              <g
                clipPath="url(#intro-clip-right)"
                className="stroke-white"
                strokeWidth={0.6}
                strokeLinecap="round"
                fill="none"
                opacity={0.28}
              >
                {DIAMOND_RIGHT_VEINING.map((d) => (
                  <path key={d} d={d} />
                ))}
              </g>
            </g>

            <g ref={mosaicRef} clipPath="url(#intro-clip-mosaic)">
              {MOSAIC_TILES.map((tile, i) => (
                <rect
                  key={tile.id}
                  ref={(el) => {
                    fragmentNodeRefs.current[i] = el;
                  }}
                  x={tile.x}
                  y={tile.y}
                  width={tile.size}
                  height={tile.size}
                  style={{ fill: tileFillVar(tile.fill), opacity: 0 }}
                />
              ))}
            </g>

            <rect
              ref={shineRef}
              x={VB_X}
              y={VB_Y - VB_H}
              width={VB_W * 0.55}
              height={VB_H * 3}
              fill="url(#intro-shine)"
              clipPath="url(#intro-clip-mark)"
              transform={`rotate(45 ${String(VB_X + VB_W / 2)} ${String(VB_Y + VB_H / 2)})`}
              style={{ opacity: 0 }}
            />
          </svg>

          {/* Trails ride above the mark — one canvas, one draw call per frame. */}
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 size-full"
          />
        </div>

        {/* Wordmark: set in the display face at a size that sits UNDER the
            mark rather than competing with it, with the wide tracking the
            printed lock-up uses. `ps-[0.34em]` offsets the trailing letter-
            space so the text is optically centred, not mechanically so. */}
        <p
          ref={wordmarkRef}
          // Scales with the mark: `clamp` ties it to viewport width so the
          // lock-up holds its proportions from phone to desktop instead of
          // the wordmark shrinking away under a large diamond.
          className="mt-9 ps-[0.34em] font-display text-[clamp(1.5rem,4.4vw,2.9rem)] leading-none tracking-[0.34em] whitespace-nowrap text-white uppercase"
          style={{ clipPath: "inset(0 100% 0 0)" }}
        >
          Amin Ceramic
        </p>
      </div>
    </div>
  );
}
