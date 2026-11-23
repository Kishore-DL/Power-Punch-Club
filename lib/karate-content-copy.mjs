// Exact replacements preserve later Admin edits and all technical identifiers.
const replacements=new Map([
  ['Fictional local-preview karate championship with Kata and Kumite. No real payment or event booking.','Karate championship featuring Kata and Kumite.'],
  ['Vellore Indoor Sports Hall — preview venue.','Vellore Indoor Sports Hall'],
  ['Preview QR — do not pay. Use a fictional transaction reference or a test screenshot. No money is collected.','Enter a transaction reference or upload a payment screenshot for review.'],
  ['Fictional preview eligibility: participants under 18 on the event date. Select the matching age category and disclose your belt. Parent or guardian consent is required for minors.','Participants must be under 18 on the event date. Select the matching age category and disclose your belt. Parent or guardian consent is required for minors.'],
  ['Fictional local preview only. No real payment was collected.',''],
  ['Illustrative monthly fee','Monthly fee'],
  ['Preview Training Studio, Vellore — fictional location','Training Studio, Vellore'],
  ['Coach Arjun Preview — fictional instructor','Coach Arjun'],
]);
export function karateContentCopy(record){
  return Object.fromEntries(Object.entries(record).map(([key,value])=>{
    if(typeof value!=='string')return [key,value];
    if(replacements.has(value))return [key,replacements.get(value)];
    if(key==='description')value=value.replace(/ Fictional local-preview class\.$/,'');
    if(key==='rules')value=value.replace(/\n- This is a fictional preview\. Do not travel to the venue or make a payment\.$/,'');
    return [key,value];
  }));
}
