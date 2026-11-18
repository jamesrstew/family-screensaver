import { useState } from "react";
import { Ink } from "@/components/Ink";
import {
  ahead,
  chanceOf,
  joinWord,
  leafAt,
  leavesOf,
  nightGame,
  ours,
  slideGames,
  standing,
  whenWord,
} from "@/lib/games";
import type { Game, Side } from "@/lib/types";
import type { ViewProps } from "./parts";

/*
 * The games: an agenda by day, in the Almanac's hand. Each game is one line:
 * the hour, a small engraved ball for the sport, the teams with their ranks
 * as small figures, the channel, and the chance of winning: the market's
 * where it trades, else ESPN's predictor. The family's own teams are set in
 * full ink, the rest in soft; their next game carries the page's one accent
 * (by day only: night has none, §4). A long agenda turns in leaves, half a
 * minute each. With no games at all, the screen shows home instead (Screen).
 *
 * Sizes are in em, from the page's own size: a short agenda (three games or
 * fewer) is set larger, as there's room.
 */

// The hour, the ball, the teams, the channel, the chance (each line its own
// grid, the same columns, so the lines align without a shared one).
const COLS = "grid grid-cols-[13em_3.2em_1fr_16em_19em] gap-x-[2em]";

/** Lines on a leaf: day names and games together. */
export const ROWS = 10;
/** A short agenda, set larger. */
const FEW = 3;
const LARGER = 1.2;

/**
 * `games`: the snapshot's, as fresh as they are now (freshGames, in Screen).
 * As one of home's slides, it's the first leaf alone, of the page's few days,
 * a family team's game today leading.
 */
export function SportsPage({
  snapshot,
  now,
  mood,
  slide,
  games: all,
}: ViewProps & { games: Game[] }) {
  const tz = snapshot.timeZone;
  const one = slide?.kind === "games";
  const games = one ? slideGames(all, now, tz) : all;
  // The leaves turn from the moment the page appears (it remounts each time).
  const [since] = useState(() => now.getTime());
  const leaves = leavesOf(games, now, tz, ROWS).slice(0, one ? 1 : undefined);
  const n = leafAt(now.getTime(), since, leaves.length);
  const leaf = leaves[n] ?? [];
  // The family's next game still to finish carries the accent (on whichever
  // leaf it falls, so it never moves from line to line as the leaves turn).
  // Night has no accent.
  const accent =
    mood === "night"
      ? undefined
      : (games.find((g) => ours(g) && g.state !== "post") ?? games.find(ours));
  // Every leaf has as many places as the longest, so a turn re-inks line by
  // line (a line the same as before holds still) and nothing simply vanishes.
  const places = Math.max(...leaves.map((l) => l.length));

  return (
    // One leaf sits in the middle of the page; a turning agenda hangs from the
    // top, so its lines stay put from leaf to leaf.
    <div
      className={`flex h-full flex-col ${leaves.length > 1 ? "justify-start pt-[4rem]" : "justify-center pb-[1rem]"}`}
      style={{ fontSize: `${games.length <= FEW ? LARGER : 1}rem` }}
    >
      <div className="relative isolate">
        {/* On home, a layer of paper under the list: the sky passes behind, never through a line. */}
        {one ? <div className="sky-word-clearing games-clearing" aria-hidden /> : null}
        {Array.from({ length: places }, (_, i) => {
          const line = leaf[i];
          return (
            <Ink
              key={i}
              k={
                !line ? "" : line.kind === "day" ? line.key : `${line.game.league}:${line.game.id}`
              }
              order={i * 0.35}
              plain
            >
              {!line ? null : line.kind === "day" ? (
                <div
                  className={`flex items-baseline gap-[2em] ${i ? "pt-[2.2em]" : ""} pb-[0.6em]`}
                >
                  <p className="text-[3.2em] leading-none whitespace-nowrap text-ink-soft italic">
                    {line.label}
                  </p>
                  <div className="h-px flex-1 translate-y-[-0.9em] bg-rule" />
                </div>
              ) : (
                <Row game={line.game} tz={tz} accent={line.game === accent} />
              )}
            </Ink>
          );
        })}
      </div>
    </div>
  );
}

function Row({ game: g, tz, accent }: { game: Game; tz: string; accent: boolean }) {
  const mine = ours(g);
  const lead = ahead(g);
  const odds = chanceOf(g);
  const live = g.state === "in";
  const final = g.state === "post";
  // A long pairing ("Florida International at Western Kentucky") takes the short names.
  const long = g.away.name.length + g.home.name.length > 30;
  // One side only, even when two of the family's teams meet (then the home side).
  const lit = accent ? (g.home.mine ? g.home : g.away) : null;
  const side = (s: Side) => (
    <Team
      side={s}
      long={long}
      ink={
        s === lit
          ? "text-accent"
          : lead
            ? lead === s
              ? "text-ink"
              : "text-ink-soft"
            : mine
              ? "text-ink"
              : "text-ink-soft"
      }
    />
  );
  return (
    <div className={`${COLS} items-baseline py-[0.55em]`}>
      <p
        className={`text-right text-[2.8em] leading-[1.3] whitespace-nowrap ${
          // Under way, in ink; over, in soft italic, like a note.
          live ? "text-ink" : final ? "text-ink-soft italic" : mine ? "text-ink" : "text-ink-soft"
        }`}
      >
        <When g={g} tz={tz} />
      </p>
      <Ball league={g.league} />
      <p className="truncate text-[3.3em] leading-[1.3]">
        {side(g.away)} <span className="text-[0.8em] text-ink-faint italic">{joinWord(g)}</span>{" "}
        {side(g.home)}
      </p>
      <p className="text-[2.6em] leading-[1.3] whitespace-nowrap text-ink-soft italic">
        {g.tv ?? ""}
      </p>
      {/* Right-aligned as a row, so a long name runs left into the channel's air, never past the margin. */}
      <p className="flex items-baseline justify-end gap-[0.25em] text-[3em] leading-[1.3] whitespace-nowrap">
        {g.state !== "pre" && g.away.score !== undefined && g.home.score !== undefined ? (
          // The score in the matchup's order: away, then home.
          <span className={final ? "text-ink-soft" : "text-ink"}>
            {g.away.score}&ndash;{g.home.score}
          </span>
        ) : odds?.pct === 50 ? (
          // A true toss-up names no side.
          <span className="text-ink-soft italic">Even</span>
        ) : odds ? (
          <>
            <span className="text-[0.85em] text-ink-soft italic">{odds.side.short}</span>
            <span className={mine ? "text-ink" : "text-ink-soft"}>{odds.pct}%</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

/** "¹⁹ Iowa": the rank as a small figure, in soft ink, before the name. */
function Team({ side, long, ink }: { side: Side; long: boolean; ink: string }) {
  return (
    <span className={ink}>
      {side.rank ? (
        <span className="mr-[0.25em] align-[0.4em] text-[0.66em] text-ink-soft not-italic">
          {side.rank}
        </span>
      ) : null}
      {long ? side.short : side.name}
    </span>
  );
}

/**
 * The sport, as a small engraving: a football lying flat with its laces, or a
 * basketball with its seams. Fine strokes in currentColor, a little hatching
 * for the shade (Engraving.tsx's manner, smaller).
 */
const FOOTBALL = "M8 50 C25 22 75 22 92 50 C75 78 25 78 8 50 Z";

export function Ball({ league }: { league: Game["league"] }) {
  const id = `ball-${league}`;
  return (
    <svg
      viewBox="0 0 100 100"
      className="size-[3.2em] translate-y-[0.35em] self-center text-ink-soft"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden
    >
      {league === "cbb" ? (
        <>
          <defs>
            <clipPath id={id}>
              <circle cx="50" cy="50" r="38" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${id})`} strokeWidth={1.3}>
            {[64, 70, 76, 82, 88].map((y) => (
              <line key={y} x1="0" y1={y} x2="100" y2={y - 14} />
            ))}
          </g>
          <circle cx="50" cy="50" r="38" strokeWidth={4} />
          <path d="M50 12 V88 M12 50 H88" strokeWidth={3} />
          <path d="M23 23 C38 38 38 62 23 77 M77 23 C62 38 62 62 77 77" strokeWidth={3} />
        </>
      ) : (
        // Lying flat: a lemon, its seam level, four stitches across it.
        <>
          <defs>
            <clipPath id={id}>
              <path d={FOOTBALL} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${id})`} strokeWidth={1.3}>
            {[60, 66, 72, 78].map((y) => (
              <line key={y} x1="0" y1={y} x2="100" y2={y} />
            ))}
          </g>
          <path d={FOOTBALL} strokeWidth={4} />
          <path d="M32 50 H68" strokeWidth={3} />
          {[38, 46, 54, 62].map((x) => (
            <path key={x} d={`M${x} 44 V56`} strokeWidth={2.6} />
          ))}
        </>
      )}
    </svg>
  );
}

/**
 * The night's one game (§4: one quiet piece, never a list): a family game
 * under way, or about to start. Centered, in night's soft ink, no accent:
 * "Packers at Bears" over "5:15 p.m., ESPN", or "4th qtr., Bears lead 24–20".
 */
export function NightGame({
  snapshot,
  now,
  games,
  cued,
}: ViewProps & { games: Game[]; cued?: string }) {
  // The game the cycle was cued for (its score moves on; the game doesn't change).
  const g = games.find((x) => `${x.league}:${x.id}` === cued) ?? nightGame(games, now);
  if (!g) return null;
  const tz = snapshot.timeZone;
  const note =
    g.state === "in"
      ? [g.period, standing(g)].filter(Boolean).join(", ")
      : [whenWord(g, tz), g.tv].filter(Boolean).join(", ");
  return (
    <div className="flex h-full flex-col items-center justify-center pb-[4rem] text-center">
      <Ink k={`${g.league}:${g.id}`} order={0} className="relative isolate">
        <div className="sky-word-clearing text-clearing" aria-hidden />
        <p className="text-[5.6rem] leading-[1.15] text-ink-soft">
          <Team side={g.away} long={false} ink="text-ink-soft" />{" "}
          <span className="text-[0.7em] text-ink-faint italic">{joinWord(g)}</span>{" "}
          <Team side={g.home} long={false} ink="text-ink-soft" />
        </p>
      </Ink>
      <Ink k={`${g.id}:${note}`} order={1} className="relative isolate mt-[2rem]">
        <div className="sky-word-clearing text-clearing" aria-hidden />
        <p className="text-[3.2rem] text-ink-faint italic">{note}</p>
      </Ink>
    </div>
  );
}

/** The hour, or where a game stands; a kickoff not yet set, "TBA", faint. */
export function When({ g, tz }: { g: Game; tz: string }) {
  const word = whenWord(g, tz);
  return g.state === "pre" && !g.timed && !g.period ? (
    <span className="text-ink-faint italic">{word}</span>
  ) : (
    <>{word}</>
  );
}
