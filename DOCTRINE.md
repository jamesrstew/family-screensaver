# Doctrine

Heritage is the Stewart family's living-room screen. Think of the enchanted pages in Harry Potter: cream paper where the ink moves. It shows one beautiful thing at a time (an idea, a quote, a question, someday a photograph), with the hour, the sky, and what's next written quietly in the corners. Ask it, and it turns the page.

These are the laws. A change that breaks one is a bug, even if someone asked for it. To change a law, change this file first, out loud, in its own commit, with the reason.

The one-word test for every decision: **magic.** It should feel magic and effortless. If it needs explaining, a setting, or a second try, it isn't done.

---

## I. Purpose

1. **It serves the family. It never competes for them.** Heritage is part of the room, not a feed. Success is a glance, a smile, a question at dinner, and then everyone goes back to their lives. No feeds, no scrolling, no notifications, no badges, no streaks, no autoplay. We never measure how long anyone looked. A feature whose main effect is that someone stays longer needs a better reason than that, or it doesn't ship.

2. **Less is more.** Home shows one thing. Everything else is a small note in a corner or lives one page away. Before adding anything to a screen, try taking something away.

3. **Calm by default.** Motion is slow and rare. Nothing blinks, ticks, bounces, or counts down. The page changes when the hour turns, when the piece rotates (every fifteen minutes), or when someone asks. Never to catch an eye.

4. **Dim at night.** After the evening the paper goes dark and nearly empty: the time, tomorrow's first plan, and a question to sleep on. A bright screen in a dark room is a bug.

5. **Everything returns home.** Any page someone asks for goes back home by itself. No one ever has to clean up after Heritage.

6. **Effortless or not at all.** The family never configures, logs in twice, or waits on a spinner. One key pairs a device for a year. Voice, phone, and remote all lead to the same few pages. If a feature needs instructions on the fridge, it isn't finished.

## II. Craft

7. **Fewer things, finished.** One beautiful page beats four good ones. We would rather ship nothing than something half-made. A new page or feature has to earn its place against what's already here; until then it waits in [ROADMAP.md](ROADMAP.md).

8. **Enchanted paper, not an app.** Ink on cream paper. Type does the work, with thin rules for structure. No emoji, app icons, cards, shadows, rounded corners, or gradients beyond the paper itself. Small symbols are drawn as fine ink engravings (`src/views/Sky.tsx`), never borrowed icon sets. It is not a newspaper either: no mastheads, editions, headlines, or press jargon. It's the family's own enchanted page.

9. **Three faces and no more.** UnifrakturMaguntia for the name "Heritage" only. IM Fell English for everything else, IM Fell English SC for small labels. Colors come only from the paper tokens in `globals.css` (`--paper`, `--ink`, `--ink-soft`, `--ink-faint`, `--rule`, `--accent`). The accent (oxblood) appears at most once per page. The paper is light and milky (`#f8f4ea`), never brown.

10. **Ink, never pixels.** Content arrives and leaves by bleeding into the paper (`src/components/Ink.tsx`). Nothing slides, pops, fades on a timer, or cuts. Every block of type on the TV sits inside an `<Ink>`. When the ink is dry, the filter comes off and a still page costs nothing.

11. **Readable from the couch.** The TV is a fixed 120 × 67.5 rem sheet (1 rem = 16 px at 1080p). Anything meant to be read from across the room is at least 1.85 rem; corner notes at least 1.3 rem. Content stays inside the margins (5.5 rem sides, 3 rem top and bottom), which clears TV overscan.

12. **Protect the screen.** Nothing stays pixel-still for hours (OLED burn-in): the sheet drifts imperceptibly, the piece rotates, the night page rearranges everything.

13. **American English, AP style.** "7:30 a.m.", "noon", "Nov. 16", "Thu.". Copy is short, warm, and plain, like a kind neighbor, never like software ("The TV didn't answer. Try again.", not "Error 502").

## III. Engineering

14. **Simple, boring, few.** One Next.js app on Vercel. One small store (Upstash Redis). No database, no queue, no second server until something truly needs one. Every dependency, service, and env var is a cost that has to be justified in the change that adds it. Deleting code is a feature.

15. **Fail gently.** Every source can be missing or down (weather, calendar, notebook, store, voice) and the page still appears. A missing note is left out, never replaced by an error, a stack trace, or a spinner on the TV. Offline, the TV keeps showing what it has.

16. **The TV is the brain.** The TV decides what's on screen. Everything else (the phone remote, Siri, Alexa, the voice) only _asks_, by posting to `/api/show`. Requests go stale after two minutes, so a TV that wakes up never obeys yesterday's.

17. **Public repo, private family.** The code is public; the family is not. Never commit secrets, the family's location, calendar contents, names, photos, or the notebook corpus (James Clear's writing is copyrighted; it lives in the store, never in git). Every route that shows family data checks `isFamily()`. Production with no `FAMILY_KEY` is locked, not open.

18. **Time is the family's time.** Every date shown or reasoned about is in `HOME_TIME_ZONE`, through `src/lib/time.ts`. Servers run in UTC; never let that leak onto the page.

19. **Look at the screen.** No design change is done until you've seen it at 1920 × 1080 (`node scripts/shot.mjs`), by day and at night, and watched the ink move. Tests prove the logic; only eyes prove the magic.

## IV. Voice

20. **The voice speaks briefly, then leaves.** One or two sentences. It answers, shows the right page, says goodbye, and hangs up on its own. It never asks a follow-up question to keep someone talking, never suggests more screen time, never sells. Children may be the ones talking.

21. **The voice tells the truth.** It answers from the snapshot (the weather, the calendar), not from imagination. If it doesn't know, it says so in a few words.

---

## Vocabulary

| Word             | Means                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Heritage**     | The whole thing: the screen, the voice, the remote. One constant in `src/config.ts`.                                 |
| **Page**         | A full-screen view: `home`, `weather`, `week`, `notebook` (shown as "Ideas"), and the automatic night page.          |
| **Hero**         | The one piece set in the middle of home.                                                                             |
| **Corner notes** | The hour, the sky, and what's next, written small at home's edges.                                                   |
| **Snapshot**     | The data the TV draws from (weather, happenings, notebook), refreshed every few minutes.                             |
| **Mood**         | Time of day: morning, afternoon, evening, night. Evening brings the question for the table; night darkens the paper. |
| **Ink**          | The transition system. Content is "inked in" and "sinks out".                                                        |
| **Show request** | "Put this page on the TV", from `/remote`, Siri, Alexa, or the voice, via `POST /api/show`.                          |
| **Notebook**     | Ideas, quotes, and questions (James Clear's 3-2-1, or the small commonplace book in the repo).                       |
| **Happening**    | One calendar event occurrence.                                                                                       |
| **Family key**   | The one secret. A few plain words, easy to type with a remote.                                                       |
