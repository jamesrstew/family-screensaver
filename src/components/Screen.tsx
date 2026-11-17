"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SHOW_TTL_MS } from "@/lib/show";
import { WEATHER_MS, slideFromKey, slideKey, slideOf } from "@/lib/carousel";
import { hashOf } from "@/lib/organic";
import { dayKey, moodOf, parts, type Mood } from "@/lib/time";
import { PAGES, type ShowRequest, type Snapshot, type Page } from "@/lib/types";
import { runTool } from "@/lib/voice-tools";
import { HomePage } from "@/views/HomePage";
import { NightPage } from "@/views/NightPage";
import { NotebookPage } from "@/views/NotebookPage";
import { WeatherPage } from "@/views/WeatherPage";
import { WeekPage } from "@/views/WeekPage";
import { DESIGNS, type Design } from "@/views/designs/registry";
import { Ink, InkModeContext, InkStage, leaveMs } from "./Ink";
import { Fps } from "./Fps";
import { useVoice } from "./useVoice";

/*
 * The screen runs the TV. It keeps the snapshot fresh, keeps time, listens
 * for requests, turns pages with ink, and always finds its way home.
 * Everything here is quiet: nothing on screen moves unless something changed.
 */

// A page, the night page, or one piece of home's carousel ("home:passage-12").
type View = Page | "night" | `home:${string}`;

/** How long a page stays up before the screen returns home. */
const HOLD_MS: Record<Page, number> = {
  home: Infinity,
  weather: 4 * 60_000,
  week: 6 * 60_000,
  notebook: 5 * 60_000,
};

const SNAPSHOT_EVERY_MS = 5 * 60_000;
const STALE_WEATHER_MS = 3 * 60 * 60_000;
// Ask often while people are up; rarely in the small hours (by the clock, not the sun).
const ASK_EVERY_MS = { awake: 4_000, asleep: 20_000 };
const TICK_MS = 10_000;
const DRIFT_EVERY_MS = 4 * 60_000;

const viewOf = (page: Page, mood: Mood): View =>
  page === "home" && mood === "night" ? "night" : page;

export function Screen({
  initial,
  initialPage,
  design = null,
}: {
  initial: Snapshot;
  initialPage: Page;
  design?: Design | null;
}) {
  const kit = design ? DESIGNS[design] : null;
  const [snapshot, setSnapshot] = useState(initial);
  // First render uses the server's clock so hydration matches; then real time.
  const [now, setNow] = useState(() => new Date(initial.issuedAt));
  const [page, setPage] = useState<Page>(initialPage);
  const pageSince = useRef(0);
  // Sunrise and sunset barely move day to day, so the last ones known keep the
  // night honest even if the forecast is gone for a while.
  const [sun, setSun] = useState(initial.weather?.today ?? null);
  const mood = moodOf(now, snapshot.timeZone, snapshot.weather?.today ?? sun);

  // ---- Pages turn with ink: the old one sinks, then the new one soaks in.
  // Home by day is a slow carousel (Almanac only): each piece turns like a page.
  // It counts from the moment home appears, so it always opens on the weather.
  const base = viewOf(page, mood);
  const [homeSince, setHomeSince] = useState(() => Date.parse(initial.issuedAt));
  const [lastBase, setLastBase] = useState(base);
  if (base !== lastBase) {
    setLastBase(base);
    // Back from the Weather page, the weather's just been seen: open on a passage.
    if (base === "home") setHomeSince(now.getTime() - (lastBase === "weather" ? WEATHER_MS : 0));
  }
  const carousel = base === "home" && design === "almanac";
  const target: View = carousel
    ? `home:${slideKey(slideOf(now, homeSince, Boolean(snapshot.weather)))}`
    : base;
  const [view, setView] = useState<View>(target);
  const leaving = target !== view;
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setView(target), leaveMs());
    return () => window.clearTimeout(t);
  }, [leaving, target]);

  const show = useCallback((p: Page) => {
    pageSince.current = Date.now();
    setPage(p);
  }, []);

  // ---- Time. A tick every few seconds; the clock shows minutes.
  useEffect(() => {
    pageSince.current = Date.now();
    const first = window.setTimeout(() => {
      setNow(new Date());
      // A restored or stale page still opens home on the weather.
      setHomeSince(Date.now());
    }, 0);
    const t = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);

  // ---- Everything returns home.
  useEffect(() => {
    if (page !== "home" && Date.now() - pageSince.current > HOLD_MS[page]) show("home");
  }, [now, page, show]);

  // ---- A fresh snapshot every few minutes. A lost pairing shows the lock.
  useEffect(() => {
    let weatherAt = Date.now();
    const t = window.setInterval(async () => {
      try {
        const res = await fetch("/api/snapshot", { cache: "no-store" });
        if (res.status === 401) return window.location.reload();
        if (!res.ok) return;
        const next: Snapshot = await res.json();
        // One missed weather report shouldn't wipe the sky; keep the last for a while.
        if (next.weather) {
          weatherAt = Date.now();
          setSun(next.weather.today);
        }
        const keep = !next.weather && Date.now() - weatherAt < STALE_WEATHER_MS;
        setSnapshot((prev) => (keep && prev.weather ? { ...next, weather: prev.weather } : next));
      } catch {
        // Offline: keep printing what we have.
      }
    }, SNAPSHOT_EVERY_MS);
    return () => window.clearInterval(t);
  }, []);

  // ---- Requests from the phone remote, Siri, Alexa.
  const lastSeq = useRef<number | null>(null);
  const asleep = (() => {
    const h = parts(now, snapshot.timeZone).hour;
    return h >= 22 || h < 5;
  })();
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/show", { cache: "no-store" });
        if (!res.ok || !alive) return;
        const ask = (await res.json()) as ShowRequest | { seq: 0 };
        const known = lastSeq.current;
        lastSeq.current = ask.seq;
        if (!("page" in ask) || ask.seq === known) return;
        // Only a recent request counts (a TV waking up shouldn't obey
        // yesterday's).
        if (Date.now() - Date.parse(ask.at) < SHOW_TTL_MS) show(ask.page);
      } catch {
        // Try again next time.
      }
    };
    poll();
    const t = window.setInterval(poll, asleep ? ASK_EVERY_MS.asleep : ASK_EVERY_MS.awake);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [asleep, show]);

  // ---- The voice.
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  const voice = useVoice(
    useCallback(
      (name, args) =>
        runTool(name, args, {
          snapshot: snapshotRef.current,
          now: new Date(),
          show,
          hangUp: () => {},
        }),
      [show],
    ),
  );

  // ---- The remote: arrows turn pages, Back goes home, OK talks.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = PAGES.indexOf(page);
      if (e.key === "ArrowRight") show(PAGES[(i + 1) % PAGES.length]);
      else if (e.key === "ArrowLeft") show(PAGES[(i - 1 + PAGES.length) % PAGES.length]);
      else if (e.key === "Escape" || e.key === "Home") show("home");
      else if ((e.key === "Enter" || e.key === " ") && snapshot.voice) voice.toggle();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, show, voice, snapshot.voice]);

  // ---- Waking up: the paper takes its mood at once; only later changes are slow.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), 2500);
    return () => window.clearTimeout(t);
  }, []);

  // ---- Protect the screen: the page drifts a few pixels, too slowly to see.
  const [drift, setDrift] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const t = window.setInterval(() => {
      setDrift({ x: (Math.random() - 0.5) * 1.4, y: (Math.random() - 0.5) * 1.0 });
    }, DRIFT_EVERY_MS);
    return () => window.clearInterval(t);
  }, []);

  // The living sky's shapes and phases, fixed for the session (and the same on
  // the server), so the sky never jumps when the snapshot refreshes.
  const [seed] = useState(
    () => hashOf(dayKey(new Date(initial.issuedAt), initial.timeZone)) % 100_000,
  );

  const slide = view.startsWith("home:") ? slideFromKey(view.slice(5)) : undefined;
  const props = { snapshot, now, mood, slide };
  // The design under trial redraws home, night, and weather; Week and Ideas keep their own.
  const drawn =
    kit && (view === "home" || slide || view === "night" || view === "weather") ? kit : null;
  return (
    <div
      data-surface="tv"
      data-mood={mood}
      data-design={drawn ? (design ?? undefined) : undefined}
      data-settled={settled ? "" : undefined}
      className="paper flex h-dvh w-screen cursor-none items-center justify-center overflow-hidden"
      onClick={snapshot.voice ? voice.toggle : undefined}
    >
      <main
        className="relative h-[67.5rem] w-[120rem] px-[5.5rem] pt-[3.25rem] pb-[3rem]"
        style={{
          transform: `translate(${drift.x}rem, ${drift.y}rem)`,
          transition: "transform 180s linear",
        }}
      >
        {drawn?.Sky ? (
          <drawn.Sky
            w={snapshot.weather}
            now={now}
            mood={mood}
            arc={view === "home" || view === "night" || slide?.kind === "passage"}
            seed={seed}
          />
        ) : null}
        <InkModeContext.Provider value={drawn?.ink ?? "blots"}>
          <InkStage.Provider value={leaving}>
            <div key={view} className="relative z-[1] h-full">
              {view === "home" && (drawn ? <drawn.Home {...props} /> : <HomePage {...props} />)}
              {drawn && slide?.kind === "passage" && <drawn.Home {...props} />}
              {drawn && slide?.kind === "weather" && <drawn.Weather {...props} view={slide.view} />}
              {view === "night" && (drawn ? <drawn.Night {...props} /> : <NightPage {...props} />)}
              {view === "weather" &&
                (drawn ? <drawn.Weather {...props} /> : <WeatherPage {...props} />)}
              {view === "week" && <WeekPage {...props} />}
              {view === "notebook" && <NotebookPage {...props} />}
            </div>
          </InkStage.Provider>
        </InkModeContext.Provider>
        <VoiceLine state={voice.state} caption={voice.caption} />
      </main>
      <Fps />
    </div>
  );
}

const VOICE_WORDS: Partial<Record<string, string>> = {
  connecting: "One moment…",
  listening: "Listening\u2026",
  thinking: "Thinking\u2026",
  failed: "I can\u2019t talk just now.",
};

/** One line at the foot of the page while a conversation is open. */
function VoiceLine({ state, caption }: { state: string; caption: string }) {
  if (state === "idle") return null;
  const words = state === "speaking" && caption ? caption : VOICE_WORDS[state];
  return (
    <div className="pointer-events-none absolute inset-x-[5.5rem] bottom-[1.4rem] z-[2] flex justify-center">
      <Ink k={state === "speaking" ? "speaking" : state} className="max-w-[90rem] text-center">
        <p className="bg-paper px-6 text-[2.8rem] leading-snug text-ink italic">{words}</p>
      </Ink>
    </div>
  );
}
