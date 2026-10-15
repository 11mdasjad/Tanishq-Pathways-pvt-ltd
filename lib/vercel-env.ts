// Next.js API traffic is handled by proxy.ts. Worker bindings stay on Cloudflare.
export const env = new Proxy({}, {
  get() {
    throw new Error("Cloudflare bindings are unavailable on Vercel. Configure CLOUDFLARE_BACKEND_ORIGIN.");
  },
}) as Cloudflare.Env;
