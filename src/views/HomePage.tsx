import { family } from "@/config";
import { Ink } from "@/components/Ink";
import { leadFor, questionFor } from "@/lib/pick";
import { clock, clockFace, dayKey, happeningsOn, longDate, whenOf } from "@/lib/time";
import { Credit, KIND_LABEL, Passage, Temp, type ViewProps } from "./parts";
import { Sky } from "./Sky";

// Home: one thing, beautifully set. Everything else is a quiet note in a
// corner: the hour, the sky, what's next. The rest lives one page away.

export function HomePage({ snapshot, now, mood }: ViewProps) {
  const tz = snapshot.timeZone;
  const w = snapshot.weather;
  const hero =
    (mood === "evening" ? questionFor(snapshot.notebook) : null) ?? leadFor(snapshot.notebook, now);
  const next = nextUp(snapshot, now);
  const [, suffix] = clock(now, tz).split(" ");

  return (
    <div className="relative h-full">
      <Ink order={0} className="absolute inset-x-0 top-0 text-center">
        <p className="font-masthead text-[3.6rem] leading-none">{family.name}</p>
        <p className="mt-2 text-[1.6rem] text-ink-soft italic">{longDate(now, tz)}</p>
      </Ink>

      <Ink order={1} className="absolute top-0 left-0">
        <p className="text-[3.4rem] leading-none">
          {clockFace(now, tz)}
          <span className="ml-2 text-[1.6rem] text-ink-soft italic">{suffix ?? ""}</span>
        </p>
      </Ink>

      {w ? (
        <Ink order={1} className="absolute top-0 right-0">
          <div className="flex items-center gap-3">
            <Sky code={w.now.code} isDay={w.now.isDay} className="size-[3.6rem] text-ink-soft" />
            <div className="text-right">
              <p className="text-[3.4rem] leading-none">
                <Temp v={w.now.temp} />
              </p>
              <p className="mt-1 text-[1.4rem] text-ink-soft italic">
                {w.now.label}, high <Temp v={w.today.high} />
              </p>
            </div>
          </div>
        </Ink>
      ) : null}

      <Ink
        k={hero?.id ?? "none"}
        order={2}
        className="absolute inset-x-[6rem] top-[9rem] bottom-[7rem] flex items-center justify-center"
      >
        {hero ? (
          <article className="max-w-[88rem] text-center">
            {hero.kind === "question" ? (
              <p className="kicker mb-6 text-[1.6rem]">{KIND_LABEL.question}</p>
            ) : null}
            <Passage item={hero} className={heroSize(hero.text)} dropCap={false} />
            <Credit item={hero} className="mt-8 text-[1.5rem]" />
          </article>
        ) : null}
      </Ink>

      {next ? (
        <Ink order={3} className="absolute bottom-0 left-0">
          <p className="kicker text-[1.3rem]">Next</p>
          <p className="text-[1.9rem] leading-tight">
            <span className="text-ink-soft">{whenOf(next, dayKey(now, tz), tz)}</span> {next.title}
          </p>
        </Ink>
      ) : null}
    </div>
  );
}

/** Generous type: the hero is the only thing on the page. */
function heroSize(text: string): string {
  const n = text.length;
  if (n <= 90) return "text-[5rem] leading-[1.14]";
  if (n <= 160) return "text-[4.3rem] leading-[1.16]";
  if (n <= 240) return "text-[3.7rem] leading-[1.2]";
  return "text-[3.15rem] leading-[1.24]";
}

/** The next thing on today's calendar that hasn't started. */
function nextUp({ happenings, timeZone }: ViewProps["snapshot"], now: Date) {
  if (!happenings) return null;
  return (
    happeningsOn(happenings, dayKey(now, timeZone), timeZone).find(
      (h) => !h.allDay && new Date(h.start) > now,
    ) ?? null
  );
}
