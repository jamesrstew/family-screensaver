import { Suspense } from "react";
import { Locked } from "@/components/Locked";
import { Screen } from "@/components/Screen";
import { isFamily } from "@/lib/auth";
import { getSnapshot } from "@/lib/snapshot";
import { PAGES, type Page } from "@/lib/types";
import { FAKE_INDOORS, isFakeIndoor } from "@/lib/indoor-fixtures";
import { SKIES, fakeWeather, type FakeSky } from "@/lib/weather-fixtures";
import { designOf } from "@/views/designs/registry";

// The TV. ?page= opens straight to a page (the TV app's launcher tiles use it).
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    // Dark while the page loads: the server can't know yet whether it's night, and a
    // flash of bright paper in a dark room is the worse mistake (DOCTRINE §4).
    <Suspense
      fallback={
        <div data-surface="tv" data-mood="night" data-design="almanac" className="paper h-dvh" />
      }
    >
      <Snapshot searchParams={searchParams} />
    </Suspense>
  );
}

async function Snapshot({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  if (!(await isFamily()))
    return <Locked next="/" wrong={params.nope === "1"} wait={params.wait === "1"} />;
  const asked = String(params.page ?? "");
  const page: Page = PAGES.includes(asked as Page) ? (asked as Page) : "home";
  // Almanac, tentatively chosen; ?design=a|b|c|d still shows the other directions.
  const design = designOf(String(params.design ?? "")) ?? "almanac";
  const snapshot = await getSnapshot();
  // Design review only: ?sky=fair|snow|storm|rain draws a made-up sky,
  // ?indoor=one|close|apart|dry|none made-up thermostats, and &at= sets the
  // clock (the first paint here and the TV's own clock after).
  const sky = String(params.sky ?? "") as FakeSky;
  if (process.env.NODE_ENV !== "production") {
    const at = new Date(String(params.at ?? snapshot.issuedAt));
    const when = Number.isNaN(+at) ? new Date() : at;
    if (params.at && !Number.isNaN(+at)) snapshot.issuedAt = at.toISOString();
    if (SKIES.includes(sky)) snapshot.weather = fakeWeather(sky, when, snapshot.timeZone);
    const indoor = String(params.indoor ?? "");
    if (isFakeIndoor(indoor)) {
      const fake = FAKE_INDOORS[indoor];
      snapshot.indoor = fake && { ...fake, at: snapshot.issuedAt };
    }
  }
  return <Screen initial={snapshot} initialPage={page} design={design} />;
}
