export type RegistrationCredentials = { id:string; token?:string };
export type SavedRegistration = RegistrationCredentials & { registrationNumber?:string; trackingCode?:string };
export type ParticipantRegistration = {
  id:string; registrationNumber:string; trackingCode:string; name:string; email:string; phone:string;
  created:string; status:string; paymentStatus:string; paymentMethod:string; amount:number;
  tournament:string; transactionReference?:string; reviewNote?:string; rejectionReason?:string;
  receiptAvailable:boolean;
  fields:{label:string;value:string}[];
  team:{name:string;age:number;belt:string}[];
  event?:{manualQrImage?:string;manualPayee?:string;manualUpiId?:string;manualInstructions?:string};
};
export const participantError=(error:unknown)=>error instanceof Error?error.message:'Unable to complete the request. Please retry.';
