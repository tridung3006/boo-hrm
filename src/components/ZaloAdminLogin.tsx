import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

const appId=import.meta.env.VITE_ZALO_APP_ID as string|undefined;
const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const random=(size=32)=>base64url(crypto.getRandomValues(new Uint8Array(size)));

export function ZaloAdminLogin({session}:{session:Session|null}){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    const params=new URLSearchParams(location.search),code=params.get("code"),state=params.get("state");
    if(!code)return;
    const expected=sessionStorage.getItem("zalo_admin_state"),verifier=sessionStorage.getItem("zalo_admin_verifier");
    if(!expected||state!==expected||!verifier){setError("Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");return}
    setBusy(true);
    const redirectUri=`${location.origin}${location.pathname}`;
    supabase!.functions.invoke("zalo-admin-auth",{body:{code,codeVerifier:verifier,redirectUri}}).then(async({data,error:invokeError})=>{
      if(invokeError||data?.error)throw new Error(data?.error||invokeError?.message);
      const verified=await supabase!.auth.verifyOtp({token_hash:data.tokenHash,type:"magiclink"});
      if(verified.error)throw verified.error;
      sessionStorage.removeItem("zalo_admin_state");sessionStorage.removeItem("zalo_admin_verifier");
      history.replaceState({},"",`${location.pathname}#/admin`);location.hash="#/admin";
    }).catch(e=>setError(e.message||"Không thể đăng nhập bằng Zalo.")).finally(()=>setBusy(false));
  },[]);
  async function login(){
    if(!appId){setError("Thiếu Zalo App ID trong cấu hình triển khai.");return}
    setBusy(true);setError("");
    const verifier=random(48),state=random(24),digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));
    sessionStorage.setItem("zalo_admin_verifier",verifier);sessionStorage.setItem("zalo_admin_state",state);
    const redirectUri=`${location.origin}${location.pathname}`;
    const url=new URL("https://oauth.zaloapp.com/v4/permission");
    url.search=new URLSearchParams({app_id:appId,redirect_uri:redirectUri,code_challenge:base64url(new Uint8Array(digest)),state}).toString();
    location.assign(url.toString());
  }
  return <div className="admin-login"><section><div className="admin-login-brand">BOO</div><h1>Quản trị nhân sự</h1><p>Quét mã QR bằng ứng dụng Zalo. Hệ thống chỉ cho phép những tài khoản đã được cấp quyền quản trị.</p><button onClick={login} disabled={busy}>{busy?"Đang xác minh…":"Đăng nhập bằng Zalo"}</button>{session&&<small>Tài khoản hiện tại có thể dùng nút này để liên kết Zalo lần đầu.</small>}{error&&<div className="admin-login-error">{error}</div>}<footer>Đăng nhập được bảo vệ bởi Zalo OAuth và Supabase</footer></section></div>;
}
