create extension if not exists pgcrypto;

create type public.member_role as enum ('employee','manager','hr','admin');
create type public.attendance_event_type as enum ('check_in','check_out');
create type public.request_status as enum ('draft','pending','approved','rejected','cancelled');

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null, status text not null default 'active' check(status in ('active','suspended')), created_at timestamptz not null default now()
);
create table public.branches (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
  name text not null, address text not null, latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180),
  allowed_radius_meters integer not null default 50 check(allowed_radius_meters between 10 and 5000), max_gps_accuracy_meters integer not null default 50 check(max_gps_accuracy_meters between 5 and 1000),
  timezone text not null default 'Asia/Ho_Chi_Minh', status text not null default 'active', unique(organization_id,name)
);
create table public.departments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, name text not null, unique(organization_id,name)
);
create table public.employees (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
  branch_id uuid references public.branches, department_id uuid references public.departments, employee_code text not null, full_name text not null,
  avatar_url text, email text, phone text, position text, joined_date date, employment_status text not null default 'active', created_at timestamptz not null default now(),
  unique(organization_id,employee_code)
);
alter table public.departments add column manager_id uuid references public.employees;
create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(), auth_user_id uuid not null references auth.users on delete cascade, organization_id uuid not null references public.organizations on delete cascade,
  employee_id uuid not null references public.employees on delete cascade, role public.member_role not null default 'employee', status text not null default 'active', created_at timestamptz not null default now(),
  unique(auth_user_id,organization_id), unique(employee_id,organization_id)
);
create table public.user_identities (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees on delete cascade, auth_user_id uuid not null references auth.users on delete cascade,
  provider text not null default 'zalo', provider_user_id text not null, linked_at timestamptz not null default now(), unique(provider,provider_user_id), unique(auth_user_id,provider)
);
create table public.shifts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, name text not null,
  start_time time not null, end_time time not null, break_minutes integer not null default 0 check(break_minutes between 0 and 600), grace_period_minutes integer not null default 0 check(grace_period_minutes between 0 and 240), crosses_midnight boolean not null default false, unique(organization_id,name)
);
create table public.shift_assignments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, employee_id uuid not null references public.employees on delete cascade,
  shift_id uuid not null references public.shifts, work_date date not null, unique(employee_id,work_date,shift_id)
);
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, employee_id uuid not null references public.employees on delete cascade,
  branch_id uuid not null references public.branches, shift_assignment_id uuid references public.shift_assignments, work_date date not null,
  check_in_at timestamptz, check_out_at timestamptz, worked_minutes integer not null default 0 check(worked_minutes>=0), late_minutes integer not null default 0 check(late_minutes>=0),
  early_leave_minutes integer not null default 0 check(early_leave_minutes>=0), overtime_minutes integer not null default 0 check(overtime_minutes>=0), status text not null default 'present', created_at timestamptz not null default now(),
  check(check_out_at is null or (check_in_at is not null and check_out_at>check_in_at)), unique(employee_id,work_date)
);
create table public.qr_sessions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, branch_id uuid not null references public.branches on delete cascade,
  token_hash text not null unique, issued_at timestamptz not null default now(), expires_at timestamptz not null, status text not null default 'active' check(status in ('active','expired','revoked')), check(expires_at>issued_at)
);
create table public.attendance_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, attendance_record_id uuid not null references public.attendance_records on delete cascade,
  employee_id uuid not null references public.employees on delete cascade, branch_id uuid not null references public.branches, event_type public.attendance_event_type not null, event_time timestamptz not null default now(),
  latitude double precision, longitude double precision, gps_accuracy double precision, distance_meters double precision, verification_status text not null, qr_session_id uuid references public.qr_sessions,
  idempotency_key uuid not null, created_at timestamptz not null default now(), unique(employee_id,idempotency_key), unique(attendance_record_id,event_type)
);
create table public.attendance_event_attempts (
  id uuid primary key default gen_random_uuid(), organization_id uuid, employee_id uuid, branch_id uuid, action text not null, qr_token_hash text,
  latitude double precision, longitude double precision, gps_accuracy double precision, distance_meters double precision, result text not null, failure_reason text, created_at timestamptz not null default now()
);
create table public.leave_types (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, name text not null, is_paid boolean not null default true, policy_config jsonb not null default '{}'::jsonb, unique(organization_id,name)
);
create table public.leave_balances (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, employee_id uuid not null references public.employees on delete cascade,
  leave_type_id uuid not null references public.leave_types, year integer not null check(year between 2000 and 2200), entitled_days numeric(6,2) not null default 0, used_days numeric(6,2) not null default 0, pending_days numeric(6,2) not null default 0, carried_forward_days numeric(6,2) not null default 0,
  unique(employee_id,leave_type_id,year)
);
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, employee_id uuid not null references public.employees on delete cascade,
  leave_type_id uuid not null references public.leave_types, start_at timestamptz not null, end_at timestamptz not null, total_days numeric(6,2) not null check(total_days>0), reason text not null, status public.request_status not null default 'draft', created_at timestamptz not null default now(), check(end_at>=start_at)
);
create table public.approval_steps (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade, request_id uuid not null references public.leave_requests on delete cascade,
  step_number integer not null check(step_number>0), approver_id uuid not null references public.employees, status public.request_status not null default 'pending', action_at timestamptz, comment text, unique(request_id,step_number)
);
create table public.audit_logs (
  id bigint generated always as identity primary key, organization_id uuid not null references public.organizations on delete cascade, actor_id uuid references public.employees,
  action text not null, entity_type text not null, entity_id uuid, old_value jsonb, new_value jsonb, created_at timestamptz not null default now()
);

create index idx_memberships_user on public.organization_memberships(auth_user_id,status);
create index idx_employees_org_branch on public.employees(organization_id,branch_id);
create index idx_assignments_employee_date on public.shift_assignments(employee_id,work_date);
create index idx_attendance_employee_date on public.attendance_records(employee_id,work_date desc);
create index idx_attendance_org_date on public.attendance_records(organization_id,work_date desc);
create index idx_events_employee_time on public.attendance_events(employee_id,event_time desc);
create index idx_leave_employee_created on public.leave_requests(employee_id,created_at desc);
create index idx_approvals_approver_status on public.approval_steps(approver_id,status);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create or replace function private.is_org_member(target_org uuid) returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.organization_memberships m where m.auth_user_id=(select auth.uid()) and m.organization_id=target_org and m.status='active')
$$;
create or replace function private.has_org_role(target_org uuid, allowed public.member_role[]) returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.organization_memberships m where m.auth_user_id=(select auth.uid()) and m.organization_id=target_org and m.status='active' and m.role=any(allowed))
$$;
create or replace function private.current_employee(target_org uuid) returns uuid language sql stable security invoker set search_path='' as $$
  select m.employee_id from public.organization_memberships m where m.auth_user_id=(select auth.uid()) and m.organization_id=target_org and m.status='active' limit 1
$$;

alter table public.organizations enable row level security; alter table public.branches enable row level security; alter table public.departments enable row level security;
alter table public.employees enable row level security; alter table public.organization_memberships enable row level security; alter table public.user_identities enable row level security;
alter table public.shifts enable row level security; alter table public.shift_assignments enable row level security; alter table public.attendance_records enable row level security;
alter table public.qr_sessions enable row level security; alter table public.attendance_events enable row level security; alter table public.attendance_event_attempts enable row level security;
alter table public.leave_types enable row level security; alter table public.leave_balances enable row level security; alter table public.leave_requests enable row level security;
alter table public.approval_steps enable row level security; alter table public.audit_logs enable row level security;

create policy org_read on public.organizations for select to authenticated using(private.is_org_member(id));
create policy branch_read on public.branches for select to authenticated using(private.is_org_member(organization_id));
create policy department_read on public.departments for select to authenticated using(private.is_org_member(organization_id));
create policy employee_read on public.employees for select to authenticated using(private.is_org_member(organization_id));
create policy membership_read on public.organization_memberships for select to authenticated using(auth_user_id=(select auth.uid()));
create policy shifts_read on public.shifts for select to authenticated using(private.is_org_member(organization_id));
create policy assignments_read on public.shift_assignments for select to authenticated using(employee_id=private.current_employee(organization_id) or private.has_org_role(organization_id,array['manager','hr','admin']::public.member_role[]));
create policy attendance_read on public.attendance_records for select to authenticated using(employee_id=private.current_employee(organization_id) or private.has_org_role(organization_id,array['manager','hr','admin']::public.member_role[]));
create policy events_read on public.attendance_events for select to authenticated using(employee_id=private.current_employee(organization_id) or private.has_org_role(organization_id,array['manager','hr','admin']::public.member_role[]));
create policy leave_types_read on public.leave_types for select to authenticated using(private.is_org_member(organization_id));
create policy balances_read on public.leave_balances for select to authenticated using(employee_id=private.current_employee(organization_id) or private.has_org_role(organization_id,array['hr','admin']::public.member_role[]));
create policy leave_requests_read on public.leave_requests for select to authenticated using(employee_id=private.current_employee(organization_id) or private.has_org_role(organization_id,array['manager','hr','admin']::public.member_role[]));
create policy leave_requests_insert on public.leave_requests for insert to authenticated with check(employee_id=private.current_employee(organization_id));
create policy approvals_read on public.approval_steps for select to authenticated using(approver_id=private.current_employee(organization_id) or private.has_org_role(organization_id,array['hr','admin']::public.member_role[]));
create policy audit_read on public.audit_logs for select to authenticated using(private.has_org_role(organization_id,array['admin']::public.member_role[]));

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select on public.organizations,public.branches,public.departments,public.employees,public.organization_memberships,public.shifts,public.shift_assignments,public.attendance_records,public.attendance_events,public.leave_types,public.leave_balances,public.leave_requests,public.approval_steps to authenticated;
grant insert on public.leave_requests to authenticated;
