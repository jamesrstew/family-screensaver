import { NextResponse } from "next/server";
import { COOKIE, COOKIE_MAX_AGE, familyKey, tokenFor, tryKey } from "@/lib/auth";

// Pair a device: the TV or a phone types the family key once on the locked
// page, and gets a cookie for a year. The key is only ever posted, never put
// in a link (links end up in logs, histories, and message previews).

const PLACES = new Set(["/", "/remote"]);

export async function POST(request: Request) {
  const form = await request.formData();
  const key = form.get("key")?.toString() ?? "";
  const next = form.get("next")?.toString() ?? "";
  const to = new URL(PLACES.has(next) ? next : "/", request.url);
  const tried = key ? await tryKey(key) : "wrong";
  if (tried !== "ok") {
    to.searchParams.set(tried === "wait" ? "wait" : "nope", "1");
    return NextResponse.redirect(to, 303);
  }
  const res = NextResponse.redirect(to, 303);
  res.cookies.set(COOKIE, tokenFor(familyKey()!), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}

// An old pairing link: send it to the locked page, and ignore any key in it.
export function GET(request: Request) {
  const next = new URL(request.url).searchParams.get("next") ?? "";
  return NextResponse.redirect(new URL(PLACES.has(next) ? next : "/", request.url), 303);
}
