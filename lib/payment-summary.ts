/** All amounts in this summary are integer paise. Pending/rejected entries never unlock an agreement. */
export function paymentSummary(lead: {payment_required?:number|null;profile:{fee?:number}},payments: {amount:number;status?:string}[]) {
 const fee=Math.round(Number(lead.profile.fee||0)*100);
 const required=lead.payment_required??fee;
 const verified=payments.filter(p=>p.status==='Verified').reduce((total,p)=>total+p.amount,0);
 const pending=payments.filter(p=>p.status==='Pending verification').reduce((total,p)=>total+p.amount,0);
 return {fee,required,verified,pending,remaining:Math.max(0,required-verified),balance:Math.max(0,fee-verified),ready:required>0&&verified>=required,custom:lead.payment_required!=null};
}
