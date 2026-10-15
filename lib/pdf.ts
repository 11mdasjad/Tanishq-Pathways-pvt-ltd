import { PDFDocument,rgb,degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { fontBase64 } from './pdf-font';
import { boldFontBase64 } from './pdf-bold-font';
import { bucket,one,fail } from './crm';

/** Reference-inspired stationery. Only saved company terms become contractual content. */
export async function makeAgreement(snapshot:any){
 const {lead:l,settings:s,agreementId,version,date}=snapshot;
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 const font=await pdf.embedFont(decode(fontBase64),{subset:true});
 const bold=await pdf.embedFont(decode(boldFontBase64),{subset:true});
 const W=595.28,H=841.89,M=24,CW=265,GAP=17,R=M+CW+GAP,BOTTOM=774;
 const navy=rgb(.025,.13,.28),orange=rgb(1,.39,.045),blue=rgb(.12,.39,.68),pale=rgb(.89,.94,.98),light=rgb(.965,.98,.993),gray=rgb(.34,.40,.47),border=rgb(.81,.86,.90),white=rgb(1,1,1);
 let page:any;
 const fmtDate=new Date(date).toLocaleDateString('en-GB',{timeZone:'Asia/Kolkata'});
 pdf.setTitle(`${s.templateTitle} · ${agreementId}`);pdf.setAuthor(s.companyName);pdf.setProducer('Tanishka Pathways Agreement Management');pdf.setCreationDate(new Date(date));
 const asset=async(fileId:string)=>{const f=await one('SELECT * FROM files WHERE id=?',fileId);if(!f)fail('A required company asset is missing.');const obj=await bucket().get(f.object_key);if(!obj)fail('A required company asset is unavailable.');const bytes=await obj.arrayBuffer();return f.mime==='image/png'?pdf.embedPng(bytes):pdf.embedJpg(bytes);};
 const logo=await asset(s.logoId),signature=await asset(s.signatureId);
 const rect=(x:number,top:number,w:number,h:number,color=white,stroke?:any)=>page.drawRectangle({x,y:H-top-h,width:w,height:h,color,borderColor:stroke,borderWidth:stroke?.6:0});
 const text=(v:any,x:number,top:number,size=9,color=navy,heavy=false)=>page.drawText(String(v),{x,y:H-top-size,size,font:heavy?bold:font,color});
 const line=(x:number,top:number,x2:number,top2:number,color=border,thickness=.6)=>page.drawLine({start:{x,y:H-top},end:{x:x2,y:H-top2},color,thickness});
 const wrap=(value:any,width:number,size=9,heavy=false)=>{const face=heavy?bold:font;const result:string[]=[];for(const paragraph of String(value??'').split('\n')){let current='';for(const word of paragraph.split(/\s+/).filter(Boolean)){if(face.widthOfTextAtSize(current?current+' '+word:word,size)<=width){current=current?current+' '+word:word;continue;}if(current){result.push(current);current='';}for(const ch of word){if(face.widthOfTextAtSize(current+ch,size)>width){result.push(current);current='';}current+=ch;}}result.push(current);}return result;};
 const block=(value:any,x:number,top:number,width:number,size=9,color=navy,heavy=false)=>{const lines=wrap(value,width,size,heavy);lines.forEach((v,i)=>text(v,x,top+i*(size+3),size,color,heavy));return top+lines.length*(size+3);};
 const section=(n:number,title:string,x:number,top:number,width=CW)=>{rect(x,top,width,23,pale);rect(x,top,25,23,navy);text(n,x+8,top+3,12,white,true);text(title,x+35,top+5,10,navy,true);return top+31;};
 const skyline=(x:number,top:number,width:number,height:number)=>{for(let i=0;i<18;i++){const bw=width/20;const bh=height*(.24+((i*7)%11)/15);const bx=x+i*width/18;rect(bx,top+height-bh,bw,bh,rgb(.66,.79,.87));if(i%4===0)line(bx+bw/2,top+height-bh-10,bx+bw/2,top+height-bh,blue,.6);for(let j=0;j<3;j++)line(bx+3,top+height-bh+5+j*7,bx+bw-3,top+height-bh+5+j*7,white,.4);}};
 const image=(img:any,x:number,top:number,w:number,h:number)=>{const fit=img.scaleToFit(w,h);page.drawImage(img,{x:x+(w-fit.width)/2,y:H-top-fit.height,width:fit.width,height:fit.height});};
 const addPage=(first=false)=>{page=pdf.addPage([W,H]);if(first){
  rect(192,0,403,112,pale);skyline(208,66,250,46);
  // A vector globe and aircraft keep the travel masthead sharp at any print size.
  page.drawCircle({x:339,y:H-58,size:44,color:light,borderColor:border,borderWidth:.7});
  page.drawEllipse({x:339,y:H-58,xScale:22,yScale:44,borderColor:border,borderWidth:.7});line(296,58,382,58,border);line(304,35,374,35,border);line(304,81,374,81,border);
  page.drawSvgPath('M 0 22 L 58 20 L 92 0 L 103 0 L 80 20 L 133 22 L 145 13 L 153 13 L 145 27 L 153 40 L 145 40 L 133 31 L 80 33 L 103 53 L 92 53 L 58 33 L 0 31 Z',{x:294,y:H-37,scale:.65,color:navy,rotate:degrees(8)});
  rect(449,0,147,112,navy);rect(444,0,5,112,orange);image(logo,24,5,148,101);
  text('Your global journey.',209,16,11,navy,true);text('Our priority.',209,33,12,orange,true);
  ['Study abroad','Work visa','Tourist visa','PR & immigration','Travel assistance'].forEach((v,i)=>{page.drawCircle({x:462,y:H-22-i*19,size:2,color:orange});text(v,473,16+i*19,8.5,white);});
  rect(0,111,W,3,orange);
 }else{image(logo,M,14,64,45);text(s.companyName,102,20,Math.min(11,460/bold.widthOfTextAtSize(s.companyName,1)),navy,true);text('VISA CONSULTANCY • AGREEMENT CONTINUED',102,39,8,gray);rect(M,67,W-M*2,2,orange);}
 // Underlay remains visible without obscuring signatures or body copy.
 page.drawText(s.companyName.toUpperCase(),{x:80,y:250,size:Math.min(34,460/bold.widthOfTextAtSize(s.companyName.toUpperCase(),1)),font:bold,color:navy,rotate:degrees(38),opacity:.10});
 };
 addPage(true);
 let y=126;
 if(s.templateTitle.toLowerCase()==='visa consultancy service agreement'){
  text('VISA CONSULTANCY',M,y,23,navy,true);text('SERVICE',M,y+29,26,navy,true);text('AGREEMENT',M+119,y+29,26,orange,true);y+=65;
 }else y=block(s.templateTitle.toUpperCase(),M,y,W-M*2,22,navy,true)+7;
 y=block(`Reference: ${agreementId}   |   Version: ${version}   |   Date: ${fmtDate}`,M,y,W-M*2,8,gray)+13;
 // Each first-row column grows with its content; overflow is never clipped.
 const partyLines=[['SERVICE PROVIDER',true],[s.companyName,true],[`Registered address: ${s.address}`,false],[`Email: ${s.email}`,false],[`Phone: ${s.phone}`,false],...(s.website?[[`Website: ${s.website}`,false]]:[]),['',false],['APPLICANT / CLIENT',true],[l.name,false],[`Contact: ${l.mobile}`,false],...(l.email?[[`Email: ${l.email}`,false]]:[])];
 let left=section(1,'PARTIES',M,y);
 const drawFlow=(value:any,x:number,top:number,width:number,size=9,heavy=false)=>{for(const v of wrap(value,width,size,heavy)){if(top+size+3>BOTTOM){addPage();top=87;}text(v,x,top,size,navy,heavy);top+=size+3;}return top;};
 left=drawFlow(`Service agreement prepared on ${fmtDate} between:`,M+2,left,CW-4,9)+8;
 for(const [v,heavy] of partyLines)left=drawFlow(v,M+2,left,CW-4,9,Boolean(heavy))+1;
 // Very long company details receive their own continuation; keep the table intact.
 if(left>740||pdf.getPageCount()>1){addPage();y=87;}
 let right=section(2,'APPLICANT & SERVICE DETAILS',R,y);
 const details=[['Full legal name',l.name],['Prospect reference',l.id],['Date of birth',l.profile.dob],['Nationality',l.profile.nationality],['Passport number',l.profile.passport],['Residential address',l.profile.address],['Contact',`${l.mobile}${l.email?' | '+l.email:''}`],['Destination',l.country],['Visa category',l.visa],['Service package',l.profile.service],['Professional fee',`INR ${Number(l.profile.fee||0).toLocaleString('en-IN')}`]];
 for(const [label,value] of details){const lines=wrap(value||'Not provided',CW-110,8.5);for(let i=0;i<lines.length;i++){if(right+15>BOTTOM){addPage();right=section(2,'APPLICANT DETAILS · CONTINUED',R,87);}rect(R,right,102,14,pale);rect(R+102,right,CW-102,14,light);if(i===0)text(label,R+6,right+2,7.8,gray);text(lines[i],R+108,right+2,8.5,navy,label==='Professional fee');right+=14;}line(R,right,R+CW,right,white,1);}
 y=Math.max(left,right)+15;if(y+175>BOTTOM){addPage();y=87;}
 const scopeTop=section(3,'SCOPE OF SERVICES',M,y);let scope=block(l.profile.service||'Service package not specified',M+10,scopeTop+5,CW-20,10,navy,true);scope=drawFlow(`Destination: ${l.country}\nVisa category: ${l.visa}\nService obligations are set out in the approved terms below.`,M+10,scope+8,CW-20,9);
 const feeTop=section(4,'PAYMENT DETAILS',R,y);rect(R,feeTop,CW,48,light);rect(R,feeTop,5,48,orange);text('PROFESSIONAL FEE',R+14,feeTop+7,8,gray,true);text(`INR ${Number(l.profile.fee||0).toLocaleString('en-IN')}`,R+14,feeTop+20,18,orange,true);const feeEnd=block(snapshot.payment?`Verified payment: INR ${(snapshot.payment.verified/100).toLocaleString('en-IN')}\nRequired before agreement: INR ${(snapshot.payment.required/100).toLocaleString('en-IN')}\nRemaining professional fee: INR ${(snapshot.payment.balance/100).toLocaleString('en-IN')}\nPayment and refund conditions follow the approved terms below.`:'Payment, additional charges and refund conditions follow the approved terms below.',R+2,feeTop+57,CW-4,8.5,gray);
 y=Math.max(scope,feeEnd)+10;
 // Short terms and signatures sit side by side, like the supplied reference.
 const termsLines=wrap(s.terms,CW-12,8.5);const termsHeight=31+termsLines.reduce((total,v)=>total+(v?11.5:5),0);
 const signNameLines=Math.max(wrap(s.signatory,113,8).length+wrap(s.designation,113,7.5).length,wrap(l.name,113,8).length);
 const signatureHeight=31+wrap('The applicant signs after reviewing this agreement and its approved terms.',CW-4,8.5).length*11.5+8+118+signNameLines*11;
 const signatureBlock=(top:number)=>{let sy=section(6,'ACCEPTANCE & SIGNATURES',R,top);sy=block('The applicant signs after reviewing this agreement and its approved terms.',R+2,sy,CW-4,8.5)+8;const boxTop=sy,boxH=118+signNameLines*11;for(const x of [R,R+137])rect(x,boxTop,128,boxH,white,border);text('For the company',R+8,boxTop+8,8,navy,true);text('Applicant / Client',R+145,boxTop+8,8,navy,true);image(signature,R+9,boxTop+27,109,38);line(R+10,boxTop+73,R+118,boxTop+73,gray);line(R+147,boxTop+73,R+255,boxTop+73,gray);let by=block(s.signatory,R+8,boxTop+80,113,8,navy,true);by=block(s.designation,R+8,by+3,113,7.5,gray);block(`Prepared: ${fmtDate}`,R+8,by+6,113,7,gray);let ay=block(l.name,R+145,boxTop+80,113,8,navy,true);text('Date: ______________',R+145,ay+12,7.5,gray);};
 if(y+Math.max(termsHeight,signatureHeight)<=BOTTOM){let ty=section(5,'TERMS & CONDITIONS',M,y);termsLines.forEach(v=>{text(v,M+3,ty,8.5);ty+=v?11.5:5;});signatureBlock(y);}else if(Math.max(termsHeight,signatureHeight)<=BOTTOM-87){addPage();y=87;let ty=section(5,'TERMS & CONDITIONS',M,y);termsLines.forEach(v=>{text(v,M+3,ty,8.5);ty+=v?11.5:5;});signatureBlock(y);}else{
  if(y+70>BOTTOM){addPage();y=87;}y=section(5,'TERMS & CONDITIONS',M,y,W-M*2);
  for(const v of wrap(s.terms,W-M*2-8,9)){if(y+13>BOTTOM){addPage();y=section(5,'TERMS & CONDITIONS · CONTINUED',M,87,W-M*2);}text(v,M+3,y,9);y+=13;}
  y+=18;if(y+signatureHeight>BOTTOM){addPage();y=87;}signatureBlock(y);
 }
 const pages=pdf.getPages();pages.forEach((p,i)=>{page=p;skyline(0,779,320,24);rect(0,806,W,36,navy);rect(401,806,195,36,orange);text(s.companyName,M,812,Math.min(8,365/bold.widthOfTextAtSize(s.companyName,1)),white,true);text(`Page ${i+1} of ${pages.length}  •  ${agreementId}`,M,825,7,white);text('YOUR VISA. OUR PRIORITY.',414,818,8,white,true);text('CONFIDENTIAL • CLIENT COPY',W-180,790,7,gray);});
 return pdf.save();
}
