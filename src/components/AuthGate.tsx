import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { localAuthBypass, supabase } from "../lib/supabase";
import { EmployeeAccessGate } from "./EmployeeAccessGate";
import { ZaloAdminLogin } from "./ZaloAdminLogin";

export function AuthGate({children}:{children:React.ReactNode}){
  const [session,setSession]=useState<Session|null|undefined>(undefined),[email,setEmail]=useState(''),[sent,setSent]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(localAuthBypass){setSession({} as Session);return}supabase?.auth.getSession().then(({data})=>setSession(data.session));const sub=supabase?.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>sub?.data.subscription.unsubscribe()},[]);
  async function submit(e:FormEvent){e.preventDefault();setError('');const redirectUrl=`${location.origin}${location.pathname}`;const {error}=await supabase!.auth.signInWithOtp({email,options:{emailRedirectTo:redirectUrl}});if(error)setError(error.message);else setSent(true)}
  if(session===undefined)return <div className="auth"><p>Đang kiểm tra phiên đăng nhập…</p></div>;
  const isAdmin=location.hash.startsWith("#/admin")||new URLSearchParams(location.search).has("code")||Boolean(sessionStorage.getItem("zalo_admin_state"));
  if(isAdmin&&!session)return <ZaloAdminLogin session={null}/>;
  if(!session)return <div className="auth"><form className="card auth-card" onSubmit={submit}><div className="brand-mark">H</div><h1>Đăng nhập HRM</h1><p>Nhập email để nhận liên kết đăng nhập một lần. Zalo Auth sẽ thay thế bước này khi Mini App được cấu hình.</p><label>Email công việc<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="ban@congty.vn"/></label><button className="primary" disabled={sent}>{sent?'Đã gửi liên kết':'Gửi liên kết đăng nhập'}</button>{sent&&<p className="success-text">Kiểm tra hộp thư và mở liên kết đăng nhập.</p>}{error&&<p className="inline-error">{error}</p>}</form></div>;
  if(isAdmin)return <>{children}</>;
  return <EmployeeAccessGate>{children}</EmployeeAccessGate>;
}
