import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { d1Storage, MAX_FILE_BYTES, FILE_STORAGE_LIMIT } from '../lib/d1-storage.ts';
const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok") } }', d1Databases: ['DB'], compatibilityDate: '2026-05-15' });
try {
 const db = await mf.getD1Database('DB');
 for (const statement of readFileSync('drizzle/0005_free_file_storage.sql','utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)) await db.prepare(statement).run();
 const storage = d1Storage(db);
 const bytes = new Uint8Array(1_200_007).map((_,i)=>i%251);
 await storage.put('document/test',bytes);
 assert.deepEqual(new Uint8Array(await (await storage.get('document/test')).arrayBuffer()),bytes);
 assert.equal(await db.prepare('SELECT used FROM storage_usage WHERE id=1').first('used'),bytes.length);
 await assert.rejects(storage.put('document/test',new Uint8Array(10)));
 assert.equal(await db.prepare('SELECT used FROM storage_usage WHERE id=1').first('used'),bytes.length,'failed insert must roll back quota');
 await assert.rejects(storage.put('too-large',new Uint8Array(MAX_FILE_BYTES+1)),{status:413});
 // Leave room for exactly one concurrent write, then verify one is rejected.
 await db.prepare('UPDATE storage_usage SET used=? WHERE id=1').bind(FILE_STORAGE_LIMIT-10).run();
 const concurrent=await Promise.allSettled([storage.put('a',new Uint8Array(10)),storage.put('b',new Uint8Array(10))]);
 assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(concurrent.find(r=>r.status==='rejected').reason.status,507);
 assert.equal(await db.prepare('SELECT used FROM storage_usage WHERE id=1').first('used'),FILE_STORAGE_LIMIT);
 assert.deepEqual(new Uint8Array(await (await storage.get('document/test')).arrayBuffer()),bytes,'old files remain readable at capacity');
 await db.prepare('UPDATE storage_usage SET used=(SELECT SUM(size) FROM stored_objects) WHERE id=1').run();
 await storage.delete('document/test');
 assert.equal(await storage.get('document/test'),null);
 assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM stored_chunks WHERE object_key='document/test'").first('n'),0);
 assert.equal(await db.prepare('SELECT used FROM storage_usage WHERE id=1').first('used'),10);
 // A chunk failure must roll back the object and its reservation atomically.
 await db.prepare("CREATE TRIGGER reject_test BEFORE INSERT ON stored_chunks WHEN NEW.object_key='broken' BEGIN SELECT RAISE(ABORT,'test_failure'); END").run();
 await assert.rejects(storage.put('broken',new Uint8Array(10)));
 assert.equal(await storage.get('broken'),null);
 assert.equal(await db.prepare('SELECT used FROM storage_usage WHERE id=1').first('used'),10);
 console.log('D1 storage passed: multi-chunk persistence, quota, concurrent writes, rollback, size limit, old-file retention, deletion.');
} finally { await mf.dispose(); }
