import { useState } from "react";
import { authorize, getAccessToken, getLocation } from "zmp-sdk";
import { supabase } from "../lib/supabase";
import { isZaloMiniApp } from "../lib/zalo";

export type LocationEvidence = { latitude:number; longitude:number; accuracy:number };

export function useLocation(){
  const [loading,setLoading]=useState(false);
  const get=async()=>{
    if(isZaloMiniApp()){
      setLoading(true);
      try{
        await authorize({scopes:["scope.userLocation"]});
        const [{token},accessToken]=await Promise.all([getLocation(),getAccessToken()]);
        if(!token)throw new Error("Zalo chưa cung cấp token vị trí. Hãy mở bằng ứng dụng Zalo trên điện thoại.");
        if(!supabase)throw new Error("Ứng dụng chưa kết nối Supabase để xác minh vị trí Zalo.");
        const {data,error}=await supabase.functions.invoke<LocationEvidence>("resolve-zalo-location",{body:{locationToken:token,accessToken}});
        if(error||!data)throw new Error(error?.message||"Không giải mã được vị trí Zalo.");
        return data;
      }finally{setLoading(false)}
    }
    return new Promise<LocationEvidence>((resolve,reject)=>{
    if(!navigator.geolocation) return reject(new Error("Thiết bị không hỗ trợ lấy vị trí."));
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      p=>{setLoading(false);resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy})},
      e=>{setLoading(false);reject(new Error(e.code===1?"Bạn cần cấp quyền vị trí để chấm công.":"Không lấy được vị trí chính xác. Vui lòng thử lại ngoài trời."))},
      {enableHighAccuracy:true,timeout:12_000,maximumAge:0},
    );
    });
  };
  return {get,loading};
}
