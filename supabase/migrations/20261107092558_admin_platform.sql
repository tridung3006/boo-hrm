-- Admin web platform, employee onboarding, multi-location attendance and news.

alter table public.shifts
  add column if not exists check_in_open_minutes integer not null default 120
    check (check_in_open_minutes between 0 and 720),
  add column if not exists check_out_close_minutes integer not null default 120
    check (check_out_close_minutes between 0 and 720),
  add column if not exists active boolean not null default true;

alter table public.employees
  add column if not exists terminated_at date,
  add column if not exists termination_reason text;

create table public.employee_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  auth_user_id uuid not null references auth.users on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  employee_code text not null,
  phone text,
  email text,
  requested_department_id uuid references public.departments on delete set null,
  requested_department_name text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  review_note text,
  reviewed_by uuid references public.employees on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, auth_user_id),
  unique (organization_id, employee_code)
);

create table public.employee_location_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  branch_id uuid not null references public.branches on delete cascade,
  effective_from date not null default current_date,
  effective_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (employee_id, branch_id, effective_from)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 180),
  summary text,
  body text not null,
  cover_url text,
  audience text not null default 'all' check (audience in ('all','department','employees')),
  department_id uuid references public.departments on delete set null,
  status text not null default 'draft' check (status in ('draft','scheduled','published','archived')),
  published_at timestamptz,
  created_by uuid references public.employees on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, employee_id)
);

create index employee_applications_org_status_idx on public.employee_applications (organization_id, status, created_at desc);
create index employee_applications_auth_idx on public.employee_applications (auth_user_id);
create index employee_locations_employee_idx on public.employee_location_assignments (employee_id, active, effective_from, effective_to);
create index employee_locations_branch_idx on public.employee_location_assignments (branch_id, active);
create index announcements_org_status_idx on public.announcements (organization_id, status, published_at desc);
create index announcement_reads_employee_idx on public.announcement_reads (employee_id, read_at desc);

alter table public.employee_applications enable row level security;
alter table public.employee_location_assignments enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

revoke all on public.employee_applications, public.employee_location_assignments,
  public.announcements, public.announcement_reads from anon, authenticated;

grant select, insert, update on public.employee_applications to authenticated;
grant select, insert, update, delete on public.employee_location_assignments to authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert on public.announcement_reads to authenticated;

create policy application_own_select on public.employee_applications for select to authenticated
  using (auth_user_id = (select auth.uid()));
create policy application_own_insert on public.employee_applications for insert to authenticated
  with check (auth_user_id = (select auth.uid()));
create policy application_admin_select on public.employee_applications for select to authenticated
  using (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]));
create policy application_admin_update on public.employee_applications for update to authenticated
  using (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]))
  with check (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]));

create policy employee_locations_member_read on public.employee_location_assignments for select to authenticated
  using (
    employee_id = private.current_employee(organization_id)
    or private.has_org_role(organization_id, array['hr','admin']::public.member_role[])
  );
create policy employee_locations_admin_insert on public.employee_location_assignments for insert to authenticated
  with check (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]));
create policy employee_locations_admin_update on public.employee_location_assignments for update to authenticated
  using (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]))
  with check (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]));
create policy employee_locations_admin_delete on public.employee_location_assignments for delete to authenticated
  using (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]));

create policy announcements_member_read on public.announcements for select to authenticated
  using (
    private.is_org_member(organization_id)
    and status = 'published'
    and published_at <= now()
  );
create policy announcements_admin_select on public.announcements for select to authenticated
  using (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]));
create policy announcements_admin_insert on public.announcements for insert to authenticated
  with check (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]));
create policy announcements_admin_update on public.announcements for update to authenticated
  using (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]))
  with check (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]));
create policy announcements_admin_delete on public.announcements for delete to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.member_role[]));

create policy announcement_reads_own_select on public.announcement_reads for select to authenticated
  using (employee_id in (select m.employee_id from public.organization_memberships m where m.auth_user_id = (select auth.uid()) and m.status = 'active'));
create policy announcement_reads_own_insert on public.announcement_reads for insert to authenticated
  with check (employee_id in (select m.employee_id from public.organization_memberships m where m.auth_user_id = (select auth.uid()) and m.status = 'active'));

-- HR/admin can maintain the existing core entities from the admin website.
create policy branches_admin_insert on public.branches for insert to authenticated
  with check (private.has_org_role(organization_id, array['admin']::public.member_role[]));
create policy branches_admin_update on public.branches for update to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.member_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.member_role[]));
create policy shifts_admin_insert on public.shifts for insert to authenticated
  with check (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]));
create policy shifts_admin_update on public.shifts for update to authenticated
  using (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]))
  with check (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]));
create policy assignments_admin_insert on public.shift_assignments for insert to authenticated
  with check (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]));
create policy assignments_admin_update on public.shift_assignments for update to authenticated
  using (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]))
  with check (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]));
create policy assignments_admin_delete on public.shift_assignments for delete to authenticated
  using (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]));
create policy employees_admin_update on public.employees for update to authenticated
  using (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]))
  with check (private.has_org_role(organization_id, array['hr','admin']::public.member_role[]));

grant insert, update on public.branches, public.shifts, public.shift_assignments to authenticated;
grant delete on public.shift_assignments to authenticated;
grant update on public.employees to authenticated;
