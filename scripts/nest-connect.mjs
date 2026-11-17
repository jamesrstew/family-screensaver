// Connect the family's Nest thermostats, once. Asks for the Device Access
// project, the OAuth client, and your consent; trades the consent for a
// long-lived refresh token; and stores all four in Vercel (Production,
// sensitive). Nothing secret is printed.
//   pnpm nest:connect        (run it from the repo folder, in your own terminal)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { exit, stdin, stdout } from "node:process";

const REDIRECT = "https://www.google.com";
const SCOPE = "https://www.googleapis.com/auth/sdm.service";

/** Stop with a plain sentence (never a stack trace, which could echo what was pasted). */
function fail(words) {
  console.error(`\n${words}`);
  exit(1);
}

// Only from the folder linked to the Vercel project, and only with the CLI at hand.
let linked = "";
try {
  linked = JSON.parse(readFileSync(".vercel/project.json", "utf8")).projectName ?? "";
} catch {
  // Not linked.
}
if (linked !== "family-screensaver") {
  fail("Run this from the family-screensaver folder that's linked to Vercel (it has .vercel/).");
}
if (spawnSync("vercel", ["--version"], { stdio: "ignore" }).error) {
  fail("The Vercel CLI isn't installed here. Install it, sign in, and run this again.");
}

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q) => (await rl.question(q)).trim();

/** Ask without echoing (for the client secret and the consent link). */
async function secret(q) {
  stdout.write(q);
  // readline's private hook for echoing; there's no public way to hide input.
  const write = rl._writeToOutput;
  rl._writeToOutput = () => {};
  const answer = await rl.question("");
  rl._writeToOutput = write;
  stdout.write("\n");
  return answer.trim();
}

console.log(
  "Connect the Nest thermostats. See README: Nest thermostats for the steps before this one.\n",
);
const project = await ask("Device Access project ID (a long id from console.nest.google.com): ");
const clientId = await ask("OAuth client ID (ends in .apps.googleusercontent.com): ");
const clientSecret = await secret("OAuth client secret (hidden): ");

const consent = new URL(`https://nestservices.google.com/partnerconnections/${project}/auth`);
consent.search = new URLSearchParams({
  redirect_uri: REDIRECT,
  access_type: "offline",
  prompt: "consent",
  client_id: clientId,
  response_type: "code",
  scope: SCOPE,
}).toString();
console.log(
  "\nOpen this link, sign in with the Google account that has the home, allow the\n" +
    "thermostats, and continue past any 'unverified app' warning (it's your own app).\n\n" +
    consent.toString() +
    "\n\nYou'll land on google.com. Copy that whole address from the address bar.\n",
);
const landed = await secret("Paste the google.com address (hidden): ");
let code = null;
try {
  code = new URL(landed).searchParams.get("code");
} catch {
  // Not an address at all.
}
if (!code) fail("That address has no code in it. Run this again.");

const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT,
  }),
});
const token = await res.json();
if (!res.ok || !token.refresh_token) {
  fail(`Google said no: ${token.error ?? res.status} ${token.error_description ?? ""}`);
}

// Check it works: how many thermostats can we see? (Counts only, no names.)
const list = await fetch(
  `https://smartdevicemanagement.googleapis.com/v1/enterprises/${project}/devices`,
  { headers: { Authorization: `Bearer ${token.access_token}` } },
);
const devices = list.ok ? ((await list.json()).devices ?? []) : [];
const thermostats = devices.filter((d) => d.type === "sdm.devices.types.THERMOSTAT");
console.log(
  list.ok
    ? `\nConnected: ${thermostats.length} thermostat${thermostats.length === 1 ? "" : "s"}.`
    : `\nThe token works, but listing devices failed (${list.status}). Storing it anyway.`,
);

// Each value replaces the old one in place (--force), so a failure never
// leaves production without it.
const failed = [];
for (const [name, value] of [
  ["NEST_PROJECT_ID", project],
  ["NEST_CLIENT_ID", clientId],
  ["NEST_CLIENT_SECRET", clientSecret],
  ["NEST_REFRESH_TOKEN", token.refresh_token],
]) {
  const add = spawnSync(
    "vercel",
    ["env", "add", name, "production", "--sensitive", "--force", "--yes"],
    { input: value, stdio: ["pipe", "ignore", "inherit"] },
  );
  if (!add.error && add.status === 0) console.log(`Stored ${name}.`);
  else failed.push(name);
}
rl.close();
if (failed.length) {
  fail(
    `Couldn't store ${failed.join(", ")}. Store each by hand (it asks for the value):\n` +
      failed.map((n) => `  vercel env add ${n} production --sensitive --force`).join("\n"),
  );
}
console.log("\nDone. Redeploy to start reading the thermostats.");
