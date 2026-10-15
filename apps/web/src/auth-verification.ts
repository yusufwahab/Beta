import {z} from 'zod';

const pendingKey='beta.pending-email-verification';
export const pendingVerificationSchema=z.object({email:z.email(),retryAt:z.number().nonnegative()});
export type PendingVerification=z.infer<typeof pendingVerificationSchema>;

export function readPendingVerification():PendingVerification|null{
 try{
  const result=pendingVerificationSchema.safeParse(JSON.parse(sessionStorage.getItem(pendingKey)??'null'));
  return result.success?result.data:null;
 }catch{return null;}
}
export function rememberVerification(email:string,retryAt=0):PendingVerification{
 const pending={email,retryAt};
 try{sessionStorage.setItem(pendingKey,JSON.stringify(pending));}catch{/* Router state carries the email when storage is unavailable. */}
 return pending;
}
export function clearPendingVerification(){
 try{sessionStorage.removeItem(pendingKey);}catch{/* Nothing else is stored. */}
}
