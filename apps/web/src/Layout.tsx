import {useEffect} from 'react';
import JourneyGuide from './JourneyGuide';
import {NavLink,Outlet,Link,useLocation} from 'react-router-dom';
import {Home,Mic,Receipt,Package,Wallet,Users,HandCoins,FileCheck,Radio,Settings,LogOut,Grid2X2,ArrowUpRight,Plus,Globe} from 'lucide-react';
import {Logo} from './ui';
import {useBusiness,useSession} from './session';
import {supabase,languageNames} from './lib';
import './app-interface.css';

const tools=[
 ['expenses','Expenses','Keep track of what you spend.',Wallet],
 ['debts','Customers & Debts','Manage customers and repayments.',Users],
 ['ajo','Ajo Savings','Your savings groups and contributions.',HandCoins],
 ['passport','Activity Passport','See and share your business record.',FileCheck],
 ['settings','Settings','Your profile, language and business.',Settings],
 ['ambient','Ambient Demo','Try the ambient checkout demo.',Radio],
] as const;
const tabs=[['','Home',Home],['sales','Sales',Receipt],['checkout','Speak',Mic],['inventory','Stock',Package],['more','More',Grid2X2]] as const;

export function AppMenu(){
 const {business,profile}=useBusiness();
 const {session}=useSession();
 return <section className="app-tools" aria-labelledby="app-tools-title">
  <div className="page-heading"><div><span className="eyebrow">YOUR BUSINESS</span><h1 id="app-tools-title">More with Beta</h1><p>Everything else you need, in one place.</p></div></div>
  <div className="app-tool-grid">{tools.map(([path,label,description,Icon])=><Link className="app-tool" to={`/app/${path}`} key={path}><span className="app-tool-icon"><Icon size={24}/></span><strong>{label}</strong><span>{description}</span><ArrowUpRight className="app-tool-arrow" size={17}/>{path==='ambient'&&<small>DEMO</small>}</Link>)}</div>
  <div className="app-account-card"><span className="app-avatar" aria-hidden="true">{profile?.trader_name?.slice(0,1)||'B'}</span><div><strong>{profile?.trader_name||business?.name}</strong><span>{business?.name}</span></div><Link to="/app/settings" className="app-language"><Globe size={16}/>{languageNames[profile?.preferred_language??'en']}</Link></div>
  {!session?.user.is_anonymous&&<button className="btn-secondary app-signout" onClick={()=>void supabase?.auth.signOut()}><LogOut size={18}/>Sign out</button>}
 </section>;
}

export default function Layout(){
 const {business,profile}=useBusiness();
 const {pathname}=useLocation();
 useEffect(()=>{window.scrollTo({top:0,left:0,behavior:'instant'});},[pathname]);
 const moreActive=tools.some(([path])=>pathname===`/app/${path}`);
 return <div className="app-layout app-interface">
  <a className="app-skip" href="#business-content">Skip to content</a>
  <div className="app-content">
   <header className="app-header"><Logo/><Link to="/app" className="app-business"><small>YOUR BUSINESS</small><strong>{business?.name||'My business'}</strong></Link><Link to="/app/checkout" className="btn-primary app-header-sale"><Plus size={17}/>Record a sale</Link><Link to="/app/settings" className="app-avatar" aria-label="Profile and settings">{profile?.trader_name?.slice(0,1)||<Settings size={20}/>}</Link></header>
   <main className="workspace" id="business-content" tabIndex={-1}><JourneyGuide/><Outlet/></main>
  </div>
  <nav className="app-dock" aria-label="Main navigation">{tabs.map(([path,label,Icon])=><NavLink to={`/app/${path}`} end={path===''} key={path} aria-label={path==='checkout'?'Voice Checkout':label} className={({isActive})=>[path==='checkout'?'app-dock-voice':'',(isActive||(path==='more'&&moreActive))?'is-current':''].filter(Boolean).join(' ')}><span className="app-dock-icon"><Icon size={23}/></span><span>{label}</span></NavLink>)}</nav>
 </div>;
}
