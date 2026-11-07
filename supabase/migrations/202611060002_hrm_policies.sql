create table public.branch_network_policies (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
  branch_id uuid not null references public.branches on delete cascade, ssid text, bssid macaddr, allowed_cidr cidr,
  verification_mode text not null default 'supplemental' check(verification_mode in ('required','supplemental','disabled')),
  active boolean not null default true, created_at timestamptz not null default now(), unique(branch_id,bssid)
);
create table public.leave_accrual_policies (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
  leave_type_id uuid not null references public.leave_types on delete cascade, monthly_accrual_day smallint check(monthly_accrual_day between 1 and 28),
  monthly_amount numeric(6,2) not null default 0 check(monthly_amount>=0), seniority_after_years smallint check(seniority_after_years>0),
  seniority_amount numeric(6,2) not null default 0 check(seniority_amount>=0), seniority_effective_rule text not null default 'anniversary' check(seniority_effective_rule in ('anniversary','year_start','year_end')),
  reserve_on_pending boolean not null default true, active boolean not null default true, created_at timestamptz not null default now(), unique(organization_id,leave_type_id)
);
create table public.leave_balance_transactions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
  balance_id uuid not null references public.leave_balances on delete cascade, request_id uuid references public.leave_requests on delete set null,
  transaction_type text not null check(transaction_type in ('monthly_accrual','seniority_accrual','reserve','consume','release','manual_adjustment')),
  amount numeric(6,2) not null check(amount<>0), effective_date date not null, idempotency_key text not null,
  note text, created_at timestamptz not null default now(), unique(balance_id,idempotency_key)
);
create table public.approval_workflows (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations on delete cascade,
  request_type text not null, name text not null, active boolean not null default true, require_hr_confirmation boolean not null default false,
  created_at timestamptz not null default now(), unique(organization_id,request_type)
);
create table public.approval_workflow_steps (
  id uuid primary key default gen_random_uuid(), workflow_id uuid not null references public.approval_workflows on delete cascade,
  step_number smallint not null check(step_number>0), approver_source text not null check(approver_source in ('direct_manager','department_manager','hr','admin','employee')),
  approver_employee_id uuid references public.employees on delete set null, required boolean not null default true, unique(workflow_id,step_number)
);
create index idx_network_branch_active on public.branch_network_policies(branch_id) where active;
create index idx_accrual_org_active on public.leave_accrual_policies(organization_id) where active;
create index idx_leave_tx_balance_date on public.leave_balance_transactions(balance_id,effective_date desc);
create index idx_workflows_org_type on public.approval_workflows(organization_id,request_type) where active;
create index idx_workflow_steps_workflow on public.approval_workflow_steps(workflow_id,step_number);
alter table public.branch_network_policies enable row level security;
alter table public.leave_accrual_policies enable row level security;
alter table public.leave_balance_transactions enable row level security;
alter table public.approval_workflows enable row level security;
alter table public.approval_workflow_steps enable row level security;
create policy network_admin on public.branch_network_policies for all to authenticated using(private.has_org_role(organization_id,array['admin']::public.member_role[])) with check(private.has_org_role(organization_id,array['admin']::public.member_role[]));
create policy accrual_policy_read on public.leave_accrual_policies for select to authenticated using(private.is_org_member(organization_id));
create policy accrual_policy_admin on public.leave_accrual_policies for all to authenticated using(private.has_org_role(organization_id,array['hr','admin']::public.member_role[])) with check(private.has_org_role(organization_id,array['hr','admin']::public.member_role[]));
create policy leave_tx_read on public.leave_balance_transactions for select to authenticated using(private.is_org_member(organization_id));
create policy workflows_read on public.approval_workflows for select to authenticated using(private.is_org_member(organization_id));
create policy workflows_admin on public.approval_workflows for all to authenticated using(private.has_org_role(organization_id,array['hr','admin']::public.member_role[])) with check(private.has_org_role(organization_id,array['hr','admin']::public.member_role[]));
create policy workflow_steps_read on public.approval_workflow_steps for select to authenticated using(exists(select 1 from public.approval_workflows w where w.id=workflow_id and private.is_org_member(w.organization_id)));
grant select,insert,update,delete on public.branch_network_policies,public.leave_accrual_policies,public.approval_workflows,public.approval_workflow_steps to authenticated;
grant select on public.leave_balance_transactions to authenticated;
