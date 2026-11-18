"use client";

import { useEffect, useState } from "react";
import type { ShowRequest, TeamView } from "@/lib/types";

/** A team, by ESPN league and id (dev: `fake` asks for a made-up page instead). */
export type TeamRef = NonNullable<ShowRequest["team"]> & { fake?: string };

/** How often the page is fetched again: every minute while a game of theirs is on, else five. */
export const refreshMs = (view: TeamView | null) => (view?.live ? 60_000 : 5 * 60_000);

/**
 * One team's page, while one is asked for: fetched when asked, and again
 * every few minutes (a game under way moves). `pending` until the first
 * answer; if none comes, `view` stays null and the screen shows the games
 * page as usual.
 */
export function useTeam(ref: TeamRef | null): { view: TeamView | null; pending: boolean } {
  const key = ref ? `${ref.league}:${ref.id}:${ref.fake ?? ""}` : "";
  const [got, setGot] = useState<{ key: string; view: TeamView | null } | null>(null);
  // Faster while a game of theirs is on (a fresh fetch when that changes).
  const every = refreshMs(got?.key === key ? got.view : null);
  useEffect(() => {
    if (!key) return;
    const [league, id, fake] = key.split(":");
    let alive = true;
    const load = async () => {
      try {
        const q = new URLSearchParams({ league, id, ...(fake ? { fake } : {}) });
        const res = await fetch(`/api/team?${q}`, { cache: "no-store" });
        const view = res.ok ? ((await res.json()) as TeamView | null) : null;
        // A failed refresh keeps what's shown.
        if (alive) setGot((g) => (view || g?.key !== key ? { key, view } : g));
      } catch {
        if (alive) setGot((g) => (g?.key === key ? g : { key, view: null }));
      }
    };
    load();
    const t = window.setInterval(load, every);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [key, every]);
  const mine = got?.key === key ? got : null;
  return { view: key ? (mine?.view ?? null) : null, pending: Boolean(key) && !mine };
}
