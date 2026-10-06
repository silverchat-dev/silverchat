import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/world-lab"] }, sitemap: "https://silverchat.cash/sitemap.xml" };
}
