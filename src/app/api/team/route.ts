import { connection } from "next/server";
import { z } from "zod";
import { isFamily } from "@/lib/auth";
import { FAKE_TEAMS, fakeTeam, type FakeTeam } from "@/lib/games-fixtures";
import { household } from "@/lib/snapshot";
import { findTeam, getTeamView } from "@/lib/sports";

const noStore = { "Cache-Control": "private, no-store" };
const isFakeTeam = (s: string | null): s is FakeTeam =>
  (FAKE_TEAMS as readonly string[]).includes(s ?? "");

// One team's page, for the TV. GET by ESPN league and id (never by what was
// said): ?league=cbb&id=150. POST {"team":"kentucky basketball"} finds the
// team first (the voice on the TV asks this way); {"team": null} if no team
// answers to it.

const Ref = z.object({ league: z.enum(["cfb", "cbb", "nfl"]), id: z.string().regex(/^\d{1,8}$/) });

export async function GET(request: Request) {
  if (!(await isFamily())) return new Response(null, { status: 401 });
  await connection();
  const q = new URL(request.url).searchParams;
  // Design review only: a made-up team page.
  const fake = q.get("fake");
  if (process.env.NODE_ENV !== "production" && isFakeTeam(fake)) {
    return Response.json(fakeTeam(fake, new Date()), { headers: noStore });
  }
  const ref = Ref.safeParse({ league: q.get("league"), id: q.get("id") });
  if (!ref.success) return Response.json(null, { status: 400, headers: noStore });
  const view = await getTeamView(ref.data.league, ref.data.id, new Date()).catch(() => null);
  return Response.json(view, { headers: noStore });
}

export async function POST(request: Request) {
  if (!(await isFamily())) return new Response(null, { status: 401 });
  const body = z
    .object({
      team: z
        .string()
        .max(400)
        .transform((t) => t.slice(0, 60)),
    })
    .safeParse(await request.json().catch(() => null));
  const team = body.success
    ? await findTeam(body.data.team.trim(), household().teams, new Date()).catch(() => null)
    : null;
  return Response.json({ team }, { headers: noStore });
}
