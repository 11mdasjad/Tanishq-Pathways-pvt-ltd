import {testSession} from './session.mjs';
import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import fs from 'node:fs/promises';
const origin=process.env.CRM_TEST_ORIGIN||'http://127.0.0.1:5173';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('This test only runs against a disposable localhost database.');
const employeeMode=process.env.CRM_WORKFLOW_EMPLOYEE==='1';
const fixture=testSession();const cookie=fixture.cookie;let checks=0;
async function request(payload,expected=200){if(payload?.action==='generateAgreement')payload={country:'Canada',planId:'canada-study',...payload};const r=await fetch(origin+'/api/crm',{method:payload?'POST':'GET',headers:{cookie,...(payload?{'Content-Type':'application/json',Origin:origin}:{})},body:payload?JSON.stringify(payload):undefined});const body=await r.json();assert.equal(r.status,expected,JSON.stringify(body));checks++;return body;}
async function fileUpload(kind,leadId,category,bytes,type,extras={}){const form=new FormData();form.set('kind',kind);if(leadId)form.set('leadId',leadId);form.set('category',category);form.set('file',new File([bytes],'TEST_ONLY.'+(type==='application/pdf'?'pdf':'png'),{type}));for(const [k,v] of Object.entries(extras))form.set(k,v);const r=await fetch(origin+'/api/crm',{method:'POST',headers:{cookie,Origin:origin},body:form});const j=await r.json();assert.equal(r.status,200,JSON.stringify(j));checks++;return j.id;}
let originalSettings;
try{
const seed=Date.now();const first=await request();const owner=first.user.id;originalSettings=first.settings;if(employeeMode)fixture.setRole('Employee');
const noAuth=await fetch(origin+'/api/crm');assert.equal(noAuth.status,401);checks++;
const badOrigin=await fetch(origin+'/api/crm',{method:'POST',headers:{cookie,Origin:'https://example.invalid','Content-Type':'application/json'},body:JSON.stringify({action:'createLead'})});assert.equal(badOrigin.status,403);checks++;
const base={name:`TEST ONLY Applicant ${seed}`,mobile:'+91 90000 00000',email:'test@example.invalid',country:'Canada',visa:'Study Visa',source:'Website',assigned:owner,notes:'Disposable local test record. Not a real applicant.'};
const {id:leadId}=await request({action:'createLead',stage:'Prospect',...base});let d=await(await fetch(origin+'/api/crm?leadId='+leadId,{headers:{cookie}})).json();assert.equal(d.lead.status,'Prospect');checks++;
await request({action:'generateAgreement',leadId},400);await request({action:'submitVerification',leadId},400);
const profile={dob:'1998-01-01',nationality:'TEST',passport:'TEST-ONLY',address:'TEST ADDRESS — NOT A BUSINESS ADDRESS',service:'Test service',intake:'Test intake',fee:1000};
await request({action:'updateLead',leadId,...base,profile});
const testPdf=await PDFDocument.create();const p=testPdf.addPage();p.drawText('TEST DOCUMENT - NOT VALID',{font:await testPdf.embedFont(StandardFonts.Helvetica),x:50,y:700});const pdfBytes=await testPdf.save();
for(const category of ['Passport','Photograph','Academic records']){const fileId=await fileUpload('document',leadId,category,pdfBytes,'application/pdf');await request({action:'reviewDocument',leadId,fileId,status:'Verified'});}
await request({action:'submitVerification',leadId});await request({action:'verify',leadId,decision:'Verification Rejected',remarks:'Test resubmission'});await request({action:'submitVerification',leadId});await request({action:'verify',leadId,decision:'Verified',remarks:'Test approval'});
await request({action:'generateAgreement',leadId},400);
if(employeeMode){await request({action:'saveSettings',settings:first.settings},403);fixture.setRole('Admin');}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const logoId=await fileUpload('logo',null,'logo',png,'image/png');const signatureId=await fileUpload('signature',null,'signature',png,'image/png');
await request({action:'saveSettings',settings:{...first.settings,agreementPlans:first.settings.agreementPlans.map(p=>p.id==='canada-study'?{...p,approved:true}:p),companyName:'TEST COMPANY - NOT VALID',address:'TEST ADDRESS - NOT REGISTERED',email:'test@example.invalid',phone:'0000000000',signatory:'TEST ONLY - NOT SIGNED',designation:'TEST ONLY',logoId,signatureId,terms:Array.from({length:50},(_,i)=>`${i+1}. TEST ONLY CLAUSE. This is synthetic software test content and not an approved agreement or a valid signature.`).join('\n\n'),approved:true}});
await request({action:'setPaymentRequirement',leadId,amount:500});
if(employeeMode)fixture.setRole('Employee');
const payment=await request({action:'recordPayment',leadId,amount:500,reference:'TEST-ADVANCE-'+seed,method:'UPI',paidOn:new Date().toISOString().slice(0,10),payerName:base.name});
await request({action:'generateAgreement',leadId},400);
const receiptRes=await fetch(origin+'/api/payments/'+payment.id+'/receipt',{headers:{cookie}});assert.equal(receiptRes.status,200);assert.equal(receiptRes.headers.get('content-type'),'application/pdf');assert.ok((await PDFDocument.load(await receiptRes.arrayBuffer())).getPageCount()>0);checks+=3;
if(employeeMode){await request({action:'reviewPayment',leadId,paymentId:payment.id,expectedStatus:'Pending verification',status:'Verified',remarks:'Test bank match',confirmed:true},403);fixture.setRole('Admin');}
await request({action:'reviewPayment',leadId,paymentId:payment.id,expectedStatus:'Pending verification',status:'Verified',remarks:'Test bank match',confirmed:true});
if(employeeMode)fixture.setRole('Employee');
await request({action:'generateAgreement',leadId,country:'Australia',planId:'australia-study'},400);
await request({action:'generateAgreement',leadId,country:'Canada',planId:'canada-work'},400);
await request({action:'generateAgreement',leadId});d=await(await fetch(origin+'/api/crm?leadId='+leadId,{headers:{cookie}})).json();const ag=d.agreements[0];assert.equal(ag.plan.id,'canada-study');assert.equal(ag.plan.country,'Canada');checks+=2;assert.equal(d.verifications[0].reviewer,owner);assert.equal(ag.created_by,owner);checks+=2;
const pdfRes=await fetch(origin+'/api/files/'+ag.file_id+'?download=1',{headers:{cookie}});assert.equal(pdfRes.status,200);assert.match(pdfRes.headers.get('content-disposition'),/attachment/);const bytes=await pdfRes.arrayBuffer();await fs.writeFile('/tmp/tanishka-test-agreement.pdf',Buffer.from(bytes));const loaded=await PDFDocument.load(bytes);assert.ok(loaded.getPageCount()>1);checks+=3;
d=await(await fetch(origin+'/api/crm?leadId='+leadId,{headers:{cookie}})).json();assert.equal(d.agreements[0].status,'Agreement Draft');checks++;
if(employeeMode)fixture.setRole('Admin');
await request({action:'reviewPayment',leadId,paymentId:payment.id,expectedStatus:'Verified',status:'Rejected',remarks:'Synthetic reversal before issue',confirmed:true});
if(employeeMode)fixture.setRole('Employee');
await request({action:'issueAgreement',leadId,agreementId:ag.id},400);
if(employeeMode)fixture.setRole('Admin');
await request({action:'reviewPayment',leadId,paymentId:payment.id,expectedStatus:'Rejected',status:'Verified',remarks:'Synthetic payment rechecked',confirmed:true});
if(employeeMode)fixture.setRole('Employee');
await request({action:'issueAgreement',leadId,agreementId:ag.id});await request({action:'acceptSignature',leadId,agreementId:ag.id},400);await fileUpload('signed',leadId,'Signed agreement',pdfBytes,'application/pdf',{agreementId:ag.id});await request({action:'acceptSignature',leadId,agreementId:ag.id});
await request({action:'recordPayment',leadId,amount:500,reference:'TEST-ADVANCE-'+seed,method:'UPI'},400);
await request({action:'appointment',leadId,title:'TEST consultation',startsAt:new Date(Date.now()+86400000).toISOString(),notes:'TEST ONLY'});
await request({action:'caseStatus',leadId,status:'Completed'},400);await request({action:'caseStatus',leadId,status:'Submitted / Processing'});await request({action:'caseStatus',leadId,status:'Decision Received'});await request({action:'caseStatus',leadId,status:'Completed'});
await request({action:'updateLead',leadId,...base,profile:{...profile,address:'UPDATED TEST ADDRESS'}});await request({action:'issueAgreement',leadId,agreementId:ag.id},400);
if(employeeMode){await request({action:'archive',leadId},403);fixture.setRole('Admin');}
await request({action:'archive',leadId});await request({action:'recordPayment',leadId,amount:10,reference:'ARCHIVED-'+seed,method:'UPI'},400);await request({action:'archive',leadId});
await request({action:'saveSettings',settings:first.settings});
console.log(JSON.stringify({passed:checks,role:employeeMode?'Employee':'Admin',leadId,pdfPages:loaded.getPageCount(),pdf:'/tmp/tanishka-test-agreement.pdf'}));

}finally{fixture.setRole('Admin');if(originalSettings)await request({action:'saveSettings',settings:originalSettings});fixture.cleanup();}
