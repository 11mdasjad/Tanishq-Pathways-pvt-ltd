import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createClient} from '@libsql/client';
import {managedDatabase} from '../lib/managed-database.ts';
import {d1Storage,FILE_STORAGE_LIMIT} from '../lib/d1-storage.ts';
const directory=mkdtempSync(path.join(tmpdir(),'crm-managed-'));
const url='file:'+path.join(directory,'crm.sqlite');
let client=createClient({url});
try{
 let db=managedDatabase(client);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM users').first()).n,0);
 assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM crm_migrations').first('n'),6);
 await db.prepare('INSERT INTO users(id,email,name,role,created_at) VALUES (?,?,?,?,?)').bind('test','test@example.invalid','TEST','Admin',new Date().toISOString()).run();
 // Atomic batch and SQLite changes() are needed by the CRM concurrency guards.
 await assert.rejects(db.batch([
  db.prepare("UPDATE users SET name='must roll back' WHERE id='test'"),
  db.prepare("INSERT INTO operation_guards(id,success) VALUES ('bad',0)"),
 ]));
 assert.equal(await db.prepare("SELECT name FROM users WHERE id='test'").first('name'),'TEST');
 await db.batch([
  db.prepare("UPDATE users SET name='saved' WHERE id='test'"),
  db.prepare("INSERT INTO operation_guards(id,success) VALUES ('ok',changes())"),
 ]);
 assert.equal(await db.prepare("SELECT success FROM operation_guards WHERE id='ok'").first('success'),1);
 const storage=d1Storage(db),bytes=new Uint8Array(1_200_007).map((_,i)=>i%251);
 await storage.put('test/file',bytes);
 assert.deepEqual(new Uint8Array(await(await storage.get('test/file')).arrayBuffer()),bytes);
 assert.equal(await db.prepare('SELECT used FROM storage_usage WHERE id=1').first('used'),bytes.length);
 await db.prepare('UPDATE storage_usage SET used=? WHERE id=1').bind(FILE_STORAGE_LIMIT-10).run();
 await storage.put('last',new Uint8Array(10));
 await assert.rejects(storage.put('full',new Uint8Array(1)),{status:507});
 assert.equal(await storage.get('full'),null);
 // A new client represents a cold start/redeploy. Schema must not rerun/destruct data.
 client.close();client=createClient({url});db=managedDatabase(client);
 assert.equal(await db.prepare("SELECT name FROM users WHERE id='test'").first('name'),'saved');
 assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM crm_migrations').first('n'),6);
 assert.deepEqual(new Uint8Array(await(await d1Storage(db).get('test/file')).arrayBuffer()),bytes);
 await d1Storage(db).delete('test/file');
 assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM stored_chunks WHERE object_key='test/file'").first('n'),0);
 console.log('Managed database passed: automatic schema, repeat startup, atomic rollback, concurrency guard, multi-chunk file bytes, storage quota, persistence, cascading deletion.');
}finally{client.close();rmSync(directory,{recursive:true,force:true});}
