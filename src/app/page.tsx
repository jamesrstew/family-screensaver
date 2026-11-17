import { Suspense } from "react";
import { Locked } from "@/components/Locked";
import { Screen } from "@/components/Screen";
import { isFamily } from "@/lib/auth";
import { getSnapshot } from "@/lib/snapshot";
import { PAGES, type Page } from "@/lib/types";
import { SKIES, fakeWeather, type FakeSky } from "@/lib/weather-fixtures";
import { designOf } from "@/views/designs/registry";

// The TV. ?page= opens straight to a page (the TV app's launcher tiles use it).
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    // Dark while the page loads: the server can't know yet whether it's night, and a
    // flash of bright paper in a dark room is the worse mistake (DOCTRINE §4).
    <Suspense fallback={<div data-surface="tv" data-mood="night" className="paper h-dvh" />}>
      <Snapshot searchParams={searchParams} />
    </Suspense>
  );
}

async function Snapshot({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  if (!(await isFamily())) return <Locked next="/" wrong={params.nope === "1"} />;
  const asked = String(params.page ?? "");
  const page: Page = PAGES.includes(asked as Page) ? (asked as Page) : "home";
  // Almanac, tentatively chosen; ?design=a|b|c|d still shows the other directions.
  const design = designOf(String(params.design ?? "")) ?? "almanac";
  const snapshot = await getSnapshot();
  // Design review only: ?sky=fair|snow|storm|rain draws a made-up sky (&at= sets its clock).
  const sky = String(params.sky ?? "") as FakeSky;
  if (process.env.NODE_ENV !== "production" && SKIES.includes(sky)) {
    const at = new Date(String(params.at ?? snapshot.issuedAt));
    snapshot.weather = fakeWeather(sky, Number.isNaN(+at) ? new Date() : at, snapshot.timeZone);
  }
  return <Screen initial={snapshot} initialPage={page} design={design} />;
}
