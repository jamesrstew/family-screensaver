"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SHOW_TTL_MS, leagueFor, pageKey, targetOf, teamFor, viewAsked } from "@/lib/show";
import {
  CYCLE_MS,
  latchCue,
  nextTurnIn,
  startAfter,
  slideFromKey,
  slideKey,
  slideOf,
  turns,
  type GamesCue,
  type Slide,
  type Start,
  type WeatherView,
} from "@/lib/carousel";
import {
  freshGames,
  gamesCue,
  leagueView,
  nightGame,
  slideGames,
  type LeaguePick,
} from "@/lib/games";
import { freshIndoor } from "@/lib/indoor";
import {
  levelAt,
  isReady,
  modeFailed,
  modeGivesUp,
  modeJob,
  modeN,
  modeOnward,
  modeReady,
  modeSlot,
  modeStart,
  noteReady,
  orderOf,
  type Mode,
  type Picked,
  type Ready,
  SOUND_KEY,
  soundNamed,
  type Sound,
} from "@/lib/nature";
import { hashOf } from "@/lib/organic";
import { dayKey, moodOf, parts, twilightOf, type Mood } from "@/lib/time";
import { PAGES, type Asks, type Snapshot, type Page } from "@/lib/types";
import { runTool } from "@/lib/voice-tools";
import { HomePage } from "@/views/HomePage";
import { NightPage } from "@/views/NightPage";
import { NotebookPage } from "@/views/NotebookPage";
import { NightGame, SportsPage } from "@/views/SportsPage";
import { TeamPage, stubTeam } from "@/views/TeamPage";
import { useTeam, type TeamRef } from "./useTeam";
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
import { NATURE_GONE_MS, NatureWindow, useClips, type Phase } from "./Nature";
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
  | `sports:${string}`
  | `weather:${WeatherView}`;

/** How long a page stays up before the screen returns home. */
const HOLD_MS: Record<Page, number> = {
  home: Infinity,
  weather: 4 * 60_000,
  week: 6 * 60_000,
  notebook: 5 * 60_000,
  sports: 5 * 60_000,
  // Asked for, nature plays clip after clip a good while, then goes home too.
  nature: 60 * 60_000,
};

const SNAPSHOT_EVERY_MS = 5 * 60_000;
// Ask often while people are up; rarely in the small hours (by the clock, not the sun).
const ASK_EVERY_MS = { awake: 4_000, asleep: 20_000 };
// The clock shows minutes; the carousel's turns get a timer of their own.
const TICK_MS = 10_000;
const DRIFT_EVERY_MS = 4 * 60_000;

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

/** The team someone named, as the server finds it; null if no team answers to it. */
async function findTeamFor(team: string): Promise<TeamRef | null> {
  try {
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team }),
    });
    return res.ok ? ((await res.json()) as { team: TeamRef | null }).team : null;
  } catch {
    return null;
  }
}

const viewOf = (page: Page, mood: Mood): Page | "night" =>
  page === "home" && mood === "night" ? "night" : page;

export function Screen({
  initial,
  initialPage,
  initialTeam = null,
  initialLeague = null,
  design = null,
}: {
  initial: Snapshot;
  initialPage: Page;
  /** Dev only: a made-up team page to open on (?team=season|live|off). */
  initialTeam?: TeamRef | null;
  /** One league's games to open on (?page=sports&league=nfl). */
  initialLeague?: LeaguePick | null;
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
  // One team's games, asked for by name (voice or Siri).
  const [teamRef, setTeamRef] = useState<TeamRef | null>(initialTeam);
  const team = useTeam(teamRef);
  // One league's games, asked for by name ("show college football").
  const [league, setLeague] = useState<LeaguePick | null>(initialLeague);
  // How nature sounds: gentle until the family asks otherwise; the TV keeps
  // the last asking (storage that's missing or blocked just means gentle).
  // (Read once, on the TV; it draws nothing, so the server's guess can't mismatch.)
  const [sound, setSound] = useState<Sound>(() => {
    try {
      return soundNamed(localStorage.getItem(SOUND_KEY)) ?? "soft";
    } catch {
      return "soft";
    }
  });
  const hear = useCallback((s: Sound) => {
    setSound(s);
    try {
      localStorage.setItem(SOUND_KEY, s);
    } catch {}
  }, []);
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
  // Nature mode needs clips and the Almanac: where there are none (not the
  // TV), it's simply home.
  const clips = useClips();
  const askedBase = viewOf(page, mood);
  // No games to show (the off-season, the scores didn't answer, or the list
  // has gone stale): home.
  const games = freshGames(snapshot, now);
  // A league's page: its games, the NFL's whole slate among them. With none,
  // the page says so, but only when that's known to be true (leagueView);
  // otherwise it's home, and the asking is over (it never comes back on its
  // own when the scores do).
  const slate = freshGames({ games: snapshot.nfl, gamesAt: snapshot.gamesAt }, now);
  const leagueList = league ? leagueView(games, slate, league) : null;
  if (page === "sports" && league && leagueList === null && !teamRef) {
    setPage("home");
    setLeague(null);
  }
  const noGames = league ? leagueList === null : !games?.length;
  const base =
    (askedBase === "nature" && (design !== "almanac" || clips?.length === 0)) ||
    (askedBase === "sports" && noGames && !team.view && !team.pending)
      ? viewOf("home", mood)
      : askedBase;
  const [homeStart, setHomeStart] = useState<Start>(() => ({
    since: Date.parse(initial.issuedAt),
  }));
  const [lastBase, setLastBase] = useState(base);
  if (base !== lastBase) {
    setLastBase(base);
    // Day and night are one carousel; back from another page, it starts over.
    setHomeStart(startAfter(lastBase, base, now.getTime(), homeStart));
  }
  const carousel = turns(base) && design === "almanac";
  const hasWeather = Boolean(snapshot.weather);

  const tz = snapshot.timeZone;
  // Word from the windows: which clips are loaded and waiting.
  const [ready, setReady] = useState<Ready[]>([]);

  // Nature mode: a session per asking (lib/nature.ts), clip after clip, the
  // next loading in the other window while the current one plays out.
  // A page opened straight onto nature starts where the clock says, like any
  // asking (from the snapshot's time, the same on server and TV).
  const [mode, setMode] = useState<Mode>(() => modeStart(null, Date.parse(initial.issuedAt)));
  const [cur, setCur] = useState<Picked | null>(null);
  const [next, setNext] = useState<Picked | null>(null);
  const [nearN, setNearN] = useState<number | null>(null);
  const onward = useCallback(
    (n: number) => {
      setMode((m) => modeOnward(m, n));
      setNearN(null);
    },
    [setMode],
  );
  const onNear = useCallback((n: number) => setNearN(n), []);
  const onFail = useCallback(
    (n: number) => {
      setMode((m) => modeFailed(m, n));
      // One loading ahead that won't: drop it; it's tried again in its turn.
      setNext((j) => (j?.n === n ? null : j));
      setNearN(null);
    },
    [setMode],
  );
  const onReady = useCallback(
    (n: number, id: string) => {
      setReady((list) => noteReady(list, { n, id, at: clockNow() }));
      setMode((m) => modeReady(m, n));
    },
    [setMode],
  );
  // Five clips in a row that won't play (a drive gone): home.
  if (page === "nature" && modeGivesUp(mode)) setPage("home");
  const inMode = base === "nature" && Boolean(clips?.length);
  if (inMode && clips) {
    const id = devClip();
    const first = id ? Math.max(orderOf(clips, id), 0) : Math.floor(mode.at / 60_000);
    const want = modeN(mode, mode.k);
    if (cur?.n !== want) {
      const j = next?.n === want ? next : modeJob(clips, mode, mode.k, first);
      if (j) setCur(j);
    } else if (nearN === cur.n && next?.n !== modeN(mode, mode.k + 1)) {
      const j = modeJob(clips, mode, mode.k + 1, first);
      if (j) setNext(j);
    }
  }
  // The app hidden (the TV on another app): no clip plays, nothing counts as failed.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const seen = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, []);

  // Two windows, taking turns, so the next clip loads while the current one plays out.
  // From a clip's first frame until it has sunk, the page is the clip's: no sky.
  const [busyA, setBusyA] = useState(false);
  const [busyB, setBusyB] = useState(false);
  // Where each clip is in coming and going: the strip comes only once it's full.
  const [phaseA, setPhaseA] = useState<Phase>("hidden");
  const [phaseB, setPhaseB] = useState<Phase>("hidden");
  // The weather view someone asked for by name ("hourly"); otherwise ?weather=.
  const [view0, setView0] = useState<WeatherView | null>(null);
  const fromUrl = useAsked();
  // Home's games slide: by day, the agenda; by night, only a family game
  // under way or about to start, alone (§4). Decided as each cycle begins,
  // so a slide never turns mid-slot when a game ends or the night falls.
  const cycle = Math.floor(Math.max(now.getTime() - homeStart.since, 0) / CYCLE_MS);
  const tonight = mood === "night" ? nightGame(games, now) : null;
  const cueNow: GamesCue =
    mood === "night"
      ? {
          any: Boolean(tonight),
          ours: true,
          anyHour: true,
          ...(tonight ? { game: `${tonight.league}:${tonight.id}` } : {}),
        }
      : gamesCue(games, now, tz);
  const [cueAt, setCueAt] = useState({ cycle, cue: cueNow });
  const latched = latchCue(cueAt, cycle, cueNow);
  if (latched !== cueAt) setCueAt(latched);
  const cue = latched.cue;
  const drawnTarget = targetOf({
    base,
    slide: carousel ? slideKey(slideOf(now, homeStart, hasWeather, tz, cue)) : null,
    asked: view0,
    fromUrl,
  });
  // One league's games is a page of its own ("sports:nfl"): from the
  // scoreboard to a league, or league to league, the page turns in ink.
  const target = (drawnTarget === "sports" && league ? `sports:${league}` : drawnTarget) as View;
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
    const clip = view === "nature";
    const out = clip ? Math.max(leaveMs(), NATURE_GONE_MS) : leaveMs();
    const wait = swapDelay(leaving, turning, justTurned, out);
    if (wait === null) return;
    const t = window.setTimeout(() => setView(target), wait);
    return () => window.clearTimeout(t);
  }, [leaving, target, turning, view]);

  const show = useCallback(
    (p: Page, v?: WeatherView, t?: TeamRef | null, l?: LeaguePick | null) => {
      pageSince.current = Date.now();
      setPage(p);
      setView0(viewAsked(p, v));
      // One team's games, or one league's, or neither: any other asking clears them.
      setTeamRef(teamFor(p, t));
      setLeague(leagueFor(p, l, t));
      // Asking for nature starts a fresh session, whatever happened to the last.
      if (p === "nature") setMode((m) => modeStart(m, clockNow()));
    },
    [setMode, setView0, setTeamRef, setLeague],
  );

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
          // So do missed scores; freshGames retires them at 30 minutes.
          ...(next.games ? {} : { games: prev.games, gamesAt: prev.gamesAt, nfl: prev.nfl }),
        }));
      } catch {
        // Offline: keep printing what we have.
      }
    }, SNAPSHOT_EVERY_MS);
    return () => window.clearInterval(t);
  }, []);

  // ---- Requests from the phone remote, Siri, Alexa.
  const lastSeq = useRef<number | null>(null);
  const lastSound = useRef<number | null>(null);
  // Late at night the TV asks less often, but not during nature (a "mute" is
  // heard within seconds).
  const asleep = (() => {
    if (page === "nature") return false;
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
        const { heard, ...ask } = (await res.json()) as Asks;
        // Only a recent request counts (a TV waking up shouldn't obey
        // yesterday's). Pages and sound are asked for apart, and kept apart.
        const fresh = (at: string) => Date.now() - Date.parse(at) < SHOW_TTL_MS;
        if (heard && heard.seq !== lastSound.current) {
          lastSound.current = heard.seq;
          if (fresh(heard.at)) hear(heard.sound);
        }
        const known = lastSeq.current;
        lastSeq.current = ask.seq;
        if (!("page" in ask) || ask.seq === known) return;
        if (fresh(ask.at)) show(ask.page, ask.view, ask.team, ask.league);
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
  }, [asleep, show, hear]);

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
          show: async (p, v, team, league) => {
            // A team, as said: the server finds it (or doesn't, and it's the games as usual).
            const t = team ? await findTeamFor(team) : null;
            show(p, v, t, team ? null : league);
            return team ? t !== null : undefined;
          },
          sound: hear,
          hangUp: () => {},
        }),
      [show, hear],
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

  // The games page, whole or one league's (as drawn: while it sinks, the one it was).
  const sports = shown === "sports" || shown.startsWith("sports:");
  const shownLeague = shown.startsWith("sports:") ? (shown.slice(7) as LeaguePick) : null;
  const asked = shown.startsWith("weather:") ? (shown.slice(8) as WeatherView) : undefined;
  // A carousel slide: a weather view ("carousel:…", the same by day or by
  // night, so sunset doesn't re-ink it), or a passage by day ("home:…") or
  // by night ("night:…").
  const [at, key] = shown.split(":");
  const slide =
    (at === "home" || at === "night" || at === "carousel") && key ? slideFromKey(key) : undefined;
  const props = { snapshot, now, mood, slide, inside: freshIndoor(snapshot, now)?.temp ?? null };
  // A games slide with nothing left to show gives its place back to the passage it took.
  const gamesGone =
    slide?.kind === "games" &&
    (mood === "night"
      ? !(games ?? []).some((g) => `${g.league}:${g.id}` === cue.game)
      : slideGames(games ?? [], now, tz).length === 0);
  const instead: Slide | undefined =
    slide?.kind === "games" ? { kind: "passage", n: 2 * slide.n + 1 } : undefined;
  // The clip plays once it's loaded, while the app is in view, and sinks as the page leaves.
  const curIn = inMode && cur !== null && modeSlot(cur.n) === 1 ? "B" : "A";
  const on = inMode && !leaving && shown === "nature" && isReady(ready, cur) && !hidden;
  const jobIn = (w: "A" | "B") => {
    if (!inMode) return null;
    const mine = (j: Picked | null) => (j && (modeSlot(j.n) === 1 ? "B" : "A") === w ? j : null);
    return mine(cur) ?? mine(next);
  };
  const natureBusy = busyA || busyB;
  const clipPhase = curIn === "B" ? phaseB : phaseA;
  const stripClip = shown === "nature" ? (cur?.clip ?? null) : null;
  const volume = levelAt(paper, twilight);
  // The design under trial redraws home, night, and weather; Week and Ideas keep their own.
  const stripUp = clipPhase === "full" || clipPhase === "closing";
  const drawn =
    kit &&
    (shown === "home" ||
      slide ||
      shown === "night" ||
      asked ||
      shown === "nature" ||
      // The games are set in the Almanac's face, on bare paper.
      (sports && design === "almanac"))
      ? kit
      : null;
  return (
    <div
      data-surface="tv"
      data-mood={paper}
      data-design={drawn ? (design ?? undefined) : undefined}
      data-settled={settled ? "" : undefined}
      data-turning={turning ? "" : undefined}
      // The sky stays stopped through nature mode, gaps included.
      data-nature={natureBusy || base === "nature" ? "" : undefined}
      className="paper flex h-dvh w-screen cursor-none items-center justify-center overflow-hidden"
      onClick={snapshot.voice ? voice.toggle : undefined}
    >
      {/* A nature clip, full screen behind the page (which drifts; the picture needn't). */}
      {design === "almanac"
        ? (["A", "B"] as const).map((w) => (
            <NatureWindow
              key={w}
              job={jobIn(w)}
              on={on && curIn === w}
              volume={volume}
              sound={sound}
              onReady={onReady}
              onFail={onFail}
              onBusy={w === "A" ? setBusyA : setBusyB}
              onPhase={w === "A" ? setPhaseA : setPhaseB}
              onEnd={onward}
              onNear={onNear}
            />
          ))
        : null}
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
            hidden={!drawn || natureBusy || shown === "nature" || sports}
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
            words={slide?.kind === "weather" || slide?.kind === "games"}
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
              {drawn &&
                slide?.kind === "games" &&
                (gamesGone ? (
                  // The games it was cued for are gone (over, or the list went
                  // stale): the cycle's passage, never bare paper.
                  mood === "night" ? (
                    <drawn.Night {...props} slide={instead} />
                  ) : (
                    <drawn.Home {...props} slide={instead} />
                  )
                ) : mood === "night" ? (
                  <NightGame {...props} games={games ?? []} cued={cue.game} />
                ) : (
                  <SportsPage {...props} games={games ?? []} />
                ))}
              {shown === "night" && (drawn ? <drawn.Night {...props} /> : <NightPage {...props} />)}
              {asked &&
                (drawn ? <drawn.Weather {...props} view={asked} /> : <WeatherPage {...props} />)}
              {drawn && stripClip && stripUp ? (
                // The strip sinks before the clip does: it leaves as the clip closes.
                <InkStage.Provider value={leaving || turning || clipPhase === "closing"}>
                  <NatureStrip key={stripClip.id} {...props} clip={stripClip} />
                </InkStage.Provider>
              ) : null}
              {shown === "week" && <WeekPage {...props} />}
              {shown === "notebook" && <NotebookPage {...props} />}
              {sports &&
                // One team's page: its name at once (from the asking), its games
                // inking in below as they arrive; the games as usual if it can't be had.
                (team.view ? (
                  <TeamPage {...props} team={team.view} />
                ) : team.pending ? (
                  teamRef?.name ? (
                    <TeamPage
                      {...props}
                      team={stubTeam({ ...teamRef, name: teamRef.name })}
                      loading
                    />
                  ) : null
                ) : (
                  <SportsPage
                    {...props}
                    games={
                      shownLeague ? (leagueView(games, slate, shownLeague) ?? []) : (games ?? [])
                    }
                    league={shownLeague}
                  />
                ))}
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
