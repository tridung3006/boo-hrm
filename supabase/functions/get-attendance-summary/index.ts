import { cors,json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const {admin,authUser}=await requireUser(req);
    const {data:member}=await admin.from('organization_memberships').select('organization_id,employee_id,employees(branches(timezone))').eq('auth_user_id',authUser.id).eq('status','active').limit(1).single();
    if(!member)return json({error:'Tài khoản chưa được liên kết với nhân viên.'},403);
    const timezone=((member.employees as unknown as {branches:{timezone:string}})?.branches?.timezone)||'Asia/Ho_Chi_Minh';
    const now=new Date(), today=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now), month=today.slice(0,7);
    const [{data:record},{data:assignment},{data:records},{data:events},{data:balances}]=await Promise.all([
      admin.from('attendance_records').select('*').eq('employee_id',member.employee_id).eq('work_date',today).maybeSingle(),
      admin.from('shift_assignments').select('shifts(name,start_time,end_time)').eq('employee_id',member.employee_id).eq('work_date',today).limit(1).maybeSingle(),
      admin.from('attendance_records').select('late_minutes,overtime_minutes').eq('employee_id',member.employee_id).gte('work_date',`${month}-01`).lte('work_date',`${month}-31`),
      admin.from('attendance_events').select('id,event_type,event_time,distance_meters,verification_status,branches(name)').eq('employee_id',member.employee_id).order('event_time',{ascending:false}).limit(5),
      admin.from('leave_balances').select('entitled_days,used_days,pending_days,carried_forward_days').eq('employee_id',member.employee_id).eq('year',Number(today.slice(0,4))),
    ]);
    const rs=records??[], bs=balances??[];
    return json({record,shift:(assignment as unknown as {shifts:unknown}|null)?.shifts??null,monthly:{workdays:rs.length,late_count:rs.filter(x=>x.late_minutes>0).length,overtime_minutes:rs.reduce((s,x)=>s+x.overtime_minutes,0),leave_remaining:bs.reduce((s,x)=>s+Number(x.entitled_days)+Number(x.carried_forward_days)-Number(x.used_days)-Number(x.pending_days),0)},recent:(events??[]).map(e=>({id:e.id,event_type:e.event_type,event_time:e.event_time,distance_meters:e.distance_meters,verification_status:e.verification_status,branch_name:(e.branches as unknown as {name:string})?.name??''}))});
  }catch(e){return json({error:e instanceof Error&&e.message==='UNAUTHORIZED'?'Phiên đăng nhập không hợp lệ.':'Không thể tải dữ liệu chấm công.'},e instanceof Error&&e.message==='UNAUTHORIZED'?401:500)}
});
