import { Suspense } from "react";
import { Locked } from "@/components/Locked";
import { Screen } from "@/components/Screen";
import { isFamily } from "@/lib/auth";
import { getSnapshot } from "@/lib/snapshot";
import { PAGES, type Page } from "@/lib/types";
import { designOf } from "@/views/designs/registry";

// The TV. ?page= opens straight to a page (the TV app's launcher tiles use it).
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<div data-surface="tv" className="paper h-dvh" />}>
      <Snapshot searchParams={searchParams} />
    </Suspense>
  );
}

async function Snapshot({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  if (!(await isFamily())) return <Locked next="/" wrong={params.nope === "1"} />;
  const asked = String(params.page ?? "");
  const page: Page = PAGES.includes(asked as Page) ? (asked as Page) : "home";
  // ?design=a|b|c|d: the design directions under review (see src/views/designs).
  const design = designOf(String(params.design ?? ""));
  return <Screen initial={await getSnapshot()} initialPage={page} design={design} />;
}
