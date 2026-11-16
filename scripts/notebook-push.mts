// Upload the notebook (content/private/notebook.json, never committed) to the
// store production reads from.
//   vercel env pull .env.local && pnpm notebook:push
import { readFile } from "node:fs/promises";
import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error(
    "No store configured: set KV_REST_API_URL and KV_REST_API_TOKEN (vercel env pull).",
  );
  process.exit(1);
}

const notebook = JSON.parse(await readFile("content/private/notebook.json", "utf8"));
if (!Array.isArray(notebook.items) || notebook.items.length === 0) {
  console.error("content/private/notebook.json has no items.");
  process.exit(1);
}

await new Redis({ url, token }).set("family:notebook", notebook);
console.log(`Pushed ${notebook.items.length} notebook items.`);
