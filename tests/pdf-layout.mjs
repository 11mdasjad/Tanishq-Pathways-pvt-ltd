import ts from 'typescript';import {readFileSync,writeFileSync} from 'node:fs';import {PDFDocument,rgb,degrees} from 'pdf-lib';import fontkit from '@pdf-lib/fontkit';import {fontBase64} from '../lib/pdf-font.ts';import {boldFontBase64} from '../lib/pdf-bold-font.ts';
const source=readFileSync('lib/pdf.ts','utf8').replace(/^import .*;$/gm,'').replace('export async function','async function');
const code=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext});
const blank=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const logo=blank;
const make=new Function('PDFDocument','rgb','degrees','fontkit','fontBase64','boldFontBase64','bucket','one','fail',code+';return makeAgreement;')(PDFDocument,rgb,degrees,fontkit,fontBase64,boldFontBase64,()=>({get:async id=>({arrayBuffer:async()=>new Uint8Array(id==='logo'?logo:blank).buffer})}),async(_,id)=>({mime:'image/png',object_key:id}),message=>{throw Error(message)});

import assert from 'node:assert/strict';
const snapshot={agreementId:'TEST-PREVIEW-001',version:1,date:new Date().toISOString(),lead:{id:'TEST-001',name:'Sample Applicant',mobile:'0000000000',email:'sample@example.invalid',country:'Canada',visa:'Work Visa',profile:{dob:'1998-06-15',nationality:'Indian',passport:'SAMPLE ONLY',address:'Sample address for layout testing',service:'Visa consultation',fee:25000}},settings:{companyName:'Tanishka Pathways Pvt Ltd',email:'sample@example.invalid',phone:'0000000000',address:'SAMPLE PREVIEW — NOT AN EXECUTABLE AGREEMENT',logoId:'logo',signatureId:'blank',signatory:'SAMPLE — UNSIGNED',designation:'Preview only',templateTitle:'Visa Consultancy Service Agreement',terms:Array.from({length:7},(_,i)=>`${i+1}. Sample clause for layout review. Not approved company terms.`).join('\n\n')}};

const short=await make(snapshot);assert.equal((await PDFDocument.load(short)).getPageCount(),1);
const longSnapshot=structuredClone(snapshot);longSnapshot.settings.terms=Array.from({length:80},(_,i)=>`CLAUSE_${i+1}_MARKER Sample approved text placeholder for pagination testing. `+'Long text for testing. '.repeat(8)).join('\n\n');
const long=await make(longSnapshot);assert((await PDFDocument.load(long)).getPageCount()>3);writeFileSync('/tmp/tanishka-layout-long.pdf',long);
const wide=structuredClone(snapshot);wide.lead.profile.address='ADDRESS_MARKER '+('Long applicant address '.repeat(35));wide.settings.address='COMPANY_ADDRESS_MARKER '+('Registered address '.repeat(45));wide.settings.signatory='A long authorized company signatory name '.repeat(3);wide.settings.designation='Company authorized representative and operations director';
const extended=await make(wide);assert((await PDFDocument.load(extended)).getPageCount()>1);writeFileSync('/tmp/tanishka-layout-fields.pdf',extended);
console.log('PDF layout checks passed: one-page short terms, 80-clause pagination and long variable fields.');
