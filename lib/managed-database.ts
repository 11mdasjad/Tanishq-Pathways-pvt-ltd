import type {Client, InValue, ResultSet} from '@libsql/client';
import migrations from './crm-migrations.json' with {type:'json'};

// Keep the existing CRM's SQLite queries and atomic permission/concurrency guards.
// The adapter runs against managed libSQL; no Cloudflare bindings are involved.
export function managedDatabase(client: Client, bootstrap?: () => Promise<void>) {
 let initializing: Promise<void> | undefined;
 const ready=()=>initializing??=(initialize().catch(error=>{initializing=undefined;throw error;}));
 async function initialize(){
  for(const migration of migrations){
   const tx=await client.transaction('write');
   try{
    await tx.execute('CREATE TABLE IF NOT EXISTS crm_migrations (id TEXT PRIMARY KEY NOT NULL)');
    const applied=await tx.execute({sql:'SELECT id FROM crm_migrations WHERE id=?',args:[migration.id]});
    if(!applied.rows.length){
     await tx.batch([...migration.statements,{sql:'INSERT INTO crm_migrations (id) VALUES (?)',args:[migration.id]}]);
    }
    await tx.commit();
   }catch(error){await tx.rollback();throw error;}finally{tx.close();}
  }
  if(bootstrap)await bootstrap();
 }
 const result=(value:ResultSet)=>({results:value.rows.map(row=>Object.fromEntries(value.columns.map(column=>[column,row[column]]))),success:true,meta:{changes:value.rowsAffected,last_row_id:Number(value.lastInsertRowid??0)}});
 class Statement {
  readonly sql:string;readonly args:InValue[];
  constructor(sql:string,args:InValue[]=[]){this.sql=sql;this.args=args;}
  bind(...args:InValue[]){return new Statement(this.sql,args);}
  async all(){await ready();return result(await client.execute({sql:this.sql,args:this.args}));}
  async run(){return this.all();}
  async first(column?:string){const response=await this.all();const row=response.results[0];return row?(column?row[column]:row):null;}
 }
 return {
  prepare(sql:string){return new Statement(sql);},
  async batch(statements:Statement[]){
   await ready();
   return (await client.batch(statements.map(statement=>({sql:statement.sql,args:statement.args})),'write')).map(result);
  },
 };
}
