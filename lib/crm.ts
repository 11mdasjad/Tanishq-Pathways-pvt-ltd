import {d1Storage, FILE_STORAGE_LIMIT, MAX_FILE_BYTES} from './d1-storage';
import {agreementPlans,resolveAgreementPlan} from './agreement-plans';
import { paymentSummary } from './payment-summary';
import { agreementSetup } from './agreement-setup';
import { env } from '@runtime-env';
import { cookies } from 'next/headers';
import { tokenHash, hashPassword, temporaryPassword } from './password';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { z } from 'zod';
export const defaults = {companyName:'Tanishka Pathways Pvt Ltd',address:'',email:'',phone:'',website:'',signatory:'',designation:'',logoId:'',signatureId:'',templateTitle:'Visa Consultancy Service Agreement',terms:'',approved:false,templateVersion:'1',requirements:['Passport','Photograph','Academic records'],countryRequirements:{},retentionDays:730,paymentBankName:'',paymentAccountName:'',paymentAccountNumber:'',paymentIfsc:'',paymentUpi:'',paymentInstructions:''};
export const now=()=>new Date().toISOString();
export const id=()=>crypto.randomUUID();
export function db(): D1Database {return (env as any).DB;}
export function bucket() {
 if (env.FILE_STORAGE === 'd1') return d1Storage(db());
 if (!env.BUCKET) throw new Error('File storage is not configured.');
 return env.BUCKET;
}
export const query=(sql:string,...args:any[])=>db().prepare(sql).bind(...args);
export async function rows(sql:string,...args:any[]){return (await query(sql,...args).all()).results as any[];}
export async function one(sql:string,...args:any[]){return await query(sql,...args).first() as any;}
export function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
export const audit=(u:any,leadId:string|null,action:string,detail='')=>query('INSERT INTO activities (id,lead_id,actor,action,detail,created_at) VALUES (?,?,?,?,?,?)',id(),leadId,u.id,action,detail,now());
export async function actor(allowPasswordChange=false){
 const cookie=(await cookies()).get('tp_session')?.value;
 if(cookie){
  const user=await one('SELECT u.* FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>?',await tokenHash(cookie),Date.now());
  if(!user||!user.active)fail('Your session has expired. Please sign in again.',401);
  if(user.must_change_password&&!allowPasswordChange)fail('Please change your temporary password before continuing.',428);
  return user;
 }
 if(await one('SELECT id FROM users WHERE password_hash IS NOT NULL LIMIT 1'))fail('Please sign in with your employee ID and password.',401);

 if(env.PASSWORD_AUTH_ONLY==='true')fail('Please sign in with your employee ID and password.',401);
 const identity=await getChatGPTUser(); if(!identity)fail('Please sign in to continue.',401);
 let u=await one('SELECT * FROM users WHERE identity=?',identity.userId);
 if(!u){
  const invite=await one('SELECT * FROM users WHERE email=?',identity.email.toLowerCase());
  if(invite){if(invite.identity && invite.identity!==identity.userId)fail('Account identity does not match.',403);await query('UPDATE users SET identity=? WHERE id=? AND identity IS NULL',identity.userId,invite.id).run();}
  else {await query("INSERT OR IGNORE INTO users (id,identity,email,name,role,active,created_at) SELECT 'owner',?,?,?,'Admin',1,? WHERE NOT EXISTS (SELECT 1 FROM users)",identity.userId,identity.email.toLowerCase(),identity.fullName||'Workspace Admin',now()).run();}
  u=await one('SELECT * FROM users WHERE identity=?',identity.userId);
 }
 if(!u || !u.active)fail('Your account is not an active member of this workspace. Contact the administrator.',403);
 return u;
}
export function admin(u:any){if(u.role!=='Admin')fail('Administrator access required.',403);}
export async function leadFor(u:any,leadId:string){const l=await one('SELECT * FROM leads WHERE id=?',leadId);if(!l || (u.role!=='Admin'&& l.assigned!==u.id))fail('Record not found or access denied.',404);return {...l,profile:JSON.parse(l.profile)};}

// A D1 batch is transactional. The CHECK constraint aborts the entire batch if
// another request changed this record or revoked the actor's access meanwhile.
export async function commitLead(u:any,l:any,ops:D1PreparedStatement[]){
 const guard=id();
 return db().batch([
  query("UPDATE leads SET lock_version=lock_version+1 WHERE id=? AND lock_version=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND active=1) AND (?='Admin' OR assigned=?)",l.id,l.lock_version,u.id,u.role,u.id),
  query('INSERT INTO operation_guards (id,success) VALUES (?,changes())',guard),
  ...ops,
  query('DELETE FROM operation_guards WHERE id=?',guard)
 ]);
}

export async function config(){const s=await one("SELECT value FROM settings WHERE id='company'");const settings={...defaults,...(s?JSON.parse(s.value):{})};return {...settings,agreementPlans:agreementPlans(settings)};}
export function requiredDocs(s:any,l:any):string[]{return s.countryRequirements?.[`${l.country}/${l.visa}`]||s.countryRequirements?.[l.country]||s.requirements;}
export async function complete(l:any){
 const missing=['dob','nationality','passport','address','service'].filter(k=>!l.profile[k]);
 if(missing.length)fail(`Complete applicant details: ${missing.join(', ')}.`);
 const docs=await rows("SELECT * FROM files f WHERE lead_id=? AND kind='document' AND NOT EXISTS(SELECT 1 FROM files newer WHERE newer.replaces=f.id)",l.id);
 const needed=requiredDocs(await config(),l).filter(k=>!docs.some(d=>d.category===k&&d.status==='Verified'));
 if(needed.length)fail(`Verified documents required: ${needed.join(', ')}.`);
}
const leadSchema=z.object({name:z.string().trim().min(2).max(120),mobile:z.string().regex(/^\+?[\d\s()-]{7,20}$/),email:z.union([z.literal(''),z.string().email()]).default(''),country:z.string().min(2).max(60),visa:z.string().min(2).max(60),source:z.string().min(1).max(60),assigned:z.string().min(1),notes:z.string().max(5000).default('')});
const profileSchema=z.object({dob:z.string().max(10).default(''),nationality:z.string().max(80).default(''),passport:z.string().max(40).default(''),address:z.string().max(1000).default(''),service:z.string().max(120).default(''),intake:z.string().max(80).default(''),fee:z.coerce.number().nonnegative().max(1e9).default(0)});
export async function overview(u:any){
 const ls=await rows(`SELECT l.*,u.name AS employee FROM leads l JOIN users u ON u.id=l.assigned ${u.role==='Admin'?'':'WHERE l.assigned=?'} ORDER BY l.created_at DESC`,...(u.role==='Admin'?[]:[u.id]));
 const restriction=u.role==='Admin'?'':' AND l.assigned=?';const args=u.role==='Admin'?[]:[u.id];
 const [people,docs,ags,pays,appts,logs,s]=await Promise.all([
 rows(`SELECT id,name,email,username,role,active FROM users ${u.role==='Admin'?'':'WHERE id=?'} ORDER BY name`,...(u.role==='Admin'?[]:[u.id])),
 rows(`SELECT f.id,f.lead_id,f.name,f.category,f.status,f.kind,f.created_at,l.name AS applicant FROM files f JOIN leads l ON l.id=f.lead_id WHERE NOT EXISTS(SELECT 1 FROM files n WHERE n.replaces=f.id)${restriction} ORDER BY f.created_at DESC`,...args),
 rows(`SELECT a.*,l.name AS applicant FROM agreements a JOIN leads l ON a.lead_id=l.id WHERE 1=1${restriction} ORDER BY a.created_at DESC`,...args),
 rows(`SELECT p.*,l.name AS applicant FROM payments p JOIN leads l ON p.lead_id=l.id WHERE 1=1${restriction} ORDER BY p.created_at DESC`,...args),
 rows(`SELECT p.*,l.name AS applicant FROM appointments p JOIN leads l ON p.lead_id=l.id WHERE 1=1${restriction} ORDER BY p.starts_at`,...args),
 rows(`SELECT a.*,u.name AS actor_name,l.name AS applicant FROM activities a JOIN users u ON u.id=a.actor LEFT JOIN leads l ON l.id=a.lead_id WHERE 1=1${restriction} ORDER BY a.created_at DESC LIMIT 100`,...args),config()]);
 const tasks=await rows(`SELECT t.*,u.name AS employee FROM tasks t JOIN users u ON u.id=t.assigned ${u.role==='Admin'?'':'WHERE t.assigned=?'} ORDER BY t.due_date,t.created_at DESC`,...(u.role==='Admin'?[]:[u.id]));
 return {storage:u.role==='Admin'&&env.FILE_STORAGE==='d1'?{used:Number((await one('SELECT used FROM storage_usage WHERE id=1'))?.used||0),limit:FILE_STORAGE_LIMIT,maxFileBytes:MAX_FILE_BYTES}:null,tasks,user:{id:u.id,name:u.name,email:u.email,username:u.username,role:u.role},leads:ls.map(l=>({...l,profile:JSON.parse(l.profile)})),users:people,documents:docs,agreements:ags.map(({snapshot,...a})=>({...a,plan:JSON.parse(snapshot).plan||null})),payments:pays,appointments:appts,activities:logs,settings:u.role==='Admin'?s:{companyName:s.companyName,requirements:s.requirements,countryRequirements:s.countryRequirements,logoId:s.logoId,paymentBankName:s.paymentBankName,paymentAccountName:s.paymentAccountName,paymentAccountNumber:s.paymentAccountNumber,paymentIfsc:s.paymentIfsc,paymentUpi:s.paymentUpi,paymentInstructions:s.paymentInstructions}};
}

export async function requireVerifiedPayment(lead:any){
 const payments=await rows('SELECT * FROM payments WHERE lead_id=?',lead.id);const summary=paymentSummary(lead,payments);
 if(!summary.required)fail('Set a positive professional fee or required advance in Payments before generating an agreement.');
 if(!summary.ready)fail(`Admin must verify the required payment before the agreement. Remaining: INR ${(summary.remaining/100).toFixed(2)}.`);
 return {...summary,receipts:payments.filter(p=>p.status==='Verified').map(p=>({id:p.id,receiptNumber:p.receipt_number||p.id,amount:p.amount,reference:p.reference,verifiedAt:p.verified_at}))};
}

export async function detail(u:any,leadId:string){
 const lead=await leadFor(u,leadId);
 const [documents,agreements,verifications,payments,appointments,activities]=await Promise.all([
 rows('SELECT * FROM files WHERE lead_id=? ORDER BY created_at DESC',leadId),rows('SELECT * FROM agreements WHERE lead_id=? ORDER BY version DESC',leadId),rows('SELECT v.*,u.name AS reviewer_name FROM verifications v JOIN users u ON u.id=v.reviewer WHERE lead_id=? ORDER BY v.created_at DESC',leadId),rows('SELECT p.*,u.name AS reviewer_name FROM payments p LEFT JOIN users u ON u.id=p.verified_by WHERE p.lead_id=? ORDER BY p.created_at DESC',leadId),rows('SELECT * FROM appointments WHERE lead_id=? ORDER BY starts_at',leadId),rows('SELECT a.*,u.name AS actor_name FROM activities a JOIN users u ON u.id=a.actor WHERE lead_id=? ORDER BY created_at DESC',leadId)]);
 const settings=await config();
 return {paymentSummary:paymentSummary(lead,payments),agreementSetup:agreementSetup({...settings,terms:'Selected plan terms',approved:true}),agreementPlans:agreementPlans(settings),lead,documents,agreements:agreements.map(({snapshot,...a})=>({...a,plan:JSON.parse(snapshot).plan||null})),verifications,payments,appointments,activities,requirements:requiredDocs(settings,lead)};
}
export async function mutate(u:any,b:any){
 const action=z.string().parse(b.action);
 if(action==='createLead'){
  const d=leadSchema.parse(b);const stage=z.enum(['Lead','Prospect']).parse(b.stage||'Lead');if(u.role!=='Admin')d.assigned=u.id;
  if(!await one('SELECT id FROM users WHERE id=? AND active=1',d.assigned))fail('Choose an active employee.');
  const key=`TP-${new Date().getFullYear()}-${id().slice(0,8).toUpperCase()}`;
  await db().batch([query('INSERT INTO leads (id,name,mobile,email,country,visa,source,assigned,status,profile,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',key,d.name,d.mobile,d.email,d.country,d.visa,d.source,d.assigned,stage,'{}',d.notes,u.id,now(),now()),audit(u,key,`${stage} created`)]);return {id:key};
 }
 if(action==='createTask'){
  admin(u);const d=z.object({title:z.string().trim().min(2).max(180),notes:z.string().max(5000).default(''),assigned:z.string(),dueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).parse(b);
  const employee=await one("SELECT id,name FROM users WHERE id=? AND active=1 AND role='Employee'",d.assigned);if(!employee)fail('Choose an active employee.');
  const key=id();await db().batch([query("INSERT INTO tasks (id,title,notes,assigned,due_date,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'To do',?,?,?)",key,d.title,d.notes,d.assigned,d.dueDate,u.id,now(),now()),audit(u,null,'Task assigned',`${d.title} → ${employee.name}; due ${d.dueDate}`)]);return {id:key};
 }
 if(action==='updateTask'){
  admin(u);
  const d=z.object({taskId:z.string().min(1),title:z.string().trim().min(2).max(180),notes:z.string().max(5000).default(''),assigned:z.string().min(1),dueDate:z.string().date(),status:z.enum(['To do','In progress','Completed'])}).parse(b);
  const task=await one('SELECT * FROM tasks WHERE id=?',d.taskId);if(!task)fail('Task not found.',404);
  const employee=await one("SELECT id,name,active FROM users WHERE id=? AND role='Employee'",d.assigned);
  if(!employee||(!employee.active&&task.assigned!==d.assigned))fail('Choose an active employee.');
  await db().batch([query('UPDATE tasks SET title=?,notes=?,assigned=?,due_date=?,status=?,updated_at=? WHERE id=?',d.title,d.notes,d.assigned,d.dueDate,d.status,now(),task.id),audit(u,null,'Task updated',`${d.title} → ${employee.name}; due ${d.dueDate}; ${d.status}`)]);return {ok:true};
 }
 if(action==='taskStatus'){
  const status=z.enum(['To do','In progress','Completed']).parse(b.status);const task=await one('SELECT * FROM tasks WHERE id=?',z.string().parse(b.taskId));if(!task||(u.role!=='Admin'&&task.assigned!==u.id))fail('Task not found.',404);
  await db().batch([query('UPDATE tasks SET status=?,updated_at=? WHERE id=?',status,now(),task.id),audit(u,null,`Task ${status.toLowerCase()}`,task.title)]);return {ok:true};
 }
 if(action==='resetEmployeePassword'){
  admin(u);const employee=await one("SELECT * FROM users WHERE id=? AND role='Employee'",z.string().parse(b.employeeId));if(!employee)fail('Employee not found.',404);
  const password=temporaryPassword();await db().batch([query('UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?',await hashPassword(password),employee.id),query('DELETE FROM auth_sessions WHERE user_id=?',employee.id),audit(u,null,'Employee password reset',employee.username||employee.id)]);return {username:employee.username,temporaryPassword:password};
 }
 if(action==='saveEmployee'){
  admin(u);const d=z.object({email:z.string().email(),name:z.string().min(2).max(120),active:z.boolean().default(true)}).parse(b);
  if(b.id==='owner')fail('The workspace owner cannot be modified here.');
  if(b.id){await db().batch([query("UPDATE users SET name=?,email=?,active=? WHERE id=? AND role='Employee'",d.name,d.email.toLowerCase(),+d.active,b.id),query('DELETE FROM auth_sessions WHERE user_id=?',b.id),audit(u,null,'Employee updated')]);return {ok:true};}
  const username=z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{3,39}$/).parse(b.username);
  const password=temporaryPassword();
  await db().batch([query("INSERT INTO users (id,email,name,username,password_hash,must_change_password,role,active,created_at) VALUES (?,?,?,?,?,1,'Employee',?,?)",id(),d.email.toLowerCase(),d.name,username,await hashPassword(password),+d.active,now()),audit(u,null,'Employee account created',username)]);
  return {username,temporaryPassword:password};
 }
 if(action==='saveAgreementPlans'){
  admin(u);
  const plans=z.array(z.object({id:z.string().trim().min(1).max(100),country:z.string().trim().min(1).max(100),name:z.string().trim().min(1).max(120),visa:z.enum(['Study Visa','Work Visa','Tourist Visa','Business Visa','Family Visa','Permanent Residency']),title:z.string().trim().min(2).max(200),version:z.string().trim().min(1).max(30),scope:z.string().trim().min(1).max(2000),terms:z.string().trim().min(20).max(50000),reviewNotes:z.string().max(6000).optional(),approved:z.boolean()})).max(150).refine(plans=>new Set(plans.map(p=>p.id)).size===plans.length,'Plan IDs must be unique.').parse(b.plans);
  const settings=await config();
  settings.agreementPlans=plans;
  await db().batch([query("INSERT INTO settings (id,value,updated_at) VALUES ('company',?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",JSON.stringify(settings),now()),audit(u,null,'Agreement templates updated',`${plans.length} country / plan templates`)]);
  return {ok:true};
 }
 if(action==='saveSettings'){
  admin(u);const d=z.object({companyName:z.string().min(2).max(180),address:z.string().max(1000),email:z.union([z.literal(''),z.string().email()]),phone:z.string().max(40),website:z.string().max(200),signatory:z.string().max(120),designation:z.string().max(120),logoId:z.string(),signatureId:z.string(),templateTitle:z.string().min(2).max(200),terms:z.string().max(50000),approved:z.boolean(),templateVersion:z.string().min(1).max(30),requirements:z.array(z.string().min(1).max(80)).min(1).max(30),countryRequirements:z.record(z.array(z.string().min(1).max(80)).min(1)).default({}),paymentBankName:z.string().trim().max(120).default(''),paymentAccountName:z.string().trim().max(160).default(''),paymentAccountNumber:z.string().trim().max(50).default(''),paymentIfsc:z.string().trim().max(30).default(''),paymentUpi:z.string().trim().max(160).default(''),paymentInstructions:z.string().trim().max(2000).default(''),agreementPlans:z.array(z.object({id:z.string().trim().min(1).max(100),country:z.string().trim().min(1).max(100),name:z.string().trim().min(1).max(120),visa:z.enum(['Study Visa','Work Visa','Tourist Visa','Business Visa','Family Visa','Permanent Residency']),title:z.string().trim().min(2).max(200),version:z.string().trim().min(1).max(30),scope:z.string().trim().min(1).max(2000),terms:z.string().trim().min(20).max(50000),reviewNotes:z.string().max(6000).optional(),approved:z.boolean()})).max(150).refine(plans=>new Set(plans.map(p=>p.id)).size===plans.length,'Plan IDs must be unique.').optional(),retentionDays:z.coerce.number().int().min(30).max(3650)}).parse(b.settings);
  if(!d.agreementPlans)d.agreementPlans=agreementPlans(await config());
  for(const [key,kind] of [['logoId','logo'],['signatureId','signature']] as const)if(d[key]&&!await one('SELECT id FROM files WHERE id=? AND kind=?',d[key],kind))fail(`Upload a valid ${kind}.`);
  await db().batch([query("INSERT INTO settings (id,value,updated_at) VALUES ('company',?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",JSON.stringify(d),now()),audit(u,null,'Company and agreement settings updated',`Template ${d.templateVersion}; approved: ${d.approved}`)]);return {ok:true};
 }
 const l=await leadFor(u,z.string().parse(b.leadId));if(l.archived && !['archive','restoreLead'].includes(action))fail('Restore the archived record before making changes.');
 if(action==='convertLead'){
  if(l.status!=='Lead')fail('Only a new lead can be converted to a prospect.');
  await commitLead(u,l,[query("UPDATE leads SET status='Prospect',updated_at=? WHERE id=?",now(),l.id),audit(u,l.id,'Lead converted to prospect')]);return {ok:true};
 }
 if(action==='assignLead'){
  admin(u);const employee=await one("SELECT id,name FROM users WHERE id=? AND active=1 AND role='Employee'",z.string().parse(b.assigned));if(!employee)fail('Choose an active employee.');
  await commitLead(u,l,[query('UPDATE leads SET assigned=?,updated_at=? WHERE id=?',employee.id,now(),l.id),audit(u,l.id,'Record assigned',employee.name)]);return {ok:true};
 }
 if(action==='updateLead'){
  if(b.expectedLockVersion!==undefined&&b.expectedLockVersion!==l.lock_version)fail('This profile changed while you were editing. Refresh and try again.',409);
  const d=leadSchema.parse(b);const p=profileSchema.parse(b.profile);if(l.payment_required!=null&&Math.round(p.fee*100)<l.payment_required)fail('Professional fee cannot be below the required advance. Ask Admin to update the payment requirement first.');if(u.role!=='Admin')d.assigned=l.assigned;
  if(!await one('SELECT id FROM users WHERE id=? AND active=1',d.assigned))fail('Choose an active employee.');
  const sensitive=['Verified','Agreement Draft','Agreement Issued','Signature Pending','Agreement Signed','Payment Pending','Appointment Pending','Submitted / Processing','Decision Received','Completed'].includes(l.status);
  await commitLead(u,l,[query('UPDATE leads SET name=?,mobile=?,email=?,country=?,visa=?,source=?,assigned=?,notes=?,profile=?,status=?,revision=revision+1,updated_at=? WHERE id=?',d.name,d.mobile,d.email,d.country,d.visa,d.source,d.assigned,d.notes,JSON.stringify(p),sensitive?'Details Incomplete':l.status,now(),l.id),audit(u,l.id,'Applicant details updated',sensitive?'Verification and agreement review required':'')]);return {ok:true};
 }
 if(['archive','deleteLead','restoreLead'].includes(action)){if(action==='archive')admin(u);if(action==='deleteLead'&&l.archived)fail('This record is already in Trash.');if(action==='restoreLead'&&!l.archived)fail('This record is already active.');await commitLead(u,l,[query('UPDATE leads SET archived=?,updated_at=? WHERE id=?',l.archived?0:1,now(),l.id),audit(u,l.id,l.archived?'Record restored':'Record moved to Trash')]);return {ok:true};}
 // leadFor above and commitLead below restrict employee approvals to their assigned records.
 if(action==='reviewDocument'){
  if(l.status==='Lead')fail('Convert this lead to a prospect before document verification.');
  const f=await one("SELECT * FROM files WHERE id=? AND lead_id=? AND kind='document'",b.fileId,l.id);if(!f)fail('Document not found.',404);
  const status=z.enum(['Verified','Rejected','Re-upload Required']).parse(b.status);const remarks=z.string().max(2000).parse(b.remarks||'');if(status!=='Verified'&&!remarks.trim())fail('A correction reason is required.');
  await commitLead(u,l,[query('UPDATE files SET status=?,remarks=? WHERE id=?',status,remarks,f.id),query("UPDATE leads SET revision=revision+1,status=CASE WHEN status IN ('Lead','Prospect','Details Incomplete','Verification Rejected') THEN status ELSE 'Details Incomplete' END,updated_at=? WHERE id=?",now(),l.id),audit(u,l.id,`Document ${status.toLowerCase()}`,`${f.category}: ${remarks}`)]);return {ok:true};
 }
 if(action==='submitVerification'){
  if(!['Prospect','Details Incomplete','Verification Rejected'].includes(l.status))fail('This record is not awaiting submission.');await complete(l);
  await commitLead(u,l,[query("UPDATE leads SET status='Verification Pending',rejection='',updated_at=? WHERE id=? AND revision=?",now(),l.id,l.revision),audit(u,l.id,'Submitted for verification')]);return {ok:true};
 }
 if(action==='verify'){
  if(l.status!=='Verification Pending')fail('Submit the completed record for verification first.');
  const decision=z.enum(['Verified','Verification Rejected']).parse(b.decision);const remarks=z.string().max(3000).parse(b.remarks||'');if(decision==='Verification Rejected'&&!remarks.trim())fail('Please specify corrections required.');if(decision==='Verified')await complete(l);
  await commitLead(u,l,[query('UPDATE leads SET status=?,rejection=?,updated_at=? WHERE id=? AND revision=? AND status=?',decision,remarks,now(),l.id,l.revision,'Verification Pending'),query('INSERT INTO verifications (id,lead_id,reviewer,decision,remarks,created_at) VALUES (?,?,?,?,?,?)',id(),l.id,u.id,decision,remarks,now()),audit(u,l.id,decision,remarks)]);return {ok:true};
 }
 if(action==='generateAgreement'){
  if(!['Verified','Agreement Draft','Agreement Issued','Signature Pending','Agreement Signed'].includes(l.status))fail('The applicant must be verified before an agreement can be generated.');await complete(l);
  const payment=await requireVerifiedPayment(l);
  const company=await config();let plan;try{plan=resolveAgreementPlan(company,l,z.string().parse(b.planId),z.string().parse(b.country));}catch(error){fail(error instanceof Error?error.message:'Select a valid agreement plan.');}
  const s={...company,templateTitle:plan.title,templateVersion:plan.version,terms:plan.terms,approved:plan.approved};const setup=agreementSetup(s);if(!setup.ready)fail(`Company agreement setup is incomplete. Admin must configure: ${setup.missing.map(item=>item.label).join(', ')}.`);
  const {makeAgreement}=await import('./pdf');const version=Number((await one('SELECT MAX(version) AS v FROM agreements WHERE lead_id=?',l.id))?.v||0)+1;
  const agreementId=`AG-${l.id.slice(3)}-V${version}`;const fileId=id();const key=`agreements/${fileId}.pdf`;const snapshot={lead:{...l,profile:{...l.profile,service:plan.name+' — '+plan.scope}},settings:s,plan:{id:plan.id,country:plan.country,name:plan.name,visa:plan.visa,version:plan.version},payment,agreementId,version,date:now(),designVersion:'navy-orange-v2'};const bytes=await makeAgreement(snapshot);
  await bucket().put(key,bytes,{httpMetadata:{contentType:'application/pdf'}});
  try{await commitLead(u,l,[query("INSERT INTO files (id,lead_id,kind,name,category,mime,size,object_key,status,uploaded_by,created_at) VALUES (?,?,'agreement',?,'Agreement','application/pdf',?,?,'Verified',?,?)",fileId,l.id,`Tanishka_Pathways_Agreement_${l.id}_v${version}.pdf`,bytes.length,key,u.id,now()),query('INSERT INTO agreements (id,lead_id,version,file_id,revision,status,snapshot,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)',agreementId,l.id,version,fileId,l.revision,'Agreement Draft',JSON.stringify(snapshot),u.id,now()),query("UPDATE leads SET status='Agreement Draft',updated_at=? WHERE id=?",now(),l.id),audit(u,l.id,'Agreement generated',`${agreementId} · Version ${version} · ${plan.country} · ${plan.name} · Template ${plan.version}`)]);}catch(e){await bucket().delete(key);throw e;}return {ok:true};
 }
 if(['issueAgreement','declineAgreement','acceptSignature'].includes(action)){
  const a=await one('SELECT * FROM agreements WHERE id=? AND lead_id=?',b.agreementId,l.id);if(!a)fail('Agreement not found.',404);if(a.revision!==l.revision)fail('Applicant details changed. Verify the record and generate a new agreement version.');
  let status='Signature Pending';
  if(action==='issueAgreement'){if(a.status!=='Agreement Draft')fail('Only a draft can be issued.');await complete(l);await requireVerifiedPayment(l);}
  if(action==='declineAgreement'){if(a.status!=='Signature Pending')fail('Only an issued agreement can be declined.');if(!b.remarks?.trim())fail('A reason is required.');status='Declined';}
  if(action==='acceptSignature'){if(a.status!=='Signature Pending'||!a.signed_file_id)fail('Upload a signed copy of the issued agreement first.');status='Signed';}
  await commitLead(u,l,[query('UPDATE agreements SET status=? WHERE id=?',status,a.id),query('UPDATE leads SET status=?,updated_at=? WHERE id=?',status==='Signed'?'Agreement Signed':status==='Declined'?'Verified':status,now(),l.id),audit(u,l.id,action==='acceptSignature'?'Signed agreement accepted':action==='declineAgreement'?'Agreement declined':'Agreement issued',b.remarks||a.id)]);return {ok:true};
 }
 if(action==='setPaymentRequirement'){
  admin(u);const amount=b.amount===null?null:z.coerce.number().min(0.01).max(1e8).refine(v=>Math.abs(v*100-Math.round(v*100))<0.00001,'Use at most two decimal places.').parse(b.amount);
  const fee=Math.round(Number(l.profile.fee||0)*100);if(amount!==null&&(!fee||Math.round(amount*100)>fee))fail('Set the professional fee first. Required advance cannot exceed the full fee.');
  await commitLead(u,l,[query('UPDATE leads SET payment_required=?,updated_at=? WHERE id=?',amount===null?null:Math.round(amount*100),now(),l.id),audit(u,l.id,'Pre-agreement payment requirement updated',amount===null?'Full professional fee':`INR ${amount}`)]);return {ok:true};
 }
 if(action==='recordPayment'){
  if(l.status==='Lead')fail('Convert the lead to a prospect before recording payment.');
  const d=z.object({amount:z.coerce.number().min(0.01).max(1e8).refine(v=>Math.abs(v*100-Math.round(v*100))<0.00001,'Use at most two decimal places.'),reference:z.string().trim().min(3).max(120),method:z.enum(['Bank transfer','UPI','Cash','Card']),paidOn:z.string().date().optional(),payerName:z.string().trim().max(120).default(''),notes:z.string().trim().max(2000).default('')}).parse(b);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(d.paidOn&&d.paidOn>today)fail('Payment date cannot be in the future.');
  const paymentId=id(),receiptNumber=`RCPT-${new Date().getFullYear()}-${paymentId.toUpperCase()}`,s=await config();
  const snapshot={company:{name:s.companyName,address:s.address,email:s.email,phone:s.phone},applicant:{id:l.id,name:l.name,mobile:l.mobile,email:l.email,country:l.country,visa:l.visa,service:l.profile.service||''},recordedBy:u.name};
  await commitLead(u,l,[query('INSERT INTO payments (id,lead_id,amount,reference,method,created_by,created_at,receipt_number,paid_on,payer_name,notes,receipt_snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',paymentId,l.id,Math.round(d.amount*100),d.reference,d.method,u.id,now(),receiptNumber,d.paidOn||today,d.payerName||l.name,d.notes,JSON.stringify(snapshot)),audit(u,l.id,'Payment recorded - verification pending',`INR ${d.amount} · ${d.method} · ${receiptNumber}`)]);return {id:paymentId,receiptNumber};
 }
 if(action==='reviewPayment'){
  admin(u);const d=z.object({paymentId:z.string().min(1),status:z.enum(['Verified','Rejected']),remarks:z.string().trim().min(3).max(2000),confirmed:z.literal(true)}).parse(b);
  const payment=await one('SELECT * FROM payments WHERE id=? AND lead_id=?',d.paymentId,l.id);if(!payment)fail('Payment not found.',404);
  if(b.expectedStatus!==payment.status)fail('Payment status changed. Refresh and review it again.',409);
  if(payment.status===d.status)fail('This payment already has that status.');
  await commitLead(u,l,[query('UPDATE payments SET status=?,verified_by=?,verified_at=?,verification_notes=? WHERE id=?',d.status,u.id,now(),d.remarks,payment.id),audit(u,l.id,`Payment ${d.status.toLowerCase()}`,`${payment.receipt_number||payment.id}: ${d.remarks}`)]);return {ok:true};
 }
 if(action==='appointment'){
  const d=z.object({title:z.string().min(2).max(160),startsAt:z.string().datetime({offset:true}),notes:z.string().max(2000).default('')}).parse(b);if(new Date(d.startsAt).getTime()<Date.now())fail('Choose a future appointment time.');
  await commitLead(u,l,[query('INSERT INTO appointments (id,lead_id,title,starts_at,notes,created_by,created_at) VALUES (?,?,?,?,?,?,?)',id(),l.id,d.title,d.startsAt,d.notes,u.id,now()),audit(u,l.id,'Appointment scheduled',d.title)]);return {ok:true};
 }
 if(action==='appointmentStatus'){
  const status=z.enum(['Completed','Cancelled']).parse(b.status);await commitLead(u,l,[query('UPDATE appointments SET status=? WHERE id=? AND lead_id=?',status,b.appointmentId,l.id),audit(u,l.id,`Appointment ${status.toLowerCase()}`)]);return {ok:true};
 }
 if(action==='caseStatus'){
  const status=z.enum(['Payment Pending','Documents Pending','Appointment Pending','Submitted / Processing','Decision Received','Completed','Cancelled']).parse(b.status);
  const allowed:Record<string,string[]>={'Agreement Signed':['Payment Pending','Documents Pending','Appointment Pending','Submitted / Processing'],'Payment Pending':['Documents Pending','Appointment Pending','Submitted / Processing'],'Documents Pending':['Payment Pending','Appointment Pending','Submitted / Processing'],'Appointment Pending':['Payment Pending','Documents Pending','Submitted / Processing'],'Submitted / Processing':['Decision Received'],'Decision Received':['Completed']};
  if(status==='Cancelled'){admin(u);if(!b.remarks?.trim())fail('A cancellation reason is required.');}
  else if(!allowed[l.status]?.includes(status))fail('This case transition is not available from the current stage.');
  if(status==='Submitted / Processing'){await complete(l);if(!await one("SELECT id FROM agreements WHERE lead_id=? AND status='Signed' AND revision=?",l.id,l.revision))fail('A current signed agreement is required.');}
  await commitLead(u,l,[query('UPDATE leads SET status=?,updated_at=? WHERE id=?',status,now(),l.id),audit(u,l.id,`Case status: ${status}`,b.remarks||'')]);return {ok:true};
 }
 fail('Unknown action.');
}
export async function upload(u:any,form:FormData){
 const f=form.get('file');if(!(f instanceof File))fail('Choose a file.');if(!f.size||f.size>MAX_FILE_BYTES)fail('Files must be between 1 byte and 3 MB.');
 const kind=z.enum(['document','signed','logo','signature','payment_proof']).parse(form.get('kind'));const bytes=new Uint8Array(await f.arrayBuffer());
 const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10;const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;const pdf=new TextDecoder().decode(bytes.slice(0,5))==='%PDF-';
 const mime=png?'image/png':jpg?'image/jpeg':pdf?'application/pdf':'';if(!mime||mime!==f.type)fail('Upload a valid PDF, JPG or PNG with matching file content.');if(['logo','signature'].includes(kind)&&pdf)fail('Company assets must be PNG or JPG.');if(kind==='signed'&&!pdf)fail('Signed agreements must be PDF.');
 try{const {PDFDocument}=await import('pdf-lib');if(pdf){const document=await PDFDocument.load(bytes);if(!document.getPageCount()||document.getPageCount()>300)fail('PDF must have between 1 and 300 pages.');}else{const document=await PDFDocument.create();const image=png?await document.embedPng(bytes):await document.embedJpg(bytes);if(image.width*image.height>40000000)fail('Image dimensions exceed the 40 megapixel limit.');}}catch(e:any){if(e.status)throw e;fail('The uploaded file is damaged or cannot be read.');}
 const leadId=String(form.get('leadId')||'');const category=z.string().min(1).max(80).parse(form.get('category')||kind);const replaces=String(form.get('replaces')||'')||null;
 let l:any=null;let agreement:any=null;let payment:any=null;
 if(['logo','signature'].includes(kind))admin(u);else {l=await leadFor(u,leadId);if(l.archived)fail('Restore this record before uploading.');}
 if(replaces&&!await one('SELECT id FROM files WHERE id=? AND lead_id=? AND kind=? AND category=?',replaces,leadId,kind,category))fail('Invalid previous document version.');
 if(kind==='signed'){agreement=await one('SELECT * FROM agreements WHERE id=? AND lead_id=?',String(form.get('agreementId')),leadId);if(!agreement||agreement.status!=='Signature Pending')fail('Issue an agreement before uploading a signed copy.');if(agreement.revision!==l.revision)fail('Generate and issue a current agreement first.');}
 if(kind==='payment_proof'){payment=await one('SELECT * FROM payments WHERE id=? AND lead_id=?',String(form.get('paymentId')),leadId);if(!payment)fail('Payment not found.',404);if(payment.status!=='Pending verification')fail('Proof can only be uploaded while payment verification is pending.');}
 const fileId=id();const key=`${kind}/${fileId}`;await bucket().put(key,bytes,{httpMetadata:{contentType:mime}});
 const ops=[query('INSERT INTO files (id,lead_id,kind,name,category,mime,size,object_key,status,replaces,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',fileId,l?.id||null,kind,f.name.slice(0,180),category,mime,f.size,key,'Under Review',replaces,u.id,now()),audit(u,l?.id||null,`${kind==='signed'?'Signed agreement':kind} uploaded`,category)];
 if(kind==='document')ops.push(query("UPDATE leads SET revision=revision+1,status=CASE WHEN status IN ('Lead','Prospect','Details Incomplete','Verification Rejected') THEN status ELSE 'Details Incomplete' END,updated_at=? WHERE id=?",now(),l.id));
 if(kind==='payment_proof')ops.push(query('UPDATE payments SET proof_file_id=? WHERE id=?',fileId,payment.id));
 if(kind==='signed')ops.push(query('UPDATE agreements SET signed_file_id=? WHERE id=?',fileId,agreement.id));
 try{if(l)await commitLead(u,l,ops);else await db().batch(ops);}catch(e){await bucket().delete(key);throw e;}return {id:fileId};
}
export function errorResponse(e:any){const message=e instanceof z.ZodError?e.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '):e.status?e.message:(/guard_success|CHECK constraint/.test(e.message)?true:false)?'This record changed while you were working. Refresh and try again.':/UNIQUE constraint/.test(e.message)?'This record already exists. Refresh and try again.':'The request could not be completed. Please try again.';return Response.json({error:message},{status:e.status||400});}
