/*
 * The holidays a US family keeps, worked out from the date alone: no
 * calendar to fetch, nothing to fail. Each has a small engraved mark
 * (src/views/HolidayMark.tsx), shown beside its day in the week's forecast.
 * The civic holidays share the flag. A holiday is marked on its own date,
 * not on a weekday it's observed in its place.
 */

export type Mark =
  "firework" | "heart" | "shamrock" | "egg" | "flag" | "pumpkin" | "turkey" | "tree";

export type Holiday = { name: string; mark: Mark };

const FIXED: Record<string, Holiday> = {
  "01-01": { name: "New Year's Day", mark: "firework" },
  "02-14": { name: "Valentine's Day", mark: "heart" },
  "03-17": { name: "St. Patrick's Day", mark: "shamrock" },
  "06-19": { name: "Juneteenth", mark: "flag" },
  "07-04": { name: "Independence Day", mark: "firework" },
  "10-31": { name: "Halloween", mark: "pumpkin" },
  "11-11": { name: "Veterans Day", mark: "flag" },
  "12-25": { name: "Christmas", mark: "tree" },
};

/** The day of the month of the nth weekday (0 = Sunday) of a month; n = -1 is the last. */
function nth(year: number, month: number, weekday: number, n: number): number {
  if (n < 0) {
    const last = new Date(Date.UTC(year, month, 0));
    return last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
  }
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

/** Easter Sunday (the Gregorian computus), as [month, day]. */
export function easter(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

function moving(year: number): Record<string, Holiday> {
  const at = (month: number, day: number) =>
    `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    [at(1, nth(year, 1, 1, 3))]: { name: "Martin Luther King Jr. Day", mark: "flag" },
    [at(2, nth(year, 2, 1, 3))]: { name: "Presidents' Day", mark: "flag" },
    [at(...easter(year))]: { name: "Easter", mark: "egg" },
    [at(5, nth(year, 5, 1, -1))]: { name: "Memorial Day", mark: "flag" },
    [at(9, nth(year, 9, 1, 1))]: { name: "Labor Day", mark: "flag" },
    [at(11, nth(year, 11, 4, 4))]: { name: "Thanksgiving", mark: "turkey" },
  };
}

/** The holiday on a day key (YYYY-MM-DD, the family's own date), if any. */
export function holidayOn(key: string): Holiday | undefined {
  const year = Number(key.slice(0, 4));
  const md = key.slice(5, 10);
  return moving(year)[md] ?? FIXED[md];
}
