import type {ValidationWorkflow} from '@beta/shared';
export type ValidationContext={id:string;workflow:ValidationWorkflow;retry_count:number;submissions:number;submitted:boolean;edited:Set<string>};
const blobs=new WeakMap<Blob,ValidationContext>();const forms=new WeakMap<FormData,ValidationContext>();const latest=new Map<ValidationWorkflow,ValidationContext>();
export function currentWorkflow():ValidationWorkflow{const path=window.location.pathname;if(path==='/start'||path==='/onboarding')return 'onboarding';if(path.includes('/checkout'))return 'sale';if(path.includes('/expenses'))return 'expense';if(path.includes('/inventory'))return 'stock';if(path.includes('/debts'))return 'debt';if(path.includes('/settings'))return 'profile';if(path.includes('/ajo'))return 'ajo';if(path.includes('/passport')||path.includes('/sales'))return 'business_summary';return 'assistant';}
export function newValidationContext(workflow=currentWorkflow()){const context:ValidationContext={id:crypto.randomUUID(),workflow,retry_count:0,submissions:0,submitted:false,edited:new Set()};latest.set(workflow,context);return context;}
export const latestValidationContext=()=>latest.get(currentWorkflow());
export const tagRecording=(blob:Blob,context:ValidationContext)=>blobs.set(blob,context);
export function audioValidationContext(form:FormData,blob:Blob){const context=blobs.get(blob)??newValidationContext();blobs.set(blob,context);if(context.submissions++)context.retry_count++;forms.set(form,context);return context;}
export function validationHeaders(body?:unknown):Record<string,string>{const context=body instanceof FormData?forms.get(body):latestValidationContext();return context?{'X-Beta-Interaction-Id':context.id,'X-Beta-Workflow':context.workflow,'X-Beta-Retry-Count':String(context.retry_count)}:{};}
export function clearValidationContexts(){latest.clear();}
