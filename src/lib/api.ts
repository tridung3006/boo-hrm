import { supabase } from "./supabase";
import { localAuthBypass } from "./supabase";
import { storage } from "./storage";

export type CurrentUser = {
  employee: { id:string; full_name:string; avatar_url:string|null; position:string|null; department_name:string|null };
  organization: { id:string; name:string };
  branch: { id:string; name:string; allowed_radius_meters:number };
  role: "employee"|"manager"|"hr"|"admin";
};

export type TodayAttendance = {
  record: null | { id:string; check_in_at:string|null; check_out_at:string|null; worked_minutes:number; late_minutes:number; overtime_minutes:number; status:string };
  shift: null | { name:string; start_time:string; end_time:string };
  monthly: { workdays:number; late_count:number; overtime_minutes:number; leave_remaining:number };
  recent: Array<{ id:string; event_type:"check_in"|"check_out"; event_time:string; branch_name:string; distance_meters:number|null; verification_status:string }>;
};

export type AdminEmployee={id:string;full_name:string;employee_code:string;department:string;shift:string|null;locations:string[];status:"active"|"pending"|"inactive"};
export type AdminAttendanceRow={id:string;employee:string;employee_code:string;shift:string;check_in:string;check_out:string;worked:string;location:string;status:"on_time"|"late"|"absent"};
export type NewsItem={id:string;title:string;summary:string|null;body:string;cover_url:string|null;published_at:string|null};
export type ZaloAdmin={id:string;zalo_user_id:string;display_name:string;avatar_url:string|null;active:boolean;created_at:string};
export type AdminOverview={
  employees:AdminEmployee[];
  attendance:AdminAttendanceRow[];
  locations:Array<{id:string;name:string;address:string;method:string;details:string;assigned:number}>;
  shifts:Array<{id:string;name:string;time:string;window:string;assigned:number}>;
  announcements:Array<{id:string;title:string;status:string;published_at:string;audience:string}>;
};

async function invoke<T>(name:string, body?:Record<string, unknown>):Promise<T>{
  if(!supabase) throw new Error("Ứng dụng chưa được kết nối Supabase.");
  const { data, error } = await supabase.functions.invoke(name, { body });
  if(error) throw new Error(error.message);
  return data as T;
}

export const api = {
  currentUser: () => localAuthBypass ? Promise.resolve(devUser) : invoke<CurrentUser>("get-current-user"),
  today: () => localAuthBypass ? Promise.resolve(readDevAttendance()) : invoke<TodayAttendance>("get-attendance-summary"),
  verifyAttendance: (input:{ action:"check_in"|"check_out"; qrToken:string; latitude:number; longitude:number; accuracy:number; idempotencyKey:string; distanceMeters?:number }) => localAuthBypass ? Promise.resolve(writeDevAttendance(input)) : invoke<{ record_id:string; event_time:string; status:string }>("verify-attendance", input),
  zaloAuth: (input:{ code:string }) => invoke<{ access_token:string; refresh_token:string }>("zalo-auth", input),
  adminOverview: () => localAuthBypass ? Promise.resolve(devAdminOverview) : loadAdminOverview(),
  news: ():Promise<NewsItem[]> => localAuthBypass ? Promise.resolve(devNews) : loadNews(),
  zaloAdmins: async():Promise<ZaloAdmin[]> => {if(localAuthBypass)return [];if(!supabase)throw new Error('Chưa kết nối Supabase.');const {data,error}=await supabase.from('admin_zalo_accounts').select('id,zalo_user_id,display_name,avatar_url,active,created_at').order('created_at');if(error)throw error;return data as ZaloAdmin[]},
  addZaloAdmin: async(input:{zalo_user_id:string;display_name:string}):Promise<void> => {if(!supabase)throw new Error('Chưa kết nối Supabase.');const me=await api.currentUser();const {data:{user}}=await supabase.auth.getUser();const {error}=await supabase.from('admin_zalo_accounts').insert({organization_id:me.organization.id,zalo_user_id:input.zalo_user_id.trim(),display_name:input.display_name.trim(),created_by:user?.id});if(error)throw error},
  setZaloAdminActive: async(id:string,active:boolean):Promise<void> => {if(!supabase)throw new Error('Chưa kết nối Supabase.');const {error}=await supabase.from('admin_zalo_accounts').update({active,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error},
};

const devUser:CurrentUser={employee:{id:'local-admin',full_name:'Dũng Hằng',avatar_url:null,position:'Quản trị viên',department_name:'Điều hành'},organization:{id:'local-org',name:'Công ty của tôi'},branch:{id:'local-branch',name:'Văn phòng chính',allowed_radius_meters:50},role:'admin'};
const devAdminOverview:AdminOverview={
  employees:[
    {id:'e1',full_name:'Lê Thu Lan',employee_code:'NV-048',department:'Kinh doanh',shift:null,locations:[],status:'pending'},
    {id:'e2',full_name:'Hoàng Minh Anh',employee_code:'NV-012',department:'Nhân sự',shift:'Hành chính 08:30–17:30',locations:['Văn phòng chính','Cửa hàng Quận 1'],status:'active'},
    {id:'e3',full_name:'Trần Nguyễn Anh Tuấn',employee_code:'NV-031',department:'Vận hành',shift:null,locations:['Kho Long Biên'],status:'active'},
    {id:'e4',full_name:'Nguyễn Thị Ngọc',employee_code:'NV-007',department:'Kế toán',shift:'Hành chính 08:30–17:30',locations:['Văn phòng chính'],status:'active'},
    {id:'e5',full_name:'Phạm Quốc Bảo',employee_code:'NV-004',department:'Kinh doanh',shift:'Hành chính 08:30–17:30',locations:['Văn phòng chính','Cửa hàng Quận 1','Kho Long Biên'],status:'active'},
  ],
  attendance:[
    {id:'a1',employee:'Hoàng Minh Anh',employee_code:'NV-012',shift:'08:30–17:30',check_in:'08:27',check_out:'17:31',worked:'9 giờ 04 phút',location:'Văn phòng chính',status:'on_time'},
    {id:'a2',employee:'Trần Nguyễn Anh Tuấn',employee_code:'NV-031',shift:'08:30–17:30',check_in:'09:06',check_out:'—',worked:'Đang làm',location:'Văn phòng chính',status:'late'},
    {id:'a3',employee:'Nguyễn Thị Ngọc',employee_code:'NV-007',shift:'08:30–17:30',check_in:'—',check_out:'—',worked:'0 giờ',location:'Văn phòng chính',status:'absent'},
  ],
  locations:[
    {id:'l1',name:'Văn phòng chính',address:'65 Nguyễn Trãi, Quận 1',method:'GPS + BSSID',details:'Bán kính 50m · BOO-Office-5G',assigned:32},
    {id:'l2',name:'Kho Long Biên',address:'12 Nguyễn Văn Cừ, Long Biên',method:'GPS',details:'Bán kính 80m',assigned:11},
  ],
  shifts:[
    {id:'s1',name:'Ca hành chính',time:'08:30–17:30',window:'06:30–19:30 (±2 giờ)',assigned:39},
    {id:'s2',name:'Ca cửa hàng sáng',time:'07:00–15:00',window:'05:00–17:00 (±2 giờ)',assigned:9},
  ],
  announcements:[
    {id:'n1',title:'Chốt bảng công tháng 10 trước ngày 08/11',status:'Đã đăng',published_at:'06/11/2026',audience:'Toàn công ty'},
    {id:'n2',title:'Thông báo lịch khám sức khỏe định kỳ',status:'Đã lên lịch',published_at:'10/11/2026',audience:'Toàn công ty'},
  ],
};
const devNews:NewsItem[]=[{id:'n1',title:'Chốt bảng công tháng 10 trước ngày 08/11',summary:'Vui lòng kiểm tra giờ công và gửi yêu cầu điều chỉnh trước thời hạn.',body:'',cover_url:null,published_at:'2026-11-06T08:00:00+07:00'}];
async function loadAdminOverview():Promise<AdminOverview>{
  if(!supabase)throw new Error('Ứng dụng chưa được kết nối Supabase.');
  const me=await api.currentUser();
  if(!['admin','hr'].includes(me.role))throw new Error('Bạn không có quyền quản trị.');
  const org=me.organization.id;
  const [employeesRes,applicationsRes,locationsRes,assignmentsRes,shiftsRes,announcementsRes,attendanceRes]=await Promise.all([
    supabase.from('employees').select('id,full_name,employee_code,employment_status,departments(name)').eq('organization_id',org).order('full_name'),
    supabase.from('employee_applications').select('id,full_name,employee_code,status,departments:requested_department_id(name)').eq('organization_id',org).eq('status','pending'),
    supabase.from('branches').select('id,name,address,allowed_radius_meters,branch_network_policies(ssid,bssid,verification_mode)').eq('organization_id',org),
    supabase.from('employee_location_assignments').select('employee_id,branch_id,branches(name)').eq('organization_id',org).eq('active',true),
    supabase.from('shifts').select('id,name,start_time,end_time,check_in_open_minutes,check_out_close_minutes').eq('organization_id',org).eq('active',true),
    supabase.from('announcements').select('id,title,status,published_at,audience').eq('organization_id',org).order('created_at',{ascending:false}).limit(20),
    supabase.from('attendance_records').select('id,employee_id,check_in_at,check_out_at,worked_minutes,late_minutes,status,employees(full_name,employee_code),branches(name),shift_assignments(shifts(name,start_time,end_time))').eq('organization_id',org).eq('work_date',new Date().toISOString().slice(0,10)),
  ]);
  const failed=[employeesRes,applicationsRes,locationsRes,assignmentsRes,shiftsRes,announcementsRes,attendanceRes].find(x=>x.error);if(failed?.error)throw failed.error;
  const byEmployee=new Map<string,string[]>();for(const a of assignmentsRes.data??[]){const name=(a.branches as unknown as {name:string}|null)?.name;if(name)byEmployee.set(a.employee_id,[...(byEmployee.get(a.employee_id)??[]),name])}
  const employees:AdminEmployee[]=(employeesRes.data??[]).map((e:any)=>({id:e.id,full_name:e.full_name,employee_code:e.employee_code,department:e.departments?.name??'Chưa phân phòng',shift:null,locations:byEmployee.get(e.id)??[],status:e.employment_status==='active'?'active':'inactive'}));
  for(const a of applicationsRes.data??[])employees.unshift({id:a.id,full_name:a.full_name,employee_code:a.employee_code,department:(a.departments as unknown as {name:string}|null)?.name??'Chưa chọn',shift:null,locations:[],status:'pending'});
  const fmt=(value:string|null)=>value?new Intl.DateTimeFormat('vi-VN',{hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'—';
  return {employees,attendance:(attendanceRes.data??[]).map((r:any)=>({id:r.id,employee:r.employees?.full_name??'—',employee_code:r.employees?.employee_code??'—',shift:r.shift_assignments?.shifts?`${r.shift_assignments.shifts.start_time.slice(0,5)}–${r.shift_assignments.shifts.end_time.slice(0,5)}`:'Chưa gán',check_in:fmt(r.check_in_at),check_out:fmt(r.check_out_at),worked:r.check_in_at?`${Math.floor(r.worked_minutes/60)} giờ ${r.worked_minutes%60} phút`:'0 giờ',location:r.branches?.name??'—',status:r.late_minutes>0?'late':r.check_in_at?'on_time':'absent'})),locations:(locationsRes.data??[]).map((l:any)=>{const n=l.branch_network_policies?.[0];return{id:l.id,name:l.name,address:l.address,method:n?.bssid?'GPS + BSSID':'GPS',details:`Bán kính ${l.allowed_radius_meters}m${n?.ssid?` · ${n.ssid}`:''}`,assigned:(assignmentsRes.data??[]).filter(a=>a.branch_id===l.id).length}}),shifts:(shiftsRes.data??[]).map((s:any)=>({id:s.id,name:s.name,time:`${s.start_time.slice(0,5)}–${s.end_time.slice(0,5)}`,window:`Trước ${s.check_in_open_minutes} phút · Sau ${s.check_out_close_minutes} phút`,assigned:0})),announcements:(announcementsRes.data??[]).map((n:any)=>({id:n.id,title:n.title,status:n.status==='published'?'Đã đăng':n.status==='scheduled'?'Đã lên lịch':'Bản nháp',published_at:n.published_at?new Intl.DateTimeFormat('vi-VN').format(new Date(n.published_at)):'—',audience:n.audience==='all'?'Toàn công ty':n.audience}))};
}
async function loadNews():Promise<NewsItem[]>{if(!supabase)throw new Error('Ứng dụng chưa được kết nối Supabase.');const me=await api.currentUser();const {data,error}=await supabase.from('announcements').select('id,title,summary,body,cover_url,published_at').eq('organization_id',me.organization.id).eq('status','published').lte('published_at',new Date().toISOString()).order('published_at',{ascending:false}).limit(5);if(error)throw error;return (data??[]) as NewsItem[]}
function readDevAttendance():TodayAttendance{
  const saved=storage.getItem('hrm_dev_attendance');
  const record=saved?JSON.parse(saved):null;
  const events=record?[...(record.check_in_at?[{id:'dev-in',event_type:'check_in' as const,event_time:record.check_in_at,branch_name:'Văn phòng chính',distance_meters:record.check_in_distance_meters??null,verification_status:'verified'}]:[]),...(record.check_out_at?[{id:'dev-out',event_type:'check_out' as const,event_time:record.check_out_at,branch_name:'Văn phòng chính',distance_meters:record.check_out_distance_meters??null,verification_status:'verified'}]:[])].reverse():[];
  return {record,shift:{name:'Ca hành chính',start_time:'08:30',end_time:'17:30'},monthly:{workdays:record?1:0,late_count:0,overtime_minutes:0,leave_remaining:12},recent:events};
}
function writeDevAttendance(input:{action:'check_in'|'check_out';distanceMeters?:number}){
  const {action,distanceMeters}=input;
  const current=readDevAttendance().record, now=new Date().toISOString();
  const record=action==='check_in'?{id:'dev-record',check_in_at:now,check_out_at:null,check_in_distance_meters:distanceMeters??null,check_out_distance_meters:null,worked_minutes:0,late_minutes:0,overtime_minutes:0,status:'present'}:{...(current??{id:'dev-record',check_in_at:now}),check_out_at:now,check_out_distance_meters:distanceMeters??null,worked_minutes:current?.check_in_at?Math.max(0,Math.round((Date.now()-new Date(current.check_in_at).getTime())/60000)):0,late_minutes:0,overtime_minutes:0,status:'present'};
  storage.setItem('hrm_dev_attendance',JSON.stringify(record));
  const history=JSON.parse(storage.getItem('hrm_dev_timesheet')||'[]') as Array<typeof record>;
  const day=now.slice(0,10),index=history.findIndex(item=>item.check_in_at?.slice(0,10)===day);
  if(index>=0)history[index]=record;else history.push(record);
  storage.setItem('hrm_dev_timesheet',JSON.stringify(history));
  return {record_id:'dev-record',event_time:now,status:'verified'};
}
