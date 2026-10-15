import assert from 'node:assert/strict';
import { forwardBackend } from '../lib/backend-proxy.ts';
const originalFetch = globalThis.fetch;
const backend = 'https://backend.example';
const request = (method = 'GET', headers = {}) => new Request('https://frontend.example/api/auth?check=1', { method, headers, ...(method === 'POST' ? { body: '{"action":"login"}' } : {}) });
try {
  assert.equal((await forwardBackend(request(), '')).status, 503);
  assert.equal((await forwardBackend(request(), 'https://frontend.example')).status, 503);
  assert.equal((await forwardBackend(request('POST', {origin: 'https://evil.example'}), backend)).status, 403);
  let called = false;
  globalThis.fetch = async (url, options) => {
    called = true;
    assert.equal(String(url), 'https://backend.example/api/auth?check=1');
    assert.equal(options.headers.get('origin'), backend);
    assert.equal(options.headers.get('cookie'), 'tp_session=test');
    assert.equal(options.headers.get('oai-authenticated-user-id'), null);
    assert.equal(options.headers.get('cf-connecting-ip'), null);
    assert.equal(new TextDecoder().decode(options.body), '{"action":"login"}');
    return new Response('{"ok":true}', {headers: {'content-type':'application/json', 'set-cookie': 'tp_session=new; Path=/; HttpOnly; Secure; SameSite=Strict'}});
  };
  const response = await forwardBackend(request('POST', {origin:'https://frontend.example',cookie:'tp_session=test','oai-authenticated-user-id':'spoof','cf-connecting-ip':'spoof'}),backend);
  assert.equal(response.status,200);
  assert.equal(called,true);
  assert.match(response.headers.get('set-cookie'),/tp_session=new/);
  assert.equal(response.headers.get('cache-control'),'no-store');
  globalThis.fetch = async () => new Response(null,{status:302,headers:{location:'/login'}});
  assert.equal((await forwardBackend(request(),backend)).status,502);
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal((await forwardBackend(request(),backend)).status,502);
  console.log('Backend proxy: origin checks, identity stripping, cookies, body, and failures passed.');
} finally { globalThis.fetch = originalFetch; }
