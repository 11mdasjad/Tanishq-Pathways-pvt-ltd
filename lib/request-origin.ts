/** Next.js may normalize the internal request URL to localhost.
 * Compare against the HTTP Host presented to this handler, never forwarded-host.
 * Browser clients cannot override Host, and the request scheme must still match.
 */
export function sameOrigin(request:Request){
 const origin=request.headers.get('origin');
 if(!origin)return false;
 const url=new URL(request.url);
 return origin===`${url.protocol}//${request.headers.get('host')||url.host}`;
}
