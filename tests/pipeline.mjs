import assert from 'node:assert/strict';
import {testSession} from './session.mjs';
const admin=testSession(), employee=testSession(), other=testSession();employee.setRole('Employee');other.setRole('Employee');
const base=process.env.CRM_TEST_URL||'http://127.0.0.1:5173';let checks=0;
async function req(session,body,status=200){const r=await fetch(base+'/api/crm',{method:body?'POST':'GET',headers:{cookie:session.cookie,origin:base,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();assert.equal(r.status,status,JSON.stringify(j));checks++;return j;}
try {
 const lead=await req(admin,{action:'createLead',name:'TEST PIPELINE',mobile:'9999999999',country:'Canada',visa:'Work Visa',source:'Website',assigned:employee.id});
 let data=await req(employee);assert.equal(data.leads.find(l=>l.id===lead.id).status,'Lead');
 await req(other,{action:'convertLead',leadId:lead.id},404);
 await req(employee,{action:'convertLead',leadId:lead.id});
 await req(employee,{action:'convertLead',leadId:lead.id},400);
 await req(employee,{action:'deleteLead',leadId:lead.id});
 data=await req(employee);assert.equal(data.leads.find(l=>l.id===lead.id).archived,1);
 await req(employee,{action:'convertLead',leadId:lead.id},400);
 await req(employee,{action:'restoreLead',leadId:lead.id});
 await req(employee,{action:'assignLead',leadId:lead.id,assigned:other.id},403);
 await req(admin,{action:'assignLead',leadId:lead.id,assigned:other.id});
 await req(employee,{action:'deleteLead',leadId:lead.id},404);
 assert.equal((await req(other)).leads.find(l=>l.id===lead.id).status,'Prospect');
 await req(employee,{action:'createTask',title:'Forbidden',assigned:employee.id,dueDate:'2026-11-01'},403);
 const task=await req(admin,{action:'createTask',title:'TEST follow up',notes:'Call applicant',assigned:employee.id,dueDate:'2026-11-01'});
 assert((await req(employee)).tasks.some(t=>t.id===task.id));assert(!(await req(other)).tasks.some(t=>t.id===task.id));
 await req(other,{action:'taskStatus',taskId:task.id,status:'Completed'},404);
 await req(employee,{action:'taskStatus',taskId:task.id,status:'In progress'});
 assert.equal((await req(admin)).tasks.find(t=>t.id===task.id).status,'In progress');
 await req(employee,{action:'taskStatus',taskId:task.id,status:'Completed'});
 assert((await req(admin)).activities.some(a=>a.actor===employee.id&&a.action==='Task completed'));
 console.log(`${checks} pipeline API checks passed: persistence, conversion, Trash/restore, reassignment, tasks and role isolation.`);
} finally {admin.cleanup();employee.cleanup();other.cleanup();}
