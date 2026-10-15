// Bundle migration SQL so serverless functions never rely on a writable disk.
import {readFileSync,writeFileSync} from 'node:fs';
const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
const migrations=journal.entries.map(({tag})=>({
 id:tag,
 statements:readFileSync(new URL(`../drizzle/${tag}.sql`,import.meta.url),'utf8')
  .split('--> statement-breakpoint').map(sql=>sql.trim()).filter(Boolean),
}));
writeFileSync(new URL('../lib/crm-migrations.json',import.meta.url),JSON.stringify(migrations,null,2)+'\n');
