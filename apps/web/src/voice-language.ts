import {createContext,useContext} from 'react';
import {languages} from '@beta/shared';

export type VoiceLanguage=typeof languages[number];
export const isVoiceLanguage=(value:unknown):value is VoiceLanguage=>languages.some(language=>language===value);
export const VoiceLanguageContext=createContext<{language:VoiceLanguage;setLanguage:(value:string)=>void}|null>(null);
export function useVoiceLanguage(){const value=useContext(VoiceLanguageContext);if(!value)throw new Error('VoiceLanguageProvider is required');return value;}
