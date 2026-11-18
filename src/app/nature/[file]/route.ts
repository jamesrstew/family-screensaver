import { open, stat } from "node:fs/promises";
import path from "node:path";
import { isFamily } from "@/lib/auth";

/*
 * Dev only: the nature clips (lib/nature.ts) from a folder outside the repo,
 * NATURE_DIR, at the same /nature/ paths the TV shell answers on the TV, so
 * the page is the same code in both places. In production this is always a
 * 404: the clips are private, and only the TV has them.
 */
export async function GET(req: Request, ctx: RouteContext<"/nature/[file]">) {
  const { file } = await ctx.params;
  const dir = natureDir();
  const name = /^(manifest\.json|[\w-]{1,64}\.mp4)$/.test(file) ? file : null;
  if (!dir || !name || !(await isFamily())) return new Response(null, { status: 404 });
  const full = path.join(dir, name);
  const size = await stat(full).then(
    (s) => s.size,
    () => null,
  );
  if (size === null) return new Response(null, { status: 404 });
  const headers = {
    "Accept-Ranges": "bytes",
    "Content-Type": name.endsWith(".json") ? "application/json" : "video/mp4",
    "Cache-Control": "no-store",
  };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (!m) {
    return new Response(bytes(full, 0, size - 1), {
      headers: { ...headers, "Content-Length": String(size) },
    });
  }
  const start = m[1] ? Number(m[1]) : Math.max(size - Number(m[2]), 0);
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start > end || start >= size)
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(bytes(full, start, end), {
    status: 206,
    headers: {
      ...headers,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
    },
  });
}

/** NATURE_DIR, outside the repo, outside production; else nothing. */
function natureDir(): string | null {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) return null;
  const dir = process.env.NATURE_DIR;
  if (!dir || !path.isAbsolute(dir)) return null;
  const rel = path.relative(process.cwd(), path.resolve(dir));
  return rel.startsWith("..") || path.isAbsolute(rel) ? path.resolve(dir) : null;
}

/** Bytes `start` to `end` of a file, read as they're asked for; dropped cleanly when the asking stops. */
function bytes(file: string, start: number, end: number): ReadableStream<Uint8Array> {
  let at = start;
  const handle = open(file, "r");
  return new ReadableStream({
    async pull(c) {
      const fh = await handle;
      const want = Math.min(256 * 1024, end + 1 - at);
      const { bytesRead, buffer } = await fh.read(new Uint8Array(want), 0, want, at);
      at += bytesRead;
      if (bytesRead > 0) c.enqueue(buffer.subarray(0, bytesRead));
      if (bytesRead === 0 || at > end) {
        c.close();
        await fh.close();
      }
    },
    async cancel() {
      await (await handle).close();
    },
  });
}
