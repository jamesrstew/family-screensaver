"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SHOW_TTL_MS } from "@/lib/show";
import { moodOf, type Mood } from "@/lib/time";
import { PAGES, type ShowRequest, type Snapshot, type Page } from "@/lib/types";
import { runTool } from "@/lib/voice-tools";
import { HomePage } from "@/views/HomePage";
import { NightPage } from "@/views/NightPage";
import { NotebookPage } from "@/views/NotebookPage";
import { WeatherPage } from "@/views/WeatherPage";
import { WeekPage } from "@/views/WeekPage";
import { Ink, InkStage, OUT_MS, STAGGER_MS } from "./Ink";
import { useVoice } from "./useVoice";

/*
 * The screen runs the TV. It keeps the snapshot fresh, keeps time, listens
 * for requests, turns pages with ink, and always finds its way home.
 * Everything here is quiet: nothing on screen moves unless something changed.
 */

type View = Page | "night";

/** How long a page stays up before the screen returns home. */
const HOLD_MS: Record<Page, number> = {
  home: Infinity,
  weather: 4 * 60_000,
  week: 6 * 60_000,
  notebook: 5 * 60_000,
};

const SNAPSHOT_EVERY_MS = 5 * 60_000;
const ASK_EVERY_MS = { day: 4_000, night: 20_000 };
const TICK_MS = 10_000;
const DRIFT_EVERY_MS = 4 * 60_000;
const LEAVE_MS = OUT_MS + STAGGER_MS * 3;

const viewOf = (page: Page, mood: Mood): View =>
  page === "home" && mood === "night" ? "night" : page;

export function Screen({ initial, initialPage }: { initial: Snapshot; initialPage: Page }) {
  const [snapshot, setSnapshot] = useState(initial);
  // First render uses the server's clock so hydration matches; then real time.
  const [now, setNow] = useState(() => new Date(initial.issuedAt));
  const [page, setPage] = useState<Page>(initialPage);
  const pageSince = useRef(0);
  const mood = moodOf(now, snapshot.timeZone);

  // ---- Pages turn with ink: the old one sinks, then the new one soaks in.
  const target = viewOf(page, mood);
  const [view, setView] = useState<View>(target);
  const leaving = target !== view;
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setView(target), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [leaving, target]);

  const show = useCallback((p: Page) => {
    pageSince.current = Date.now();
    setPage(p);
  }, []);

  // ---- Time. A tick every few seconds; the clock shows minutes.
  useEffect(() => {
    pageSince.current = Date.now();
    const first = window.setTimeout(() => setNow(new Date()), 0);
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
    const t = window.setInterval(async () => {
      try {
        const res = await fetch("/api/snapshot", { cache: "no-store" });
        if (res.status === 401) return window.location.reload();
        if (res.ok) setSnapshot(await res.json());
      } catch {
        // Offline: keep printing what we have.
      }
    }, SNAPSHOT_EVERY_MS);
    return () => window.clearInterval(t);
  }, []);

  // ---- Requests from the phone remote, Siri, Alexa.
  const lastSeq = useRef<number | null>(null);
  const night = mood === "night";
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
    const t = window.setInterval(poll, night ? ASK_EVERY_MS.night : ASK_EVERY_MS.day);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [night, show]);

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

  const props = { snapshot, now, mood };
  return (
    <div
      data-surface="tv"
      data-mood={mood}
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
        <InkStage.Provider value={leaving}>
          <div key={view} className="h-full">
            {view === "home" && <HomePage {...props} />}
            {view === "night" && <NightPage {...props} />}
            {view === "weather" && <WeatherPage {...props} />}
            {view === "week" && <WeekPage {...props} />}
            {view === "notebook" && <NotebookPage {...props} />}
          </div>
        </InkStage.Provider>
        <VoiceLine state={voice.state} caption={voice.caption} />
      </main>
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
    <div className="pointer-events-none absolute inset-x-[5.5rem] bottom-[1.4rem] flex justify-center">
      <Ink k={state === "speaking" ? "speaking" : state} className="max-w-[90rem] text-center">
        <p className="bg-paper px-6 text-[2.1rem] leading-snug text-ink italic">{words}</p>
      </Ink>
    </div>
  );
}
