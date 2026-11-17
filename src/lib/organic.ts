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
 * whole units: `scale` units per grid step. Closed loops smaller than
 * `minLoop` units across are left out.
 */
export function contours(
  field: (x: number, y: number) => number,
  cols: number,
  rows: number,
  levels: number[],
  scale: number,
  minLoop = 0,
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
    // Walk each chain from an open end (or anywhere, for closed loops). A
    // closed loop smaller than `minLoop` across is a speck, not land: dropped.
    const seen = new Set<number>();
    let d = "";
    const walk = (start: number) => {
      let prev = -1;
      let cur = start;
      const chain: Array<[number, number]> = [];
      let closed = false;
      while (cur !== -1 && !seen.has(cur)) {
        seen.add(cur);
        const p = pts.get(cur)!;
        const last = chain.at(-1);
        if (!last || p[0] !== last[0] || p[1] !== last[1]) chain.push(p);
        const next: number = (links.get(cur) ?? []).find((n) => n !== prev && !seen.has(n)) ?? -1;
        prev = cur;
        if (next === -1 && prev !== start && (links.get(prev) ?? []).includes(start)) {
          chain.push(pts.get(start)!);
          closed = true;
        }
        cur = next;
      }
      if (chain.length < 2) return;
      if (closed && minLoop > 0) {
        const xs = chain.map((p) => p[0]);
        const ys = chain.map((p) => p[1]);
        const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        if (span < minLoop) return;
      }
      d += chain.map((p, i) => `${i ? " " : "M"}${p[0]} ${p[1]}`).join("");
    };
    for (const [id, l] of links) if (l.length === 1 && !seen.has(id)) walk(id);
    for (const id of links.keys()) if (!seen.has(id)) walk(id);
    return d;
  });
}

/** Evenly spaced levels through the bulk of a field's values (by quantile). */
export function levelsOf(
  field: (x: number, y: number) => number,
  cols: number,
  rows: number,
  count: number,
): number[] {
  const vs: number[] = [];
  for (let j = 0; j <= rows; j += 2) for (let i = 0; i <= cols; i += 2) vs.push(field(i, j));
  vs.sort((a, b) => a - b);
  const lo = vs[Math.floor(vs.length * 0.04)];
  const hi = vs[Math.floor(vs.length * 0.96)];
  return Array.from({ length: count }, (_, k) => lo + ((hi - lo) * (k + 0.5)) / count);
}

/**
 * The drainage of a height field: where rain on it would run. Each grid point
 * drains to its steepest-downhill neighbor, and flow accumulates downstream
 * (D8). The channels that gather enough flow are returned as segments in a
 * few classes by size, from capillaries to trunks, so they can be drawn with
 * tapering weight: veins in the land. Units as in `contours`.
 */
export function drainage(
  field: (x: number, y: number) => number,
  cols: number,
  rows: number,
  scale: number,
  threshold: number,
  classes = 4,
  seed = 0,
): string[] {
  const W = cols + 1;
  const n = W * (rows + 1);
  const h = new Float64Array(n);
  // A little fine roughness, so water meanders instead of running along
  // the grid's straight lines.
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++)
      h[j * W + i] = field(i, j) + 0.035 * fbm(seed + 77, i * 0.3, j * 0.3, 2);
  // Fill the pits (priority flood from the top row, the horizon), so every
  // drop finds its way out and the channels join into whole trees.
  {
    const done = new Uint8Array(n);
    const heap: number[] = [];
    const less = (a: number, b: number) => h[heap[a]] < h[heap[b]];
    const push = (k: number) => {
      heap.push(k);
      for (let c = heap.length - 1; c > 0;) {
        const p = (c - 1) >> 1;
        if (!less(c, p)) break;
        [heap[c], heap[p]] = [heap[p], heap[c]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let c = 0; ;) {
          const l = 2 * c + 1;
          const r = l + 1;
          let m = c;
          if (l < heap.length && less(l, m)) m = l;
          if (r < heap.length && less(r, m)) m = r;
          if (m === c) break;
          [heap[c], heap[m]] = [heap[m], heap[c]];
          c = m;
        }
      }
      return top;
    };
    for (let i = 0; i <= cols; i++) {
      done[i] = 1;
      push(i);
    }
    while (heap.length) {
      const k = pop();
      const i = k % W;
      const j = Math.floor(k / W);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const x = i + di;
          const y = j + dj;
          if (x < 0 || y < 0 || x > cols || y > rows) continue;
          const m = y * W + x;
          if (done[m]) continue;
          done[m] = 1;
          if (h[m] <= h[k]) h[m] = h[k] + 1e-5;
          push(m);
        }
      }
    }
  }
  const down = new Int32Array(n).fill(-1);
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const k = j * W + i;
      let best = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const x = i + di;
          const y = j + dj;
          if (x < 0 || y < 0 || x > cols || y > rows) continue;
          const drop = (h[k] - h[y * W + x]) / Math.hypot(di, dj);
          if (drop > best) {
            best = drop;
            down[k] = y * W + x;
          }
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => h[b] - h[a]);
  const acc = new Float64Array(n).fill(1);
  for (const k of order) if (down[k] >= 0) acc[down[k]] += acc[k];
  // Channels: where enough has gathered. Each gets a size class.
  const cls = new Int8Array(n).fill(-1);
  for (let k = 0; k < n; k++) {
    if (acc[k] >= threshold)
      cls[k] = Math.min(Math.floor(Math.log(acc[k] / threshold) / Math.log(3)), classes - 1);
  }
  const ups = new Int32Array(n);
  const upOf = new Int32Array(n).fill(-1);
  for (let k = 0; k < n; k++) {
    if (cls[k] >= 0 && down[k] >= 0 && cls[down[k]] >= 0) {
      ups[down[k]]++;
      upOf[down[k]] = k;
    }
  }
  // A stream starts at a spring, a confluence, or where it grows a size;
  // it runs downstream to the next such point. Each is smoothed (Chaikin), so
  // the grid's steps become the curves of water.
  const starts = (k: number) => ups[k] !== 1 || cls[upOf[k]] !== cls[k];
  const out: string[] = Array.from({ length: classes }, () => "");
  for (let k = 0; k < n; k++) {
    if (cls[k] < 0 || !starts(k)) continue;
    const pts: Array<[number, number]> = [[k % W, Math.floor(k / W)]];
    let cur = k;
    while (down[cur] >= 0 && cls[down[cur]] >= 0) {
      cur = down[cur];
      pts.push([cur % W, Math.floor(cur / W)]);
      if (starts(cur)) break;
    }
    if (pts.length < 2) continue;
    let line = pts;
    for (let pass = 0; pass < 2; pass++) {
      const next: Array<[number, number]> = [line[0]];
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, ay] = line[i];
        const [bx, by] = line[i + 1];
        next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
        next.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
      }
      next.push(line[line.length - 1]);
      line = next;
    }
    // Bend the course by a smooth field, as real streams wander.
    const bend = (x: number, y: number): [number, number] => [
      x + 1.1 * noise(seed + 91, x * 0.11, y * 0.11),
      y + 0.6 * noise(seed + 97, x * 0.11, y * 0.11),
    ];
    out[cls[k]] += line
      .map(([x0, y0], i) => {
        const [x, y] = bend(x0, y0);
        return `${i ? "L" : "M"}${Math.round(x * scale)} ${Math.round(y * scale)}`;
      })
      .join("");
  }
  return out;
}
