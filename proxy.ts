import { NextResponse, type NextRequest } from 'next/server';
import { forwardBackend } from './lib/backend-proxy';

export function proxy(request: NextRequest) {
  if (process.env.DEPLOY_TARGET !== 'vercel' && process.env.VERCEL !== '1') return NextResponse.next();
  return forwardBackend(request);
}
export const config = { matcher: '/api/:path*' };
