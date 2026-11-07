import { cors,json } from "../_shared/cors.ts";

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const {locationToken,accessToken}=await req.json();
    const secretKey=Deno.env.get('ZALO_APP_SECRET');
    if(!secretKey)return json({error:'Server chưa cấu hình ZALO_APP_SECRET.'},500);
    if(typeof locationToken!=='string'||!locationToken||typeof accessToken!=='string'||!accessToken)return json({error:'Token vị trí Zalo không hợp lệ.'},400);
    const response=await fetch('https://graph.zalo.me/v2.0/me/info',{headers:{access_token:accessToken,code:locationToken,secret_key:secretKey}});
    const payload=await response.json();
    if(!response.ok||payload.error)return json({error:payload.error?.message||'Zalo không thể giải mã vị trí.'},422);
    const source=payload.data??payload;
    const latitude=Number(source.latitude),longitude=Number(source.longitude),accuracy=Number(source.accuracy??50);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return json({error:'Phản hồi vị trí Zalo không có tọa độ.'},422);
    return json({latitude,longitude,accuracy});
  }catch(error){console.error(error);return json({error:'Không thể xác minh vị trí Zalo.'},500)}
});
