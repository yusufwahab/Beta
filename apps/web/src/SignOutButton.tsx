import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {LogOut} from 'lucide-react';
import {supabase} from './lib';
import {stopAudio} from './audio';
import {finishValidationSession} from './validation';

export default function SignOutButton({className='btn-secondary',label='Sign out'}:{className?:string;label?:string}){
 const client=useQueryClient();const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function signOut(){setBusy(true);setError('');try{stopAudio();finishValidationSession();if(supabase){const result=await supabase.auth.signOut({scope:'local'});if(result.error)throw result.error;}client.clear();window.location.replace('/');}catch{setError('Could not sign out. Please retry.');setBusy(false);}}
 return <><button type="button" className={className} disabled={busy} onClick={()=>void signOut()}><LogOut size={18}/>{busy?'Signing out…':label}</button>{error&&<p role="alert">{error}</p>}</>;
}
