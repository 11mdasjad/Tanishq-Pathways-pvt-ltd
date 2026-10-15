/** Forward only application API requests; never forward caller-supplied identity headers. */
export async function forwardBackend(request: Request, backendOrigin = process.env.CLOUDFLARE_BACKEND_ORIGIN): Promise<Response> {
  const incoming = new URL(request.url);
  const noStore = { 'Cache-Control': 'no-store' };
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== incoming.origin) {
    return Response.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStore });
  }
  if (!backendOrigin) {
    return Response.json({ error: 'Workspace backend is not configured. Contact the administrator.' }, { status: 503, headers: noStore });
  }
  let backend: URL;
  try {
    backend = new URL(backendOrigin);
    if (backend.protocol !== 'https:' || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash || backend.origin === incoming.origin) throw new Error('Invalid backend');
  } catch {
    return Response.json({ error: 'Workspace backend configuration is invalid.' }, { status: 503, headers: noStore });
  }
  const target = new URL(incoming.pathname + incoming.search, backend.origin);
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'cookie']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Validate the browser origin above before translating it to the backend origin.
  if (!['GET', 'HEAD'].includes(request.method)) headers.set('origin', backend.origin);
  try {
    const upstream = await fetch(target, {
      method: request.method, headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(25000),
    });
    // A Sites access/login redirect must not masquerade as an API response.
    if ((upstream.status >= 300 && upstream.status < 400) || upstream.headers.get('content-type')?.includes('text/html')) {
      return Response.json({ error: 'Workspace backend is unavailable or requires hosting access configuration.' }, { status: 502, headers: noStore });
    }
    const responseHeaders = new Headers(noStore);
    for (const name of ['content-type', 'content-disposition', 'x-content-type-options', 'content-security-policy']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append('set-cookie', cookie);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: 'Workspace backend could not be reached. Please try again.' }, { status: 502, headers: noStore });
  }
}
