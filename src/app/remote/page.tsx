import type { Metadata } from "next";
import { Suspense } from "react";
import { Remote } from "@/components/Remote";
import { Locked } from "@/components/Locked";
import { isFamily } from "@/lib/auth";
import { getSnapshot } from "@/lib/snapshot";

export const metadata: Metadata = { title: "Remote" };

// The phone in your pocket: send a page to the TV, or talk to it.
export default function RemotePage({ searchParams }: PageProps<"/remote">) {
  return (
    <Suspense fallback={<div className="paper min-h-dvh" />}>
      <Gate searchParams={searchParams} />
    </Suspense>
  );
}

async function Gate({ searchParams }: Pick<PageProps<"/remote">, "searchParams">) {
  const params = await searchParams;
  if (!(await isFamily()))
    return <Locked next="/remote" wrong={params.nope === "1"} wait={params.wait === "1"} />;
  // The phone never turns the carousel, so it doesn't get the TV's deck.
  const snapshot = await getSnapshot();
  delete snapshot.passages;
  return <Remote snapshot={snapshot} />;
}
