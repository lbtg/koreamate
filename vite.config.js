import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The public address of the site. It used to be written out in twelve places across
// index.html, robots.txt and sitemap.xml — twelve chances to miss one when the domain
// changes, and a stale canonical tag quietly tells Google the real site is elsewhere.
//
// To move to a new domain, change this one line (or set PUBLIC_ORIGIN when building).
// No trailing slash.
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "https://kilomate.com.cn";

// Pages a search engine should index. Everything behind a login is excluded here and
// again in robots.txt below.
const PUBLIC_PAGES = [
  ["/", "weekly", "1.0"],
  ["/interpreters", "weekly", "0.9"],
  ["/help", "monthly", "0.8"],
  ["/join", "monthly", "0.6"],
  ["/login", "monthly", "0.4"],
  ["/guide/login", "monthly", "0.4"],
  ["/terms", "yearly", "0.3"],
  ["/privacy", "yearly", "0.3"],
  ["/refund", "yearly", "0.3"],
  ["/intro", "monthly", "0.5"],
];
const PRIVATE_PREFIXES = [
  "/admin",
  "/account",
  "/orders",
  "/messages",
  "/guide",
  "/payments",
  "/api/",
];

const sitemap = () =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PUBLIC_PAGES.map(
  ([path, changefreq, priority]) => `  <url>
    <loc>${PUBLIC_ORIGIN}${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
).join("\n")}
</urlset>
`;

const robots = () =>
  `User-agent: *
Allow: /
${PRIVATE_PREFIXES.map((p) => `Disallow: ${p}`).join("\n")}

Sitemap: ${PUBLIC_ORIGIN}/sitemap.xml
`;

export default defineConfig({
  plugins: [
    react(),
    {
      name: "public-origin",
      transformIndexHtml: (html) =>
        html.replaceAll("__PUBLIC_ORIGIN__", PUBLIC_ORIGIN),
      // Written at build time rather than kept in public/, so the domain and the page
      // list cannot drift apart from the app they describe.
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "sitemap.xml",
          source: sitemap(),
        });
        this.emitFile({
          type: "asset",
          fileName: "robots.txt",
          source: robots(),
        });
      },
    },
  ],
  server: { host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:3001" } },
});
