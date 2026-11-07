create table public.admin_zalo_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  zalo_user_id text not null,
  display_name text not null,
  avatar_url text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, zalo_user_id)
);

alter table public.admin_zalo_accounts enable row level security;

create policy admin_zalo_read on public.admin_zalo_accounts for select to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.member_role[]));
create policy admin_zalo_insert on public.admin_zalo_accounts for insert to authenticated
  with check (private.has_org_role(organization_id, array['admin']::public.member_role[]));
create policy admin_zalo_update on public.admin_zalo_accounts for update to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.member_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.member_role[]));
create policy admin_zalo_delete on public.admin_zalo_accounts for delete to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.member_role[]));

grant select, insert, update, delete on public.admin_zalo_accounts to authenticated;
create index admin_zalo_accounts_lookup on public.admin_zalo_accounts(zalo_user_id) where active;
