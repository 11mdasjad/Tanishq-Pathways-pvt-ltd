import { NextResponse } from 'next/server';

// CRM API handlers execute directly on Vercel with managed storage.
// Each write handler validates Origin and each read enforces account permissions.
export function proxy() { return NextResponse.next(); }
export const config = { matcher: '/api/:path*' };
