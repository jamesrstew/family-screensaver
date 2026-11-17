// Seeded randomness and the organic patterns drawn from it: smooth noise and
// the contour lines of a landscape that never existed. Pure and deterministic,
// so the server and the TV draw exactly the same lines.

/** A small, fast, seeded random number generator (mulberry32): 0 <= x < 1. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable number for a string (FNV-1a). */
export function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function lattice(seed: number, x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Gradient noise in about -1..1, smooth everywhere. */
export function noise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const dot = (ix: number, iy: number) => {
    const a = lattice(seed, ix, iy) * Math.PI * 2;
    return Math.cos(a) * (x - ix) + Math.sin(a) * (y - iy);
  };
  const u = fade(x - x0);
  const v = fade(y - y0);
  const top = dot(x0, y0) + u * (dot(x0 + 1, y0) - dot(x0, y0));
  const bot = dot(x0, y0 + 1) + u * (dot(x0 + 1, y0 + 1) - dot(x0, y0 + 1));
  return (top + v * (bot - top)) * 1.4;
}

/** A few octaves of noise: the roughness of real ground. */
export function fbm(seed: number, x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(seed + i * 101, x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

/**
 * The height of an imaginary eroded land: gentle hills, cut by branching
 * valleys (ridged noise, warped so the valleys wander like rivers, or veins).
 * `t` moves the land a little, for a second state of the same map.
 */
export function terrain(seed: number, x: number, y: number, t = 0): number {
  const wx = fbm(seed + 7, x * 0.9 + t * 0.35, y * 0.9, 3);
  const wy = fbm(seed + 13, x * 0.9, y * 0.9 - t * 0.35, 3);
  const px = x + wx * 0.9;
  const py = y + wy * 0.9;
  const hills = fbm(seed, px * 0.7, py * 0.7, 3);
  const valleys = 1 - Math.abs(fbm(seed + 29, px * 1.1, py * 1.1, 4));
  return hills * 0.55 + valleys * valleys * 0.6;
}

/**
 * Contour lines of a field sampled on a grid (marching squares), joined into
 * polylines and written as one SVG path per level. Coordinates are rounded to
 * whole units: `scale` units per grid step.
 */
export function contours(
  field: (x: number, y: number) => number,
  cols: number,
  rows: number,
  levels: number[],
  scale: number,
): string[] {
  const v: number[] = new Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) v[j * (cols + 1) + i] = field(i, j);
  const at = (i: number, j: number) => v[j * (cols + 1) + i];

  return levels.map((L) => {
    // Each crossing point lives on a grid edge; link crossings that share a cell.
    const pts = new Map<number, [number, number]>();
    const links = new Map<number, number[]>();
    // Edge ids: horizontal edges first, then vertical.
    const hId = (i: number, j: number) => j * cols + i;
    const vId = (i: number, j: number) => (rows + 1) * cols + j * (cols + 1) + i;
    const cross = (
      id: number,
      ax: number,
      ay: number,
      bx: number,
      by: number,
      a: number,
      b: number,
    ) => {
      if (!pts.has(id)) {
        const k = (L - a) / (b - a);
        pts.set(id, [
          Math.round((ax + (bx - ax) * k) * scale),
          Math.round((ay + (by - ay) * k) * scale),
        ]);
      }
      return id;
    };
    const link = (a: number, b: number) => {
      (links.get(a) ?? links.set(a, []).get(a)!).push(b);
      (links.get(b) ?? links.set(b, []).get(b)!).push(a);
    };
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = at(i, j);
        const b = at(i + 1, j);
        const c = at(i + 1, j + 1);
        const d = at(i, j + 1);
        const edges: number[] = [];
        if (a < L !== b < L) edges.push(cross(hId(i, j), i, j, i + 1, j, a, b));
        if (b < L !== c < L) edges.push(cross(vId(i + 1, j), i + 1, j, i + 1, j + 1, b, c));
        if (d < L !== c < L) edges.push(cross(hId(i, j + 1), i, j + 1, i + 1, j + 1, d, c));
        if (a < L !== d < L) edges.push(cross(vId(i, j), i, j, i, j + 1, a, d));
        if (edges.length === 2) link(edges[0], edges[1]);
        else if (edges.length === 4) {
          link(edges[0], edges[1]);
          link(edges[2], edges[3]);
        }
      }
    }
    // Walk each chain from an open end (or anywhere, for closed loops).
    const seen = new Set<number>();
    let d = "";
    const walk = (start: number) => {
      let prev = -1;
      let cur = start;
      let first = true;
      let last: [number, number] | null = null;
      while (cur !== -1 && !seen.has(cur)) {
        seen.add(cur);
        const p = pts.get(cur)!;
        if (!last || p[0] !== last[0] || p[1] !== last[1]) {
          d += `${first ? "M" : " "}${p[0]} ${p[1]}`;
          first = false;
          last = p;
        }
        const next: number = (links.get(cur) ?? []).find((n) => n !== prev && !seen.has(n)) ?? -1;
        prev = cur;
        if (next === -1 && prev !== start && (links.get(prev) ?? []).includes(start)) {
          const s = pts.get(start)!;
          d += ` ${s[0]} ${s[1]}`;
        }
        cur = next;
      }
    };
    for (const [id, l] of links) if (l.length === 1 && !seen.has(id)) walk(id);
    for (const id of links.keys()) if (!seen.has(id)) walk(id);
    return d;
  });
}
