"use client";

import { Mended } from "@/components/Mended";

// The root layout itself failed: bring our own html and body.
export default function GlobalError({ error }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <Mended error={error} />
      </body>
    </html>
  );
}
