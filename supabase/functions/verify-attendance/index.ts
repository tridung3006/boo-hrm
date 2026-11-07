import { cors,json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const distance=(aLat:number,aLng:number,bLat:number,bLng:number)=>{const r=6371000,dLat=(bLat-aLat)*Math.PI/180,dLng=(bLng-aLng)*Math.PI/180;const x=Math.sin(dLat/2)**2+Math.cos(aLat*Math.PI/180)*Math.cos(bLat*Math.PI/180)*Math.sin(dLng/2)**2;return 2*r*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))};
const minutes=(value:string)=>{const [h,m]=value.slice(0,5).split(':').map(Number);return h*60+m};
const dateParts=(timezone:string)=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const get=(type:string)=>parts.find(p=>p.type===type)?.value??'';return{date:`${get('year')}-${get('month')}-${get('day')}`,minute:Number(get('hour'))*60+Number(get('minute'))}};
const normalizeBssid=(value:unknown)=>typeof value==='string'?value.trim().toLowerCase():null;

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const {admin,authUser}=await requireUser(req);const input=await req.json();
    if(!['check_in','check_out'].includes(input.action)||!input.idempotencyKey)return json({error:'Dữ liệu chấm công không hợp lệ.'},400);
    const hasGps=typeof input.latitude==='number'&&typeof input.longitude==='number'&&typeof input.accuracy==='number',bssid=normalizeBssid(input.bssid);
    if(!hasGps&&!bssid)return json({error:'Cần cung cấp GPS hoặc BSSID đã được xác minh.'},400);
    const {data:member}=await admin.from('organization_memberships').select('organization_id,employee_id,status,employees(employment_status)').eq('auth_user_id',authUser.id).eq('status','active').limit(1).maybeSingle();
    if(!member||member.status!=='active'||(member.employees as {employment_status:string}|null)?.employment_status!=='active')return json({error:'Tài khoản chưa được duyệt hoặc đã ngừng làm việc.'},403);
    const {data:duplicate}=await admin.from('attendance_events').select('id').eq('employee_id',member.employee_id).eq('idempotency_key',input.idempotencyKey).maybeSingle();if(duplicate)return json({error:'Yêu cầu này đã được xử lý.'},409);
    const timezone='Asia/Ho_Chi_Minh',nowLocal=dateParts(timezone);
    const {data:schedule}=await admin.from('shift_assignments').select('id,work_date,shifts(id,name,start_time,end_time,crosses_midnight,check_in_open_minutes,check_out_close_minutes)').eq('employee_id',member.employee_id).eq('work_date',nowLocal.date).limit(1).maybeSingle();
    if(!schedule?.shifts)return json({error:'Hôm nay bạn không có ca làm được phân công.'},422);
    const shift=schedule.shifts as unknown as {name:string;start_time:string;end_time:string;crosses_midnight:boolean;check_in_open_minutes:number;check_out_close_minutes:number};
    const start=minutes(shift.start_time)-shift.check_in_open_minutes,end=minutes(shift.end_time)+shift.check_out_close_minutes+(shift.crosses_midnight?1440:0),now=nowLocal.minute+(shift.crosses_midnight&&nowLocal.minute<minutes(shift.start_time)?1440:0);
    const clock=(value:number)=>`${String(Math.floor(((value+1440)%1440)/60)).padStart(2,'0')}:${String((value+1440)%60).padStart(2,'0')}`;
    if(now<start||now>end)return json({error:`Chỉ có thể chấm công từ ${clock(start)} đến ${clock(end)} cho ${shift.name}.`},422);
    const {data:assigned}=await admin.from('employee_location_assignments').select('branch_id,branches(id,name,latitude,longitude,allowed_radius_meters,max_gps_accuracy_meters,branch_network_policies(bssid,verification_mode,active))').eq('employee_id',member.employee_id).eq('active',true).lte('effective_from',nowLocal.date).or(`effective_to.is.null,effective_to.gte.${nowLocal.date}`);
    if(!assigned?.length)return json({error:'Bạn chưa được gán địa điểm chấm công.'},422);
    let matched:null|{id:string;name:string;meters:number|null}=null;
    for(const item of assigned){const branch=item.branches as unknown as {id:string;name:string;latitude:number;longitude:number;allowed_radius_meters:number;max_gps_accuracy_meters:number;branch_network_policies:Array<{bssid:string|null;verification_mode:string;active:boolean}>}|null;if(!branch)continue;const wifiMatch=Boolean(bssid&&(branch.branch_network_policies??[]).some(p=>p.active&&p.verification_mode!=='disabled'&&normalizeBssid(p.bssid)===bssid));let meters:null|number=null,gpsMatch=false;if(hasGps){meters=distance(input.latitude,input.longitude,branch.latitude,branch.longitude);gpsMatch=input.accuracy<=branch.max_gps_accuracy_meters&&meters<=branch.allowed_radius_meters}if(wifiMatch||gpsMatch){matched={id:branch.id,name:branch.name,meters};break}}
    if(!matched)return json({error:hasGps?'Bạn đang ngoài phạm vi các địa điểm được phân công.':'Wi‑Fi hiện tại không thuộc địa điểm được phân công.'},422);
    let {data:record}=await admin.from('attendance_records').select('*').eq('employee_id',member.employee_id).eq('work_date',nowLocal.date).maybeSingle();
    if(input.action==='check_out'&&!record?.check_in_at)return json({error:'Chưa có lượt check-in để check-out.'},409);if(input.action==='check_in'&&record?.check_in_at)return json({error:'Bạn đã check-in hôm nay.'},409);
    const nowIso=new Date().toISOString();
    if(!record){const late=Math.max(0,nowLocal.minute-minutes(shift.start_time));const created=await admin.from('attendance_records').insert({organization_id:member.organization_id,employee_id:member.employee_id,branch_id:matched.id,shift_assignment_id:schedule.id,work_date:nowLocal.date,check_in_at:nowIso,late_minutes:late,status:'present'}).select().single();if(created.error)throw created.error;record=created.data}else{const worked=Math.max(0,Math.round((Date.now()-new Date(record.check_in_at).getTime())/60000));const updated=await admin.from('attendance_records').update({check_out_at:nowIso,worked_minutes:worked}).eq('id',record.id).is('check_out_at',null).select().single();if(updated.error)throw updated.error;record=updated.data}
    const event=await admin.from('attendance_events').insert({organization_id:member.organization_id,attendance_record_id:record.id,employee_id:member.employee_id,branch_id:matched.id,event_type:input.action,event_time:nowIso,latitude:hasGps?input.latitude:null,longitude:hasGps?input.longitude:null,gps_accuracy:hasGps?input.accuracy:null,distance_meters:matched.meters,verification_status:bssid?'verified_wifi':'verified_gps',idempotency_key:input.idempotencyKey}).select().single();if(event.error)throw event.error;
    return json({record_id:record.id,event_time:nowIso,status:'verified',location:matched.name});
  }catch(e){console.error(e);return json({error:e instanceof Error&&e.message==='UNAUTHORIZED'?'Phiên đăng nhập không hợp lệ.':'Không thể hoàn tất chấm công.'},e instanceof Error&&e.message==='UNAUTHORIZED'?401:500)}
});
