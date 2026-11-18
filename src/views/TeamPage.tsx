import { Ink } from "@/components/Ink";
import { dayLabel, whenWord } from "@/lib/games";
import { resultWord, sides } from "@/lib/team-view";
import { addDays, dayKey, shortDate, weekdayOf } from "@/lib/time";
import type { Game, League, TeamView } from "@/lib/types";
import type { ViewProps } from "./parts";
import { Ball } from "./SportsPage";

/*
 * One team's page, asked for by name ("show Kentucky basketball"): the team
 * as a quiet title (its name, the sport, its record and rank), a game under
 * way first if there is one, then its last few results, then its next
 * games, each with its date, hour, opponent, channel, and the team's own
 * chance. In the Almanac's hand, like the games page; the name carries the
 * page's one accent by day, none at night (§4).
 */

const SPORT: Record<League, string> = {
  cfb: "College football",
  cbb: "Men’s basketball",
  nfl: "NFL",
};

// The date, the hour, the opponent, the channel, the chance or result.
const COLS = "grid grid-cols-[15em_11em_1fr_11em_9em] gap-x-[2em] items-baseline";

export function TeamPage({ snapshot, now, mood, team }: ViewProps & { team: TeamView }) {
  const tz = snapshot.timeZone;
  const facts = [
    SPORT[team.league],
    team.record?.replace("-", "–"),
    team.rank ? `No. ${team.rank}` : null,
  ].filter(Boolean);
  // Room on the page: a game under way takes a line from the results and one from the games ahead.
  const ahead = team.ahead.slice(0, team.live ? 5 : 6);
  const results = team.live ? team.results.slice(-2) : team.results;
  // Each block inks after the one above it.
  const at = { order: 0 };
  const next = () => (at.order += 0.35);
  return (
    <div className="flex h-full flex-col justify-center pb-[1rem]">
      <Ink k={`${team.league}:${team.id}`} order={0} className="mb-[1.2rem]">
        <div className="flex items-center gap-[2rem]">
          <span className="text-[1.5rem]">
            <Ball league={team.league} />
          </span>
          <h1
            className={`text-[5rem] leading-none ${mood === "night" ? "text-ink" : "text-accent"}`}
          >
            {team.name}
          </h1>
        </div>
        <p className="mt-[0.8rem] pl-[6.8rem] text-[2.5rem] text-ink-soft italic">
          {facts.join(" · ")}
        </p>
      </Ink>
      {team.live ? (
        <>
          <Head k="now" order={next()} label="Now" />
          <Ink k={`live:${team.live.id}`} order={next()} plain>
            <Line g={team.live} team={team} tz={tz} now={now} />
          </Ink>
        </>
      ) : null}
      {results.length ? (
        <>
          <Head k="lately" order={next()} label="Lately" />
          {results.map((g) => (
            <Ink key={g.id} k={`r:${g.id}`} order={next()} plain>
              <Line g={g} team={team} tz={tz} now={now} />
            </Ink>
          ))}
        </>
      ) : null}
      <Head k="next" order={next()} label="Next" />
      {ahead.length ? (
        ahead.map((g) => (
          <Ink key={g.id} k={`a:${g.id}`} order={next()} plain>
            <Line g={g} team={team} tz={tz} now={now} />
          </Ink>
        ))
      ) : (
        <Ink k="none" order={next()} plain>
          <p className="py-[0.5rem] text-[2.8rem] text-ink-soft italic">No games ahead yet.</p>
        </Ink>
      )}
    </div>
  );
}

function Head({ k, order, label }: { k: string; order: number; label: string }) {
  return (
    <Ink
      k={k}
      order={order}
      plain
      className="flex items-baseline gap-[2rem] pt-[1.2rem] pb-[0.2rem]"
    >
      <p className="text-[2.8rem] leading-none whitespace-nowrap text-ink-soft italic">{label}</p>
      <div className="h-px flex-1 translate-y-[-0.8rem] bg-rule" />
    </Ink>
  );
}

/** "Today", "Tomorrow", or "Sat., Nov. 21". */
function dateWord(g: Game, now: Date, tz: string): string {
  const key = dayKey(new Date(g.start), tz);
  const today = dayKey(now, tz);
  if (key >= addDays(today, -1) && key <= addDays(today, 1)) return dayLabel(key, now, tz);
  return `${weekdayOf(key, "short")}, ${shortDate(key)}`;
}

function Line({ g, team, tz, now }: { g: Game; team: TeamView; tz: string; now: Date }) {
  const { us, them, home } = sides(g, team.id);
  const pre = g.state === "pre";
  const pct = us.chance;
  return (
    <div className={`${COLS} py-[0.2rem]`}>
      <p className="text-[2.6rem] leading-[1.3] whitespace-nowrap text-ink-soft">
        {dateWord(g, now, tz)}
      </p>
      <p
        className={`text-right text-[2.6rem] leading-[1.3] whitespace-nowrap ${
          g.state === "in" ? "text-ink" : "text-ink-soft"
        } ${g.state === "post" ? "italic" : ""}`}
      >
        {/* A result's line says only that it's over; its score is at the end. */}
        {g.state === "post" ? "" : whenWord(g, tz)}
      </p>
      <p className="truncate text-[3rem] leading-[1.3] text-ink">
        <span className="text-[0.8em] text-ink-faint italic">
          {home || g.neutral ? "vs." : "at"}
        </span>{" "}
        {them.rank ? (
          <span className="mr-[0.25em] align-[0.4em] text-[0.66em] text-ink-soft">{them.rank}</span>
        ) : null}
        {them.short.length > 18 ? them.short : them.name}
      </p>
      <p className="text-[2.6rem] leading-[1.3] whitespace-nowrap text-ink-soft italic">
        {g.tv ?? ""}
      </p>
      {/* Right-aligned as a row: a long result runs left, never past the margin. */}
      <p className="flex items-baseline justify-end text-[2.8rem] leading-[1.3] whitespace-nowrap">
        {pre ? (
          pct === undefined ? null : pct === 50 ? (
            <span className="text-ink-soft italic">Even</span>
          ) : (
            <span className="text-ink">{pct}%</span>
          )
        ) : (
          <span className={g.state === "in" ? "text-ink" : "text-ink-soft"}>
            {resultWord(g, team.id)}
          </span>
        )}
      </p>
    </div>
  );
}
