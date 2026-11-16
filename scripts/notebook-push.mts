// Upload the notebook (content/private/notebook.json, never committed) to the
// store production reads from, through the app (PUT /api/notebook).
//   FAMILY_KEY=… pnpm notebook:push [site-url]
import { readFile } from "node:fs/promises";

const site = (process.argv[2] ?? "https://family-screensaver.vercel.app").replace(/\/$/, "");
const key = process.env.FAMILY_KEY;
if (!key) {
  console.error("Set FAMILY_KEY to the family key.");
  process.exit(1);
}

const body = await readFile("content/private/notebook.json", "utf8");
const res = await fetch(`${site}/api/notebook`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body,
});
const out = await res.text();
if (!res.ok) {
  console.error(`Upload failed (${res.status}): ${out}`);
  process.exit(1);
}
console.log(`Pushed ${JSON.parse(out).items} notebook items to ${site}.`);
