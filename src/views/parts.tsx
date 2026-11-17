// Pieces of type shared by the pages. Server-safe; no state.

import { clock, longDate, type Mood } from "@/lib/time";
import type { Slide } from "@/lib/carousel";
import type { Snapshot, NotebookItem } from "@/lib/types";

export type ViewProps = {
  snapshot: Snapshot;
  now: Date;
  mood: Mood;
  /** Home only: which piece of the carousel is up. */
  slide?: Slide;
  /** Home only: the house's temperature, when the reading is fresh. */
  inside?: number | null;
};

/** The quiet header on every page but home: date, title, time. */
export function SectionHead({ title, snapshot, now }: { title: string } & Omit<ViewProps, "mood">) {
  const tz = snapshot.timeZone;
  return (
    <header>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <span className="kicker text-[1.4rem]">{longDate(now, tz)}</span>
        <h1 className="font-caps text-[4.6rem] leading-none tracking-[0.04em]">{title}</h1>
        <span className="kicker text-right text-[1.4rem]">{clock(now, tz)}</span>
      </div>
      <div className="rule-thin mt-5" />
    </header>
  );
}

/** Type size that lets a passage fill its space without crowding it. */
export function sizeFor(text: string, scale: "lead" | "page" = "lead"): string {
  const n = text.length;
  if (scale === "page") {
    if (n <= 120) return "text-[5rem] leading-[1.15]";
    if (n <= 240) return "text-[4.1rem] leading-[1.18]";
    if (n <= 400) return "text-[3.35rem] leading-[1.22]";
    return "text-[2.85rem] leading-[1.25]";
  }
  if (n <= 90) return "text-[4.4rem] leading-[1.15]";
  if (n <= 160) return "text-[3.7rem] leading-[1.18]";
  if (n <= 240) return "text-[3.15rem] leading-[1.2]";
  return "text-[2.7rem] leading-[1.24]";
}

export const KIND_LABEL: Record<NotebookItem["kind"], string> = {
  idea: "An idea",
  quote: "Words worth keeping",
  question: "A question for the table",
};

/**
 * The night's one quiet piece (§4): the afternoon's question, an idea, or a
 * quote, in dim ink, with a quote's author under it.
 */
export function NightPiece({ item, className }: { item: NotebookItem; className: string }) {
  const text = item.kind === "quote" ? `“${item.text}”` : item.text;
  return (
    <>
      <p
        className={`whitespace-pre-line text-ink-soft ${item.kind === "idea" ? "" : "italic"} ${className}`}
      >
        {text}
      </p>
      {item.kind === "quote" && item.author ? (
        <p className="mt-[1rem] text-[1.85rem] text-ink-faint">{item.author}</p>
      ) : null}
    </>
  );
}

/** Paragraphs, with quotes set in italic and hung punctuation. */
export function Passage({
  item,
  className,
  dropCap = true,
}: {
  item: NotebookItem;
  className: string;
  dropCap?: boolean;
}) {
  const paras = item.text.split(/\n{2,}/);
  if (item.kind === "quote") {
    return (
      <blockquote className={`italic ${className}`}>
        {paras.map((p, i) => (
          <p key={i} className={i === 0 ? "hang" : "mt-[0.5em]"}>
            {i === 0 ? "“" : ""}
            {p}
            {i === paras.length - 1 ? "”" : ""}
          </p>
        ))}
      </blockquote>
    );
  }
  return (
    <div className={`${item.kind === "question" ? "italic" : ""} ${className}`}>
      {paras.map((p, i) => {
        const lines = p.split("\n");
        // A drop cap only opens a long, flowing paragraph; on a list it collides.
        const drop =
          dropCap && i === 0 && item.kind === "idea" && lines.length === 1 && p.length >= 140;
        return (
          <p key={i} className={`${drop ? "dropcap" : ""} ${i > 0 ? "mt-[0.5em]" : ""}`}>
            {lines.map((line, j) =>
              line.startsWith("• ") ? (
                <span key={j} className="block pl-[0.9em] -indent-[0.9em]">
                  {line}
                </span>
              ) : (
                <span key={j} className={lines.length > 1 ? "block" : undefined}>
                  {line}
                </span>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}

export function Credit({ item, className = "" }: { item: NotebookItem; className?: string }) {
  if (!item.author) return null;
  return (
    <p className={`kicker ${className}`}>
      &mdash; {item.author}
      {item.source ? (
        <>
          , <span className="font-serif tracking-normal italic">{item.source}</span>
        </>
      ) : null}
    </p>
  );
}

/** "Sunrise ......... 6:58 a.m." */
export function Leader({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 text-[1.75rem] leading-[1.6]">
      <span>{label}</span>
      <span className="flex-1 translate-y-[-0.3rem] border-b-[0.15rem] border-dotted border-ink-faint" />
      <span>{value}</span>
    </div>
  );
}

/** A temperature with a properly sized degree sign. */
export function Temp({ v }: { v: number }) {
  return (
    <>
      {v}
      <span className="deg">°</span>
    </>
  );
}
