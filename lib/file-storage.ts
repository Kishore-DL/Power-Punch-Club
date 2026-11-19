import { Binary } from 'mongodb';
import { database } from './mongodb';

const files=()=>database().collection<{
  _id:string; type:string; data:Binary; registrationToken?:string; created:Date;
}>('files');

export const fileStorage={
  async get(key:string) {
    const file=await files().findOne({_id:key});
    return file?{body:new Uint8Array(file.data.value()),httpMetadata:{contentType:file.type}}:null;
  },
  async head(key:string) {
    const file=await files().findOne({_id:key},{projection:{type:1,registrationToken:1}});
    return file?{httpMetadata:{contentType:file.type},customMetadata:{registrationToken:file.registrationToken}}:null;
  },
  async put(key:string,output:ArrayBuffer|Blob,options:{httpMetadata:{contentType:string};customMetadata?:{registrationToken:string}}) {
    const data=output instanceof Blob?await output.arrayBuffer():output;
    if(data.byteLength>8*1024*1024)throw new Error('Upload exceeds the 8 MB limit');
    await files().insertOne({_id:key,type:options.httpMetadata.contentType,data:new Binary(new Uint8Array(data)),
      registrationToken:options.customMetadata?.registrationToken,created:new Date()});
  },
};
