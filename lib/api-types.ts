import type {AnswerValue,TeamMember} from './club-types';
export type RegistrationInput={id:string;token:string;kind:string;target?:string;name:string;email:string;phone:string;answers?:Record<string,AnswerValue>;team?:TeamMember[];message?:string;consent?:boolean;website?:string;manualProof?:{transactionId:string;screenshot:string};registrationChoice?:'free'|'paid'|'manual';expectedAmount?:number};
export type VerificationInput={id:string;token?:string;razorpay_order_id:string;razorpay_payment_id:string;razorpay_signature:string};
export type ProviderPayment={id:string;order_id:string;amount:number;currency:string;status:string};
export type ContentUpdate={key:string;value:Record<string,string>|Record<string,unknown>[]};
