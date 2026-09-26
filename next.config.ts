import type { NextConfig } from "next";

// Set NEXT_PUBLIC_BASE_PATH (e.g. "/travel") at build time to serve under a sub-path.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  basePath,
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
