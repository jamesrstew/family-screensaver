import type { ComponentType } from "react";
import type { InkMode } from "@/components/Ink";
import type { WeatherView } from "@/lib/carousel";
import type { ViewProps } from "../parts";
import type { LivingSkyProps } from "./living";
import * as almanac from "./almanac";
import * as bookplate from "./bookplate";
import * as plate from "./plate";
import * as still from "./still";

/*
 * Design directions under review. Each is a full set of home, night, and
 * weather pages with its own face, paper, and ink. Switch with ?design=a|b|c|d.
 * When one is chosen, it replaces the default views and this file goes away.
 */

export type Design = "still" | "bookplate" | "plate" | "almanac";

type Kit = {
  name: string;
  ink: InkMode;
  Home: ComponentType<ViewProps>;
  Night: ComponentType<ViewProps>;
  Weather: ComponentType<ViewProps & { view?: WeatherView }>;
  /** The living sky behind the pages, if the design draws one. */
  Sky?: ComponentType<LivingSkyProps>;
};

export const DESIGNS: Record<Design, Kit> = {
  still: { name: "Still", ink: "seep", ...still },
  bookplate: { name: "Bookplate", ink: "seep", ...bookplate },
  plate: { name: "Plate", ink: "seep", ...plate },
  almanac: { name: "Almanac", ink: "write", ...almanac },
};

const LETTERS: Record<string, Design> = { a: "still", b: "bookplate", c: "plate", d: "almanac" };

export function designOf(param: string): Design | null {
  const p = param.toLowerCase();
  if (Object.hasOwn(LETTERS, p)) return LETTERS[p];
  return Object.hasOwn(DESIGNS, p) ? (p as Design) : null;
}
