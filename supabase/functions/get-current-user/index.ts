import { cors,json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const {admin,authUser}=await requireUser(req);
    let {data}=await admin.from('organization_memberships').select(`role,organization:organizations(id,name),employee:employees(id,full_name,avatar_url,position,department:departments(name),branch:branches(id,name,allowed_radius_meters))`).eq('auth_user_id',authUser.id).eq('status','active').limit(1).maybeSingle();
    if(!data){
      const displayName=(authUser.email?.split('@')[0]||'Quản trị viên').replace(/[._-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
      const org=(await admin.from('organizations').insert({name:'Công ty của tôi'}).select().single()).data;
      if(!org)throw new Error('BOOTSTRAP_ORG');
      const branch=(await admin.from('branches').insert({organization_id:org.id,name:'Văn phòng chính',address:'Chưa cập nhật',latitude:10.7769,longitude:106.7009,allowed_radius_meters:50}).select().single()).data;
      const department=(await admin.from('departments').insert({organization_id:org.id,name:'Điều hành'}).select().single()).data;
      const employee=(await admin.from('employees').insert({organization_id:org.id,branch_id:branch.id,department_id:department.id,employee_code:'ADMIN-001',full_name:displayName,email:authUser.email,position:'Quản trị viên'}).select().single()).data;
      await admin.from('organization_memberships').insert({auth_user_id:authUser.id,organization_id:org.id,employee_id:employee.id,role:'admin'});
      const shift=(await admin.from('shifts').insert({organization_id:org.id,name:'Ca hành chính',start_time:'08:30',end_time:'17:30',break_minutes:60,grace_period_minutes:5}).select().single()).data;
      const leaveType=(await admin.from('leave_types').insert({organization_id:org.id,name:'Nghỉ phép năm',is_paid:true}).select().single()).data;
      await admin.from('leave_balances').insert({organization_id:org.id,employee_id:employee.id,leave_type_id:leaveType.id,year:new Date().getUTCFullYear(),entitled_days:12});
      const today=new Date().toISOString().slice(0,10);await admin.from('shift_assignments').insert({organization_id:org.id,employee_id:employee.id,shift_id:shift.id,work_date:today});
      data={role:'admin',organization:org,employee:{...employee,department,branch}} as never;
    }
    const employee=data.employee as unknown as {id:string;full_name:string;avatar_url:string|null;position:string|null;department:{name:string}|null;branch:{id:string;name:string;allowed_radius_meters:number}};
    const organization=data.organization as unknown as {id:string;name:string};
    return json({employee:{id:employee.id,full_name:employee.full_name,avatar_url:employee.avatar_url,position:employee.position,department_name:employee.department?.name??null},organization,branch:employee.branch,role:data.role});
  }catch(e){return json({error:e instanceof Error&&e.message==='UNAUTHORIZED'?'Phiên đăng nhập không hợp lệ.':'Không thể tải hồ sơ.'},e instanceof Error&&e.message==='UNAUTHORIZED'?401:500)}
});
