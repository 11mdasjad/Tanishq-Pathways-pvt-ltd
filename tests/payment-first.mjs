import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {testSession} from './session.mjs';
const base=process.env.CRM_TEST_URL||'http://127.0.0.1:5184';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Disposable local server only.');
const admin=testSession(),employee=testSession(),other=testSession();employee.setRole('Employee');other.setRole('Employee');let checks=0;
async function req(session,body,status=200,path='/api/crm'){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie:session.cookie,origin:base,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const result=await r.json();assert.equal(r.status,status,JSON.stringify(result));checks++;return result;
}
async function receipt(session,id,status=200,download=false){const r=await fetch(`${base}/api/payments/${id}/receipt${download?'?download=1':''}`,{headers:{cookie:session.cookie}});assert.equal(r.status,status);checks++;if(status!==200)return;assert.match(r.headers.get('content-type'),/application\/pdf/);assert.match(r.headers.get('content-disposition'),download?/attachment/:/inline/);const bytes=new Uint8Array(await r.arrayBuffer());assert((await PDFDocument.load(bytes)).getPageCount()>=1);return bytes;}
try{
 const seed=Date.now();
 const leadBody={name:'TEST Payment Applicant',mobile:'9999999999',email:'payment@example.invalid',country:'Canada',visa:'Study Visa',source:'Website',assigned:employee.id};
 const {id:leadId}=await req(admin,{action:'createLead',stage:'Prospect',...leadBody});
 const details=()=>req(admin,null,200,`/api/crm?leadId=${leadId}`);
 const profile={fee:1000,service:'TEST Visa consultation',address:'Synthetic preview address'};
 await req(employee,{action:'updateLead',leadId,...leadBody,profile});
 let detail=await details();assert.equal(detail.paymentSummary.required,100000);assert.equal(detail.paymentSummary.ready,false);
 await req(employee,{action:'setPaymentRequirement',leadId,amount:200},403);
 for(const amount of [0,-1,1001,1.001])await req(admin,{action:'setPaymentRequirement',leadId,amount},400);
 await req(admin,{action:'setPaymentRequirement',leadId,amount:500});
 await req(employee,{action:'updateLead',leadId,...leadBody,profile:{...profile,fee:400}},400);
 const body={action:'recordPayment',leadId,amount:300,reference:`PAYMENT-TEST-${seed}`,method:'UPI',paidOn:'2026-10-01',payerName:'TEST Payer',notes:'Synthetic receipt for QA only'};
 await req(other,body,404);
 await req(employee,{...body,amount:0.001},400);await req(employee,{...body,paidOn:'2099-01-01'},400);await req(employee,{...body,paidOn:'2026-02-30'},400);
 const p=await req(employee,body);assert.match(p.receiptNumber,/^RCPT-/);await req(employee,body,400);
 detail=await details();assert.equal(detail.paymentSummary.verified,0);assert.equal(detail.paymentSummary.pending,30000);assert.equal(detail.paymentSummary.ready,false);
 writeFileSync('/tmp/tanishka-receipt-pending.pdf',await receipt(employee,p.id));await receipt(other,p.id,404);await receipt(admin,'missing',404);
 const unauth=await fetch(`${base}/api/payments/${p.id}/receipt`);assert.equal(unauth.status,401);checks++;
 const review={action:'reviewPayment',leadId,paymentId:p.id,status:'Verified',expectedStatus:'Pending verification',remarks:'Checked synthetic UPI reference against synthetic statement',confirmed:true};
 await req(employee,review,403);await req(other,review,404);await req(admin,{...review,confirmed:false},400);await req(admin,{...review,remarks:''},400);
 const form=new FormData();form.set('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')],'test-proof.png',{type:'image/png'}));form.set('kind','payment_proof');form.set('leadId',leadId);form.set('paymentId',p.id);form.set('category','Payment proof');
 const upload=await fetch(base+'/api/crm',{method:'POST',headers:{cookie:employee.cookie,origin:base},body:form});assert.equal(upload.status,200,await upload.text());checks++;
 await req(admin,review);await req(admin,review,409);
 detail=await details();assert.equal(detail.paymentSummary.verified,30000);assert.equal(detail.paymentSummary.remaining,20000);assert.equal(detail.paymentSummary.ready,false);assert.equal(detail.lead.revision,1);
 writeFileSync('/tmp/tanishka-receipt-verified.pdf',await receipt(admin,p.id,200,true));
 const p2=await req(employee,{...body,reference:body.reference+'-2',amount:200});
 await req(admin,{...review,paymentId:p2.id});detail=await details();assert.equal(detail.paymentSummary.ready,true);assert.equal(detail.paymentSummary.balance,50000);
 await req(admin,{...review,paymentId:p2.id,status:'Rejected',expectedStatus:'Verified',remarks:'Synthetic transaction reversed'});
 detail=await details();assert.equal(detail.paymentSummary.ready,false);assert.equal(detail.paymentSummary.verified,30000);
 writeFileSync('/tmp/tanishka-receipt-rejected.pdf',await receipt(employee,p2.id));
 await req(admin,{...review,paymentId:p2.id,expectedStatus:'Rejected'});
 await req(admin,{action:'setPaymentRequirement',leadId,amount:null});detail=await details();assert.equal(detail.paymentSummary.required,100000);assert.equal(detail.paymentSummary.ready,false);
 await req(admin,{action:'deleteLead',leadId});await req(admin,{...review,status:'Rejected',expectedStatus:'Verified'},400);await receipt(admin,p.id);
 await req(admin,{action:'restoreLead',leadId});
 const all=await req(employee);assert.equal(all.payments.filter(p=>p.lead_id===leadId).length,2);assert(!(await req(other)).payments.some(p=>p.lead_id===leadId));
 console.log(`${checks} payment-first checks passed: defaults, advances, receipts, proof, admin verification, rejection, audit and access restrictions.`);
}finally{admin.cleanup();employee.cleanup();other.cleanup();}
