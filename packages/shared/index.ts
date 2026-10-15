import { z } from 'zod';
export const languages = ['en','yo','ha','ig'] as const;
export const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter a positive amount with at most two decimal places');
export const saleSchema = z.object({items:z.array(z.object({product_id:z.uuid(),quantity:z.number().int().min(1).max(100000),unit_price:money})).min(1).max(50),payment_status:z.enum(['paid','unpaid','partial','unknown']),paid_amount:money.optional(),customer_id:z.uuid().optional(),source:z.enum(['manual','voice']),voice_interaction_id:z.uuid().optional(),idempotency_key:z.uuid()}).superRefine((v,c)=>{if(v.source==='voice'&&!v.voice_interaction_id)c.addIssue({code:'custom',message:'Voice sale requires a recorded interaction',path:['voice_interaction_id']});if(v.payment_status==='partial'&&!v.paid_amount)c.addIssue({code:'custom',message:'Enter the amount paid',path:['paid_amount']});if(['unpaid','partial'].includes(v.payment_status)&&!v.customer_id)c.addIssue({code:'custom',message:'Select a customer for credit sales',path:['customer_id']});});
export const intentSchema = z.object({intent:z.literal('record_sale'),items:z.array(z.object({product_name:z.string().min(1),quantity:z.number().int().positive().nullable(),unit_price:money.nullable()})).min(1).max(50),payment_status:z.enum(['paid','unpaid','partial','unknown']),clarification:z.string().optional()});
export type SaleInput=z.infer<typeof saleSchema>;
export type SaleIntent=z.infer<typeof intentSchema>;
export type Product={id:string;name:string;category:string;selling_price:string;cost_price:string|null;stock_quantity:number;low_stock_threshold:number;archived:boolean};

export * from "./voice.js";
