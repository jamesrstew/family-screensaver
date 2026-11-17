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

export type Fit = { size: number; lh: number };

type Options = {
  italic?: boolean;
  /** Largest and smallest sizes allowed, in rem. */
  max: number;
  min: number;
};

const ADVANCE = { roman: 0.43, italic: 0.4 };
const PARA_GAP = 0.45; // em, as Words sets it

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

export function fitType(text: string, box: { w: number; h: number }, o: Options): Fit {
  const paras = text.split(/\n{2,}/).length;
  for (let size = o.max; size > o.min; size = Math.round((size - 0.1) * 10) / 10) {
    const lh = leadingFor(size);
    const lines = linesAt(text, size, box.w, o.italic);
    const height = lines * size * lh + (paras - 1) * PARA_GAP * size;
    if (height <= box.h) return { size, lh };
  }
  return { size: o.min, lh: leadingFor(o.min) };
}
