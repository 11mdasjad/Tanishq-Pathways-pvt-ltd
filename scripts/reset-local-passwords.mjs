// Explicit operator action, local database only. Password is read from stdin.
import {DatabaseSync} from 'node:sqlite';
import {globSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {hashPassword,tokenHash} from '../lib/password.ts';
const password=readFileSync(0,'utf8').trimEnd();if(!password||password.length>128)throw new Error('Provide a password on stdin.');
const paths=globSync('.wrangler/state/v3/d1/**/*.sqlite').filter(p=>{const d=new DatabaseSync(p);const yes=d.prepare("SELECT name FROM sqlite_master WHERE name='auth_sessions'").get();d.close();return yes;});if(paths.length!==1)throw new Error('Expected one initialized local database.');
const d=new DatabaseSync(paths[0]);const names=['admin','employee01','employee02','employee03'];const accounts=[];
for(const username of names){const user=d.prepare('SELECT id,name,role FROM users WHERE username=?').get(username);if(!user)throw new Error(`Missing account: ${username}`);accounts.push({...user,username,hash:await hashPassword(password),attemptKey:await tokenHash('account:'+username)});}
d.exec('BEGIN');try{for(const u of accounts){d.prepare('UPDATE users SET password_hash=?,must_change_password=0,active=1 WHERE id=?').run(u.hash,u.id);d.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(u.id);d.prepare('DELETE FROM login_attempts WHERE id=?').run(u.attemptKey);d.prepare('INSERT INTO activities (id,actor,action,detail,created_at) VALUES (?,?,?,?,?)').run(randomUUID(),accounts[0].id,'Local account password reset',u.username,new Date().toISOString());}d.prepare('DELETE FROM login_attempts WHERE id=?').run(await tokenHash('ip:local'));d.exec('COMMIT');}catch(e){d.exec('ROLLBACK');throw e;}finally{d.close();}
const credentials=accounts.map(({username,name,role})=>({username,name,role,password,mustChangePassword:false}));
writeFileSync('.local/account-credentials.json',JSON.stringify(credentials,null,2)+'\n',{mode:0o600});chmodSync('.local/account-credentials.json',0o600);
writeFileSync('.local/Login Details.txt','TANISHKA PATHWAYS — LOCAL WORKSPACE\nSign in: http://127.0.0.1:5173/sign-in\nNo first-login password change required for these configured accounts.\n\n'+credentials.map(c=>`${c.role}: ${c.name}\nID: ${c.username}\nPassword: ${c.password}\n`).join('\n'),{mode:0o600});chmodSync('.local/Login Details.txt',0o600);
console.log('Updated four local accounts, revoked old sessions, and refreshed private login details.');
