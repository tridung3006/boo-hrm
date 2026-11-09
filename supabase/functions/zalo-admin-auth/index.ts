import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const {code,codeVerifier,redirectUri}=await req.json();
    if(!code||!codeVerifier||!redirectUri)return json({error:"Thiếu dữ liệu xác thực Zalo."},400);
    const allowedRedirectUri="https://tridung3006.github.io/boo-hrm/";
    if(redirectUri!==allowedRedirectUri)return json({error:"Redirect URI quản trị không hợp lệ."},400);
    const appId=Deno.env.get("ZALO_APP_ID")!,secret=Deno.env.get("ZALO_APP_SECRET")!;
    const tokenBody=new URLSearchParams({app_id:appId,code,grant_type:"authorization_code",code_verifier:codeVerifier});
    const tokenResponse=await fetch("https://oauth.zaloapp.com/v4/access_token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","secret_key":secret},body:tokenBody});
    const token=await tokenResponse.json();
    if(!tokenResponse.ok||!token.access_token)return json({error:"Zalo không xác nhận được phiên đăng nhập."},401);
    const profileResponse=await fetch("https://graph.zalo.me/v2.0/me?fields=id,name,picture",{headers:{access_token:token.access_token}});
    const profile=await profileResponse.json();
    if(!profileResponse.ok||!profile.id)return json({error:"Không đọc được tài khoản Zalo."},401);

    const url=Deno.env.get("SUPABASE_URL")!,serviceKey=(Deno.env.get("SUPABASE_SECRET_KEY")??Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
    const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
    let {data:allowed}=await admin.from("admin_zalo_accounts").select("id,organization_id,auth_user_id,active").eq("zalo_user_id",String(profile.id)).eq("active",true).maybeSingle();

    // Bootstrap an account only when the caller already owns a valid Supabase admin session.
    if(!allowed){
      const bearer=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");
      if(bearer){
        const {data:{user}}=await admin.auth.getUser(bearer);
        if(user){
          const {data:membership}=await admin.from("organization_memberships").select("organization_id").eq("auth_user_id",user.id).eq("role","admin").eq("status","active").maybeSingle();
          if(membership){
            const inserted=await admin.from("admin_zalo_accounts").insert({organization_id:membership.organization_id,auth_user_id:user.id,zalo_user_id:String(profile.id),display_name:profile.name||"Zalo Admin",avatar_url:profile.picture?.data?.url??null,created_by:user.id}).select("id,organization_id,auth_user_id,active").single();
            if(inserted.error)throw inserted.error; allowed=inserted.data;
          }
        }
      }
    }
    if(!allowed)return json({error:"Tài khoản Zalo này chưa được cấp quyền quản trị."},403);

    let authUserId=allowed.auth_user_id as string|null;
    if(!authUserId){
      const email=`zalo-admin-${profile.id}@auth.boo.internal`;
      const created=await admin.auth.admin.createUser({email,email_confirm:true,user_metadata:{name:profile.name,zalo_user_id:String(profile.id)}});
      if(created.error&&created.error.message&&!created.error.message.includes("already"))throw created.error;
      authUserId=created.data.user?.id??null;
      if(!authUserId){
        const {data:list}=await admin.auth.admin.listUsers({page:1,perPage:1000});
        authUserId=list.users.find(u=>u.email===email)?.id??null;
      }
      if(!authUserId)throw new Error("Không thể tạo tài khoản quản trị.");
      await admin.from("admin_zalo_accounts").update({auth_user_id:authUserId,display_name:profile.name||"Zalo Admin",avatar_url:profile.picture?.data?.url??null,updated_at:new Date().toISOString()}).eq("id",allowed.id);
      const {data:template}=await admin.from("organization_memberships").select("employee_id").eq("organization_id",allowed.organization_id).eq("role","admin").limit(1).maybeSingle();
      await admin.from("organization_memberships").upsert({auth_user_id:authUserId,organization_id:allowed.organization_id,employee_id:template?.employee_id??null,role:"admin",status:"active"},{onConflict:"auth_user_id,organization_id"});
    }
    const email=`zalo-admin-${profile.id}@auth.boo.internal`;
    const link=await admin.auth.admin.generateLink({type:"magiclink",email});
    if(link.error||!link.data.properties.hashed_token)throw link.error??new Error("Không tạo được phiên đăng nhập.");
    return json({tokenHash:link.data.properties.hashed_token,profile:{id:String(profile.id),name:profile.name,avatar:profile.picture?.data?.url??null}});
  }catch(error){console.error(error);return json({error:"Không thể hoàn tất đăng nhập Zalo."},500)}
});
