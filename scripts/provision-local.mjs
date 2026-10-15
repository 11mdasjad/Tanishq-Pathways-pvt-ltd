// Local-only provisioning. No credentials are sent to a hosted service.
import {DatabaseSync} from 'node:sqlite';
import {globSync,mkdirSync,writeFileSync,existsSync,readFileSync,chmodSync} from 'node:fs';
import {hashPassword,temporaryPassword} from '../lib/password.ts';
const candidates=globSync('.wrangler/state/v3/d1/**/*.sqlite').filter(path=>{const d=new DatabaseSync(path);const yes=d.prepare("SELECT name FROM sqlite_master WHERE name='users'").get();d.close();return yes;});
if(candidates.length!==1)throw new Error('Expected exactly one local CRM database. Apply migrations first.');
const db=new DatabaseSync(candidates[0]);const destination='.local/account-credentials.json';
mkdirSync('.local',{recursive:true,mode:0o700});chmodSync('.local',0o700);
const credentials=existsSync(destination)?JSON.parse(readFileSync(destination,'utf8')):[];
for(const spec of [{id:'owner',username:'admin',name:'Tanishka Administrator',role:'Admin'},...Array.from({length:3},(_,i)=>({id:`employee-${i+1}`,username:`employee0${i+1}`,name:`Employee 0${i+1}`,role:'Employee'}))]){
 const existing=db.prepare('SELECT * FROM users WHERE id=? OR username=?').get(spec.id,spec.username);if(existing?.password_hash){console.log(`${spec.username}: already provisioned; password unchanged`);continue;}
 const password=temporaryPassword(),hash=await hashPassword(password);
 if(existing)db.prepare('UPDATE users SET name=?,username=?,password_hash=?,must_change_password=1 WHERE id=?').run(spec.name,spec.username,hash,existing.id);
 else db.prepare('INSERT INTO users (id,email,name,username,password_hash,must_change_password,role,active,created_at) VALUES (?,?,?,?,?,1,?,1,?)').run(spec.id,`${spec.username}@workspace.invalid`,spec.name,spec.username,hash,spec.role,new Date().toISOString());
 credentials.push({role:spec.role,name:spec.name,username:spec.username,temporaryPassword:password});console.log(`${spec.username}: created (${spec.role})`);
}
db.close();writeFileSync(destination,JSON.stringify(credentials,null,2)+'\n',{mode:0o600});chmodSync(destination,0o600);
writeFileSync('.local/Login Details.txt','TANISHKA PATHWAYS — LOCAL WORKSPACE\nSign in: http://127.0.0.1:5173/sign-in\nAccounts marked temporary require a first-login password change.\n\n'+credentials.map(c=>`${c.role}: ${c.name}\nID: ${c.username}\n${c.password?'Password':'Temporary password'}: ${c.password||c.temporaryPassword}\n`).join('\n'),{mode:0o600});chmodSync('.local/Login Details.txt',0o600);
console.log('Credentials saved privately under .local/. They are excluded from source control.');
