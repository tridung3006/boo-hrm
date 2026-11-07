import { createClient } from "npm:@supabase/supabase-js@2.119.0";

export function clients(req:Request){
  const url=Deno.env.get('SUPABASE_URL')!, publishable=Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!, secret=Deno.env.get('SUPABASE_SECRET_KEY')!;
  const token=req.headers.get('Authorization')??'';
  return {
    user:createClient(url,publishable,{global:{headers:{Authorization:token}},auth:{persistSession:false}}),
    admin:createClient(url,secret,{auth:{persistSession:false}}),
  };
}
export async function requireUser(req:Request){const c=clients(req);const {data,error}=await c.user.auth.getUser();if(error||!data.user)throw new Error('UNAUTHORIZED');return {...c,authUser:data.user}}
