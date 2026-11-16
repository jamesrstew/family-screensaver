import { isFamily } from "@/lib/auth";
import { getSnapshot } from "@/lib/snapshot";

// The TV refreshes its snapshot every few minutes.
export async function GET() {
  if (!(await isFamily())) return new Response(null, { status: 401 });
  return Response.json(await getSnapshot(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
