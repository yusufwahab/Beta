import * as Sentry from '@sentry/react';
if(import.meta.env.VITE_SENTRY_DSN)Sentry.init({dsn:import.meta.env.VITE_SENTRY_DSN,defaultIntegrations:false,beforeSend(event){return {type:event.type,event_id:event.event_id,timestamp:event.timestamp,level:'error',message:'Beta operation failed',tags:{operation:String(event.tags?.operation??'frontend')}};}});
export function reportFailure(operation:string){if(import.meta.env.VITE_SENTRY_DSN)Sentry.captureMessage('Beta operation failed',{level:'error',tags:{operation}});}
