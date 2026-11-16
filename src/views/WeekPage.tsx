import { Ink } from "@/components/Ink";
import { addDays, dayKey, happeningsOn, shortDate, weekdayOf, whenOf } from "@/lib/time";
import { SectionHead, type ViewProps } from "./parts";

const MAX_ROWS = 7;

export function WeekPage({ snapshot, now }: ViewProps) {
  const tz = snapshot.timeZone;
  const today = dayKey(now, tz);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const all = snapshot.happenings;

  return (
    <div className="flex h-full flex-col">
      <Ink order={0}>
        <SectionHead title="The Week Ahead" snapshot={snapshot} now={now} />
      </Ink>
      {!all ? (
        <Ink order={1} className="flex flex-1 items-center justify-center">
          <p className="text-[3rem] text-ink-soft italic">No calendar is connected yet.</p>
        </Ink>
      ) : (
        <div className="mt-9 grid min-h-0 flex-1 grid-cols-7 divide-x divide-rule/40">
          {days.map((day, i) => {
            const items = happeningsOn(all, day, tz);
            const shown = items.slice(0, MAX_ROWS);
            return (
              <Ink key={day} order={1 + i * 0.5} className="min-h-0 px-4">
                <div className={`pb-3 text-center ${i === 0 ? "text-accent" : ""}`}>
                  <p
                    className="kicker text-[1.5rem]"
                    style={i === 0 ? { color: "inherit" } : undefined}
                  >
                    {i === 0 ? "Today" : weekdayOf(day)}
                  </p>
                  <p className="text-[1.6rem] text-ink-soft italic">{shortDate(day)}</p>
                </div>
                <div className="rule-thin mb-4" />
                {items.length === 0 ? (
                  <p className="text-center text-[1.5rem] text-ink-faint italic">Nothing planned</p>
                ) : (
                  <ul className="space-y-4">
                    {shown.map((h) => (
                      <li key={h.id}>
                        <p className="kicker text-[1.2rem]">{whenOf(h, day, tz)}</p>
                        <p className={`text-[1.65rem] leading-[1.18] ${h.allDay ? "italic" : ""}`}>
                          {h.title}
                        </p>
                      </li>
                    ))}
                    {items.length > shown.length ? (
                      <li className="text-[1.35rem] text-ink-soft italic">
                        and {items.length - shown.length} more
                      </li>
                    ) : null}
                  </ul>
                )}
              </Ink>
            );
          })}
        </div>
      )}
    </div>
  );
}
