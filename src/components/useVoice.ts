"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// One conversation with the screen: mic in, voice out, over WebRTC straight
// to OpenAI with a two-minute key from /api/voice. Tools run here, in the
// browser. The conversation ends itself: on goodbye, or after a quiet spell.

export type VoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "failed";

type Tool = (name: string, args: Record<string, unknown>) => Promise<unknown>;

const QUIET_MS = 15_000;
const GOODBYE_MS = 2_500;

type ServerEvent = {
  type: string;
  delta?: string;
  transcript?: string;
  response?: {
    output?: Array<{ type: string; name?: string; call_id?: string; arguments?: string }>;
  };
};

export function useVoice(tool: Tool) {
  const [state, setState] = useState<VoiceState>("idle");
  const [caption, setCaption] = useState("");
  const live = useRef<{ pc: RTCPeerConnection; mic: MediaStream; audio: HTMLAudioElement } | null>(
    null,
  );
  const quiet = useRef<number | undefined>(undefined);
  const toolRef = useRef(tool);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  const stop = useCallback(() => {
    window.clearTimeout(quiet.current);
    const l = live.current;
    live.current = null;
    if (l) {
      l.mic.getTracks().forEach((t) => t.stop());
      l.pc.close();
      l.audio.srcObject = null;
    }
    setState("idle");
    setCaption("");
  }, []);

  const hushTimer = useCallback(
    (ms = QUIET_MS) => {
      window.clearTimeout(quiet.current);
      quiet.current = window.setTimeout(stop, ms);
    },
    [stop],
  );

  const start = useCallback(async () => {
    if (live.current) return;
    setState("connecting");
    setCaption("");
    try {
      const res = await fetch("/api/voice", { method: "POST" });
      if (!res.ok) throw new Error(`voice key ${res.status}`);
      const { key } = (await res.json()) as { key: string };

      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      const pc = new RTCPeerConnection();
      const audio = new Audio();
      audio.autoplay = true;
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0];
      };
      pc.addTrack(mic.getAudioTracks()[0], mic);
      live.current = { pc, mic, audio };

      const dc = pc.createDataChannel("oai-events");
      const send = (event: object) => dc.readyState === "open" && dc.send(JSON.stringify(event));

      dc.addEventListener("open", () => {
        setState("listening");
        hushTimer();
      });
      dc.addEventListener("message", async (e) => {
        const event = JSON.parse(e.data) as ServerEvent;
        switch (event.type) {
          case "input_audio_buffer.speech_started":
            window.clearTimeout(quiet.current);
            setState("listening");
            setCaption("");
            break;
          case "response.created":
            setState("thinking");
            break;
          case "response.output_audio_transcript.delta":
            setState("speaking");
            setCaption((c) => c + (event.delta ?? ""));
            break;
          case "response.output_audio_transcript.done":
            if (event.transcript) setCaption(event.transcript);
            break;
          case "response.done": {
            const calls = (event.response?.output ?? []).filter((o) => o.type === "function_call");
            if (calls.length === 0) {
              setState("listening");
              hushTimer();
              break;
            }
            let hangingUp = false;
            for (const call of calls) {
              if (call.name === "end_conversation") hangingUp = true;
              const args = safeJson(call.arguments);
              const output = await toolRef.current(call.name ?? "", args).catch((err) => ({
                ok: false,
                error: String(err),
              }));
              send({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: call.call_id,
                  output: JSON.stringify(output),
                },
              });
            }
            if (hangingUp) hushTimer(GOODBYE_MS);
            else send({ type: "response.create" });
            break;
          }
          case "error":
            console.error("[voice]", event);
            break;
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/sdp" },
      });
      if (!sdp.ok) throw new Error(`realtime call ${sdp.status}`);
      await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() });
    } catch (err) {
      console.error("[voice] could not start", err);
      stop();
      setState("failed");
      window.setTimeout(() => setState((s) => (s === "failed" ? "idle" : s)), 4000);
    }
  }, [hushTimer, stop]);

  const toggle = useCallback(() => (live.current ? stop() : start()), [start, stop]);

  useEffect(() => stop, [stop]);

  return { state, caption, start, stop, toggle };
}

function safeJson(s: string | undefined): Record<string, unknown> {
  try {
    return JSON.parse(s ?? "{}");
  } catch {
    return {};
  }
}
