import {useState} from 'react';
import type {ReactNode} from 'react';
import {useMe,useSession} from './session';
import {isVoiceLanguage,VoiceLanguageContext} from './voice-language';
import type {VoiceLanguage} from './voice-language';

// Profile is the durable default. A speaking-language override applies throughout
// the current session and cannot carry over to another signed-in account.
export function VoiceLanguageProvider({children}:{children:ReactNode}){
 const {session}=useSession();const me=useMe();const user=session?.user.id;
 const [selection,setSelection]=useState<{user:string|undefined;language:VoiceLanguage}>();
 const preferred=me.data?.profile?.preferred_language;
 const language=selection?.user===user&&selection?selection.language:isVoiceLanguage(preferred)?preferred:'en';
 const setLanguage=(value:string)=>{if(isVoiceLanguage(value))setSelection({user,language:value});};
 return <VoiceLanguageContext.Provider value={{language,setLanguage}}>{children}</VoiceLanguageContext.Provider>;
}
