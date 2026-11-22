import "server-only";
import { family } from "@/config";
import { LEAGUE_PICKS } from "./games";
import { SOUNDS } from "./nature";
import { clock, longDate } from "./time";

// The voice: OpenAI Realtime over WebRTC. The server mints a
// short-lived key with the persona and tools baked in; the browser talks to
// OpenAI directly and runs the tools against the snapshot it already has.

export const VOICE_MODEL = process.env.OPENAI_REALTIME_MODEL?.trim() || "gpt-realtime-2.1";
export const VOICE_NAME = "marin";

function instructions(place: string, timeZone: string, now: Date) {
  return `You are the voice of the living-room screen for ${family.household} in ${place}. It is ${longDate(now, timeZone)}, ${clock(now, timeZone)}.

How you speak:
- Briefly. One or two short sentences, like a kind neighbor, never a salesperson. Children may be talking to you; keep it simple and warm.
- Plain American English. Say times the way people do ("seven thirty", "noon").
- Never ask a follow-up question to keep the conversation going, and never suggest more screen time. When the request is handled, say a short goodbye and call end_conversation.
- If you don't know, say so in a few words. Don't invent events or weather; use the tools.

What you can do:
- show_page puts a page on the TV: home, weather, week (the family calendar), notebook (ideas, quotes, and questions), sports (the scoreboard: every game ahead, the family's teams and the Top 25; name a league to show only its games: cfb for college football, cbb for college basketball, nfl for the NFL's whole slate, or football for college and the NFL together; or name a team, any college football, men's college basketball, or NFL team, to show that team's schedule), nature (quiet films of real places, one after another, until someone asks for something else). For the weather you may name a view: now, hours (hour by hour), days (the seven-day forecast), or ribbon (the next 24 hours).
- nature_sound sets how nature sounds, now and from then on: soft (gentle and quiet, the usual; also "unmute" and "sound on"), full (just as it was recorded, only when someone asks for full sound), or off (muted). "Mute the nature sounds", "full sound", "back to the gentle sound."
- read_weather, read_calendar, and read_games give you facts to answer with. When someone asks about the weather, their plans, or a game, you may also show the matching page.
- If show_page says a team wasn't found, say only: "I couldn't find that team; here are the games."
- If read_weather's inside is "unknown", say you can't tell how warm it is inside right now.`;
}

const tools = [
  {
    type: "function",
    name: "show_page",
    description: "Put a page on the TV.",
    parameters: {
      type: "object",
      properties: {
        page: { type: "string", enum: ["home", "weather", "week", "notebook", "sports", "nature"] },
        view: {
          type: "string",
          enum: ["now", "hours", "days", "ribbon"],
          description: "Weather only: which view of it.",
        },
        team: {
          type: "string",
          description:
            'Sports only: one team\'s page (its record, recent results, and next games), as the person said it: \"Kentucky basketball\", \"the Zags\", \"Bucs\".',
        },
        league: {
          type: "string",
          enum: [...LEAGUE_PICKS],
          description:
            'Sports only, and only without a team: one league\'s games. "College football" is cfb; "college basketball" or "basketball" is cbb; "the NFL" or "pro football" is nfl; "football" alone is football (college and the NFL together). Leave it out for the whole scoreboard ("scores", "all the games").',
        },
      },
      required: ["page"],
    },
  },
  {
    type: "function",
    name: "nature_sound",
    description: "How nature sounds, from now on.",
    parameters: {
      type: "object",
      properties: {
        sound: {
          type: "string",
          enum: [...SOUNDS],
          description:
            'soft: gentle and quiet ("mellow", "quieter", "unmute", "sound on", the usual). full: as recorded, only when asked for by name ("full sound", "full volume"). off: muted ("mute", "no sound").',
        },
      },
      required: ["sound"],
    },
  },
  {
    type: "function",
    name: "read_weather",
    description:
      "Current conditions, the seven-day forecast, and the temperature inside the house.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "read_calendar",
    description: "The family calendar for a range of days.",
    parameters: {
      type: "object",
      properties: { range: { type: "string", enum: ["today", "tomorrow", "week"] } },
      required: ["range"],
    },
  },
  {
    type: "function",
    name: "read_games",
    description:
      "The games ahead: the family's own teams and the Top 25, with times, channels, scores, and each game's chance of winning. Name a league for its games alone (nfl includes the NFL's whole slate).",
    parameters: {
      type: "object",
      properties: { league: { type: "string", enum: [...LEAGUE_PICKS] } },
    },
  },
  {
    type: "function",
    name: "end_conversation",
    description: "Hang up after saying goodbye.",
    parameters: { type: "object", properties: {} },
  },
];

export async function mintVoiceKey(place: string, timeZone: string, now = new Date()) {
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 120 },
      session: {
        type: "realtime",
        model: VOICE_MODEL,
        instructions: instructions(place, timeZone, now),
        audio: {
          input: { turn_detection: { type: "semantic_vad", eagerness: "high" } },
          output: { voice: VOICE_NAME },
        },
        tools,
        tool_choice: "auto",
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`realtime key ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { value: string };
  return data.value;
}
