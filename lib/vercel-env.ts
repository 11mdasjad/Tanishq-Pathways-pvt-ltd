import {createClient, type Client} from '@libsql/client';
import {managedDatabase} from './managed-database';
import {hashPassword} from './password';

let database:D1Database|undefined;
function setupError(message:string):never{throw Object.assign(new Error(message),{status:503});}
async function bootstrap(client:Client){
 // Only a deployment-owner supplied secret can create the initial Admin.
 // Public requests cannot choose an Admin or overwrite an existing password.
 if((await client.execute('SELECT id FROM users LIMIT 1')).rows.length)return;
 const password=process.env.CRM_INITIAL_ADMIN_PASSWORD;
 if(!password||password.length<14)setupError('First-time setup: add CRM_INITIAL_ADMIN_PASSWORD (at least 14 characters) in Vercel, then redeploy.');
 const passwordHash=await hashPassword(password);
 await client.execute({sql:`INSERT INTO users (id,email,name,username,password_hash,must_change_password,role,active,created_at)
  SELECT 'owner','admin@workspace.invalid','Workspace Administrator','admin',?,1,'Admin',1,?
  WHERE NOT EXISTS (SELECT 1 FROM users)`,args:[passwordHash,new Date().toISOString()]});
}
export const env={
 FILE_STORAGE:'libsql',
 PASSWORD_AUTH_ONLY:'true',
 get DB():D1Database{
  if(database)return database;
  // Optional disposable/local Next.js preview; Vercel always requires shared storage.
  const localPath=process.env.VERCEL==='1'?undefined:process.env.CRM_LOCAL_DATABASE_PATH;
  const url=localPath?'file:'+localPath:process.env.TURSO_DATABASE_URL;
  const authToken=process.env.TURSO_AUTH_TOKEN;
  if(!url||(!localPath&&!authToken))setupError('One-time setup required: connect Turso storage to this Vercel project and redeploy. No Cloudflare backend is needed.');
  // Never use ephemeral Vercel disk or silently fall back to a local database.
  if(!localPath&&!/^(libsql|https):\/\//.test(url))setupError('Managed storage URL must use libsql:// or https://.');
  const client=createClient({url,authToken});
  database=managedDatabase(client,()=>bootstrap(client)) as unknown as D1Database;
  return database;
 },
} as Cloudflare.Env;
