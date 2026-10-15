import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {globSync,readFileSync} from 'node:fs';
import {hashPassword,temporaryPassword} from '../lib/password.ts';
const origin='http://127.0.0.1:5173';let passed=0;
async function call(path,body,cookie,expected=200){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));passed++;return {data,cookie:r.headers.get('set-cookie')?.split(';')[0],response:r};}
const paths=globSync('.wrangler/state/v3/d1/**/*.sqlite').filter(path=>{const d=new DatabaseSync(path);const v=d.prepare("SELECT name FROM sqlite_master WHERE name='users'").get();d.close();return v;});assert.equal(paths.length,1);const db=new DatabaseSync(paths[0]);
const generated=JSON.parse(readFileSync('.local/account-credentials.json','utf8'));const stamp=Date.now();const adminId='auth-test-'+stamp;const adminPass=temporaryPassword();const testUsers=[adminId];const leads=[];
try{
 await call('/api/crm',null,null,401);await call('/api/auth',{action:'login',username:'invalid-user-'+stamp,password:'invalidpassword'},null,401);
 for(const u of (process.env.CRM_SKIP_INITIAL_CREDENTIALS==='1'?[]:generated)){const a=await call('/api/auth',{action:'login',username:u.username,password:u.password||u.temporaryPassword});assert.equal(a.data.user.role,u.role);assert.equal(a.data.user.mustChangePassword,u.mustChangePassword??true);passed+=2;assert.match(a.response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);passed++;await call('/api/crm',null,a.cookie,(u.mustChangePassword??true)?428:200);await call('/api/auth',{action:'logout'},a.cookie);await call('/api/crm',null,a.cookie,401);}
 db.prepare('INSERT INTO users (id,name,email,username,password_hash,role,active,created_at) VALUES (?,?,?,?,?,?,1,?)').run(adminId,'AUTH TEST ADMIN',adminId+'@example.invalid',adminId,await hashPassword(adminPass),'Admin',new Date().toISOString());
 const admin=await call('/api/auth',{action:'login',username:adminId,password:adminPass});const adminCookie=admin.cookie;
 // Regression: successful logins must not consume the shared IP failure limit.
 for(let i=0;i<32;i++){const login=await call('/api/auth',{action:'login',username:adminId,password:adminPass});await call('/api/auth',{action:'logout'},login.cookie);}
 const e=await call('/api/crm',{action:'saveEmployee',name:'AUTH TEST EMPLOYEE',email:'auth-employee-'+stamp+'@example.invalid',username:'authemployee-'+stamp,active:true},adminCookie);let overview=(await call('/api/crm',null,adminCookie)).data;const employee=overview.users.find(u=>u.username===e.data.username);testUsers.push(employee.id);
 let employeeSession=await call('/api/auth',{action:'login',username:e.data.username,password:e.data.temporaryPassword});await call('/api/crm',null,employeeSession.cookie,428);
 await call('/api/auth',{action:'changePassword',currentPassword:e.data.temporaryPassword,newPassword:'short'},employeeSession.cookie,400);
 const changedPassword=temporaryPassword();const changed=await call('/api/auth',{action:'changePassword',currentPassword:e.data.temporaryPassword,newPassword:changedPassword},employeeSession.cookie);await call('/api/crm',null,employeeSession.cookie,401);const employeeCookie=changed.cookie;
 await call('/api/auth',{action:'login',username:e.data.username,password:e.data.temporaryPassword},null,401);
 const base={name:'AUTH TEST APPLICANT',mobile:'9000000000',country:'Canada',visa:'Study Visa',source:'Website',notes:'TEST ONLY'};
 const own=(await call('/api/crm',{action:'createLead',...base,assigned:employee.id},adminCookie)).data.id;leads.push(own);
 const other=(await call('/api/crm',{action:'createLead',...base,assigned:adminId},adminCookie)).data.id;leads.push(other);
 const limited=(await call('/api/crm',null,employeeCookie)).data;assert.equal(limited.leads.length,1);assert.equal(limited.leads[0].id,own);assert.equal(limited.users.length,1);passed+=3;
 await call('/api/crm?leadId='+other,null,employeeCookie,404);
 for(const action of ['verify','reviewDocument','issueAgreement','acceptSignature'])await call('/api/crm',{action,leadId:other,decision:'Verified',fileId:'unavailable',agreementId:'unavailable'},employeeCookie,404);
 await call('/api/crm',{action:'updateLead',leadId:own,...base,name:'AUTH TEST EDITED',assigned:adminId,profile:{}},employeeCookie);
 assert.equal((await call('/api/crm?leadId='+own,null,adminCookie)).data.lead.assigned,employee.id);passed++;
 await call('/api/crm',{action:'verify',leadId:own,decision:'Verified'},employeeCookie,400);
 await call('/api/crm',{action:'saveSettings',settings:{}},employeeCookie,403);
 await call('/api/crm',{action:'resetEmployeePassword',employeeId:employee.id},employeeCookie,403);
 const reset=await call('/api/crm',{action:'resetEmployeePassword',employeeId:employee.id},adminCookie);await call('/api/crm',null,employeeCookie,401);
 employeeSession=await call('/api/auth',{action:'login',username:e.data.username,password:reset.data.temporaryPassword});assert.ok(employeeSession.data.user.mustChangePassword);passed++;
 const wrongOrigin=await fetch(origin+'/api/auth',{method:'POST',headers:{Origin:'https://invalid.example','Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});assert.equal(wrongOrigin.status,403);passed++;
 for(let i=0;i<5;i++)await call('/api/auth',{action:'login',username:'limited-'+stamp,password:'wrong'},null,401);await call('/api/auth',{action:'login',username:'limited-'+stamp,password:'wrong'},null,429);
 console.log(JSON.stringify({passed,accounts:generated.map(c=>({username:c.username,role:c.role})),checked:'Passwords, mandatory first-login change, server roles, assignment isolation, reset revocation, CSRF and rate limiting'}));
}finally{
 db.exec('BEGIN');try{for(const id of leads){for(const table of ['activities','verifications','payments','appointments','agreements','files'])db.prepare(`DELETE FROM ${table} WHERE lead_id=?`).run(id);db.prepare('DELETE FROM leads WHERE id=?').run(id);}for(const id of testUsers){db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(id);db.prepare('DELETE FROM activities WHERE actor=?').run(id);db.prepare('DELETE FROM users WHERE id=?').run(id);}db.exec('DELETE FROM login_attempts');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}db.close();}
