# Stewart Family App

A quiet screen for the Stewart family's living room. Cream paper where the ink moves, like the enchanted pages in Harry Potter: one idea, quote, or question at a time, with the hour, the sky, and what's next written small in the corners. In the afternoon it asks the family a question for the table. At night it goes dark. Ask it (by voice, phone, Siri, or the TV remote) and it turns the page, then finds its own way home.

It is built to serve the family, never to hold their attention. Read [DOCTRINE.md](DOCTRINE.md) before changing anything, and [ROADMAP.md](ROADMAP.md) for what's next.

## How it works

- **The TV** opens the web app full screen (via the small Android TV app in [`tv/`](tv/README.md), a TV browser, or a cast tab). `Screen` keeps time, refreshes its snapshot every five minutes, and checks `/api/show` every few seconds for requests.
- **Pages:** home, weather, the week ahead, and ideas. Night replaces home after 9:30 p.m.
- **Asking it:** the phone remote at `/remote`, `POST /api/show` with the family key (Siri Shortcuts, Alexa), the TV remote's arrows, or the voice.
- **The voice** is OpenAI Realtime over WebRTC. The server mints a two-minute key; the browser talks to OpenAI and answers from the snapshot it already has.
- **Sources:** Open-Meteo (weather, no key), the family's Google Calendar secret iCal address, and James Clear's 3-2-1 (extracted from Gmail; stored privately, never in git).

## Set up

1. `pnpm install`, then `cp .env.example .env.local` and fill it in. `pnpm dev` and open http://localhost:3000.
2. **Family key:** `pnpm key` prints four words and a number. Set `FAMILY_KEY` in Vercel. Pair a device by typing the key on its locked screen (the TV, or `/remote` on a phone). Keys are never put in links.
3. **Store:** add Upstash Redis from the Vercel Marketplace (Storage → Upstash → connect to this project), then `FAMILY_KEY=… pnpm notebook:push` (uploads through `PUT /api/notebook`; the store's own keys stay inside Vercel).
4. **Calendar:** in Google Calendar, open the family calendar's settings → _Integrate calendar_ → _Secret address in iCal format_. Put it in `CALENDAR_ICS_URLS` (comma-separate several). Treat it like a password.
5. **Voice:** set `OPENAI_API_KEY`.
6. **Home:** set `HOME_PLACE`, `HOME_LAT`, `HOME_LON`, `HOME_TIME_ZONE` (city-level coordinates are plenty).

### Siri

Make a Shortcut named, say, "Family weather": **Get Contents of URL** → `https://<site>/api/show`, method POST, header `Authorization: Bearer <family key>`, JSON body `{"page": "weather"}`. Pages: `home`, `weather`, `week`, `notebook`. The weather's views have names of their own, so "Family hourly" sends `{"page": "hourly"}` and "Family seven-day" sends `{"page": "seven-day"}` (also `now`, and `today` for the next 24 hours).

### Nest thermostats

Optional: "68° inside" in home's corner, and the voice can say how warm each room is. Read only. Once, in this order:

1. **Google Cloud:** make a project (console.cloud.google.com) and enable the **Smart Device Management API**.
2. **OAuth consent screen:** user type _External_. Branding needs a home page and a privacy policy link (the site's address will do). Then **publish it to _In production_**: while it's in _Testing_, Google expires the refresh token after 7 days and the reading quietly disappears. The "unverified app" warning during consent is expected.
3. **OAuth client:** _Credentials_ → _Create credentials_ → _OAuth client ID_ → _Web application_, with the authorized redirect URI `https://www.google.com`. Keep the client ID and secret.
4. **Device Access:** register at console.nest.google.com/device-access (a one-time $5 fee) and create a project with that OAuth client ID. Note the project ID.
5. From this folder, in your own terminal: `pnpm nest:connect`. It asks for the project ID, client ID, and secret, prints Google's consent link (grant the thermostats only, in this home only; then paste back the google.com address you land on), and stores `NEST_PROJECT_ID`, `NEST_CLIENT_ID`, `NEST_CLIENT_SECRET`, and `NEST_REFRESH_TOKEN` in Vercel. Redeploy.

To disconnect: Google Account → _Security_ → _Third-party access_ (remove the app), and remove the project in the Device Access console.

## Develop

`pnpm check` runs lint, types, tests, and formatting. `node scripts/shot.mjs <url> out.png` takes a 1920 × 1080 screenshot (add `--at 2026-11-16T22:30:00-08:00` to see night). Look at the screen before calling a design change done.
