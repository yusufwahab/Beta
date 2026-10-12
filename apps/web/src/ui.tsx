import type {ReactNode} from 'react';
import {LoaderCircle,ArrowUpRight,AudioLines} from 'lucide-react';
import {Link} from 'react-router-dom';
export function Logo(){return <Link to="/" className="logo" aria-label="Beta home"><span className="logo-mark"><AudioLines size={23}/></span>beta<span className="logo-dot">.</span></Link>}
export function Button({children,onClick,type='button',disabled=false,secondary=false}:{children:ReactNode;onClick?:()=>void;type?:'button'|'submit';disabled?:boolean;secondary?:boolean}){return <button type={type} onClick={onClick} disabled={disabled} className={secondary?'btn-secondary':'btn-primary'}>{children}</button>}
export function CTA({children='Get Started Free',to='/auth?mode=register'}:{children?:ReactNode;to?:string}){return <Link className="btn-primary" to={to}>{children}<ArrowUpRight size={17}/></Link>}
export function Card({children,className=''}:{children:ReactNode;className?:string}){return <div className={`panel ${className}`}>{children}</div>}
export function ErrorBox({error}:{error:unknown}){return error?<div className="error-box" role="alert">{error instanceof Error?error.message:String(error)}</div>:null}
export function Loading(){return <div className="loading" role="status"><LoaderCircle className="animate-spin"/>Loading your business…</div>}
export function Empty({children='No records yet. Add your first record to get started.'}:{children?:ReactNode}){return <div className="empty">{children}</div>}
export function Field({label,children}:{label:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}
export function Badge({children}:{children:ReactNode}){return <span className="badge">{children}</span>}
