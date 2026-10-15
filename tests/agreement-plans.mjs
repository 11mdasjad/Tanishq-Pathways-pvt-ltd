import assert from 'node:assert/strict';
import {agreementPlans,defaultAgreementPlans,resolveAgreementPlan} from '../lib/agreement-plans.ts';
const plans=defaultAgreementPlans();assert.equal(plans.length,39);assert.equal(new Set(plans.map(p=>p.id)).size,39);
for(const country of new Set(plans.map(p=>p.country))){const local=plans.filter(p=>p.country===country);assert.equal(local.length,country==='Canada'?7:['Germany','Australia'].includes(country)?6:5);assert.equal(new Set(local.map(p=>p.terms)).size,country==='Canada'?7:['Germany','Australia'].includes(country)?6:5);assert(local.every(p=>!p.approved&&p.terms.includes(country)));}
const lead={country:'Canada',visa:'Study Visa'},settings={agreementPlans:plans};
assert.throws(()=>resolveAgreementPlan(settings,lead,'canada-study','Canada'),/approve/);
plans.find(p=>p.id==='canada-study').approved=true;
assert.equal(resolveAgreementPlan(settings,lead,'canada-study','Canada').name,'Study assistance');
assert.throws(()=>resolveAgreementPlan(settings,lead,'canada-study','Australia'),/country/);
assert.throws(()=>resolveAgreementPlan(settings,lead,'australia-study','Canada'),/country/);
assert.throws(()=>resolveAgreementPlan(settings,lead,'canada-work','Canada'),/visa/);
assert.throws(()=>resolveAgreementPlan(settings,lead,'missing','Canada'),/valid/);
assert.equal(defaultAgreementPlans()[0].approved,false);
console.log('Agreement plans passed: 39 independent drafts, selection, country/visa matching and approval gates.');

assert.deepEqual(agreementPlans({agreementPlans:[]}),[], 'Deleting every plan must not restore defaults');
const remaining=plans.filter(p=>p.id!=='canada-study');
assert.throws(()=>resolveAgreementPlan({agreementPlans:remaining},lead,'canada-study','Canada'),/valid/);

const eep=plans.find(p=>p.id==='canada-express-entry-pnp');
assert.equal(eep.country,'Canada');
assert.equal(eep.visa,'Permanent Residency');
assert.equal(eep.approved,false);
for(const clause of ['Stage 1:', 'Stage 2:', 'Stage 3:', 'Retainer Advance:', 'Non-Refundable Retainer:', '7. GOVERNING LAW AND DISPUTE RESOLUTION']) assert(eep.terms.includes(clause));
assert(!eep.terms.includes('Pathwais'));
assert.throws(()=>resolveAgreementPlan(settings,{country:'Canada',visa:'Permanent Residency'},eep.id,'Canada'),/approve/);

for(const [id,country,visa,sections] of [['germany-work-pathways','Germany','Work Visa',7],['canada-rcip','Canada','Permanent Residency',8],['australia-skilled-pr','Australia','Permanent Residency',7]]){
 const plan=plans.find(p=>p.id===id);
 assert(plan);assert.equal(plan.country,country);assert.equal(plan.visa,visa);assert.equal(plan.approved,false);
 assert(plan.reviewNotes.length>0);
 for(let section=1;section<=sections;section++)assert(new RegExp('\\n'+section+'\\. ').test(plan.terms),`${id} section ${section}`);
 assert.throws(()=>resolveAgreementPlan(settings,{country,visa},id,country),/approve/);
}
const rcip=plans.find(p=>p.id==='canada-rcip');
assert(!rcip.terms.includes('State clearly whether'));
assert(rcip.reviewNotes.includes('State clearly whether'));
assert(rcip.terms.includes('100% Refund Guarantee'));
assert(rcip.terms.includes('Non-Refundable Retainer'));
assert(plans.find(p=>p.id==='germany-work-pathways').terms.includes('Milestone / Event | Amount (INR)'));
