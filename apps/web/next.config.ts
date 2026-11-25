import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@pactline/domain",
    "@pactline/db",
    "@pactline/incident-runtime",
  ],
};

export default nextConfig;
