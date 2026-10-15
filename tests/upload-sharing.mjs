// Disposable full-server test: never reads or writes the real workspace database.
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {mkdtempSync,readFileSync,writeFileSync,globSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
const root=process.cwd(), temporary=mkdtempSync(path.join(tmpdir(),'crm-upload-test-'));
const cli=path.join(root,'node_modules/wrangler/bin/wrangler.js');
const config=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
assert.equal(config.vars.FILE_STORAGE,'d1','Run npm run build:backend first');
for(const file of globSync('dist/server/**/*.js'))assert.ok(!readFileSync(file,'utf8').includes('Cloudflare bindings are unavailable on Vercel'),'Backend must use Cloudflare bindings, not the Vercel stub');
config.main=path.join(root,'dist/server/index.js');config.assets.directory=path.join(root,'dist/client');
config.d1_databases[0].migrations_dir=path.join(root,'drizzle');
const configPath=path.join(temporary,'wrangler.json');writeFileSync(configPath,JSON.stringify(config));
const persist=path.join(temporary,'state');
const env={...process.env,CLOUDFLARE_CF_FETCH_ENABLED:'false',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:path.join(temporary,'logs')};
const args=['--config',configPath,'--persist-to',persist];
let server,db;
try{
 const migrate=spawnSync(process.execPath,[cli,'d1','migrations','apply','DB','--local',...args],{env,encoding:'utf8'});
 assert.equal(migrate.status,0,migrate.stderr+'\n'+migrate.stdout);
 const databases=globSync(path.join(persist,'v3/d1/**/*.sqlite')).filter(file=>{const candidate=new DatabaseSync(file);try{return !!candidate.prepare("SELECT name FROM sqlite_master WHERE name='users'").get();}finally{candidate.close();}});
 assert.equal(databases.length,1);
 db=new DatabaseSync(databases[0]);
 const cookies={};
 for(const [id,role] of [['admin','Admin'],['employee','Employee'],['other','Employee']]){
  db.prepare('INSERT INTO users(id,email,name,username,role,active,created_at) VALUES (?,?,?,?,?,1,?)').run(id,id+'@example.invalid',id,id,role,new Date().toISOString());
  const token=randomBytes(32).toString('hex');cookies[id]='tp_session='+token;
  db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+3600000,new Date().toISOString());
 }
 db.close();db=null;
 const origin='http://127.0.0.1:5197';
 const start=async()=>{
  server=spawn(process.execPath,[cli,'dev',...args,'--ip','127.0.0.1','--port','5197','--inspector-port','0'],{env,stdio:['ignore','pipe','pipe']});
  let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
  for(let i=0;i<120;i++){
   if(server.exitCode!==null)throw new Error(logs);
   try{const r=await fetch(origin+'/api/auth',{signal:AbortSignal.timeout(1500)});if(r.status===401)return;if(r.status===400)throw new Error('Backend readiness failed: '+await r.text());}catch{}
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('Test server failed to start: '+logs);
 };
 const stop=()=>new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM');});
 const request=async(who,url='/api/crm',body,expected=200)=>{
  const multipart=body instanceof FormData;
  const response=await fetch(origin+url,{method:body?'POST':'GET',headers:{cookie:cookies[who],...(body?{Origin:origin,...(multipart?{}:{'Content-Type':'application/json'})}:{})},body:body?(multipart?body:JSON.stringify(body)):undefined});
  assert.equal(response.status,expected,await response.clone().text());return response;
 };
 await start();
 const lead=await(await request('employee','/api/crm',{action:'createLead',name:'TEST Applicant',mobile:'9000000000',email:'applicant@example.invalid',country:'Canada',visa:'Study Visa',source:'Website',assigned:'other',notes:''})).json();
 const pdf=await PDFDocument.create();pdf.addPage().drawText('SYNTHETIC UPLOAD TEST');const bytes=Buffer.from(await pdf.save());
 const form=new FormData();form.set('kind','document');form.set('leadId',lead.id);form.set('category','Passport');form.set('file',new File([bytes],'passport.pdf',{type:'application/pdf'}));
 const file=await(await request('employee','/api/crm',form)).json();
 const verify=async()=>{
  for(const who of ['admin','employee']){
   const overview=await(await request(who)).json();
   assert.ok(overview.leads.some(l=>l.id===lead.id));
   assert.ok(overview.documents.some(f=>f.id===file.id));
   const detail=await(await request(who,'/api/crm?leadId='+lead.id)).json();
   assert.equal(detail.lead.assigned,'employee');
   assert.ok(detail.documents.some(f=>f.id===file.id));
   assert.deepEqual(Buffer.from(await(await request(who,'/api/files/'+file.id)).arrayBuffer()),bytes);
  }
  const other=await(await request('other')).json();assert.equal(other.leads.length,0);assert.equal(other.documents.length,0);
  await request('other','/api/crm?leadId='+lead.id,undefined,404);
  await request('other','/api/files/'+file.id,undefined,404);
 };
 await verify();await stop();await start();await verify();await stop();server=null;
 console.log('Upload sharing passed: employee save/upload, Admin visibility, assigned employee access, other employee isolation, exact download bytes, persistence after server restart.');
}finally{
 db?.close();
 if(server&&server.exitCode===null){await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM');});}
 rmSync(temporary,{recursive:true,force:true});
}
