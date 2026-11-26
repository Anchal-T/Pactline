import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a verification build run beside `next dev` without overwriting its .next folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@pactline/domain"],
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};

export default nextConfig;
