import { NextResponse } from "next/server";
import { COOKIE, COOKIE_MAX_AGE, familyKey, keyMatches, tokenFor } from "@/lib/auth";

// Pair a device: the TV types the family key once (or a phone opens a link
// with ?key=…), and gets a cookie for a year. The key never stays in the URL.

const PLACES = new Set(["/", "/remote"]);

async function pair(request: Request, key: string | null, next: string | null) {
  const to = new URL(PLACES.has(next ?? "") ? next! : "/", request.url);
  if (!key || !keyMatches(key)) {
    to.searchParams.set("nope", "1");
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  return pair(request, url.searchParams.get("key"), url.searchParams.get("next"));
}

export async function POST(request: Request) {
  const form = await request.formData();
  return pair(request, form.get("key")?.toString() ?? null, form.get("next")?.toString() ?? null);
}
