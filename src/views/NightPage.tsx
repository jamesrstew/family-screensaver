import { family } from "@/config";
import { Ink } from "@/components/Ink";
import { leadFor, questionFor } from "@/lib/pick";
import {
  addDays,
  asksQuestion,
  clock,
  clockFace,
  dayKey,
  happeningsOn,
  longDate,
  parts,
  whenOf,
} from "@/lib/time";
import { NightPiece, type ViewProps } from "./parts";

// After the evening: dark paper, faint ink, almost nothing on it.
// The clock, what tomorrow holds, and one quiet piece: the afternoon's
// question until 6 p.m., then an idea or a quote.

export function NightPage({ snapshot, now }: ViewProps) {
  const tz = snapshot.timeZone;
  // Past midnight, "tomorrow" is today.
  const morning = parts(now, tz).hour < 5;
  const nextDay = morning ? dayKey(now, tz) : addDays(dayKey(now, tz), 1);
  const first = snapshot.happenings
    ? (happeningsOn(snapshot.happenings, nextDay, tz).find((h) => !h.allDay) ??
      happeningsOn(snapshot.happenings, nextDay, tz)[0])
    : undefined;
  const piece =
    (asksQuestion(now, tz) ? questionFor(snapshot.notebook) : null) ??
    leadFor(snapshot.notebook, now);
  const suffix = clock(now, tz).split(" ").at(-1);

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <Ink order={0}>
        <p className="font-masthead text-[2.6rem] text-ink-soft">{family.name}</p>
      </Ink>
      <Ink order={1} className="my-10">
        <p className="text-[13rem] leading-none tracking-[-0.02em]">
          {clockFace(now, tz)}
          <span className="ml-4 text-[3rem] text-ink-soft">{suffix}</span>
        </p>
        <p className="mt-4 text-[2rem] text-ink-soft italic">{longDate(now, tz)}</p>
      </Ink>
      {first ? (
        <Ink order={2}>
          <p className="kicker text-[1.4rem]">{morning ? "This Morning" : "Tomorrow"}</p>
          <p className="mt-1 text-[2.2rem]">
            {whenOf(first, nextDay, tz)}, {first.title}
          </p>
        </Ink>
      ) : null}
      {piece ? (
        <Ink order={3} className="mt-14 max-w-[70rem]">
          <NightPiece item={piece} className="text-[1.9rem] leading-snug" />
        </Ink>
      ) : null}
    </div>
  );
}
