"use client";

import { useEffect, useRef, useState } from "react";
import { MANIFEST_URL, clipsOf, srcOf, volumeOf, type Clip, type Picked } from "@/lib/nature";

/*
 * A real place, full screen: a nature clip at its own size (1080p on a 1080p
 * TV, pixel for pixel), under the page's strip of notes (NatureStrip.tsx).
 * A minute of one now and then in home's carousel; in nature mode, clip
 * after clip (nature.ts, carousel.ts).
 *
 * The clip is loaded and seeked before its turn. When the turn comes it
 * starts, unseen; once its first frame is on the glass, the sky sinks, and
 * then the clip surfaces from the paper (by opacity: the TV can't filter
 * moving pictures), its sound rising slower still. At the end it sinks
 * completely before anything else comes. A clip that won't load, never shows
 * a frame, or stalls (a drive pulled out) gives its turn back; one playing
 * when the TV leaves the app stops at once. Never a spinner, never a black
 * frame.
 */
/** How long the sky takes to sink (living.css), before the clip surfaces. */
const SKY_MS = 2500;
const IN_MS = 4000;
/** The clip sinks no faster than the ink leaves; the screen waits for it. */
export const NATURE_OUT_MS = 3000;
const SOUND_IN_MS = 9000;
const STALL_MS = 6000;
// The manifest is asked for again now and then: a drive can be plugged in or pulled out.
const MANIFEST_EVERY_MS = 10 * 60_000;

/** The clips the TV holds (none anywhere else); null until the first answer. */
export function useClips(): Clip[] | null {
  const [clips, setClips] = useState<Clip[] | null>(null);
  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const res = await fetch(MANIFEST_URL, { cache: "no-store" });
        // No manifest: no drive, or not a TV. Nothing to show.
        const next = res.ok ? clipsOf(await res.json()) : [];
        if (alive) setClips((prev) => (prev && same(prev, next) ? prev : next));
      } catch {
        // Offline or malformed: keep what we had (nothing, the first time).
        if (alive) setClips((prev) => prev ?? []);
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
 * The window itself. `job` is the next clip (or null); `on` says its turn
 * has come; `volume` is the hour's level (the clip's gain evens it out). It
 * tells the screen when the clip is ready, when it fails, when it has played
 * to its end and sunk (`onEnd`, for a clip with an `until`), and while it
 * holds the page (`onBusy`: from its first frame until it has sunk), so the
 * sky stays away for exactly that long.
 */
export function NatureWindow({
  job,
  on,
  volume,
  onReady,
  onFail,
  onBusy,
  onEnd,
  turning,
}: {
  job: Picked | null;
  on: boolean;
  volume: number;
  onReady: (n: number, id: string) => void;
  onFail: (n: number) => void;
  onBusy: (busy: boolean) => void;
  onEnd: (n: number) => void;
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
  const [ended, setEnded] = useState<number | null>(null);
  const n = held?.n ?? null;
  const until = held?.until;
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
    // A whole clip, played to its end: it sinks, then the screen moves on.
    const end = () => alive && setEnded(n);
    const time = () => until !== undefined && v.currentTime >= until && end();
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
    v.addEventListener("timeupdate", time);
    v.addEventListener("ended", end);
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
      v.removeEventListener("timeupdate", time);
      v.removeEventListener("ended", end);
      document.removeEventListener("visibilitychange", away);
    };
  }, [on, n, until, onFail, turning]);

  useEffect(() => {
    if (ended === null || ended !== n) return;
    const t = window.setTimeout(() => onEnd(ended), NATURE_OUT_MS);
    return () => window.clearTimeout(t);
  }, [ended, n, onEnd]);

  // The sky sinks first; then, on bare paper, the clip surfaces.
  const live = on && n !== null && framed === n;
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!live) return;
    const t = window.setTimeout(() => setShown(n), SKY_MS);
    return () => window.clearTimeout(t);
  }, [live, n]);
  const visible = live && shown === n && ended !== n;

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

  return (
    <div
      aria-hidden
      className="nature-window pointer-events-none fixed inset-0"
      data-visible={visible ? "" : undefined}
      style={{ transition: `opacity ${visible ? IN_MS : NATURE_OUT_MS}ms ease-in-out` }}
    >
      <video ref={ref} playsInline preload="auto" disablePictureInPicture />
      {/* A soft dusk at the foot of the picture, so the strip reads over snow or sky. */}
      <div className="nature-scrim" />
    </div>
  );
}
