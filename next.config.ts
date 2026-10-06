import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // There is a stray package-lock.json in the home folder; pin the project root to this folder.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
