import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { authorize, getAccessToken } from "zmp-sdk";
import { localAuthBypass, supabase } from "../lib/supabase";
import { isZaloMiniApp } from "../lib/zalo";
import { EmployeeAccessGate } from "./EmployeeAccessGate";
import { ZaloAdminLogin } from "./ZaloAdminLogin";

export function AuthGate({children}:{children:React.ReactNode}){
  const [session,setSession]=useState<Session|null|undefined>(undefined),[email,setEmail]=useState(''),[sent,setSent]=useState(false),[error,setError]=useState(''),[zaloBusy,setZaloBusy]=useState(false);
  useEffect(()=>{if(localAuthBypass){setSession({} as Session);return}supabase?.auth.getSession().then(({data})=>setSession(data.session));const sub=supabase?.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>sub?.data.subscription.unsubscribe()},[]);
  useEffect(()=>{if(session===null&&isZaloMiniApp()&&!zaloBusy&&!error)void loginWithZalo()},[session]);
  async function loginWithZalo(){
    if(!supabase)return;
    setZaloBusy(true);setError('');
    try{
      await authorize({scopes:['scope.userInfo']});
      const accessToken=await getAccessToken();
      if(!accessToken)throw new Error('Zalo không cấp access token.');
      const {data,error:invokeError}=await supabase.functions.invoke('zalo-miniapp-auth',{body:{accessToken}});
      if(invokeError){
        let backendMessage='';
        const response=(invokeError as {context?:Response}).context;
        if(response)try{backendMessage=String((await response.clone().json())?.error||'')}catch{backendMessage=''}
        throw new Error(backendMessage||invokeError.message||'Không thể xác minh tài khoản Zalo.');
      }
      if(!data?.tokenHash)throw new Error(data?.error||'Không thể xác minh tài khoản Zalo.');
      const {error:verifyError}=await supabase.auth.verifyOtp({token_hash:data.tokenHash,type:'email'});
      if(verifyError)throw verifyError;
    }catch(cause){setError(cause instanceof Error?cause.message:'Không thể đăng nhập bằng Zalo.')}finally{setZaloBusy(false)}
  }
  async function submit(e:FormEvent){e.preventDefault();setError('');const redirectUrl=`${location.origin}${location.pathname}`;const {error}=await supabase!.auth.signInWithOtp({email,options:{emailRedirectTo:redirectUrl}});if(error)setError(error.message);else setSent(true)}
  if(session===undefined)return <div className="auth"><p>Đang kiểm tra phiên đăng nhập…</p></div>;
  const isAdmin=location.hash.startsWith("#/admin")||new URLSearchParams(location.search).has("code")||Boolean(sessionStorage.getItem("zalo_admin_state"));
  if(isAdmin&&!session)return <ZaloAdminLogin session={null}/>;
  if(!session&&isZaloMiniApp())return <div className="auth"><section className="card auth-card"><div className="brand-mark">B</div><h1>BOO HRM</h1><p>{zaloBusy?'Đang xác minh tài khoản Zalo…':'Cần xác thực Zalo để tiếp tục.'}</p><button className="primary" onClick={loginWithZalo} disabled={zaloBusy}>{zaloBusy?'Đang đăng nhập…':'Đăng nhập bằng Zalo'}</button>{error&&<p className="inline-error">{error}</p>}</section></div>;
  if(!session)return <div className="auth"><form className="card auth-card" onSubmit={submit}><div className="brand-mark">H</div><h1>Đăng nhập HRM</h1><p>Đăng nhập bằng email chỉ dành cho môi trường web.</p><label>Email công việc<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="ban@congty.vn"/></label><button className="primary" disabled={sent}>{sent?'Đã gửi liên kết':'Gửi liên kết đăng nhập'}</button>{sent&&<p className="success-text">Kiểm tra hộp thư và mở liên kết đăng nhập.</p>}{error&&<p className="inline-error">{error}</p>}</form></div>;
  if(isAdmin)return <>{children}</>;
  return <EmployeeAccessGate>{children}</EmployeeAccessGate>;
}
