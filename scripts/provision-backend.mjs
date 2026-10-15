// Run only after migrations, against the configured production database.
// Creates the first Admin; never resets or replaces an existing account.
import './sites-env.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { hashPassword, temporaryPassword } from '../lib/password.ts';
const directory = '.local';
const credentialsPath = `${directory}/production-admin.json`;
const sqlPath = `${directory}/production-bootstrap.sql`;
mkdirSync(directory,{recursive:true,mode:0o700});
chmodSync(directory,0o700);
const credentials = existsSync(credentialsPath)
  ? JSON.parse(readFileSync(credentialsPath,'utf8'))
  : { username:'admin', temporaryPassword:temporaryPassword() };
const passwordHash = await hashPassword(credentials.temporaryPassword);
writeFileSync(credentialsPath,JSON.stringify(credentials,null,2)+'\n',{mode:0o600});
chmodSync(credentialsPath,0o600);
const quote = value => "'"+String(value).replaceAll("'","''")+"'";
writeFileSync(sqlPath, `INSERT INTO users (id,email,name,username,password_hash,must_change_password,role,active,created_at)
SELECT 'owner','admin@workspace.invalid','Workspace Administrator',${quote(credentials.username)},${quote(passwordHash)},1,'Admin',1,${quote(new Date().toISOString())}
WHERE NOT EXISTS (SELECT 1 FROM users);\n`,{mode:0o600});
try {
 const result=JSON.parse(execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--remote','--config','wrangler.backend.json','--file',sqlPath,'--json'],{encoding:'utf8'}));
 if(!result.every(item=>item.success)) throw new Error('Admin provisioning failed.');
 const changed=result.some(item=>Number(item.meta?.changes)>0);
 console.log(changed
   ? 'First Admin created. Temporary credentials are in .local/production-admin.json. First login requires a password change.'
   : 'An account already exists. No account or password was changed; the local credentials file may not match the existing account.');
} finally { rmSync(sqlPath,{force:true}); }
