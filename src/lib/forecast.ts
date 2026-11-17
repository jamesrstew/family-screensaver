// Weather in words: the sky described, the way a person would say it.
//
// Every sentence keeps three things apart: what the sky is doing now (the
// current report), what the hours ahead will bring (the hourly forecast), and
// what later days look like (the daily forecast). The daily label is the worst
// hour of the whole day, past hours included, so it never describes "now".

import { addDays, clock, dayKey, parts, weekdayOf } from "./time";
import type { Weather } from "./types";

/** WMO weather code to a short label. */
export function describe(code: number, isDay = true): string {
  if (code === 0) return isDay ? "Fair" : "Clear";
  if (code === 1) return isDay ? "Mostly Sunny" : "Mostly Clear";
  if (code === 2) return "Partly Cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code === 56 || code === 57) return "Freezing Drizzle";
  if (code === 61) return "Light Rain";
  if (code === 63) return "Rain";
  if (code === 65) return "Heavy Rain";
  if (code === 66 || code === 67) return "Freezing Rain";
  if (code === 71) return "Light Snow";
  if (code === 73) return "Snow";
  if (code === 75) return "Heavy Snow";
  if (code === 77) return "Snow Grains";
  if (code >= 80 && code <= 82) return "Showers";
  if (code === 85 || code === 86) return "Snow Showers";
  if (code === 95) return "Thunderstorms";
  if (code === 96 || code === 99) return "Thunderstorms and Hail";
  return "Unsettled";
}

export type Fall = "rain" | "snow" | "storms";

/** What falls from the sky for a code, if anything. */
export function precipKind(code: number): Fall | null {
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storms";
  if (code >= 51 && code <= 82) return "rain";
  return null;
}

export function feel(high: number): string {
  if (high < 25) return "bitter cold";
  if (high < 40) return "cold";
  if (high < 55) return "cool";
  if (high < 70) return "mild";
  if (high < 85) return "warm";
  return "hot";
}

// How sure, in the National Weather Service's words.
export const LIKELY = 55;
export const CHANCE = 30;
export const SLIGHT = 15;
export type Sure = "likely" | "chance" | "slight";

type Hour = Weather["hours"][number];
type Day = Weather["days"][number];

/** What one hour will drop, and how sure the forecast is. */
export function hourFall(h: Hour): { kind: Fall; sure: Sure } | null {
  const kind = h.code == null ? null : precipKind(h.code);
  const sure: Sure | null =
    h.precipChance >= LIKELY
      ? "likely"
      : h.precipChance >= CHANCE
        ? "chance"
        : h.precipChance >= SLIGHT
          ? "slight"
          : null;
  if (!sure) return null;
  if (kind) return { kind, sure };
  // The model's best guess is dry but the odds say otherwise: call it a chance.
  if (h.precipChance >= LIKELY) return { kind: h.temp <= 33 ? "snow" : "rain", sure: "chance" };
  return null;
}

/** The same for a whole day. */
export function dayFall(d: Day): { kind: Fall; sure: Sure } | null {
  const kind = precipKind(d.code);
  if (!kind) return null;
  if (d.precipChance >= LIKELY) return { kind, sure: "likely" };
  if (d.precipChance >= CHANCE) return { kind, sure: "chance" };
  if (d.precipChance >= SLIGHT) return { kind, sure: "slight" };
  return null;
}

const SEVERITY: Record<Fall, number> = { rain: 1, snow: 2, storms: 3 };
const RANK: Record<Sure, number> = { slight: 1, chance: 2, likely: 3 };

/** The sky without precipitation: the most common cover, cloudier on a tie. */
function coverOf(hours: Hour[]): number {
  const count = new Map<number, number>();
  for (const h of hours) {
    let c = h.code ?? 3;
    if (precipKind(c)) c = 3; // a dry hour under a rain code is still a gray one
    if (c === 48) c = 45;
    count.set(c, (count.get(c) ?? 0) + 1);
  }
  let best = 3;
  let n = -1;
  for (const [c, k] of count) if (k > n || (k === n && c > best)) [best, n] = [c, k];
  return best;
}

/** One code for a stretch of hours: the worst wet hour that counts, or the cover. */
function codeOf(hours: Hour[]): { code: number; fall: { kind: Fall; sure: Sure } | null } {
  let fall: { kind: Fall; sure: Sure } | null = null;
  let code: number | null = null;
  for (const h of hours) {
    const f = hourFall(h);
    if (!f || f.sure === "slight") continue;
    if (
      !fall ||
      SEVERITY[f.kind] > SEVERITY[fall.kind] ||
      (f.kind === fall.kind && RANK[f.sure] > RANK[fall.sure])
    ) {
      fall = f;
      code = h.code != null && precipKind(h.code) ? h.code : f.kind === "snow" ? 73 : 63;
    }
  }
  return code != null ? { code, fall } : { code: coverOf(hours), fall: null };
}

/** One code for a stretch of hours, for drawing it. */
export function skyOf(hours: Hour[]): number {
  return codeOf(hours).code;
}

/** "Sunny", "Partly cloudy", "Cloudy": the cover in words. */
export function skyWords(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? "Sunny" : "Clear";
  if (code === 1) return isDay ? "Mostly sunny" : "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 45 || code === 48) return "Foggy";
  const f = precipKind(code);
  if (f === "snow") return code === 75 ? "Heavy snow" : code === 71 ? "Light snow" : "Snowing";
  if (f === "storms") return "Stormy";
  if (f === "rain") return code === 65 ? "Pouring" : code <= 55 ? "Drizzling" : "Raining";
  return "Cloudy";
}

const FALL_NOUN: Record<Fall, string> = { rain: "rain", snow: "snow", storms: "storms" };

function fallWords(f: { kind: Fall; sure: Sure }): string {
  const n = FALL_NOUN[f.kind];
  if (f.sure === "likely") return `${cap(n)} likely`;
  if (f.sure === "chance") return `Chance of ${n}`;
  return `Slight chance of ${n}`;
}

/** The same, mid-sentence: "snow likely", "a chance of rain". */
function fallPhrase(f: { kind: Fall; sure: Sure }): string {
  const w = lower(fallWords(f));
  return f.sure === "likely" ? w : `a ${w}`;
}

/** One stretch of the coming day: "This afternoon", "Tonight", "Tomorrow". */
export type Part = {
  label: string;
  temp: number;
  /** True when temp is the high; false when it's the low. */
  high: boolean;
  code: number;
  isDay: boolean;
  words: string;
  wet: boolean;
};

/** A run of wet hours in the next day. */
export type Spell = {
  kind: Fall;
  sure: "likely" | "chance";
  from: string; // ISO
  to: string; // ISO, the end of the last wet hour
  now: boolean; // already falling
  before: Fall | null; // what's falling now, when the spell's worst is still to come
  open: boolean; // still going at the end of the forecast hours
};

export type Outlook = {
  /** What to say about now and the hours ahead, in one sentence. */
  line: string;
  /** Rain or snow, and when. Null on a dry day. */
  timing: string | null;
  /** Do I need a coat? Always an answer. */
  wear: string;
  /** Beyond the next day: the next wet day, or how long it stays dry. */
  ahead: string | null;
  /** Whether we're talking about today or, after the day is done, tomorrow. */
  focus: "today" | "tomorrow";
  parts: Part[];
  spell: Spell | null;
  /** The plain shape of the weather, for a page to set its tone. */
  tone: "fair" | "gray" | "wet" | "snow" | "storm";
};

const HOUR = 3_600_000;

/** Morning 5 to noon, afternoon noon to 5 p.m., evening 5 to 9 p.m., then night. */
export function periodWord(t: Date, now: Date, tz: string): string {
  const { hour } = parts(t, tz);
  const today = dayKey(now, tz);
  const day = dayKey(t, tz);
  const tomorrow = addDays(today, 1);
  const lateNight = parts(now, tz).hour < 5;
  // Past midnight, "tonight" still means the night we're in.
  const sameNight =
    (day === today && hour >= 21) ||
    (day === tomorrow && hour < 5 && !lateNight) ||
    (day === today && hour < 5 && lateNight);
  if (sameNight) return day === today && hour < 5 ? "before dawn" : "tonight";
  const part = hour < 5 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  if (day === today) return `this ${part}`;
  if (day === tomorrow) return part === "night" ? "tomorrow night" : `tomorrow ${part}`;
  return `${weekdayOf(day)} ${part}`;
}

/** Find the first spell of rain or snow in the hours ahead (a one-hour gap doesn't end it). */
export function spellOf(w: Weather, now: Date): Spell | null {
  const hours = w.hours.filter((h) => Date.parse(h.time) + HOUR > now.getTime());
  const wet = hours.map((h) => {
    const f = hourFall(h);
    return f && f.sure !== "slight" ? f : null;
  });
  const start = wet.findIndex(Boolean);
  if (start < 0) return null;
  let end = start;
  for (let i = start + 1; i < wet.length; i++) {
    if (wet[i]) end = i;
    else if (!wet[i + 1]) break;
  }
  const run = wet.slice(start, end + 1).filter((f): f is NonNullable<typeof f> => Boolean(f));
  const kind = run.reduce<Fall>((k, f) => (SEVERITY[f.kind] > SEVERITY[k] ? f.kind : k), "rain");
  const falling = Date.parse(hours[start].time) <= now.getTime();
  // Storms inside a rainy spell: the storms are the news, so time those.
  let [from, to] = [start, end];
  if (kind === "storms") {
    from = wet.findIndex((f, i) => i >= start && f?.kind === "storms");
    to = from;
    while (to + 1 <= end && wet[to + 1]?.kind === "storms") to++;
  }
  return {
    kind,
    sure: run.some((f) => f.sure === "likely") ? "likely" : "chance",
    from: hours[from].time,
    to: new Date(Date.parse(hours[to].time) + HOUR).toISOString(),
    now: Date.parse(hours[from].time) <= now.getTime(),
    before: falling && from > start ? wet[start]!.kind : null,
    open: to === hours.length - 1,
  };
}

/** "Snow likely from 4 p.m. until about 9 p.m." in plain words. */
export function timingWords(s: Spell, now: Date, tz: string): string {
  const n = FALL_NOUN[s.kind];
  const to = new Date(s.to);
  const from = new Date(s.from);
  const until = s.open ? null : clock(to, tz);
  if (s.now) {
    return until ? `${cap(n)} until about ${until}.` : `${cap(n)} on and off all day.`;
  }
  // Rain now, storms later: say both.
  const lead = s.before
    ? `${cap(FALL_NOUN[s.before])} now; ${n} likely`
    : s.sure === "likely"
      ? `${cap(n)} likely`
      : `A chance of ${n}`;
  if (s.sure === "chance" && !s.before) return `${lead} ${periodWord(from, now, tz)}.`;
  const at = clock(from, tz);
  const fromWord = dayKey(from, tz) === dayKey(now, tz) ? at : `${at} ${dayOf(from, now, tz)}`;
  if (!until) return `${lead} from ${fromWord} on.`;
  return `${lead} from ${fromWord} until about ${until}.`;
}

function dayOf(t: Date, now: Date, tz: string): string {
  const k = dayKey(t, tz);
  if (k === addDays(dayKey(now, tz), 1)) return parts(t, tz).hour < 5 ? "tonight" : "tomorrow";
  return weekdayOf(k);
}

/** Hours of the forecast that fall in [from, to) local hours of a given day. */
function hoursIn(w: Weather, now: Date, tz: string, day: string, from: number, to: number) {
  return w.hours.filter((h) => {
    const t = new Date(h.time);
    if (Date.parse(h.time) + HOUR <= now.getTime()) return false;
    const k = dayKey(t, tz);
    const hr = parts(t, tz).hour;
    // A window past 24 runs into the next morning.
    if (k === day) return hr >= from && hr < Math.min(to, 24);
    if (to > 24 && k === addDays(day, 1)) return hr < to - 24;
    return false;
  });
}

function partFromHours(label: string, hours: Hour[], night: boolean): Part | null {
  if (!hours.length) return null;
  const temps = hours.map((h) => h.temp);
  const { code, fall } = codeOf(hours);
  return {
    label,
    temp: night ? Math.min(...temps) : Math.max(...temps),
    high: !night,
    code,
    isDay: !night,
    words: fall ? fallWords(fall) : skyWords(code, !night),
    wet: Boolean(fall),
  };
}

/** A whole day as a part, drawn honestly (a slight chance stays a gray day). */
export function partFromDay(label: string, d: Day): Part {
  const f = dayFall(d);
  const counts = f && f.sure !== "slight";
  // A day whose worst hour is a slight chance of snow is drawn as a gray one.
  const code = counts ? d.code : precipKind(d.code) ? 3 : d.code;
  return {
    label,
    temp: d.high,
    high: true,
    code,
    isDay: true,
    words: counts
      ? fallWords(f!)
      : f
        ? `${skyWords(code, true)}, ${fallPhrase(f)}`
        : skyWords(code, true),
    wet: Boolean(counts),
  };
}

/** Do I need a coat? The coldest waking hour decides, and what's falling adds to it. */
function wearWords(cold: number, fall: Fall | null, when: "today" | "tomorrow"): string {
  const coat =
    cold < 20
      ? "a heavy coat, a hat, and mittens"
      : cold < 40
        ? "a warm coat"
        : cold < 55
          ? "a jacket"
          : cold < 65
            ? "a sweater"
            : null;
  const gear = fall === "snow" ? "boots" : fall ? "an umbrella" : null;
  const day = when === "tomorrow" ? "Tomorrow, you’ll" : "You’ll";
  if (!coat) return gear ? `No coat needed, but bring ${gear}.` : "No coat needed.";
  if (!gear) return `${day} want ${coat}.`;
  return `${day} want ${coat} and ${gear}.`;
}

/**
 * The weather, answered: now and the hours ahead in one sentence, rain or
 * snow and when, what to wear, and what the next few days hold.
 */
export function outlook(w: Weather, now: Date, tz: string): Outlook {
  const today = dayKey(now, tz);
  const tomorrow = addDays(today, 1);
  const hour = parts(now, tz).hour;
  const lateNight = hour < 5;
  // After 5 p.m. the day is done: talk about tonight and tomorrow.
  const focus: Outlook["focus"] = hour >= 17 || lateNight ? "tomorrow" : "today";
  const dayIdx = (k: string) => w.days.findIndex((d) => d.date === k);

  // The stretches of the coming day, and the last day they cover.
  const ps: Array<Part | null> = [];
  const nightDay = lateNight ? addDays(today, -1) : today;
  const tonight = partFromHours("Tonight", hoursIn(w, now, tz, nightDay, 17, 24 + 6), true);
  const dayPart = (label: string, key: string) => {
    const i = dayIdx(key);
    return i >= 0 ? partFromDay(label, w.days[i]) : null;
  };
  let covered: string;
  if (hour >= 5 && hour < 12) {
    ps.push(partFromHours("This morning", hoursIn(w, now, tz, today, 5, 12), false));
    ps.push(partFromHours("This afternoon", hoursIn(w, now, tz, today, 12, 17), false));
    ps.push(tonight);
    covered = today;
  } else if (hour >= 12 && hour < 17) {
    ps.push(partFromHours("This afternoon", hoursIn(w, now, tz, today, 12, 17), false));
    ps.push(tonight);
    ps.push(dayPart("Tomorrow", tomorrow));
    covered = tomorrow;
  } else if (lateNight) {
    ps.push(tonight);
    ps.push(dayPart("Today", today));
    ps.push(dayPart("Tomorrow", tomorrow));
    covered = tomorrow;
  } else {
    const after = addDays(tomorrow, 1);
    ps.push(tonight);
    ps.push(dayPart("Tomorrow", tomorrow));
    ps.push(dayPart(weekdayOf(after), after));
    covered = after;
  }
  const partsList = ps.filter((p): p is Part => p !== null);

  // One sentence: the sky now, and where the temperature goes from here.
  const nowSky = skyWords(w.now.code, w.now.isDay);
  let line: string;
  if (focus === "today") {
    const rest = hoursIn(w, now, tz, today, hour, 17);
    const peak = rest.length ? Math.max(...rest.map((h) => h.temp)) : w.now.temp;
    const peakAt = rest.find((h) => h.temp === peak);
    const night = tonight?.temp;
    if (peak >= w.now.temp + 3 && peakAt) {
      const when =
        parts(new Date(peakAt.time), tz).hour >= 12 && hour < 12
          ? "this afternoon"
          : `by ${clock(new Date(peakAt.time), tz)}`;
      line = `${nowSky} and ${w.now.temp}° now, up to ${peak}° ${when}.`;
    } else if (night != null && night <= w.now.temp - 3) {
      line = `${nowSky} and ${w.now.temp}° now, down to ${night}° tonight.`;
    } else {
      line = `${nowSky} and ${w.now.temp}°, and staying about that way.`;
    }
  } else {
    const low = tonight?.temp;
    const lowWords = low != null && low < w.now.temp ? `, down to ${low}° overnight` : "";
    const label = lateNight ? "Today" : "Tomorrow";
    const next = partsList.find((p) => p.label === label);
    const nextDay = w.days[dayIdx(lateNight ? today : tomorrow)];
    const nextFall = nextDay ? dayFall(nextDay) : null;
    const tmw = !next
      ? ""
      : next.wet
        ? ` ${label}, ${fallPhrase(nextFall!)}, with a high of ${next.temp}°.`
        : ` ${label}, ${lower(next.words)} and ${next.temp}°.`;
    line = `${nowSky} and ${w.now.temp}° now${lowWords}.${tmw}`;
  }

  // Rain or snow in the next day, and when.
  const spell = spellOf(w, now);
  let timing = spell ? timingWords(spell, now, tz) : null;
  if (!timing) {
    // Nothing that counts, but a few flakes are possible: say so, softly.
    const slight = w.hours
      .filter((h) => Date.parse(h.time) + HOUR > now.getTime())
      .find((h) => hourFall(h)?.sure === "slight");
    if (slight) {
      const f = hourFall(slight)!;
      timing = `${f.kind === "snow" ? "A few flakes" : f.kind === "storms" ? "A stray storm" : "A sprinkle"} possible ${periodWord(new Date(slight.time), now, tz)}.`;
    }
  }

  // What to wear: the coldest hour you're likely to be out in.
  const wearDay = focus === "today" ? today : lateNight ? today : tomorrow;
  const waking = hoursIn(
    w,
    focus === "today" ? now : new Date(0),
    tz,
    wearDay,
    focus === "today" ? hour : 7,
    21,
  );
  const cold = waking.length
    ? Math.min(...waking.map((h) => h.temp))
    : (w.days[dayIdx(wearDay)]?.low ?? w.now.temp);
  const wetWhileOut = waking
    .map(hourFall)
    .filter((f) => f && f.sure === "likely")
    .reduce<Fall | null>((k, f) => (!k || SEVERITY[f!.kind] > SEVERITY[k] ? f!.kind : k), null);
  const dayWet = (() => {
    const i = dayIdx(wearDay);
    const f = i >= 0 && !waking.length ? dayFall(w.days[i]) : null;
    return f?.sure === "likely" ? f.kind : null;
  })();
  const wear = wearWords(
    cold,
    wetWhileOut ?? dayWet,
    focus === "today" || lateNight ? "today" : "tomorrow",
  );

  // Beyond the parts: the next wet day, or how long it stays dry.
  // (Only this week: past a week, a weekday's name would be ambiguous.)
  const later = w.days.filter((d) => d.date > covered && d.date < addDays(today, 7));
  const wetDay = later.find((d) => dayFall(d)?.sure === "likely");
  const maybeDay = later.find((d) => dayFall(d)?.sure === "chance");
  const dayName = (k: string) => (k === tomorrow && !lateNight ? "tomorrow" : weekdayOf(k));
  let ahead: string | null = null;
  if (wetDay && (!maybeDay || wetDay.date <= maybeDay.date)) {
    ahead = `${cap(FALL_NOUN[dayFall(wetDay)!.kind])} likely ${dayName(wetDay.date)}.`;
  } else if (maybeDay) {
    ahead = `A chance of ${FALL_NOUN[dayFall(maybeDay)!.kind]} ${dayName(maybeDay.date)}.`;
  } else if (later.length) {
    ahead = `Dry through ${weekdayOf(later.at(-1)!.date)}.`;
  }

  const kinds = [
    spell?.sure === "likely" ? spell.kind : null,
    ...partsList.filter((p) => p.wet).map((p) => precipKind(p.code)),
  ];
  const tone: Outlook["tone"] = kinds.includes("storms")
    ? "storm"
    : kinds.includes("snow")
      ? "snow"
      : kinds.includes("rain")
        ? "wet"
        : partsList.slice(0, 2).every((p) => p.code >= 3)
          ? "gray"
          : "fair";

  return {
    line: tidy(line),
    timing: timing && tidy(timing),
    wear,
    ahead,
    focus,
    parts: partsList,
    spell,
    tone,
  };
}

/**
 * The days ahead in a sentence: which days are wet, then the range of highs.
 * "Snow likely Wednesday and Saturday. Highs from 30° to 37°."
 */
export function weekLine(w: Weather, now: Date, tz: string): string {
  const today = dayKey(now, tz);
  // Today counts until 5 p.m.; after that the week starts tomorrow.
  const late = parts(now, tz).hour >= 17;
  const ahead = w.days.filter((d) => d.date > today || (d.date === today && !late)).slice(0, 7);
  if (!ahead.length) return "";
  const name = (k: string) =>
    k === today ? "today" : k === addDays(today, 1) ? "tomorrow" : weekdayOf(k);
  const byKind = new Map<Fall, string[]>();
  for (const d of ahead) {
    const f = dayFall(d);
    if (f?.sure === "likely") byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), name(d.date)]);
  }
  const wet = [...byKind].map(([k, days]) => `${cap(FALL_NOUN[k])} likely ${list(days)}.`);
  const highs = ahead.map((d) => d.high);
  const [lo, hi] = [Math.min(...highs), Math.max(...highs)];
  const range =
    hi - lo <= 4 ? `Highs near ${Math.round((lo + hi) / 2)}°.` : `Highs from ${lo}° to ${hi}°.`;
  const maybe = ahead.find((d) => dayFall(d)?.sure === "chance");
  if (!wet.length && maybe) {
    return `Mostly dry; a chance of ${FALL_NOUN[dayFall(maybe)!.kind]} ${name(maybe.date)}. ${range}`;
  }
  if (!wet.length) return `Dry all week. ${range}`;
  return `${wet.join(" ")} ${range}`;
}

const list = (xs: string[]) =>
  xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")}, and ${xs.at(-1)}`;

/**
 * The next day, hour by hour, in a sentence: rain or snow and when (or how
 * long it stays dry), then the first turn of the temperature.
 * "Snow likely from 2 p.m. until about 10 p.m. Down to 25° by 1 a.m."
 */
export function hoursLine(w: Weather, now: Date, tz: string): string {
  const o = outlook(w, now, tz);
  const hours = w.hours.filter((h) => Date.parse(h.time) + HOUR > now.getTime()).slice(0, 24);
  if (hours.length < 2) return o.line;
  // A couple of hours short of the end, so "dry through" never overreaches.
  const wet =
    o.timing ??
    `Dry through ${periodWord(new Date(hours[Math.max(hours.length - 3, 0)].time), now, tz)}.`;
  const temps = hours.map((h, i) => (i === 0 ? w.now.temp : h.temp));
  const hi = temps.indexOf(Math.max(...temps));
  const lo = temps.indexOf(Math.min(...temps));
  const turn = [hi, lo]
    .filter((i) => Math.abs(temps[i] - w.now.temp) >= 3)
    .sort((a, b) => a - b)[0];
  const temp =
    turn === undefined
      ? `Steady near ${w.now.temp}°.`
      : `${temps[turn] > w.now.temp ? "Up" : "Down"} to ${temps[turn]}° by ${clock(new Date(hours[turn].time), tz)}.`;
  return tidy(`${wet} ${temp}`);
}

/**
 * Two or three sentences for the voice and the other designs:
 * "Cloudy and 45° now, down to 32° tonight. Snow likely Wednesday."
 */
export function forecastLine(w: Weather, now: Date, tz: string): string {
  const o = outlook(w, now, tz);
  return [o.line, o.timing ?? o.ahead].filter(Boolean).join(" ");
}

/** "until about 10 p.m.." reads as a typo: one period ends both. */
const tidy = (s: string) => s.replace(/\.\./g, ".");
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const lower = (s: string) => s[0].toLowerCase() + s.slice(1);
