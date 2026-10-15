import {useEffect} from 'react';
import {useSession} from './session';
import {useVoiceLanguage} from './voice-language';
import {configureValidation,startValidationSession,flushValidation,finishValidationSession,validationHeartbeat} from './validation';
export default function ValidationTracker(){const {session}=useSession();const {language}=useVoiceLanguage();
 useEffect(()=>{const tracked=session?.user.app_metadata?.beta_validation_admin!==true;configureValidation(tracked?session?.user.id??null:null,tracked?session?.access_token??'':'',language);if(session&&tracked)void startValidationSession();},[session,language]);
 useEffect(()=>{if(!session)return;const hide=()=>{if(document.visibilityState==='hidden')finishValidationSession();else{void startValidationSession();void flushValidation();}};const close=()=>finishValidationSession();document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',close);const heartbeat=setInterval(validationHeartbeat,60000);return()=>{clearInterval(heartbeat);document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',close);};},[session]);return null;}
