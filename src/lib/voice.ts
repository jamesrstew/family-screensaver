import "server-only";
import { family } from "@/config";
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
- show_page puts a page on the TV: home, weather, week (the family calendar), notebook (ideas, quotes, and questions).
- read_weather and read_calendar give you facts to answer with. When someone asks about the weather or their plans, you may also show the matching page.`;
}

const tools = [
  {
    type: "function",
    name: "show_page",
    description: "Put a page on the TV.",
    parameters: {
      type: "object",
      properties: {
        page: { type: "string", enum: ["home", "weather", "week", "notebook"] },
      },
      required: ["page"],
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
