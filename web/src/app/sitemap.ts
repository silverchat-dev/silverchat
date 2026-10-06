import type { MetadataRoute } from "next";

import { STOPS } from "@/world/stops";

// the walk and every live stop's pages; add final polls from db.polls() once there are enough to be worth indexing
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = new Set(["", "/demo", "/stats", "/algorithm", "/docs"]);
  for (const s of STOPS.filter((s) => s.live)) {
    s.routes.filter((r) => !["/poll", "/me", "/u"].includes(r)).forEach((r) => pages.add(r));
    if (s.also) pages.add(s.also.route);
  }
  return [...pages].map((p) => ({ url: `https://silverchat.cash${p}` }));
}
