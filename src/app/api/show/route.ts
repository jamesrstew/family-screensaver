import { isFamily } from "@/lib/auth";
import { household } from "@/lib/snapshot";
import { ShowBody } from "@/lib/show";
import { findTeam } from "@/lib/sports";
import { KEYS, store } from "@/lib/store";
import type { Asks, ShowRequest, SoundRequest } from "@/lib/types";

const noStore = { "Cache-Control": "private, no-store" };

// The TV asks: anything new? One small read.
export async function GET() {
  if (!(await isFamily())) return new Response(null, { status: 401 });
  const [latest, heard] = await Promise.all([
    store.get<ShowRequest>(KEYS.show),
    store.get<SoundRequest>(KEYS.sound),
  ]);
  const asks: Asks = { ...(latest ?? { seq: 0 }), heard: heard ?? null };
  return Response.json(asks, { headers: noStore });
}

// The phone, Siri, Alexa, or the voice: show this page.
//   curl -X POST -H "Authorization: Bearer $FAMILY_KEY" -d '{"page":"weather"}' …/api/show
// The weather's views have names of their own: {"page":"hourly"}, {"page":"seven-day"}.
// One team's games: {"page":"sports","team":"kentucky basketball"}; a team
// that can't be found shows the games page as usual, never an error.
// One league's: {"page":"sports","league":"nfl"}, or {"page":"college football"}.
// Nature's sound, alone or beside a page: {"sound":"off"}, "full", or "soft".
export async function POST(request: Request) {
  if (!(await isFamily())) return new Response(null, { status: 401 });
  const body = ShowBody.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Unknown page or sound" }, { status: 400, headers: noStore });
  }
  const now = new Date();
  const heard: SoundRequest | null = body.data.sound
    ? { seq: Date.now(), sound: body.data.sound, at: now.toISOString() }
    : null;
  if (heard) await store.set(KEYS.sound, heard);
  if (!body.data.page) return Response.json(heard, { headers: noStore });
  const team = body.data.team
    ? await findTeam(body.data.team, household().teams, now).catch(() => null)
    : null;
  const ask: ShowRequest = {
    seq: Date.now(),
    page: body.data.page,
    ...(body.data.view ? { view: body.data.view } : {}),
    ...(team ? { team } : {}),
    // A league only when no team was named (one that wasn't found shows every game).
    ...(body.data.league && !body.data.team ? { league: body.data.league } : {}),
    at: now.toISOString(),
  };
  await store.set(KEYS.show, ask);
  return Response.json(ask, { headers: noStore });
}
