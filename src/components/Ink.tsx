"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/*
 * Ink: the only way anything appears on or leaves the page.
 *
 * Each block of type sits behind its own SVG filter. Coming in, blots of ink
 * soak through the paper in a noise pattern while the strokes are still wet
 * (displaced and soft), then settle into crisp letters. Going out, the same
 * in reverse: the ink sinks back into the paper. When the ink is dry the
 * filter is removed, so a still page costs nothing to draw.
 *
 *   <Ink k={item.id} order={2}>…</Ink>
 *
 * `k` is the content's identity: change it and the block re-inks (out with
 * the old, in with the new). `order` staggers blocks on a page, top to bottom.
 * `lag` holds the old ink a while before it sinks, so blocks that change
 * together turn one after another and the page is never blank.
 * Inside a leaving <InkStage>, every block bleeds out.
 */

export const IN_MS = 3000;
export const OUT_MS = 1500;
export const STAGGER_MS = 180;

/** True while the page is leaving: every Ink on it bleeds out. */
export const InkStage = createContext(false);

/*
 * How the ink behaves. A design picks one for its whole page.
 *  blots:   the original. Blots of ink soak through in a noise pattern.
 *  seep:    many small wet points spread and join, pale at first, then dark.
 *  write:   each line writes itself, left to right, in reading order.
 *  develop: for photographs. The shadows come up first, like a print in the tray.
 */
export type InkMode = "blots" | "seep" | "write" | "develop";
export const InkModeContext = createContext<InkMode>("blots");

type Tune = {
  freq: number;
  octaves: number;
  disp: number;
  blur: number;
  slope: number;
  fade: number; // how pale the ink starts (0: no fade)
  inMs: number;
  outMs: number;
};

const TUNE: Record<InkMode, Tune> = {
  blots: {
    freq: 0.011,
    octaves: 4,
    disp: 26,
    blur: 2.6,
    slope: 9,
    fade: 0,
    inMs: IN_MS,
    outMs: OUT_MS,
  },
  seep: {
    freq: 0.022,
    octaves: 3,
    disp: 7,
    blur: 1.4,
    slope: 5,
    fade: 0.75,
    inMs: 5200,
    outMs: 2400,
  },
  write: { freq: 0.03, octaves: 2, disp: 3, blur: 0.9, slope: 5, fade: 0.55, inMs: 0, outMs: 2200 },
  develop: {
    freq: 0.004,
    octaves: 2,
    disp: 0,
    blur: 0,
    slope: 2.2,
    fade: 0,
    inMs: 6500,
    outMs: 2600,
  },
};

/** The longest any ink takes to sink out: a page turn waits this long. */
export const OUT_MS_MAX = Math.max(...Object.values(TUNE).map((t) => t.outMs));

/** Pixels of line a hand writes per second, at 1080p. */
const WRITE_PX_PER_S = 1100;
const WRITE_EDGE = 140;

type Props = {
  k?: string | number;
  order?: number;
  mode?: InkMode;
  /** Milliseconds to hold the old ink before it sinks, when `k` changes. */
  lag?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

// Slow to start, slow to settle: the ink spreads, then dries.
const easeInOut = (x: number) => (1 - Math.cos(Math.PI * x)) / 2;
const easeIn = (x: number) => x ** 2;

/*
 * The TV's chip can't redraw an SVG noise filter sixty times a second, so in
 * the TV app (an Android WebView) ink arrives in a lighter hand: the type
 * comes up out of a soft blur, which the GPU draws on its own. ?ink=light
 * previews it anywhere; ?ink=full forces the full ink.
 */
let light: boolean | null = null;
function lightHand() {
  if (light === null) {
    const asked = new URLSearchParams(window.location.search).get("ink");
    light = asked ? asked === "light" : /; wv\)/.test(navigator.userAgent);
  }
  return light;
}
const LIGHT_BLUR_REM = 0.9;
const LIGHT_OUT_MS = 1500;

/** How long a turning page takes to sink out, in this hand. */
export function leaveMs() {
  return (lightHand() ? LIGHT_OUT_MS : OUT_MS_MAX) + STAGGER_MS * 3;
}

function prefersStill() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function Ink({
  k = "",
  order = 0,
  mode: asked,
  lag = 0,
  className,
  style,
  children,
}: Props) {
  const leaving = useContext(InkStage);
  const designMode = useContext(InkModeContext);
  const mode = asked ?? designMode;
  const tune = TUNE[mode];
  const fid = `ink-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const box = useRef<HTMLDivElement>(null);
  const disp = useRef<SVGFEDisplacementMapElement>(null);
  const blur = useRef<SVGFEGaussianBlurElement>(null);
  const alpha = useRef<SVGFEFuncAElement>(null);
  const fade = useRef<SVGFEFuncAElement>(null);
  const dev = useRef<SVGFEFuncAElement>(null);
  const wash = useRef<SVGFEFuncAElement>(null);
  const frame = useRef(0);
  const timer = useRef(0);
  const firstIn = useRef(true);

  // What's on the paper now. When `k` changes, the old content stays until
  // its ink has sunk; then the new content takes its place.
  const [shown, setShown] = useState({ k, children });
  const current = shown.k === k;
  if (current && shown.children !== children) setShown({ k, children });
  // Each inking gets its own pattern of blots, the same on server and TV.
  const seed = hash(`${fid}:${shown.k}`) % 1000;

  // p = 0: no ink on the paper. p = 1: dry, crisp type.
  function paint(p: number) {
    const q = 1 - p;
    if (mode === "develop") {
      // alpha = s(1 - lum) + (s + 1)p - s: shadows first, highlights last.
      const s = tune.slope;
      dev.current?.setAttribute("intercept", ((s + 1) * p - s).toFixed(3));
      return;
    }
    disp.current?.setAttribute("scale", (tune.disp * q * q).toFixed(2));
    blur.current?.setAttribute("stdDeviation", (tune.blur * q).toFixed(2));
    const intercept = mode === "blots" ? -7.5 * q : -tune.slope * 0.85 * q + p;
    alpha.current?.setAttribute("intercept", intercept.toFixed(3));
    fade.current?.setAttribute("slope", (1 - tune.fade * q * q).toFixed(3));
    // A pale wash of the whole passage runs ahead of the ink, then dries away.
    wash.current?.setAttribute("slope", (0.32 * q * Math.min(1, p * 5)).toFixed(3));
  }

  // Write: a soft-edged mask sweeps each line box in reading order.
  function writeIn(el: HTMLDivElement, delay: number, done?: () => void): void {
    const box = el.getBoundingClientRect();
    // One box per line of text, in reading order (text nodes only, so the
    // boxes of the elements around them don't swallow the lines).
    const range = document.createRange();
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent?.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width > 2 && r.height > 2)
          rects.push({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height });
      }
    }
    // Merge fragments on the same line (spans inside one line).
    const lines: typeof rects = [];
    for (const r of rects) {
      const last = lines.at(-1);
      if (last && Math.abs(last.y + last.h / 2 - (r.y + r.h / 2)) < Math.min(last.h, r.h) / 2) {
        const x = Math.min(last.x, r.x);
        last.w = Math.max(last.x + last.w, r.x + r.w) - x;
        last.x = x;
        last.y = Math.min(last.y, r.y);
        last.h = Math.max(last.h, r.h);
      } else lines.push({ ...r });
    }
    if (!lines.length) return play("in", delay, done, "seep");
    const scale = window.innerHeight / 1080;
    const pxPerMs = (WRITE_PX_PER_S * scale) / 1000;
    const edge = WRITE_EDGE * scale;
    const spans = lines.map((l) => (l.w + edge) / pxPerMs);
    const total = spans.reduce((a, b) => a + b, 0);
    const pad = 6 * scale;
    el.style.maskRepeat = "no-repeat";
    el.style.maskSize = lines.map((l) => `${l.w + edge * 2}px ${l.h + pad * 2}px`).join(",");
    const frameAt = (elapsed: number) => {
      let t = elapsed;
      const imgs: string[] = [];
      const pos: string[] = [];
      lines.forEach((l, i) => {
        const x = Math.min(Math.max(t / spans[i], 0), 1);
        t -= spans[i];
        // The gradient's ink edge travels from the line's start to past its end.
        const head = edge + x * (l.w + edge);
        imgs.push(
          `linear-gradient(to right, #000 ${Math.max(head - edge, 0).toFixed(1)}px, transparent ${head.toFixed(1)}px)`,
        );
        pos.push(`${(l.x - edge).toFixed(1)}px ${(l.y - pad).toFixed(1)}px`);
      });
      el.style.maskImage = imgs.join(",");
      el.style.maskPosition = pos.join(",");
    };
    el.style.opacity = "1";
    el.style.filter = `url(#${fid})`;
    frameAt(0);
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const elapsed = Math.max(now - start, 0);
      frameAt(elapsed);
      // The wet look dries over the whole writing.
      paint(Math.min(0.55 + (0.45 * elapsed) / total, 1));
      if (elapsed < total) {
        frame.current = requestAnimationFrame(tick);
        return;
      }
      el.style.maskImage = "";
      el.style.maskPosition = "";
      el.style.maskSize = "";
      el.style.filter = "none";
      done?.();
    };
    frame.current = requestAnimationFrame(tick);
  }

  function play(dir: "in" | "out", delay: number, done?: () => void, as?: InkMode): void {
    const el = box.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    window.clearTimeout(timer.current);
    if (dir === "in" && mode === "write" && !as && !prefersStill() && !lightHand())
      return writeIn(el, delay, done);

    if (lightHand() && !prefersStill()) {
      const ms = dir === "in" ? 2400 : Math.min(tune.outMs, LIGHT_OUT_MS);
      const blurred = `blur(${LIGHT_BLUR_REM}rem)`;
      el.style.willChange = "opacity, filter";
      if (dir === "in") {
        // Start from nothing, with no transition, then let the GPU bring it up.
        el.style.transition = "none";
        el.style.opacity = "0";
        el.style.filter = blurred;
        void el.offsetWidth;
      }
      el.style.transition = `opacity ${ms}ms ease-in-out ${delay}ms, filter ${ms}ms ease-out ${delay}ms`;
      el.style.opacity = dir === "in" ? "1" : "0";
      el.style.filter = dir === "in" ? "blur(0)" : blurred;
      timer.current = window.setTimeout(() => {
        // Dry: nothing left for the compositor to hold on to.
        el.style.transition = "none";
        if (dir === "in") el.style.filter = "none";
        el.style.willChange = "";
        done?.();
      }, delay + ms);
      return;
    }

    if (prefersStill()) {
      el.style.filter = "none";
      el.style.transition = `opacity ${dir === "in" ? 900 : 500}ms ease`;
      el.style.transitionDelay = `${delay}ms`;
      el.style.opacity = dir === "in" ? "1" : "0";
      window.setTimeout(() => done?.(), delay + (dir === "in" ? 900 : 500));
      return;
    }

    el.style.opacity = "1";
    el.style.filter = `url(#${fid})`;
    const duration = dir === "in" ? tune.inMs || 4200 : tune.outMs;
    const start = performance.now() + delay;
    const tick = (t: number) => {
      const x = Math.min(Math.max((t - start) / duration, 0), 1);
      paint(dir === "in" ? easeInOut(x) : 1 - easeIn(x));
      if (x < 1) {
        frame.current = requestAnimationFrame(tick);
        return;
      }
      // Dry ink needs no filter. Sunk ink stays hidden until the next inking.
      if (dir === "in") el.style.filter = "none";
      else el.style.opacity = "0";
      done?.();
    };
    frame.current = requestAnimationFrame(tick);
  }

  // Ink in on arrival, and again whenever new content takes the page.
  useEffect(() => {
    const delay = firstIn.current ? order * STAGGER_MS : 0;
    firstIn.current = false;
    play("in", delay);
    return () => {
      cancelAnimationFrame(frame.current);
      window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.k]);

  // New identity: sink the old ink, then swap. If the identity comes back
  // before the old ink has sunk, ink it straight back in.
  const settledK = useRef(true);
  useEffect(() => {
    if (current) {
      if (!settledK.current) play("in", 0);
      settledK.current = true;
      return;
    }
    settledK.current = false;
    play("out", lag, () => setShown((s) => ({ k, children: s.children })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  // The whole page is leaving.
  const wasLeaving = useRef(false);
  useEffect(() => {
    if (leaving) play("out", order * STAGGER_MS * 0.4);
    // A turn called off midway (→ then ←): the page stays, so ink it back.
    else if (wasLeaving.current) play("in", 0);
    wasLeaving.current = leaving;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  return (
    <div
      ref={box}
      className={className}
      // Before the first frame runs, the paper is blank (no flash of type).
      style={{ ...style, filter: `url(#${fid})` }}
    >
      <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
        <filter
          id={fid}
          x="-4%"
          y="-8%"
          width="108%"
          height="116%"
          colorInterpolationFilters="sRGB"
        >
          {mode === "develop" ? (
            <>
              <feColorMatrix
                in="SourceGraphic"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 0 1"
                result="dark"
              />
              <feComponentTransfer in="dark" result="mask">
                <feFuncA ref={dev} type="linear" slope={tune.slope} intercept={-tune.slope} />
              </feComponentTransfer>
              <feComposite in="SourceGraphic" in2="mask" operator="in" />
            </>
          ) : (
            <>
              <feTurbulence
                type="fractalNoise"
                baseFrequency={tune.freq}
                numOctaves={tune.octaves}
                seed={seed}
                result="noise"
              />
              <feDisplacementMap
                ref={disp}
                in="SourceGraphic"
                in2="noise"
                scale={tune.disp}
                xChannelSelector="R"
                yChannelSelector="G"
                result="flow"
              />
              <feGaussianBlur ref={blur} in="flow" stdDeviation={tune.blur} result="wet" />
              <feColorMatrix
                in="noise"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0"
                result="noiseAlpha"
              />
              <feComponentTransfer in="noiseAlpha" result="blots">
                <feFuncA ref={alpha} type="linear" slope={tune.slope} intercept={-tune.slope} />
              </feComponentTransfer>
              <feComposite in="wet" in2="blots" operator="in" result="inked" />
              <feComponentTransfer in="inked" result="ink">
                <feFuncA ref={fade} type="linear" slope={1 - tune.fade} />
              </feComponentTransfer>
              {mode === "blots" ? null : (
                <>
                  <feGaussianBlur in="SourceGraphic" stdDeviation={3.2} result="soft" />
                  <feComponentTransfer in="soft" result="washed">
                    <feFuncA ref={wash} type="linear" slope={0} />
                  </feComponentTransfer>
                  <feMerge>
                    <feMergeNode in="washed" />
                    <feMergeNode in="ink" />
                  </feMerge>
                </>
              )}
            </>
          )}
        </filter>
      </svg>
      {current ? children : shown.children}
    </div>
  );
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
