"use client";

import { useEffect, useRef, useState } from "react";
import { nowIsFresh } from "@/lib/forecast";
import { MANIFEST_URL, clipsOf, srcOf, volumeOf, type Clip, type Picked } from "@/lib/nature";
import type { Weather } from "@/lib/types";
import { ClockFace, degrees } from "@/views/designs/common";
import { Ink } from "./Ink";

/*
 * A window in the page onto a real place: a nature clip, set into the paper
 * like a plate in a book, a minute at a time (nature.ts, carousel.ts).
 *
 * The clip is loaded and seeked shortly before its slot. When the slot comes
 * it starts, unseen; once its first frame is on the glass, the sky sinks,
 * and then, on bare paper, the clip surfaces (by opacity: the TV can't filter
 * moving pictures), its sound rising slower still. At the end it sinks
 * completely before the sky comes back. A clip that won't load, never shows
 * a frame, or stalls (a drive pulled out) gives its slot back to a passage;
 * one playing when the TV leaves the app stops at once. Never a spinner,
 * never a black frame.
 */

// The plate, in sheet rem: a 16:9 window with paper all round, a little
// above the middle so the foot of the page keeps its notes.
export const PLATE = { left: 20, top: 7.5, width: 80, height: 45 } as const;
// Where the page's own box starts on the sheet (Screen's top margin).
const PAGE_TOP = 3.25;
/** How long the sky takes to sink (living.css), before the clip surfaces. */
const SKY_MS = 2500;
const IN_MS = 4000;
/** The clip sinks no faster than the ink leaves; the screen waits for it. */
export const NATURE_OUT_MS = 3000;
const SOUND_IN_MS = 9000;
const STALL_MS = 6000;
// The manifest is asked for again now and then: a drive can be plugged in or pulled out.
const MANIFEST_EVERY_MS = 10 * 60_000;

/** The clips the TV holds (none anywhere else). */
export function useClips(): Clip[] {
  const [clips, setClips] = useState<Clip[]>([]);
  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const res = await fetch(MANIFEST_URL, { cache: "no-store" });
        // No manifest: no drive, or not a TV. Nothing to show.
        const next = res.ok ? clipsOf(await res.json()) : [];
        if (alive) setClips((prev) => (same(prev, next) ? prev : next));
      } catch {
        // Offline or malformed: keep what we had.
      }
    };
    read();
    const t = window.setInterval(read, MANIFEST_EVERY_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  return clips;
}

const same = (a: Clip[], b: Clip[]) =>
  a.length === b.length &&
  a.every(
    (c, i) =>
      c.id === b[i].id &&
      c.seconds === b[i].seconds &&
      c.place === b[i].place &&
      c.gain === b[i].gain,
  );

/**
 * The window itself. `job` is the next clip (or null); `on` says its slot
 * has come; `volume` is the hour's level (the clip's gain evens it out). It
 * tells the screen when the clip is ready, when it fails, and while it holds
 * the page (`onBusy`: from its first frame until it has sunk), so the sky
 * stays away for exactly that long.
 */
export function NatureWindow({
  job,
  on,
  volume,
  onReady,
  onFail,
  onBusy,
  turning,
}: {
  job: Picked | null;
  on: boolean;
  volume: number;
  onReady: (n: number, id: string) => void;
  onFail: (n: number) => void;
  onBusy: (busy: boolean) => void;
  /** The paper turning at dusk or dawn: a clip up then gives its slot back to a passage. */
  turning: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  // Keep the clip while it sinks out, after the screen has moved on.
  const [held, setHeld] = useState(job);
  if (job && job !== held) setHeld(job);
  useEffect(() => {
    if (job || !held) return;
    const t = window.setTimeout(() => setHeld(null), NATURE_OUT_MS + 300);
    return () => window.clearTimeout(t);
  }, [job, held]);

  // Load it and seek to its minute; ready once it can play from there.
  useEffect(() => {
    const v = ref.current;
    if (!v || !held) return;
    let seeked = false;
    let told = false;
    const ready = () => {
      if (told || !seeked || v.readyState < 3) return;
      told = true;
      onReady(held.n, held.clip.id);
    };
    const meta = () => {
      v.currentTime = held.from;
    };
    const onSeeked = () => {
      seeked = true;
      ready();
    };
    const fail = () => onFail(held.n);
    v.addEventListener("loadedmetadata", meta);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("canplaythrough", ready);
    v.addEventListener("canplay", ready);
    v.addEventListener("error", fail);
    v.src = srcOf(held.clip);
    v.load();
    return () => {
      v.removeEventListener("loadedmetadata", meta);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("canplaythrough", ready);
      v.removeEventListener("canplay", ready);
      v.removeEventListener("error", fail);
      v.pause();
      v.removeAttribute("src");
      v.load();
    };
  }, [held, onReady, onFail]);

  // Its slot: play, unseen, until a frame is really on the glass. No frame
  // in time, a stall, or the TV leaving the app gives the slot back.
  const [framed, setFramed] = useState<number | null>(null);
  const n = held?.n ?? null;
  useEffect(() => {
    const v = ref.current;
    if (!v || n === null || !on) return;
    let alive = true;
    const give = () => {
      if (!alive) return;
      v.pause();
      onFail(n);
    };
    if (turning) return give();
    // Until the first frame is on the glass, one deadline; after it, a stall
    // ("waiting" without "playing" again) gets its own.
    let framedYet = false;
    let stall = window.setTimeout(give, STALL_MS);
    const waiting = () => {
      if (!framedYet) return;
      window.clearTimeout(stall);
      stall = window.setTimeout(give, STALL_MS);
    };
    const going = () => framedYet && window.clearTimeout(stall);
    const away = () => document.hidden && give();
    const first = () => {
      if (!alive) return;
      const done = () => {
        if (!alive) return;
        framedYet = true;
        window.clearTimeout(stall);
        setFramed(n);
      };
      if ("requestVideoFrameCallback" in v) v.requestVideoFrameCallback(done);
      else done();
    };
    v.addEventListener("waiting", waiting);
    v.addEventListener("playing", going);
    document.addEventListener("visibilitychange", away);
    // With sound if the browser allows it (the TV does); else silent, never skipped for it.
    v.volume = 0;
    v.muted = false;
    v.play().then(first, () => {
      v.muted = true;
      v.play().then(first, give);
    });
    return () => {
      alive = false;
      window.clearTimeout(stall);
      v.removeEventListener("waiting", waiting);
      v.removeEventListener("playing", going);
      document.removeEventListener("visibilitychange", away);
    };
  }, [on, n, onFail, turning]);

  // The sky sinks first; then, on bare paper, the clip surfaces.
  const live = on && n !== null && framed === n;
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!live) return;
    const t = window.setTimeout(() => setShown(n), SKY_MS);
    return () => window.clearTimeout(t);
  }, [live, n]);
  const visible = live && shown === n;

  // The page is the clip's from its first frame until it has fully sunk.
  useEffect(() => {
    if (live) {
      onBusy(true);
      return;
    }
    const t = window.setTimeout(() => onBusy(false), NATURE_OUT_MS);
    return () => window.clearTimeout(t);
  }, [live, onBusy]);

  // The sound rises slower than the picture and sinks as slowly; then the clip stops.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const to = visible && held ? volumeOf(held.clip, volume) : 0;
    const ms = visible ? SOUND_IN_MS : NATURE_OUT_MS;
    const from = v.volume;
    const t0 = performance.now();
    const t = window.setInterval(() => {
      const k = Math.min((performance.now() - t0) / ms, 1);
      v.volume = from + (to - from) * k;
      if (k < 1) return;
      window.clearInterval(t);
      if (!on) v.pause();
    }, 100);
    return () => window.clearInterval(t);
  }, [visible, volume, held, on]);

  const r = (x: number) => `${x}rem`;
  return (
    <div
      aria-hidden
      className="nature-window pointer-events-none absolute z-[1]"
      data-visible={visible ? "" : undefined}
      style={{
        left: r(PLATE.left),
        top: r(PLATE.top),
        width: r(PLATE.width),
        height: r(PLATE.height),
        transition: `opacity ${visible ? IN_MS : NATURE_OUT_MS}ms ease-in-out`,
      }}
    >
      <video ref={ref} playsInline preload="auto" disablePictureInPicture />
    </div>
  );
}

/**
 * Under the plate, where it was filmed; at the foot of the page, as on home,
 * outside in the left corner and the hour in the right.
 */
export function NatureNotes({
  clip,
  w,
  now,
  tz,
}: {
  clip: Clip;
  w: Weather | null;
  now: Date;
  tz: string;
}) {
  const outside = w && nowIsFresh(w, now) ? w.now.temp : null;
  return (
    <>
      {clip.place ? (
        <Ink
          k={clip.id}
          order={1}
          mode="seep"
          className="absolute inset-x-0 text-center"
          style={{ top: `${PLATE.top - PAGE_TOP + PLATE.height + 2.2}rem` }}
        >
          <p className="text-[2.6rem] text-ink-soft italic">{clip.place}</p>
        </Ink>
      ) : null}
      <Ink
        k={outside == null ? "none" : "outside"}
        order={2}
        mode="seep"
        className="absolute bottom-[0.7rem] left-0"
      >
        {outside != null ? (
          <p className="text-[2rem] whitespace-nowrap text-ink-soft">
            {degrees(outside)} <span className="text-ink-faint italic">outside</span>
          </p>
        ) : null}
      </Ink>
      <Ink order={2} mode="seep" className="absolute right-0 bottom-[0.7rem]">
        <p className="text-[2rem] whitespace-nowrap text-ink-soft">
          <ClockFace now={now} tz={tz} />
        </p>
      </Ink>
    </>
  );
}
