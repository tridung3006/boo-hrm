-- Pending applicants may read only the department catalogue assigned by the
-- trusted onboarding function in auth app_metadata.
alter table public.user_identities alter column employee_id drop not null;

create policy department_onboarding_read
on public.departments
for select
to authenticated
using (
  organization_id = nullif((select auth.jwt() -> 'app_metadata' ->> 'organization_id'), '')::uuid
);

drop policy if exists application_own_insert on public.employee_applications;
create policy application_own_insert
on public.employee_applications
for insert
to authenticated
with check (
  auth_user_id = (select auth.uid())
  and organization_id = nullif((select auth.jwt() -> 'app_metadata' ->> 'organization_id'), '')::uuid
);
