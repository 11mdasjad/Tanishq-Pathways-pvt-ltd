import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {fontBase64} from './pdf-font';
import {boldFontBase64} from './pdf-bold-font';

export async function makePaymentReceipt(payment:any,snapshot:any,reviewerName:string){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 const font=await pdf.embedFont(decode(fontBase64),{subset:true}),bold=await pdf.embedFont(decode(boldFontBase64),{subset:true});
 const navy=rgb(.06,.19,.27),gray=rgb(.35,.42,.47),gold=rgb(.70,.48,.20),pale=rgb(.95,.97,.98);
 const W=595.28,H=841.89,M=42,width=W-2*M;
 let page=pdf.addPage([W,H]),y=0;
 const receipt=payment.receipt_number||`LEGACY-${payment.id}`;
 const draw=(value:string,x:number,top:number,size=10,heavy=false,color=navy)=>page.drawText(value,{x,y:H-top-size,font:heavy?bold:font,size,color});
 const wrap=(value:any,w:number,size=10,heavy=false)=>{
  const face=heavy?bold:font,lines:string[]=[];
  for(const paragraph of String(value??'').replace(/\r/g,'').split('\n')){
   let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){
    if(face.widthOfTextAtSize(line?line+' '+word:word,size)<=w){line=line?line+' '+word:word;continue;}
    if(line)lines.push(line);line='';
    for(const ch of word){if(face.widthOfTextAtSize(line+ch,size)>w){lines.push(line);line='';}line+=ch;}
   }lines.push(line);
  }return lines;
 };
 const header=()=>{page.drawRectangle({x:0,y:H-12,width:W,height:12,color:navy});y=36;for(const line of wrap(snapshot.company.name,width,18,true)){draw(line,M,y,18,true);y+=23;}draw('PAYMENT RECEIPT',M,y+9,15,true);draw(payment.status.toUpperCase(),M,y+34,10,true,payment.status==='Verified'?rgb(.12,.43,.30):gold);y+=60;};
 const ensure=(height:number)=>{if(y+height>765){page=pdf.addPage([W,H]);header();}};
 const block=(value:any,size=10,color=gray)=>{for(const line of wrap(value,width,size)){ensure(size+5);draw(line,M,y,size,false,color);y+=size+5;}};
 const row=(label:string,value:any)=>{const lines=wrap(value||'—',width-135,10);for(let i=0;i<lines.length;i++){ensure(16);if(i===0)draw(label,M,y,9,true,gray);draw(lines[i],M+135,y,10);y+=16;}y+=3;};
 const section=(title:string)=>{ensure(46);y+=12;page.drawRectangle({x:M,y:H-y-25,width,height:25,color:pale});draw(title,M+10,y+6,10,true);y+=38;};
 const date=(value:string)=>value?new Date(value.length===10?value+'T12:00:00+05:30':value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',year:'numeric',month:'short',day:'2-digit',...(value.length===10?{}:{hour:'2-digit',minute:'2-digit'})}):'Not reviewed';
 header();if(snapshot.company.address)block(snapshot.company.address);const contact=[snapshot.company.email,snapshot.company.phone].filter(Boolean).join(' | ');if(contact)block(contact);y+=8;
 row('Receipt number',receipt);row('Payment date',date(payment.paid_on||payment.created_at));row('Recorded on',date(payment.created_at));
 ensure(72);page.drawRectangle({x:M,y:H-y-62,width,height:62,color:navy});draw('AMOUNT RECORDED',M+16,y+10,9,true,rgb(1,1,1));draw(`INR ${(payment.amount/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`,M+16,y+28,20,true,rgb(1,1,1));y+=78;
 section('APPLICANT & PAYMENT');
 for(const [label,value] of [['Applicant',snapshot.applicant.name],['Applicant ID',snapshot.applicant.id],['Paid by',payment.payer_name||snapshot.applicant.name],['Contact',snapshot.applicant.mobile],['Service',snapshot.applicant.service],['Destination / visa',[snapshot.applicant.country,snapshot.applicant.visa].filter(Boolean).join(' / ')],['Payment method',payment.method],['Transaction reference',payment.reference],['Recorded by',snapshot.recordedBy],['Payment notes',payment.notes]])row(label,value);
 section('VERIFICATION');row('Status',payment.status);row('Reviewed by',reviewerName);row('Reviewed on',date(payment.verified_at));row('Review notes',payment.verification_notes);
 y+=8;block(payment.status==='Verified'?'Payment has been verified by the administrator against the recorded transaction details.':payment.status==='Rejected'?'This payment record was rejected. It does not count towards the required payment for an agreement.':'This receipt acknowledges a recorded payment only. Funds have not yet been verified by the administrator.');
 y+=8;block('This is a payment receipt, not an agreement or a tax invoice. Agreement generation requires the configured payment amount and applicant verification. No applicant signature is implied.',9);
 const pages=pdf.getPages();pages.forEach((p,i)=>{page=p;draw(`Payment receipt | Page ${i+1} of ${pages.length}`,M,799,8,false,gray);draw('Tanishka Pathways CRM',W-161,799,8,false,gray);});
 pdf.setTitle(`Payment receipt - ${receipt}`);pdf.setAuthor(snapshot.company.name);pdf.setCreationDate(new Date(payment.created_at));
 return pdf.save();
}
