"use client";

import { useCallback, useRef, useState } from "react";
import { family } from "@/config";
import type { Page, Snapshot } from "@/lib/types";
import { runTool } from "@/lib/voice-tools";
import { useVoice } from "./useVoice";

// The phone remote: put a page on the TV, or talk to it.

const PAGES: Array<{ page: Page; title: string; line: string }> = [
  { page: "home", title: "Home", line: "The quiet screen" },
  { page: "weather", title: "The Weather", line: "Today and the week ahead" },
  { page: "week", title: "The Week Ahead", line: "The family calendar" },
  { page: "notebook", title: "Ideas", line: "An idea, a quote, or a question" },
];

async function show(page: Page) {
  const res = await fetch("/api/show", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page }),
  });
  if (!res.ok) throw new Error(`show ${res.status}`);
}

export function Remote({ snapshot }: { snapshot: Snapshot }) {
  const [sent, setSent] = useState<{ page: Page; ok: boolean } | null>(null);
  const clear = useRef<number | undefined>(undefined);

  const send = useCallback(async (page: Page) => {
    window.clearTimeout(clear.current);
    const ok = await show(page).then(
      () => true,
      () => false,
    );
    setSent({ page, ok });
    clear.current = window.setTimeout(() => setSent(null), 3000);
  }, []);

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
          <li key={p.page} className="border-b border-rule/40">
            <button
              onClick={() => send(p.page)}
              className="w-full py-5 text-left active:opacity-60"
            >
              <span className="block text-[1.9rem] leading-tight">{p.title}</span>
              <span className="block text-lg text-ink-soft italic">
                {sent?.page === p.page
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
