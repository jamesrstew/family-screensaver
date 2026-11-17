"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/*
 * ?fps=1: the measured frame rate, small in a corner, for checking the living
 * sky on the TV. Off unless asked for; when off, nothing runs.
 */

const noop = () => () => {};

export function Fps() {
  const asked = useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).get("fps") === "1",
    () => false,
  );
  return asked ? <Meter /> : null;
}

function Meter() {
  const [shown, setShown] = useState({ fps: 0, low: 0, worst: 0 });
  useEffect(() => {
    let frame = 0;
    let frames = 0;
    let since = performance.now();
    let last = since;
    let worst = 0;
    const history: number[] = [];
    const tick = (t: number) => {
      frames++;
      worst = Math.max(worst, t - last);
      last = t;
      if (t - since >= 1000) {
        const fps = (frames * 1000) / (t - since);
        history.push(fps);
        if (history.length > 10) history.shift();
        setShown({ fps, low: Math.min(...history), worst });
        frames = 0;
        worst = 0;
        since = t;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <p className="fixed right-[1rem] bottom-[1rem] z-50 bg-paper px-[0.6rem] font-mono text-[1.3rem] text-ink">
      {shown.fps.toFixed(0)} fps · low {shown.low.toFixed(0)} · worst {shown.worst.toFixed(0)} ms
    </p>
  );
}
