import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  env: {
    DEPLOY_TARGET: process.env.VERCEL === "1" || process.env.npm_lifecycle_event?.endsWith(":vercel")
      ? "vercel" : "cloudflare",
  },
  turbopack: { resolveAlias: { "@runtime-env": "./lib/vercel-env.ts" } },
  webpack(config, { webpack }) {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /^cloudflare:workers$/,
      path.resolve("lib/vercel-env.ts"),
    ));
    return config;
  },
};
export default nextConfig;
