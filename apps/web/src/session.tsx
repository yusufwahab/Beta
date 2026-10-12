import {createContext,useContext,useEffect,useState} from 'react';
import type {ReactNode} from 'react';
import type {Session} from '@supabase/supabase-js';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Navigate,Outlet,useLocation} from 'react-router-dom';
import {api,supabase} from './lib';
import {Loading,ErrorBox,Button,Logo} from './ui';
const SessionContext=createContext<{session:Session|null;ready:boolean}>({session:null,ready:false});
export function SessionProvider({children}:{children:ReactNode}){const [session,setSession]=useState<Session|null>(null);const [ready,setReady]=useState(false);const queryClient=useQueryClient();useEffect(()=>{if(!supabase){setReady(true);return;}supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)});const {data}=supabase.auth.onAuthStateChange((_event,value)=>{setSession(value);setReady(true);queryClient.clear()});return ()=>data.subscription.unsubscribe()},[queryClient]);return <SessionContext.Provider value={{session,ready}}>{children}</SessionContext.Provider>}
export const useSession=()=>useContext(SessionContext);
export function useMe(){const {session}=useSession();return useQuery({queryKey:['me',session?.user.id],queryFn:()=>api('/me'),enabled:!!session});}
export function Protected(){const {session,ready}=useSession();const me=useMe();const location=useLocation();if(!ready)return <Loading/>;if(!session)return <Navigate to="/auth" replace/>;if(me.isPending)return <Loading/>;if(me.error)return <div className="auth-shell"><Logo/><ErrorBox error={me.error}/><Button onClick={()=>me.refetch()}>Retry</Button><Button secondary onClick={()=>supabase?.auth.signOut()}>Sign out</Button></div>;if(!me.data?.businesses.length&&location.pathname!=='/onboarding')return <Navigate to="/onboarding" replace/>;return <Outlet/>}
export function useBusiness(){const me=useMe();return {business:me.data?.businesses[0],profile:me.data?.profile,user:me.data?.user};}
export function useBusinessQuery<T=any>(path:string){const {business}=useBusiness();return useQuery<T>({queryKey:['business',business?.id,path],queryFn:()=>api(`/businesses/${business.id}${path}`),enabled:!!business});}
export function useBusinessApi(){const {business}=useBusiness();const client=useQueryClient();return {request:async<T=any>(path:string,body?:unknown,method?:string)=>{const result=await api<T>(`/businesses/${business.id}${path}`,body,method);if(body)await client.invalidateQueries({queryKey:['business',business.id]});return result;},refresh:()=>client.invalidateQueries({queryKey:['business',business.id]})};}
