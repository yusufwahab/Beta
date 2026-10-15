import {z} from 'zod';
import {money,saleSchema} from '@beta/shared';
const positiveMoney=money.refine(value=>/[1-9]/.test(value),'Amount must be greater than zero');
const key={idempotency_key:z.uuid()};
const text=z.string().trim().min(1).max(200);
export function validateVoiceAction(path:string,body:unknown){
 switch(path){
  case '/sales':return saleSchema.parse(body);
  case '/expenses':return z.object({...key,amount:positiveMoney,category:text,description:text,occurred_on:z.iso.date()}).parse(body);
  case '/debts':return z.object({...key,amount:positiveMoney,customer_id:z.uuid(),description:text}).parse(body);
  case '/products/:id/stock':return z.object({...key,quantity:z.number().int().positive().max(1000000),reason:text}).parse(body);
  case '/debts/:id/repayments':return z.object({...key,amount:positiveMoney}).parse(body);
  default:throw new Error('Unsupported voice financial action');
 }
}
