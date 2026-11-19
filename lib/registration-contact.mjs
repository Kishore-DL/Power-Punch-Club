export function normaliseIndianMobile(value){
  if(typeof value!=='string')return '';
  const raw=value.trim();
  if(/^[0-9]{10}$/.test(raw))return raw;
  if(/^\+91[ -]?[0-9]{5}[ -]?[0-9]{5}$/.test(raw))return raw.replace(/[^0-9]/g,'').slice(2);
  return '';
}
export const indianMobileInternational=value=>{const local=normaliseIndianMobile(value);return local?'+91'+local:value;};
export const normaliseRegistrationEmail=value=>typeof value==='string'?value.trim():'';
export function validRegistrationEmail(value){
  const email=normaliseRegistrationEmail(value);
  return email.length<=254&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}
export function registrationContactError(contact){
  if(typeof contact.name!=='string'||!contact.name.trim()||contact.name.trim().length>120)return 'Enter a participant / contact name (up to 120 characters).';
  if(typeof contact.email!=='string'||!validRegistrationEmail(contact.email))return 'Enter a valid email address, for example name@example.com.';
  if(!normaliseIndianMobile(contact.phone))return 'Enter a valid phone number: exactly 10 digits after +91.';
  return '';
}
