# Stewart Family App: notes for Claude sessions

The Stewart family's living-room screen (Google TV). Enchanted paper, like the moving pages in Harry Potter: cream paper, ink that bleeds in and out, one beautiful piece at a time (a James Clear idea, quote, or question), with the hour, the sky, and what's next in the corners. Voice, phone, Siri, and the TV remote can ask it to turn the page.

@DOCTRINE.md
@AGENTS.md

**Read DOCTRINE.md before every change.** It is the law of this repo: magic and effortless, less is more, calm, dim at night, ink not pixels, enchanted paper (not a newspaper, not an app), public repo / private family. Unbuilt work lives in ROADMAP.md with a priority and an area.

## Stack

- Next.js 16 App Router, **Cache Components on**. Read `node_modules/next/dist/docs/` before using an API you're unsure of. Dynamic reads go in an async component inside `<Suspense>`; `getSnapshot()` calls `connection()`.
- Tailwind v4; tokens in `src/app/globals.css`. The TV is a fixed 120 × 67.5 rem sheet (`[data-surface="tv"]` scales the root font). Phones (`/remote`) use the normal 16px root.
- Upstash Redis (`src/lib/store.ts`) for the latest show request and the notebook; an in-memory map in dev when `KV_REST_API_*` is unset.
- Weather: Open-Meteo (no key). Calendar: Google's secret iCal URLs, parsed with `ical.js` (`src/lib/calendar.ts`). Voice: OpenAI Realtime over WebRTC; the server only mints a two-minute key (`src/lib/voice.ts`), tools run in the browser (`src/lib/voice-tools.ts`).
- `tv/`: the Android TV shell (WebView + launcher aliases + mic tests). Separate Gradle project; see `tv/README.md`.

## Map

- `src/components/Screen.tsx` runs the TV: snapshot refresh, clock, polling `/api/show`, page turns, return-home, drift, remote keys (←/→ turn pages, Back goes home, OK talks), voice.
- `src/components/Ink.tsx`: the only way content appears. Wrap every block of TV type in `<Ink>`; give it `k` (content identity) and `order` (stagger).
- `src/views/*Page.tsx`: one file per page, pure functions of `{ snapshot, now, mood }`. To add a page: add it to `PAGES` in `src/lib/types.ts`, write the view, add it to `Screen`, the remote, the voice tool enum, and `HOLD_MS`.
- `src/views/Sky.tsx`: the engraved weather symbols.
- `src/views/designs/living.tsx` (+ `living.css`): Almanac's living sky behind home, night, and weather: the land (rivers and contours in perspective, cloud shadows), the sun or moon on its arc, wisps, cumulus, stratus, stars, rain, snow, mist, birds, all following the real weather. Drawn once, seeded (`src/lib/organic.ts`); the land is a cached SVG image from `/land/[seed]` (`src/lib/land.ts`), so the TV computes none of it; only transform and opacity animate, on few layers (the TV's GPU is weak: keep each scene under about 6 screens of compositing). `?fps=1` shows the frame rate in a corner; in dev, `?at=` sets the whole clock.
- `src/lib/time.ts`: every date and time, always in `snapshot.timeZone`, AP style.
- `src/lib/auth.ts`: one secret (`FAMILY_KEY`); devices hold an HMAC cookie; scripts send `Authorization: Bearer <key>`. Every family-data route checks `isFamily()`.

## Commands

- `pnpm dev`, then open http://localhost:3000 (the TV) and /remote (the phone).
- `pnpm check`: lint, typecheck, tests, prettier.
- `node scripts/shot.mjs <url> <out.png> [--at ISO] [--frames n,ms] [--wait ms]`: 1920 × 1080 screenshots. `--at "2026-11-16T22:30:00-08:00"` for night (it sets the TV's clock and adds `&at=` for the server), `--frames 8,250` to watch the ink. **Look at your screens** (doctrine §19).
- `pnpm key`: a new family key. `FAMILY_KEY=… pnpm notebook:push [site]`: upload `content/private/notebook.json` (gitignored) to production's store through `PUT /api/notebook` (the store's keys are sensitive in Vercel and can't be pulled).
- Dev calendar: `CALENDAR_ICS_URLS=file://$PWD/content/fixtures/family.ics` (a fictional family; `file:` works only outside production).

## Shipping

- Run `/scrutinize` on every change before it reaches `main`. Pushing `main` deploys production on Vercel.
- Never merge a PR whose CI check isn't green (`gh pr checks` must show `check pass`); `main` requires it. A pre-push hook (`.githooks/pre-push`, set by `pnpm install`) runs `pnpm check` before any push.
- Run vercel commands only from this folder (linked to the Vercel project `family-screensaver`). Never re-link other folders.
- Conventional Commits (`feat:`, `fix:`, `style:`, `docs:`, `chore:`, `refactor:`, `test:`). Short branches, PRs, squash-merge.
- Never commit secrets, the family's location, calendar contents, photos, or `content/private/`.
