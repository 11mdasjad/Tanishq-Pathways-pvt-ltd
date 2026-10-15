const iterations=100000;
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const unhex=(value:string)=>new Uint8Array(value.match(/../g)!.map(x=>parseInt(x,16)));
export function temporaryPassword(){return 'TP!'+hex(crypto.getRandomValues(new Uint8Array(12)))+'aA7';}
export async function hashPassword(password:string,salt=hex(crypto.getRandomValues(new Uint8Array(24)))){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:unhex(salt),iterations,hash:'SHA-256'},key,256);return `pbkdf2-sha256$${iterations}$${salt}$${hex(new Uint8Array(bits))}`;}
export async function verifyPassword(password:string,stored:string){const parts=stored.split('$');if(parts.length!==4||parts[0]!=='pbkdf2-sha256'||parts[1]!==String(iterations))return false;const candidate=await hashPassword(password,parts[2]);let difference=candidate.length^stored.length;for(let i=0;i<stored.length;i++)difference|=stored.charCodeAt(i)^(candidate.charCodeAt(i)||0);return difference===0;}
export async function tokenHash(token:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));}
export function sessionToken(){return hex(crypto.getRandomValues(new Uint8Array(32)));}
