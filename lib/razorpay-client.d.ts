export {};
declare global {
  interface Window {
    Razorpay?:new(options:{key:string;amount:number;currency:string;order_id:string;name:string;description:string;prefill:{name:string;email:string;contact:string};theme:{color:string};handler:(result:{razorpay_order_id:string;razorpay_payment_id:string;razorpay_signature:string})=>Promise<void>;modal:{ondismiss:()=>void}})=>{on:(event:string,callback:()=>void)=>void;open:()=>void};
  }
}
