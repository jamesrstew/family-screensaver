"use client";

import { useCallback, useRef, useState } from "react";
import { family } from "@/config";
import type { WeatherView } from "@/lib/carousel";
import type { LeaguePick } from "@/lib/games";
import type { Page, ShowRequest, Snapshot } from "@/lib/types";
import { runTool } from "@/lib/voice-tools";
import { useVoice } from "./useVoice";

// The phone remote: put a page on the TV, or talk to it.

type Ask = { page: Page; view?: WeatherView; league?: LeaguePick };
const PAGES: Array<Ask & { title: string; line: string }> = [
  { page: "home", title: "Home", line: "The quiet screen" },
  { page: "weather", title: "The Weather", line: "The sky right now" },
  { page: "weather", view: "hours", title: "Hour by Hour", line: "The next day, hour by hour" },
  { page: "weather", view: "days", title: "Seven Days", line: "The week’s weather" },
  { page: "week", title: "The Week Ahead", line: "The family calendar" },
  { page: "notebook", title: "Ideas", line: "An idea, a quote, or a question" },
  { page: "sports", title: "The Games", line: "Our teams and the Top 25" },
  { page: "sports", league: "cfb", title: "College Football", line: "Football’s Top 25, and ours" },
  {
    page: "sports",
    league: "cbb",
    title: "College Basketball",
    line: "Basketball’s Top 25, and ours",
  },
  { page: "sports", league: "nfl", title: "The NFL", line: "Every game of the next few days" },
  { page: "nature", title: "Nature", line: "Real places, one after another" },
];
const id = (a: Ask) => [a.page, a.view ?? a.league].filter(Boolean).join(":");

// One team's games has no button: it's asked for by voice (or Siri) only.
async function show(page: Page, view?: WeatherView, team?: string, league?: LeaguePick) {
  const res = await fetch("/api/show", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page,
      ...(view ? { view } : {}),
      ...(team ? { team } : {}),
      ...(league ? { league } : {}),
    }),
  });
  if (!res.ok) throw new Error(`show ${res.status}`);
  return (await res.json()) as ShowRequest;
}

export function Remote({ snapshot }: { snapshot: Snapshot }) {
  const [sent, setSent] = useState<{ id: string; ok: boolean } | null>(null);
  const clear = useRef<number | undefined>(undefined);

  const send = useCallback(
    async (page: Page, view?: WeatherView, team?: string, league?: LeaguePick) => {
      window.clearTimeout(clear.current);
      const asked = await show(page, view, team, league).catch(() => null);
      const ok = asked !== null;
      setSent({ id: id({ page, view, league }), ok });
      clear.current = window.setTimeout(() => setSent(null), 3000);
      // For the voice: whether the team asked for was found.
      return team ? Boolean(asked?.team) : undefined;
    },
    [],
  );

  const voice = useVoice(
    useCallback(
      (name, args) =>
        runTool(name, args, { snapshot, now: new Date(), show: send, hangUp: () => {} }),
      [snapshot, send],
    ),
  );
  const talking = voice.state !== "idle" && voice.state !== "failed";

  return (
    <main className="paper mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-12 pb-8">
      <header className="text-center">
        <h1 className="font-masthead text-[3rem] leading-none">{family.name}</h1>
        <p className="mt-2 text-lg text-ink-soft italic">Show on the TV</p>
      </header>

      <ul className="mt-8 border-t border-rule/40">
        {PAGES.map((p) => (
          <li key={id(p)} className="border-b border-rule/40">
            <button
              onClick={() => send(p.page, p.view, undefined, p.league)}
              className="w-full py-5 text-left active:opacity-60"
            >
              <span className="block text-[1.9rem] leading-tight">{p.title}</span>
              <span className="block text-lg text-ink-soft italic">
                {sent?.id === id(p)
                  ? sent.ok
                    ? "On the TV now."
                    : "The TV didn’t answer. Try again."
                  : p.line}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {snapshot.voice ? (
        <div className="mt-auto pt-10 text-center">
          <button
            onClick={voice.toggle}
            className="w-full border-2 border-rule py-5 text-[1.6rem] active:opacity-60"
          >
            {talking ? "Hang up" : "Talk to the TV"}
          </button>
          <p className="mt-3 min-h-[3.5rem] text-lg text-ink-soft italic">
            {voice.state === "speaking"
              ? voice.caption
              : voice.state === "listening"
                ? "Listening…"
                : voice.state === "connecting"
                  ? "One moment…"
                  : voice.state === "failed"
                    ? "I can’t talk just now."
                    : ""}
          </p>
        </div>
      ) : null}
    </main>
  );
}
