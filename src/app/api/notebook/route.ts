import { z } from "zod";
import { isFamily } from "@/lib/auth";
import { KEYS, hasStore, store } from "@/lib/store";

// Replace the notebook in the store (`pnpm notebook:push`). The store's keys
// live only inside Vercel, so the upload comes through the app, behind the
// family key, instead of straight to Redis.

const Notebook = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(["idea", "quote", "question"]),
        text: z.string().min(1),
        author: z.string().optional(),
        source: z.string().optional(),
      }),
    )
    .min(1),
});

export async function PUT(request: Request) {
  if (!(await isFamily())) return new Response(null, { status: 401 });
  if (!hasStore) return Response.json({ error: "No store connected" }, { status: 503 });
  const body = Notebook.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Not a notebook" }, { status: 400 });
  await store.set(KEYS.notebook, { items: body.data.items });
  return Response.json({ items: body.data.items.length });
}
