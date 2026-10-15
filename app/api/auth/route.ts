import {sameOrigin} from '../../../lib/request-origin';
import {actor,query,one,db,audit,now,fail,errorResponse} from '../../../lib/crm';
import {hashPassword,verifyPassword,tokenHash,sessionToken} from '../../../lib/password';
import {z} from 'zod';
import {cookies} from 'next/headers';
export const dynamic='force-dynamic';
const publicUser=(u:any)=>({id:u.id,name:u.name,username:u.username,role:u.role,mustChangePassword:!!u.must_change_password});
function cookieHeader(request:Request,token:string,expires=28800){return `tp_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${expires}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export async function GET(){try{return Response.json({user:publicUser(await actor(true))},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 if(!sameOrigin(request))fail('Invalid request origin.',403);
 const body:any=await request.json();
 if(body.action==='logout'){const token=(await cookies()).get('tp_session')?.value;if(token)await query('DELETE FROM auth_sessions WHERE id=?',await tokenHash(token)).run();return Response.json({ok:true},{headers:{'Set-Cookie':cookieHeader(request,'',0),'Cache-Control':'no-store'}});}
 if(body.action==='changePassword'){
  const user=await actor(true);const d=z.object({currentPassword:z.string().max(200),newPassword:z.string().min(14).max(128)}).parse(body);
  if(d.currentPassword===d.newPassword)fail('Choose a different password.');if(!user.password_hash||!await verifyPassword(d.currentPassword,user.password_hash))fail('Current password is incorrect.',400);
  const hash=await hashPassword(d.newPassword);const token=sessionToken();await db().batch([query('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?',hash,user.id),query('DELETE FROM auth_sessions WHERE user_id=?',user.id),query('INSERT INTO auth_sessions (id,user_id,expires_at,created_at) VALUES (?,?,?,?)',await tokenHash(token),user.id,Date.now()+28800000,now()),audit(user,null,'Password changed')]);return Response.json({user:publicUser({...user,must_change_password:0})},{headers:{'Set-Cookie':cookieHeader(request,token),'Cache-Control':'no-store'}});
 }
 if(body.action!=='login')fail('Unknown action.');
 const d=z.object({username:z.string().trim().toLowerCase().min(1).max(100),password:z.string().min(1).max(200)}).parse(body);
 const keys=[await tokenHash('account:'+d.username),await tokenHash('ip:'+(request.headers.get('cf-connecting-ip')||'local'))];
 // Successful sign-ins must not exhaust the shared IP failure budget.
 const ipAttempt=await one('SELECT attempts,reset_at FROM login_attempts WHERE id=?',keys[1]);
 if(ipAttempt&&ipAttempt.reset_at>Date.now()&&ipAttempt.attempts>=30)fail('Too many sign-in attempts. Please try again in 15 minutes.',429);
 await query('INSERT INTO login_attempts (id,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END',keys[0],Date.now()+900000,Date.now(),Date.now()).run();
 const attempt=await one('SELECT attempts FROM login_attempts WHERE id=?',keys[0]);if(attempt.attempts>5)fail('Too many sign-in attempts. Please try again in 15 minutes.',429);
 const u=await one('SELECT * FROM users WHERE username=?',d.username);
 const fallback='pbkdf2-sha256$100000$000000000000000000000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
 const valid=await verifyPassword(d.password,u?.password_hash||fallback);if(!valid||!u?.active){await query('INSERT INTO login_attempts (id,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END',keys[1],Date.now()+900000,Date.now(),Date.now()).run();fail('Employee ID or password is incorrect.',401);}
 const previousToken=(await cookies()).get('tp_session')?.value;const token=sessionToken();await db().batch([...(previousToken?[query('DELETE FROM auth_sessions WHERE id=?',await tokenHash(previousToken))]:[]),query('DELETE FROM login_attempts WHERE id=?',keys[0]),query('DELETE FROM auth_sessions WHERE expires_at<?',Date.now()),query('INSERT INTO auth_sessions (id,user_id,expires_at,created_at) VALUES (?,?,?,?)',await tokenHash(token),u.id,Date.now()+28800000,now()),audit(u,null,'Signed in')]);return Response.json({user:publicUser(u)},{headers:{'Set-Cookie':cookieHeader(request,token),'Cache-Control':'no-store'}});
 }catch(e){return errorResponse(e);}}
