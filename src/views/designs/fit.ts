/*
 * Type fitted to its space. Given the words and the box they live in (rem, on
 * the 120 x 67.5 rem sheet), pick the largest size at which they wrap into
 * the box: a short line is set huge, a long passage as large as still fits.
 *
 * It's arithmetic, not measurement: each word's width is estimated from
 * Fraunces' average advance per character (measured on the page: about 0.40
 * em roman, 0.37 em italic, padded here for safety), and the lines are wrapped
 * greedily, as the browser does. The same answer on the server and the TV, so
 * nothing reflows after the ink goes down. CSS text-balance then evens the
 * lines without ever adding one.
 */

/** The size and leading chosen, and whether the words fit the box at all. */
export type Fit = { size: number; lh: number; fits: boolean };

type Options = {
  italic?: boolean;
  /** Largest and smallest sizes allowed, in rem. */
  max: number;
  min: number;
};

const ADVANCE = { roman: 0.43, italic: 0.4 };
const PARA_GAP = 0.45; // em, as Words sets it

/**
 * A line's width in em, by kind of character: Fraunces' capitals run about
 * 0.68 em, its digits 0.55, everything else about 0.45 (padded). For a single
 * line that must not run into its neighbor, such as a calendar title in caps.
 */
export function widthEm(text: string): number {
  let w = 0;
  for (const ch of text) w += /[A-Z]/.test(ch) ? 0.68 : /[0-9\u2212]/.test(ch) ? 0.55 : 0.45;
  return w;
}

/** Big type is set tight; reading type gets more air. */
export const leadingFor = (size: number) => (size >= 7 ? 1.06 : size >= 5 ? 1.12 : 1.2);

/** How many lines the words take at a size, in a measure `w` rem wide. */
export function linesAt(text: string, size: number, w: number, italic = false): number {
  const em = (italic ? ADVANCE.italic : ADVANCE.roman) * size;
  let lines = 0;
  for (const para of text.split(/\n{2,}/)) {
    let line = 0;
    lines++;
    for (const word of para.split(/[ \n]+/).filter(Boolean)) {
      const width = word.length * em;
      const next = line === 0 ? width : line + em + width;
      if (next > w && line > 0) {
        lines++;
        line = width;
      } else line = next;
    }
  }
  return lines;
}

/** The height the words take at a size, in rem. */
export function heightAt(text: string, size: number, w: number, italic = false): number {
  const paras = text.split(/\n{2,}/).length;
  return linesAt(text, size, w, italic) * size * leadingFor(size) + (paras - 1) * PARA_GAP * size;
}

/** The widest single word at a size, in rem (a word can't wrap). */
const longestAt = (text: string, size: number, italic = false) =>
  Math.max(...text.split(/\s+/).map((w) => w.length)) *
  (italic ? ADVANCE.italic : ADVANCE.roman) *
  size;

/**
 * The largest size, from `max` down to `min`, at which the words wrap into
 * the box and no single word is wider than it. If even `min` won't do, it
 * says so (`fits: false`), so the caller can choose other words.
 */
export function fitType(text: string, box: { w: number; h: number }, o: Options): Fit {
  for (let size = o.max; size >= o.min; size = Math.round((size - 0.1) * 10) / 10) {
    if (heightAt(text, size, box.w, o.italic) <= box.h && longestAt(text, size, o.italic) <= box.w)
      return { size, lh: leadingFor(size), fits: true };
  }
  return { size: o.min, lh: leadingFor(o.min), fits: false };
}
