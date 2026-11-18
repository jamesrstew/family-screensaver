import { isFamily } from "@/lib/auth";
import { household } from "@/lib/snapshot";
import { ShowBody } from "@/lib/show";
import { findTeam } from "@/lib/sports";
import { KEYS, store } from "@/lib/store";
import type { ShowRequest } from "@/lib/types";

const noStore = { "Cache-Control": "private, no-store" };

// The TV asks: anything new? One small read.
export async function GET() {
  if (!(await isFamily())) return new Response(null, { status: 401 });
  const latest = await store.get<ShowRequest>(KEYS.show);
  return Response.json(latest ?? { seq: 0 }, { headers: noStore });
}

// The phone, Siri, Alexa, or the voice: show this page.
//   curl -X POST -H "Authorization: Bearer $FAMILY_KEY" -d '{"page":"weather"}' …/api/show
// The weather's views have names of their own: {"page":"hourly"}, {"page":"seven-day"}.
// One team's games: {"page":"sports","team":"kentucky basketball"}; a team
// that can't be found shows the games page as usual, never an error.
export async function POST(request: Request) {
  if (!(await isFamily())) return new Response(null, { status: 401 });
  const body = ShowBody.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Unknown page" }, { status: 400, headers: noStore });
  }
  const now = new Date();
  const team = body.data.team
    ? await findTeam(body.data.team, household().teams, now).catch(() => null)
    : null;
  const ask: ShowRequest = {
    seq: Date.now(),
    page: body.data.page,
    ...(body.data.view ? { view: body.data.view } : {}),
    ...(team ? { team } : {}),
    at: now.toISOString(),
  };
  await store.set(KEYS.show, ask);
  return Response.json(ask, { headers: noStore });
}
