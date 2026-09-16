import type { NextConfig } from "next";

// Defensive headers for every response. No script CSP yet: the TradingView embeds
// and inline theme bootstrap would need nonces first.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without this, Next.js detects a stray
  // lockfile in a parent directory and warns about an ambiguous root.
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
