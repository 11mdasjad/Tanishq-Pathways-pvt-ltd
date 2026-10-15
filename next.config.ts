import type { NextConfig } from "next";
import path from "node:path";

const vercelTarget = process.env.VERCEL === "1" || process.env.npm_lifecycle_event?.endsWith(":vercel");

const nextConfig: NextConfig = {
  env: {
    DEPLOY_TARGET: vercelTarget ? "vercel" : "cloudflare",
  },
  turbopack: { resolveAlias: { "@runtime-env": vercelTarget ? "./lib/vercel-env.ts" : "./lib/cloudflare-env.ts" } },
  webpack(config, { webpack }) {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /^cloudflare:workers$/,
      path.resolve("lib/vercel-env.ts"),
    ));
    return config;
  },
};
export default nextConfig;
