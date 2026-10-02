import type { MetadataRoute } from "next";

// the fixed pages only; add final polls from db.polls() once there are enough to be worth indexing
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/ask", "/pulse", "/records", "/docs", "/demo", "/algorithm"].map((p) => ({ url: `https://silverchat.cash${p}` }));
}
