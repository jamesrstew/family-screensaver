"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SHOW_TTL_MS, pageKey, targetOf, viewAsked } from "@/lib/show";
import {
  natureNext,
  nextTurnIn,
  startAfter,
  slideFromKey,
  slideKey,
  slideOf,
  turns,
  type Start,
  type WeatherView,
} from "@/lib/carousel";
import { freshIndoor } from "@/lib/indoor";
import {
  NATURE_AT_NIGHT,
  VOLUME,
  orderOf,
  pickFor,
  readyFor,
  wholeAt,
  type Picked,
  type Ready,
} from "@/lib/nature";
import { hashOf } from "@/lib/organic";
import { dayKey, moodOf, parts, twilightOf, type Mood } from "@/lib/time";
import { PAGES, type ShowRequest, type Snapshot, type Page } from "@/lib/types";
import { runTool } from "@/lib/voice-tools";
import { HomePage } from "@/views/HomePage";
import { NightPage } from "@/views/NightPage";
import { NotebookPage } from "@/views/NotebookPage";
import { WeatherPage } from "@/views/WeatherPage";
import { WeekPage } from "@/views/WeekPage";
import { useAsked } from "@/views/designs/almanac-weather";
import { glowsAt } from "@/views/designs/living";
import { DESIGNS, type Design } from "@/views/designs/registry";
import { freshWeather } from "@/lib/forecast";
import { swapDelay } from "@/lib/turn";
import { Dusk, useTurn } from "./Dusk";
import { Ink, InkModeContext, InkStage, leaveMs } from "./Ink";
import { Fps } from "./Fps";
import { NATURE_OUT_MS, NatureWindow, useClips } from "./Nature";
import { NatureStrip } from "./NatureStrip";
import { useVoice } from "./useVoice";

/*
 * The screen runs the TV. It keeps the snapshot fresh, keeps time, listens
 * for requests, turns pages with ink, and always finds its way home.
 * Everything here is quiet: nothing on screen moves unless something changed.
 */

// A page, the night page, one piece of home's carousel ("home:passage-12"),
// or one view of the weather ("weather:hours").
type View =
  | Exclude<Page, "weather">
  | "night"
  | `home:${string}`
  | `night:${string}`
  | `carousel:${string}`
  | `weather:${WeatherView}`;

/** How long a page stays up before the screen returns home. */
const HOLD_MS: Record<Page, number> = {
  home: Infinity,
  weather: 4 * 60_000,
  week: 6 * 60_000,
  notebook: 5 * 60_000,
  // Asked for, nature plays clip after clip a good while, then goes home too.
  nature: 60 * 60_000,
};

const SNAPSHOT_EVERY_MS = 5 * 60_000;
// Ask often while people are up; rarely in the small hours (by the clock, not the sun).
const ASK_EVERY_MS = { awake: 4_000, asleep: 20_000 };
// The clock shows minutes; the carousel's turns get a timer of their own.
const TICK_MS = 10_000;
const DRIFT_EVERY_MS = 4 * 60_000;
// A nature clip starts loading this long before its slot.
const PRELOAD_MS = 25_000;

// Dev only: ?clip= starts nature mode on that clip.
const devClip = () =>
  process.env.NODE_ENV !== "production"
    ? new URLSearchParams(window.location.search).get("clip")
    : null;

// Dev only: ?at= runs the TV's clock from that moment (with ?sky=, a made-up
// sky), so a day scene can be checked at night. Fixed at the first read.
let clockOffset: number | null = null;
function clockNow(): number {
  if (clockOffset === null) {
    const at =
      process.env.NODE_ENV !== "production"
        ? new URLSearchParams(window.location.search).get("at")
        : null;
    const t = at ? Date.parse(at) : NaN;
    clockOffset = Number.isNaN(t) ? 0 : t - Date.now();
  }
  return Date.now() + clockOffset;
}

const viewOf = (page: Page, mood: Mood): Page | "night" =>
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
  const [latest, setSnapshot] = useState(initial);
  // First render uses the server's clock so hydration matches; then real time.
  const [now, setNow] = useState(() => new Date(initial.issuedAt));
  // A forecast that no longer speaks of now (offline for hours, a clock far
  // off) is left out, never shown as fact: the screen turns passages alone.
  // Memoized on fresh or stale, not on the clock, so it stays the same object
  // from tick to tick.
  const fresh = freshWeather(latest.weather, now) !== null;
  const snapshot = useMemo(
    () => (fresh || !latest.weather ? latest : { ...latest, weather: null }),
    [latest, fresh],
  );
  const [page, setPage] = useState<Page>(initialPage);
  const pageSince = useRef(0);
  // Sunrise and sunset barely move day to day, so the last ones known keep the
  // night honest even if the forecast is gone for a while.
  const [sun, setSun] = useState(initial.weather?.today ?? null);
  const mood = moodOf(now, snapshot.timeZone, snapshot.weather?.today ?? sun);
  const twilight = twilightOf(now, snapshot.timeZone, snapshot.weather?.today ?? sun);

  // ---- Waking up: the paper takes its mood at once; only later changes are slow.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), 2500);
    return () => window.clearTimeout(t);
  }, []);

  // ---- Pages turn with ink: the old one sinks, then the new one soaks in.
  // Home and night are a carousel (Almanac only), half a minute a piece, each turning like a page.
  // It counts from the moment home appears, so it always opens on the weather.
  // At dusk and dawn the paper turns between the two (Dusk.tsx).
  const { paper, turning } = useTurn(mood, settled);
  // Nature mode needs clips: where there are none (not the TV, or a drive
  // that won't play), it's simply home.
  const clips = useClips();
  // Nature mode walks the clips from where the clock says, one after another;
  // five that won't play in a row and it gives up (a drive gone).
  const [mode, setMode] = useState({ at: 0, k: 0, fails: 0 });
  const askedBase = viewOf(page, mood);
  const base =
    askedBase === "nature" && (clips?.length === 0 || mode.fails >= 5)
      ? viewOf("home", mood)
      : askedBase;
  const [homeStart, setHomeStart] = useState<Start>(() => ({
    since: Date.parse(initial.issuedAt),
  }));
  const [lastBase, setLastBase] = useState(base);
  const [modeJob, setModeJob] = useState<Picked | null>(null);
  if (base !== lastBase) {
    setLastBase(base);
    // Day and night are one carousel; back from another page, it starts over.
    setHomeStart(startAfter(lastBase, base, now.getTime(), homeStart));
    if (base === "nature") {
      setMode({ at: now.getTime(), k: 0, fails: 0 });
      setModeJob(null);
    }
  }
  const carousel = turns(base) && design === "almanac";
  const hasWeather = Boolean(snapshot.weather);

  // ---- Nature: now and then a minute of a real place (at night too, dimmed,
  // while NATURE_AT_NIGHT says so), and only once its clip is loaded and waiting.
  const tz = snapshot.timeZone;
  const outdoors = carousel && Boolean(clips?.length) && (NATURE_AT_NIGHT || mood !== "night");
  const wild = outdoors ? natureNext(now.getTime(), homeStart, hasWeather) : null;
  // The slot's clip is picked once, shortly before it, and kept.
  const [picked, setPicked] = useState<Picked | null>(null);
  if (wild && now.getTime() >= wild.from - PRELOAD_MS && picked?.n !== wild.n) {
    const p = pickFor(picked, wild.n, clips ?? []);
    if (p) setPicked(p);
  }
  const [ready, setReady] = useState<Ready | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  // In nature mode a clip that fails or ends gives way to the next.
  const onward = useCallback(
    (n: number) => setMode((m) => (n === -1 - m.k ? { ...m, k: m.k + 1 } : m)),
    [],
  );
  const onFail = useCallback((n: number) => {
    setFailed(n);
    if (n < 0) setMode((m) => (n === -1 - m.k ? { ...m, k: m.k + 1, fails: m.fails + 1 } : m));
  }, []);
  const onReady = useCallback((n: number, id: string) => {
    setReady({ n, id, at: clockNow() });
    if (n < 0) setMode((m) => (m.fails ? { ...m, fails: 0 } : m));
  }, []);
  const inMode = base === "nature" && Boolean(clips?.length);
  if (inMode && clips && modeJob?.n !== -1 - mode.k) {
    const id = mode.k === 0 ? devClip() : null;
    const first = id ? Math.max(orderOf(clips, id), 0) : Math.floor(mode.at / 60_000);
    const next = wholeAt(clips, first, mode.k);
    if (next) setModeJob(next);
  }
  const carouselJob = picked && wild && picked.n === wild.n && failed !== picked.n ? picked : null;
  const job = inMode ? (modeJob && failed !== modeJob.n ? modeJob : null) : carouselJob;
  // Ready before its slot began, or not at all.
  const readyN =
    carouselJob && wild && readyFor(carouselJob.n, carouselJob, ready, wild.from)
      ? carouselJob.n
      : null;
  const natureReady = (n: number) => n === readyN;
  // From a clip's first frame until it has sunk, the page is the clip's: no sky.
  const [natureBusy, setNatureBusy] = useState(false);
  // The weather view someone asked for by name ("hourly"); otherwise ?weather=.
  const [view0, setView0] = useState<WeatherView | null>(null);
  const fromUrl = useAsked();
  const target = targetOf({
    base,
    slide: carousel ? slideKey(slideOf(now, homeStart, hasWeather, tz, natureReady)) : null,
    asked: view0,
    fromUrl,
  }) as View;
  const [view, setView] = useState<View>(target);
  // Passages back to back are one page: the clock and the notes hold still,
  // and only the piece turns, in its own ink (keyed by the passage).
  const leaving = pageKey(target) !== pageKey(view);
  const shown = leaving ? view : target;
  if (!leaving && target !== view) setView(target);
  // Just after a turn the old page has already sunk: the next takes the paper at once.
  const wasTurning = useRef(false);
  useEffect(() => {
    const justTurned = wasTurning.current && !turning;
    wasTurning.current = turning;
    // A clip sinks slower than ink; the next page waits for it.
    const clip = view === "nature" || view.startsWith("carousel:nature");
    const out = clip ? Math.max(leaveMs(), NATURE_OUT_MS) : leaveMs();
    const wait = swapDelay(leaving, turning, justTurned, out);
    if (wait === null) return;
    const t = window.setTimeout(() => setView(target), wait);
    return () => window.clearTimeout(t);
  }, [leaving, target, turning, view]);

  const show = useCallback((p: Page, v?: WeatherView) => {
    pageSince.current = Date.now();
    setPage(p);
    setView0(viewAsked(p, v));
  }, []);

  // ---- Time. A tick every few seconds; the clock shows minutes.
  useEffect(() => {
    pageSince.current = Date.now();
    const first = window.setTimeout(() => {
      setNow(new Date(clockNow()));
      // A restored or stale page still opens home on the weather.
      setHomeStart({ since: clockNow() });
    }, 0);
    const t = window.setInterval(() => setNow(new Date(clockNow())), TICK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);

  // ---- The carousel's next turn lands on its moment, not on the next tick.
  useEffect(() => {
    if (!carousel) return;
    const at = clockNow();
    const wait = nextTurnIn(at, homeStart.since, Boolean(snapshot.weather));
    const t = window.setTimeout(() => setNow(new Date(clockNow())), wait + 50);
    return () => window.clearTimeout(t);
  }, [carousel, homeStart, now, snapshot.weather]);

  // ---- Everything returns home.
  useEffect(() => {
    if (page !== "home" && Date.now() - pageSince.current > HOLD_MS[page]) show("home");
  }, [now, page, show]);

  // ---- A fresh snapshot every few minutes. A lost pairing shows the lock.
  useEffect(() => {
    const t = window.setInterval(async () => {
      try {
        const res = await fetch("/api/snapshot", { cache: "no-store" });
        if (res.status === 401) return window.location.reload();
        if (!res.ok) return;
        const next: Snapshot = await res.json();
        // One missed weather report shouldn't wipe the sky: keep the last
        // until it's stale (freshWeather).
        if (next.weather) setSun(next.weather.today);
        setSnapshot((prev) => ({
          ...next,
          weather: next.weather ?? prev.weather,
          // A missed thermostat reading keeps the last; freshIndoor retires it at 30 minutes.
          indoor: next.indoor ?? prev.indoor,
        }));
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
        if (Date.now() - Date.parse(ask.at) < SHOW_TTL_MS) show(ask.page, ask.view);
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
  // The wall clock at first paint (the same on server and TV): the sky's
  // drifts take their phase from it, so a reload carries on, not over.
  const [epoch] = useState(() => Math.floor(Date.parse(initial.issuedAt) / 1000));
  const [seed] = useState(
    () => hashOf(dayKey(new Date(initial.issuedAt), initial.timeZone)) % 100_000,
  );

  const asked = shown.startsWith("weather:") ? (shown.slice(8) as WeatherView) : undefined;
  // A carousel slide: a weather view ("carousel:…", the same by day or by
  // night, so sunset doesn't re-ink it), or a passage by day ("home:…") or
  // by night ("night:…").
  const [at, key] = shown.split(":");
  const slide =
    (at === "home" || at === "night" || at === "carousel") && key ? slideFromKey(key) : undefined;
  const props = { snapshot, now, mood, slide, inside: freshIndoor(snapshot, now)?.temp ?? null };
  const wilds = slide?.kind === "nature" && picked?.n === slide.n ? picked.clip : null;
  // The clip plays while its slot is up (in nature mode, once it's ready),
  // and sinks as the page leaves.
  const outside = inMode
    ? !leaving &&
      shown === "nature" &&
      job !== null &&
      ready?.n === job.n &&
      ready.id === job.clip.id
    : Boolean(wilds) && !leaving;
  const volume = paper === "night" ? VOLUME.night : twilight ? VOLUME.twilight : VOLUME.day;
  // The design under trial redraws home, night, and weather; Week and Ideas keep their own.
  const drawn =
    kit && (shown === "home" || slide || shown === "night" || asked || shown === "nature")
      ? kit
      : null;
  return (
    <div
      data-surface="tv"
      data-mood={paper}
      data-design={drawn ? (design ?? undefined) : undefined}
      data-settled={settled ? "" : undefined}
      data-turning={turning ? "" : undefined}
      data-nature={natureBusy ? "" : undefined}
      className="paper flex h-dvh w-screen cursor-none items-center justify-center overflow-hidden"
      onClick={snapshot.voice ? voice.toggle : undefined}
    >
      {/* A nature clip, full screen behind the page (which drifts; the picture needn't). */}
      {design === "almanac" ? (
        <NatureWindow
          job={job}
          on={outside}
          volume={volume}
          onReady={onReady}
          onFail={onFail}
          onBusy={setNatureBusy}
          onEnd={onward}
          // In nature mode the clip plays on while the paper turns behind it.
          turning={turning && !inMode}
        />
      ) : null}
      <main
        className="relative h-[67.5rem] w-[120rem] px-[5.5rem] pt-[3.25rem] pb-[3rem]"
        style={{
          transform: `translate(${drift.x}rem, ${drift.y}rem)`,
          transition: "transform 180s linear",
        }}
      >
        {/* The sky stays mounted while Week or Ideas is up, faded out, so it
            fades back in (and carries on) instead of cutting. */}
        {kit?.Sky ? (
          <kit.Sky
            hidden={!drawn || natureBusy || shown === "nature"}
            w={snapshot.weather}
            now={now}
            mood={paper}
            // The carousel's sky holds steady, slide to slide: the sun or moon
            // on its arc, nothing dimmed by the long fades (they take longer
            // than a slide, so following the slides would make the sky pulse).
            // A weather slide's words get a short step back instead: no rule
            // or arc dots through them, the body faint behind them.
            arc={shown === "home" || shown === "night" || Boolean(slide)}
            quiet={!slide && (asked ?? "now") !== "now"}
            words={slide?.kind === "weather"}
            seed={seed}
            epoch={epoch}
            twilight={twilight}
          />
        ) : null}
        <InkModeContext.Provider value={drawn?.ink ?? "blots"}>
          {/* At the turn, whatever is up sinks, so the paper turns empty
              (and an asked page inks back in afterward). */}
          <InkStage.Provider value={leaving || turning}>
            <div
              key={pageKey(shown)}
              className="relative z-[1] h-full"
              // The weather's words, set in night's soft ink after dark (designs.css).
              data-weather-view={slide?.kind === "weather" || asked ? "" : undefined}
            >
              {shown === "home" && (drawn ? <drawn.Home {...props} /> : <HomePage {...props} />)}
              {drawn && slide?.kind === "passage" && at === "home" && <drawn.Home {...props} />}
              {drawn && slide?.kind === "passage" && at === "night" && <drawn.Night {...props} />}
              {drawn && slide?.kind === "weather" && <drawn.Weather {...props} view={slide.view} />}
              {shown === "night" && (drawn ? <drawn.Night {...props} /> : <NightPage {...props} />)}
              {asked &&
                (drawn ? <drawn.Weather {...props} view={asked} /> : <WeatherPage {...props} />)}
              {drawn && wilds && <NatureStrip {...props} clip={wilds} />}
              {drawn && shown === "nature" && modeJob && (
                <NatureStrip {...props} clip={modeJob.clip} />
              )}
              {shown === "week" && <WeekPage {...props} />}
              {shown === "notebook" && <NotebookPage {...props} />}
            </div>
          </InkStage.Provider>
        </InkModeContext.Provider>
        {design === "almanac" ? (
          <Dusk
            twilight={twilight}
            paper={paper}
            turning={turning}
            on={page === "home"}
            clear={glowsAt(snapshot.weather)}
          />
        ) : null}
        {/* The voice's line sinks at the turn too, and comes back after. */}
        <InkStage.Provider value={turning}>
          <VoiceLine state={voice.state} caption={voice.caption} />
        </InkStage.Provider>
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
