"use client";

import { useEffect } from "react";

const RELOAD_MS = 60_000;

/*
 * What the TV shows if a page breaks: dim paper and a quiet line, then a
 * fresh start a minute later. No one should have to walk over and reload.
 */
export function Mended({ error }: { error: unknown }) {
  useEffect(() => {
    console.error(error);
    const t = window.setTimeout(() => window.location.reload(), RELOAD_MS);
    return () => window.clearTimeout(t);
  }, [error]);
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#13110e",
        color: "#6c6354",
        fontFamily: "Georgia, serif",
        fontStyle: "italic",
        fontSize: "clamp(16px, 2.2vw, 40px)",
      }}
    >
      One moment.
    </div>
  );
}
