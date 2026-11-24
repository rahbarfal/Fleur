import type { NextConfig } from "next";

const securityHeaders = [
  // Fleur is never embedded in another site (prevents clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Vercel adds Strict-Transport-Security on its own domains.
];

const nextConfig: NextConfig = {
  // Lets a second build/server (e.g. verification) use its own folder
  // instead of clobbering the running `next dev` output in .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
