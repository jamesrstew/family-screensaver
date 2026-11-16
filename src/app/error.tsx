"use client";

import { Mended } from "@/components/Mended";

export default function ErrorPage({ error }: { error: unknown; retry: () => void }) {
  return <Mended error={error} />;
}
