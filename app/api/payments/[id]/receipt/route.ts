import {actor,one,leadFor,config,audit,errorResponse} from '../../../../../lib/crm';
import {makePaymentReceipt} from '../../../../../lib/payment-receipt';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const user=await actor();const {id}=await params;
  const payment=await one('SELECT p.*,u.name AS reviewer_name,c.name AS creator_name FROM payments p LEFT JOIN users u ON u.id=p.verified_by JOIN users c ON c.id=p.created_by WHERE p.id=?',id);
  if(!payment)return new Response('Payment not found',{status:404});
  const lead=await leadFor(user,payment.lead_id);
  let snapshot=JSON.parse(payment.receipt_snapshot||'{}');
  if(!snapshot.company){const s=await config();snapshot={company:{name:s.companyName,address:s.address,email:s.email,phone:s.phone},applicant:{...lead,service:lead.profile.service},recordedBy:payment.creator_name};}
  const bytes=await makePaymentReceipt(payment,snapshot,payment.reviewer_name||'Not reviewed');
  const download=new URL(request.url).searchParams.has('download');
  await audit(user,lead.id,download?'Payment receipt downloaded':'Payment receipt previewed',payment.receipt_number||payment.id).run();
  return new Response(new Uint8Array(bytes).buffer,{headers:{'Content-Type':'application/pdf','Content-Disposition':`${download?'attachment':'inline'}; filename="Payment_Receipt_${payment.id.replace(/[^a-zA-Z0-9-]/g,'')}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }catch(error){return errorResponse(error);}
}
