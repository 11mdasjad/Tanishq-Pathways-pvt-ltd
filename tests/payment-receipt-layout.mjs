import ts from 'typescript';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {fontBase64} from '../lib/pdf-font.ts';
import {boldFontBase64} from '../lib/pdf-bold-font.ts';
const source=readFileSync(new URL('../lib/payment-receipt.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export async function','async function');
const code=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext});
const make=new Function('PDFDocument','rgb','fontkit','fontBase64','boldFontBase64',code+';return makePaymentReceipt;')(PDFDocument,rgb,fontkit,fontBase64,boldFontBase64);
const snapshot={company:{name:'TEST COMPANY - RECEIPT PREVIEW',address:'Synthetic company address, for layout review only',email:'preview@example.invalid',phone:'0000000000'},applicant:{name:'Sample Applicant',id:'TEST-APPLICANT-001',mobile:'0000000000',service:'Study visa consultation',country:'Canada',visa:'Study Visa'},recordedBy:'Test Employee'};
const payment={id:'test-payment',receipt_number:'RCPT-2026-12345678-1234-1234-1234-123456789ABC',amount:1000000,status:'Pending verification',created_at:'2026-10-13T08:30:00Z',paid_on:'2026-10-13',payer_name:'Sample Applicant',reference:'TEST-UPI-123456789',method:'UPI',notes:'Synthetic payment. Not a real transaction.'};
for(const status of ['Pending verification','Verified','Rejected']){
 const p={...payment,status,verified_at:status==='Pending verification'?null:'2026-10-13T09:00:00Z',verification_notes:status==='Pending verification'?'':status==='Verified'?'Matched the test transaction reference and amount.':'Test payment reference did not match.'};
 const bytes=await make(p,snapshot,status==='Pending verification'?'Not reviewed':'Test Administrator');
 assert.equal((await PDFDocument.load(bytes)).getPageCount(),1,`Standard ${status} receipt should fit on one page`);
 writeFileSync(`/tmp/tanishka-receipt-${status==='Pending verification'?'pending':status.toLowerCase()}.pdf`,bytes);
}
const long=await make({...payment,notes:'Long payment note. '.repeat(150),verification_notes:'Long review note. '.repeat(150)},snapshot,'Test Administrator');assert((await PDFDocument.load(long)).getPageCount()>1);writeFileSync('/tmp/tanishka-receipt-long.pdf',long);
console.log('Receipt layout checks passed: all three statuses fit one page; long notes paginate.');
