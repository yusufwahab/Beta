import * as Sentry from '@sentry/node';
if(process.env.SENTRY_DSN)Sentry.init({dsn:process.env.SENTRY_DSN,defaultIntegrations:false,beforeSend(event){return {type:event.type,event_id:event.event_id,timestamp:event.timestamp,level:'error',message:'Beta operation failed',tags:{operation:String(event.tags?.operation??'server')}};}});
export function reportFailure(operation:string){if(process.env.SENTRY_DSN)Sentry.captureMessage('Beta operation failed',{level:'error',tags:{operation}});}
