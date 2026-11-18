// The nature clips, onto the TV. They never go online or into git.
//
//   node scripts/nature-push.mjs <folder>                 write <folder>/manifest.json
//   node scripts/nature-push.mjs <folder> --to <drive>    and copy the folder onto a drive
//   node scripts/nature-push.mjs <folder> --adb [volume]  or push it to the TV over adb
//
// <folder> holds <id>.mp4 and manifest.txt (id|seconds|title per line). The
// manifest lists the clips that are there, each captioned with where it was
// filmed (from its title: "Nature: Herons in Alder County" → "Alder County"; the
// owner's to edit in manifest.json, kept as edited on every run), each
// with a gain that brings its sound to one loudness (measured once, EBU R128;
// the page sets the clip's volume from it, so nothing is re-encoded). Its
// `excluded` list is the owner's: kept as edited on every run (the first run
// suggests one from the titles). --to takes the drive's root (e.g.
// /Volumes/NATURE); the TV finds the clips at Android/data/<app>/files/nature/
// on any of its volumes. --adb takes the volume on the TV (default /sdcard; a
// USB drive is /storage/<its id>). Both copy only what's new or changed, and
// the manifest last. Add --dry-run to see what would be copied.
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

// Every clip is brought to this loudness; the page's volume does the rest.
const TARGET_LUFS = -30;
const APP_DIR = "Android/data/com.jamesstewart.family/files/nature";
// Titles to leave out until the owner says otherwise: not calm enough for the living room.
const NOT_CALM =
  /\b(spider|tarantula|snake|rattlesnake|shark|alligator|crocodile|scorpion|wasp|hornet|leeche|vulture)s?\b/i;

const [folder, ...rest] = process.argv.slice(2);
if (!folder) {
  console.error(
    "Usage: node scripts/nature-push.mjs <folder> [--to <drive> | --adb [volume]] [--dry-run]",
  );
  process.exit(1);
}
const flag = (name) => rest.indexOf(`--${name}`);
const valueOf = (name) => {
  const i = flag(name);
  return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : null;
};
const dry = flag("dry-run") >= 0;
const src = path.resolve(folder);

// ---- The manifest.
const lines = (await readFile(path.join(src, "manifest.txt"), "utf8")).split("\n");
const here = new Set((await readdir(src)).filter((f) => f.endsWith(".mp4")));
const seen = new Set();
const clips = lines.flatMap((line) => {
  const [id, s, ...t] = line.split("|");
  const seconds = Number(s);
  const title = t.join("|").trim();
  if (!/^[\w-]{1,64}$/.test(id ?? "") || !(seconds > 0) || !here.has(`${id}.mp4`) || seen.has(id))
    return [];
  seen.add(id);
  return [{ id, seconds, title }];
});
const old = await readFile(path.join(src, "manifest.json"), "utf8")
  .then(JSON.parse)
  .catch(() => null);
const excluded = Array.isArray(old?.excluded)
  ? old.excluded
  : clips.filter((c) => NOT_CALM.test(c.title)).map((c) => c.id);
/**
 * Where a clip was filmed, from its title: what follows its last " in ", " at ",
 * " above" (and the like): "Terns at Quill Point" → "Quill Point". A title naming
 * only a place is the place; one naming only its subject ("Marsh wrens") has none.
 */
function placeOf(title) {
  const t = title.replace(/^.*?nature\s*:\s*/i, "").trim();
  const m = /^.*\s(?:in|at|on|off|near|above|of)\s+(?:the\s+|an?\s+)?(.+)$/i.exec(t);
  if (m) return m[1];
  // A proper name ("Tamsin Lake", "Westerly") rather than a subject ("Marsh wrens").
  const words = t.split(/\s+/);
  return words.every((w) => /^[A-Z'’]/.test(w) || /^(of|the|and|de|la)$/.test(w)) ? t : "";
}

// Each clip's gain, measured once: a clip already in the manifest keeps its own.
const known = new Map((old?.clips ?? []).map((c) => [c.id, c.gain]));
const places = new Map(
  (old?.clips ?? []).filter((c) => typeof c.place === "string").map((c) => [c.id, c.place]),
);
const run = promisify(execFile);
async function gainOf(id) {
  if (typeof known.get(id) === "number") return known.get(id);
  const { stderr } = await run(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      path.join(src, `${id}.mp4`),
      "-vn",
      "-af",
      "ebur128",
      "-f",
      "null",
      "-",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  ).catch((e) => e);
  const lufs = Number([...String(stderr).matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)?.[1]);
  // Silence, or a clip ffmpeg can't read: no change.
  return Number.isFinite(lufs) && lufs > -70
    ? Math.round(10 ** ((TARGET_LUFS - lufs) / 20) * 100) / 100
    : 1;
}
const gains = new Map();
for (let i = 0; i < clips.length; i += 4) {
  const batch = clips.slice(i, i + 4);
  const got = await Promise.all(batch.map((c) => gainOf(c.id)));
  batch.forEach((c, j) => gains.set(c.id, got[j]));
  process.stdout.write(`\rloudness ${Math.min(i + 4, clips.length)}/${clips.length}`);
}
process.stdout.write("\n");
const manifest = {
  clips: clips.map(({ id, seconds, title }) => ({
    id,
    seconds,
    place: places.get(id) ?? placeOf(title),
    gain: gains.get(id),
  })),
  excluded,
};
await writeFile(path.join(src, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const hours = clips.reduce((n, c) => n + c.seconds, 0) / 3600;
console.log(`${clips.length} clips (${hours.toFixed(1)} h), ${excluded.length} excluded:`);
for (const id of excluded)
  console.log(`  ${id}  ${clips.find((c) => c.id === id)?.title ?? "(gone)"}`);

// ---- The copy: every clip that's new or a different size, then the manifest.
const files = [...clips.map((c) => `${c.id}.mp4`), "manifest.json"];
const drive = valueOf("to");
const adb = flag("adb") >= 0;
if (drive) {
  const dest = path.join(drive, APP_DIR);
  if (!dry) await mkdir(dest, { recursive: true });
  for (const f of files) {
    const a = await stat(path.join(src, f));
    const b = await stat(path.join(dest, f)).catch(() => null);
    if (f !== "manifest.json" && b?.size === a.size) continue;
    console.log(`${dry ? "would copy" : "copying"} ${f}`);
    if (!dry) await copyFile(path.join(src, f), path.join(dest, f));
  }
} else if (adb) {
  const volume = valueOf("adb") ?? "/sdcard";
  const dest = `${volume}/${APP_DIR}`;
  const shell = (cmd) => execFileSync("adb", ["shell", cmd], { encoding: "utf8" });
  if (!dry) shell(`mkdir -p '${dest}'`);
  // What's on the TV already, by size.
  const there = new Map(
    shell(`ls -l '${dest}' 2>/dev/null || true`)
      .split("\n")
      .map((l) => l.trim().split(/\s+/))
      .filter((p) => p.length >= 8)
      .map((p) => [p[p.length - 1], Number(p[4])]),
  );
  for (const f of files) {
    const { size } = await stat(path.join(src, f));
    if (f !== "manifest.json" && there.get(f) === size) continue;
    console.log(`${dry ? "would push" : "pushing"} ${f}`);
    if (!dry)
      execFileSync("adb", ["push", path.join(src, f), `${dest}/${f}`], { stdio: "inherit" });
  }
}
