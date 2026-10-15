export const validationEvents=['VOICE_STARTED','VOICE_PAUSED','VOICE_RESUMED','VOICE_CANCELLED','VOICE_SUBMITTED','NATLAS_PROCESSING_STARTED','NATLAS_SUCCESS','NATLAS_FAILED','TRANSCRIPT_RETRY','TRANSCRIPT_EDITED','RESULT_CONFIRMED','TRANSACTION_SAVED','FLOW_COMPLETED'] as const;
export const validationClientEvents=['VOICE_STARTED','VOICE_PAUSED','VOICE_RESUMED','VOICE_CANCELLED','VOICE_SUBMITTED','TRANSCRIPT_RETRY','TRANSCRIPT_EDITED','RESULT_CONFIRMED'] as const;
export const validationWorkflows=['onboarding','sale','expense','stock','debt','business_summary','profile','customer','ajo','assistant','other'] as const;
export const validationFields=['name','trader_name','business','category','location','product','product_id','quantity','unit_price','selling_price','cost_price','stock_quantity','low_stock_threshold','amount','paid_amount','payment_status','customer','customer_id','phone','description','reason','occurred_on','transcript','preferred_language','other'] as const;
export type ValidationWorkflow=typeof validationWorkflows[number];
export type ValidationEvent=typeof validationEvents[number];
