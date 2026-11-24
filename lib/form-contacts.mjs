import {registrationContactError,normaliseRegistrationEmail,normaliseIndianMobile,validRegistrationEmail} from './registration-contact.mjs';

const types={name:'text',email:'email',phone:'tel'};
export function formContactConfigurationError(fields){
 const ids=new Set(),roles=new Set();
 for(const field of fields){
  if(!field||typeof field.id!=='string'||!field.id||ids.has(field.id))return 'Every form question needs a unique ID.';
  ids.add(field.id);
  if(!field.contactRole)continue;
  if(!Object.hasOwn(types,field.contactRole)||types[field.contactRole]!==field.type)return 'Choose a compatible contact mapping for '+field.label+'.';
  if(roles.has(field.contactRole))return 'Use only one question for each contact mapping.';
  roles.add(field.contactRole);
 }
 return '';
}

// Stored definitions, never labels or client flags, determine contact mappings.
// Legacy API clients retain their existing validation, while new forms submit
// only answers. Configured required questions are still validated by the API.
export function formContacts(fields,answers,input={},options={}){
 const configuration=formContactConfigurationError(fields);if(configuration)throw Error(configuration);
 const legacy=['name','email','phone'].some(key=>Object.hasOwn(input,key));
 const contact={name:'',email:'',phone:''};
 if(legacy){
  const error=registrationContactError({...input,email:input.email===undefined&&options.emailOptional?'':input.email},options);if(error)throw Error(error);
  contact.name=input.name.trim();contact.email=normaliseRegistrationEmail(input.email).toLowerCase();contact.phone=normaliseIndianMobile(input.phone);
 }
 for(const field of fields){
  if(!field.contactRole)continue;
  const raw=answers[field.id];
  if(raw!==undefined&&raw!==null&&typeof raw!=='string')throw Error('Enter a valid answer for '+field.label+'.');
  const value=typeof raw==='string'?raw.trim():'';
  if(!value){if(field.required)throw Error('Complete '+field.label);contact[field.contactRole]='';continue;}
  if(field.contactRole==='name'&&value.length>120)throw Error('Enter '+field.label+' using at most 120 characters.');
  if(field.contactRole==='email'&&!validRegistrationEmail(value))throw Error('Enter a valid email for '+field.label+'.');
  if(field.contactRole==='phone'&&!normaliseIndianMobile(value))throw Error('Enter exactly 10 digits for '+field.label+'.');
  contact[field.contactRole]=field.contactRole==='phone'?normaliseIndianMobile(value):field.contactRole==='email'?normaliseRegistrationEmail(value).toLowerCase():value;
 }
 return contact;
}

export function documentContactVisible(data,role){
 return !Object.entries(data?.receiptFields||{}).some(([id,field])=>field?.contactRole===role&&
  (field.showOnReceipt===false||field.type==='masked_aadhaar'||/aadhaar|aadhar|tracking|token|password|secret|credential|admin.?notes/i.test(id+' '+field.label)));
}
