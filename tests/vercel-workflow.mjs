// Exercises real Next.js handlers with a disposable local managed-database adapter.
// No Cloudflare process, bindings, remote backend, or real applicant data are used.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
const directory=mkdtempSync(path.join(tmpdir(),'crm-vercel-test-'));
const origin='http://127.0.0.1:5198';
const initial='TEST!'+randomBytes(20).toString('hex');
const changed='CHANGED!'+randomBytes(20).toString('hex');
let server,logs='';
const env={...process.env,CRM_LOCAL_DATABASE_PATH:path.join(directory,'crm.sqlite'),CRM_INITIAL_ADMIN_PASSWORD:initial};
delete env.VERCEL;delete env.TURSO_DATABASE_URL;delete env.TURSO_AUTH_TOKEN;delete env.CLOUDFLARE_BACKEND_ORIGIN;
const cookies={};
async function call(who,url='/api/crm',body,expected=200){
 const multipart=body instanceof FormData;
 const response=await fetch(origin+url,{method:body?'POST':'GET',headers:{...(cookies[who]?{cookie:cookies[who]}:{}),...(body?{Origin:origin,...(!multipart?{'Content-Type':'application/json'}:{})}:{})},body:body?(multipart?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,expected,await response.clone().text());
 const cookie=response.headers.get('set-cookie');if(cookie)cookies[who]=cookie.split(';')[0];
 return response;
}
async function start(){
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','5198'],{env,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',v=>logs+=v);server.stderr.on('data',v=>logs+=v);
 for(let i=0;i<80;i++){
  if(server.exitCode!==null)throw Error(logs);
  try{const r=await fetch(origin+'/api/auth',{signal:AbortSignal.timeout(1500)});if(r.status===401)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 throw Error('Server not ready: '+logs);
}
const stop=()=>new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM');});
try{
 await start();
 const login=await(await call('admin','/api/auth',{action:'login',username:'admin',password:initial})).json();assert.equal(login.user.mustChangePassword,true);
 await call('admin','/api/crm',undefined,428);
 await call('admin','/api/auth',{action:'changePassword',currentPassword:initial,newPassword:changed});
 const overview=await(await call('admin')).json();assert.equal(overview.user.role,'Admin');assert.equal(overview.leads.length,0);
 for(const username of ['employee01','employee02']){
  const account=await(await call('admin','/api/crm',{action:'saveEmployee',username,name:'TEST '+username,email:username+'@example.invalid',active:true})).json();
  await call(username,'/api/auth',{action:'login',username,password:account.temporaryPassword});
  await call(username,'/api/auth',{action:'changePassword',currentPassword:account.temporaryPassword,newPassword:changed});
 }
 const lead=await(await call('employee01','/api/crm',{action:'createLead',name:'TEST Applicant',mobile:'9000000000',email:'applicant@example.invalid',country:'Canada',visa:'Study Visa',source:'Website',assigned:'owner',notes:''})).json();
 const pdf=await PDFDocument.create();pdf.addPage().drawText('SYNTHETIC UPLOAD TEST');const bytes=Buffer.from(await pdf.save());
 const form=new FormData();form.set('kind','document');form.set('leadId',lead.id);form.set('category','Passport');form.set('file',new File([bytes],'test.pdf',{type:'application/pdf'}));
 const file=await(await call('employee01','/api/crm',form)).json();
 async function verify(){
  for(const who of ['admin','employee01']){
   const overview=await(await call(who)).json();assert.ok(overview.leads.some(l=>l.id===lead.id));assert.ok(overview.documents.some(f=>f.id===file.id));
   const detail=await(await call(who,'/api/crm?leadId='+lead.id)).json();assert.ok(detail.documents.some(f=>f.id===file.id));
   assert.deepEqual(Buffer.from(await(await call(who,'/api/files/'+file.id)).arrayBuffer()),bytes);
  }
  assert.equal((await(await call('employee02')).json()).leads.length,0);
  await call('employee02','/api/files/'+file.id,undefined,404);
  await call('employee02','/api/crm?leadId='+lead.id,undefined,404);
 }
 await verify();await stop();
 // Startup password changes must never reset the existing Admin.
 env.CRM_INITIAL_ADMIN_PASSWORD='UNUSED!'+randomBytes(20).toString('hex');
 await start();await verify();
 await call('newAdmin','/api/auth',{action:'login',username:'admin',password:changed});
 const denied=await fetch(origin+'/api/crm',{method:'POST',headers:{cookie:cookies.admin,Origin:'https://example.invalid','Content-Type':'application/json'},body:JSON.stringify({action:'createLead'})});assert.equal(denied.status,403);
 await stop();server=null;
 console.log('Vercel workflow passed: automatic schema/Admin bootstrap, password change, employee creation, applicant save/upload, Admin/employee visibility, isolation, restart persistence, no password reset, CSRF protection.');
}finally{
 if(server&&server.exitCode===null)await stop();
 rmSync(directory,{recursive:true,force:true});
}
