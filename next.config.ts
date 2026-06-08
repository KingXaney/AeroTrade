import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without this, Next.js detects a stray
  // lockfile in a parent directory and warns about an ambiguous root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
