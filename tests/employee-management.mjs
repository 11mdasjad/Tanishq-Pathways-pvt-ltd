import assert from 'node:assert/strict';
import {testSession} from './session.mjs';
const admin=testSession(),employee=testSession(),other=testSession();
employee.setRole('Employee');other.setRole('Employee');
const base=process.env.CRM_TEST_URL||'http://127.0.0.1:5173';let checks=0;
async function req(session,body,status=200){
 const response=await fetch(base+'/api/crm',{method:body?'POST':'GET',headers:{cookie:session.cookie,origin:base,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));checks++;return result;
}
try{
 const task=await req(admin,{action:'createTask',title:'TEST employee work',notes:'Collect passport',assigned:employee.id,dueDate:'2026-11-01'});
 const update={action:'updateTask',taskId:task.id,title:'TEST updated work',notes:'Review passport and call applicant',assigned:other.id,dueDate:'2026-11-15',status:'In progress'};
 await req(employee,update,403);await req(other,update,403);
 await req(admin,{...update,assigned:'missing'},400);
 await req(admin,{...update,assigned:admin.id},400);
 await req(admin,{...update,dueDate:'2026-02-30'},400);
 await req(admin,{...update,title:' '},400);
 await req(admin,{...update,status:'Invalid'},400);
 await req(admin,{...update,taskId:'missing'},404);
 await req(admin,update);
 const current=(await req(admin)).tasks.find(t=>t.id===task.id);
 for(const [key,value] of Object.entries({title:update.title,notes:update.notes,assigned:other.id,due_date:update.dueDate,status:update.status}))assert.equal(current[key],value);
 assert(!(await req(employee)).tasks.some(t=>t.id===task.id));
 assert((await req(other)).tasks.some(t=>t.id===task.id));
 await req(employee,{action:'taskStatus',taskId:task.id,status:'Completed'},404);
 await req(other,{action:'taskStatus',taskId:task.id,status:'Completed'});
 await req(admin,{...update,status:'To do'});
 assert.equal((await req(other)).tasks.find(t=>t.id===task.id).status,'To do');
 assert((await req(admin)).activities.some(a=>a.actor===admin.id&&a.action==='Task updated'));
 await req(admin,{action:'saveEmployee',id:other.id,name:'TEST inactive employee',email:other.id+'@example.invalid',active:false});
 await req(admin,{...update,status:'Completed'});
 await req(admin,{...update,assigned:employee.id});
 await req(admin,update,400);
 console.log(`${checks} employee-management API checks passed: editing, reassignment, validation, audit, inactive accounts and employee isolation.`);
}finally{admin.cleanup();employee.cleanup();other.cleanup();}
