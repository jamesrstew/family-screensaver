import { landSvg, type Tone } from "@/lib/land";

// The land under the living sky, as an image (src/lib/land.ts). It holds no
// family data (an imaginary country drawn from a number), so it needs no key,
// and the same seed always draws the same land: cached for good.
export async function GET(request: Request, ctx: RouteContext<"/land/[seed]">) {
  const { seed } = await ctx.params;
  const n = Number(seed);
  if (!/^\d{1,6}$/.test(seed) || !Number.isSafeInteger(n)) {
    return new Response(null, { status: 404 });
  }
  const tone: Tone = new URL(request.url).searchParams.get("tone") === "night" ? "night" : "day";
  return new Response(landSvg(n, tone), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
