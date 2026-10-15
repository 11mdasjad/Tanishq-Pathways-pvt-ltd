import assert from 'node:assert/strict';
import { checklistOverrides } from '../lib/checklist-overrides.ts';
assert.deepEqual(checklistOverrides([]), {});
assert.deepEqual(checklistOverrides([
  {country:'Canada',visa:'Study Visa',documents:' Passport \nPhotograph\nPassport\n'},
  {country:'Canada',visa:'',documents:'Passport'},
]), {'Canada/Study Visa':['Passport','Photograph'],Canada:['Passport']});
assert.throws(()=>checklistOverrides([{country:'',visa:'',documents:'Passport'}]),/select a country/);
assert.throws(()=>checklistOverrides([{country:'Canada',visa:'',documents:' \n'}]),/at least one document/);
assert.throws(()=>checklistOverrides([
  {country:'Canada',visa:'Study Visa',documents:'Passport'},
  {country:' Canada ',visa:'Study Visa',documents:'Photograph'},
]),/more than one checklist/);
assert.throws(()=>checklistOverrides([{country:'Canada',visa:'',documents:'a'.repeat(81)}]),/80 characters/);
console.log('Checklist tests passed: defaults, country and visa scopes, duplicates, empty rows and document limits.');
