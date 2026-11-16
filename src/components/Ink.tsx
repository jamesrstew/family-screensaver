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
 * Inside a leaving <InkStage>, every block bleeds out.
 */

export const IN_MS = 3000;
export const OUT_MS = 1500;
export const STAGGER_MS = 180;

/** True while the page is leaving: every Ink on it bleeds out. */
export const InkStage = createContext(false);

type Props = {
  k?: string | number;
  order?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

// Slow to start, slow to settle: the ink spreads, then dries.
const easeInOut = (x: number) => (1 - Math.cos(Math.PI * x)) / 2;
const easeIn = (x: number) => x ** 2;

function prefersStill() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function Ink({ k = "", order = 0, className, style, children }: Props) {
  const leaving = useContext(InkStage);
  const fid = `ink-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const box = useRef<HTMLDivElement>(null);
  const disp = useRef<SVGFEDisplacementMapElement>(null);
  const blur = useRef<SVGFEGaussianBlurElement>(null);
  const alpha = useRef<SVGFEFuncAElement>(null);
  const frame = useRef(0);
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
    disp.current?.setAttribute("scale", (26 * q * q).toFixed(2));
    blur.current?.setAttribute("stdDeviation", (2.6 * q).toFixed(2));
    alpha.current?.setAttribute("intercept", (-7.5 * q).toFixed(3));
  }

  function play(dir: "in" | "out", delay: number, done?: () => void) {
    const el = box.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);

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
    const duration = dir === "in" ? IN_MS : OUT_MS;
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
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.k]);

  // New identity: sink the old ink, then swap.
  useEffect(() => {
    if (current) return;
    play("out", 0, () => setShown((s) => ({ k, children: s.children })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  // The whole page is leaving.
  useEffect(() => {
    if (leaving) play("out", order * STAGGER_MS * 0.4);
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
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.011"
            numOctaves={4}
            seed={seed}
            result="noise"
          />
          <feDisplacementMap
            ref={disp}
            in="SourceGraphic"
            in2="noise"
            scale="26"
            xChannelSelector="R"
            yChannelSelector="G"
            result="flow"
          />
          <feGaussianBlur ref={blur} in="flow" stdDeviation="2.6" result="wet" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0"
            result="noiseAlpha"
          />
          <feComponentTransfer in="noiseAlpha" result="blots">
            <feFuncA ref={alpha} type="linear" slope="9" intercept="-7.5" />
          </feComponentTransfer>
          <feComposite in="wet" in2="blots" operator="in" />
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
