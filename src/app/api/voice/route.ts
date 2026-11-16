import { isFamily } from "@/lib/auth";
import { household } from "@/lib/snapshot";
import { mintVoiceKey } from "@/lib/voice";

// A two-minute key for one conversation. The browser talks to OpenAI directly.
export async function POST() {
  if (!(await isFamily())) return new Response(null, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return new Response(null, { status: 503 });
  try {
    const { place, timeZone } = household();
    const key = await mintVoiceKey(place, timeZone);
    return Response.json({ key }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[voice] could not mint a key", err);
    return new Response(null, { status: 502 });
  }
}
