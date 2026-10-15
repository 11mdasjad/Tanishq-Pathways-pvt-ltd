declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    FILE_STORAGE?: string;
    PASSWORD_AUTH_ONLY?: string;
    BUCKET?: R2Bucket;
  }
}
