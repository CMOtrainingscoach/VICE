-- VICE Phase 1: identity, tenants, invites, audit, RLS

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type app.membership_role as enum ('admin', 'client');
create type app.tenant_status as enum (
  'new',
  'collecting',
  'audit_in_progress',
  'audit_done',
  'archived'
);
create type app.theme_preference as enum ('light', 'dark', 'system');
create type app.deletion_request_status as enum (
  'pending',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table app.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  locale text not null default 'nl-BE',
  theme_preference app.theme_preference not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.platform_admins (
  user_id uuid primary key references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table app.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  contact_name text,
  contact_email text,
  audit_goal text not null default '',
  language text not null default 'nl',
  status app.tenant_status not null default 'new',
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_name_not_blank check (char_length(trim(name)) > 0)
);

create table app.tenant_memberships (
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role app.membership_role not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index tenant_memberships_user_id_idx on app.tenant_memberships (user_id);

create table app.invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  email text not null,
  role app.membership_role not null default 'client',
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint invites_email_lower check (email = lower(email))
);

create index invites_tenant_id_idx on app.invites (tenant_id);
create unique index invites_token_hash_uidx on app.invites (token_hash)
where revoked_at is null and accepted_at is null;

create table app.audit_events (
  id bigserial primary key,
  tenant_id uuid references app.tenants (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_tenant_created_idx on app.audit_events (tenant_id, created_at desc);

create table app.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table app.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  requested_by uuid not null references auth.users (id),
  status app.deletion_request_status not null default 'pending',
  confirm_phrase text,
  scheduled_for timestamptz,
  executed_at timestamptz,
  report jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers (security definer, fixed search_path)
-- ---------------------------------------------------------------------------
create or replace function app.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid();
$$;

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = app, public, auth
as $$
  select exists (
    select 1
    from app.platform_admins pa
    where pa.user_id = auth.uid()
  );
$$;

create or replace function app.is_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, auth
as $$
  select exists (
    select 1
    from app.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.revoked_at is null
  );
$$;

create or replace function app.membership_role(p_tenant_id uuid)
returns app.membership_role
language sql
stable
security definer
set search_path = app, public, auth
as $$
  select tm.role
  from app.tenant_memberships tm
  where tm.tenant_id = p_tenant_id
    and tm.user_id = auth.uid()
    and tm.revoked_at is null
  limit 1;
$$;

create or replace function app.has_capability(p_tenant_id uuid, p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
declare
  v_role app.membership_role;
begin
  if app.is_platform_admin() then
    if p_capability in (
      'tenant.create',
      'tenant.read',
      'tenant.update',
      'tenant.archive',
      'tenant.delete',
      'member.invite',
      'member.revoke'
    ) then
      return app.is_member(p_tenant_id) or p_capability = 'tenant.create';
    end if;
    if app.is_member(p_tenant_id) and app.membership_role(p_tenant_id) = 'admin' then
      return true;
    end if;
    if p_capability = 'tenant.create' then
      return true;
    end if;
    return false;
  end if;

  if not app.is_member(p_tenant_id) then
    return false;
  end if;

  v_role := app.membership_role(p_tenant_id);

  if v_role = 'admin' then
    return p_capability in (
      'tenant.read',
      'tenant.update',
      'source.create',
      'source.read_internal',
      'meeting.record',
      'transcript.edit',
      'task.review',
      'audit.edit',
      'audit.approve',
      'dashboard.publish',
      'member.invite',
      'member.revoke'
    );
  end if;

  if v_role = 'client' then
    return p_capability in (
      'tenant.read',
      'source.create',
      'dashboard.read_published',
      'feedback.create',
      'export.create'
    );
  end if;

  return false;
end;
$$;

create or replace function app.jwt_aal()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1');
$$;

create or replace function app.require_admin_mfa()
returns boolean
language sql
stable
security definer
set search_path = app, public, auth
as $$
  select
    case
      when not app.is_platform_admin() then true
      else app.jwt_aal() = 'aal2'
    end;
$$;

-- Profile on signup
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  insert into app.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function app.handle_new_user();

-- Prevent removing last platform admin
create or replace function app.guard_last_platform_admin()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int;
begin
  if tg_op = 'DELETE' then
    select count(*) into v_count from app.platform_admins;
    if v_count <= 1 then
      raise exception 'Cannot remove the last platform administrator';
    end if;
  end if;
  return old;
end;
$$;

create trigger platform_admins_last_admin
before delete on app.platform_admins
for each row
execute function app.guard_last_platform_admin();

-- One-time bootstrap: first authenticated user matching env is done in app layer;
-- DB allows self-bootstrap only when table empty.
create or replace function app.bootstrap_platform_admin()
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from app.platform_admins) then
    raise exception 'Platform admin already provisioned';
  end if;

  insert into app.platform_admins (user_id) values (auth.uid());

  insert into app.audit_events (actor_user_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'platform_admin.bootstrap',
    'user',
    auth.uid()::text,
    '{}'::jsonb
  );
end;
$$;

revoke all on function app.bootstrap_platform_admin() from public;
grant execute on function app.bootstrap_platform_admin() to authenticated;

-- Tenant CRUD via RPC for consistent checks
create or replace function app.create_tenant(
  p_name text,
  p_website text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_audit_goal text default '',
  p_language text default 'nl'
)
returns app.tenants
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant app.tenants;
begin
  if not app.is_platform_admin() or not app.require_admin_mfa() then
    raise exception 'Forbidden';
  end if;

  insert into app.tenants (name, website, contact_name, contact_email, audit_goal, language)
  values (trim(p_name), p_website, p_contact_name, p_contact_email, coalesce(p_audit_goal, ''), coalesce(p_language, 'nl'))
  returning * into v_tenant;

  insert into app.tenant_memberships (tenant_id, user_id, role)
  values (v_tenant.id, auth.uid(), 'admin');

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id)
  values (v_tenant.id, auth.uid(), 'tenant.create', 'tenant', v_tenant.id::text);

  return v_tenant;
end;
$$;

grant execute on function app.create_tenant(text, text, text, text, text, text) to authenticated;

create or replace function app.update_tenant(
  p_tenant_id uuid,
  p_name text,
  p_website text,
  p_contact_name text,
  p_contact_email text,
  p_audit_goal text,
  p_language text
)
returns app.tenants
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant app.tenants;
begin
  if not app.has_capability(p_tenant_id, 'tenant.update') or not app.require_admin_mfa() then
    raise exception 'Forbidden';
  end if;

  update app.tenants
  set
    name = trim(p_name),
    website = p_website,
    contact_name = p_contact_name,
    contact_email = p_contact_email,
    audit_goal = coalesce(p_audit_goal, ''),
    language = coalesce(p_language, 'nl'),
    updated_at = now()
  where id = p_tenant_id and deleted_at is null
  returning * into v_tenant;

  if v_tenant.id is null then
    raise exception 'Tenant not found';
  end if;

  return v_tenant;
end;
$$;

grant execute on function app.update_tenant(uuid, text, text, text, text, text, text) to authenticated;

create or replace function app.set_tenant_archived(p_tenant_id uuid, p_archived boolean)
returns app.tenants
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant app.tenants;
begin
  if not app.has_capability(p_tenant_id, 'tenant.archive') or not app.require_admin_mfa() then
    raise exception 'Forbidden';
  end if;

  update app.tenants
  set
    status = case when p_archived then 'archived'::app.tenant_status else 'new'::app.tenant_status end,
    archived_at = case when p_archived then now() else null end,
    updated_at = now()
  where id = p_tenant_id and deleted_at is null
  returning * into v_tenant;

  return v_tenant;
end;
$$;

grant execute on function app.set_tenant_archived(uuid, boolean) to authenticated;

create or replace function app.request_tenant_deletion(p_tenant_id uuid, p_confirm_phrase text)
returns app.deletion_requests
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_req app.deletion_requests;
begin
  if not app.has_capability(p_tenant_id, 'tenant.delete') or not app.require_admin_mfa() then
    raise exception 'Forbidden';
  end if;

  if p_confirm_phrase is distinct from 'VERWIJDER' then
    raise exception 'Confirmation phrase required';
  end if;

  insert into app.deletion_requests (tenant_id, requested_by, status, confirm_phrase, scheduled_for)
  values (p_tenant_id, auth.uid(), 'pending', p_confirm_phrase, now() + interval '30 days')
  returning * into v_req;

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id)
  values (p_tenant_id, auth.uid(), 'tenant.deletion_requested', 'deletion_request', v_req.id::text);

  return v_req;
end;
$$;

grant execute on function app.request_tenant_deletion(uuid, text) to authenticated;

-- Invite accept (membership created server-side)
create or replace function app.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth, extensions
as $$
declare
  v_invite app.invites;
  v_hash text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select * into v_invite
  from app.invites
  where token_hash = v_hash
    and revoked_at is null
    and accepted_at is null
    and expires_at > now()
  for update;

  if v_invite.id is null then
    raise exception 'Invalid or expired invite';
  end if;

  if lower(auth.jwt() ->> 'email') is distinct from v_invite.email then
    raise exception 'Invite email mismatch';
  end if;

  insert into app.tenant_memberships (tenant_id, user_id, role)
  values (v_invite.tenant_id, auth.uid(), v_invite.role)
  on conflict (tenant_id, user_id) do update
  set role = excluded.role, revoked_at = null;

  update app.invites set accepted_at = now() where id = v_invite.id;

  return v_invite.tenant_id;
end;
$$;

grant execute on function app.accept_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table app.profiles enable row level security;
alter table app.platform_admins enable row level security;
alter table app.tenants enable row level security;
alter table app.tenant_memberships enable row level security;
alter table app.invites enable row level security;
alter table app.audit_events enable row level security;
alter table app.system_settings enable row level security;
alter table app.deletion_requests enable row level security;

-- MFA restrictive for platform admins on tenant data
create policy platform_admin_requires_mfa_tenants
  on app.tenants
  as restrictive
  for all
  to authenticated
  using (app.require_admin_mfa())
  with check (app.require_admin_mfa());

create policy profiles_select_own
  on app.profiles for select to authenticated
  using (user_id = auth.uid() or app.is_platform_admin());

create policy profiles_update_own
  on app.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy platform_admins_select_self
  on app.platform_admins for select to authenticated
  using (user_id = auth.uid());

create policy tenants_select_member
  on app.tenants for select to authenticated
  using (
    deleted_at is null
    and app.is_member(id)
  );

create policy tenants_select_platform_admin
  on app.tenants for select to authenticated
  using (deleted_at is null and app.is_platform_admin() and app.is_member(id));

-- Platform admin sees all tenants they manage via membership OR all if we add membership on create
-- Additional: list all tenants for platform admin with admin membership only - create_tenant adds membership

create policy memberships_select_own
  on app.tenant_memberships for select to authenticated
  using (
    user_id = auth.uid()
    or (
      app.is_member(tenant_id)
      and app.membership_role(tenant_id) = 'admin'
    )
  );

create policy invites_select_admin
  on app.invites for select to authenticated
  using (app.has_capability(tenant_id, 'member.invite'));

create policy audit_events_select_member
  on app.audit_events for select to authenticated
  using (
    tenant_id is null
    or app.is_member(tenant_id)
  );

create policy deletion_requests_select_admin
  on app.deletion_requests for select to authenticated
  using (app.has_capability(tenant_id, 'tenant.delete'));

-- Inserts/updates on tenants directly blocked; use RPC
create policy tenants_no_direct_write
  on app.tenants for insert to authenticated
  with check (false);

create policy tenants_no_direct_update
  on app.tenants for update to authenticated
  using (false);

-- Grants
grant usage on schema app to authenticated, service_role;
grant select on all tables in schema app to authenticated;
grant select, insert, update on app.profiles to authenticated;
grant select on app.platform_admins to authenticated;
grant select on app.tenant_memberships to authenticated;
grant select on app.invites to authenticated;
grant select on app.audit_events to authenticated;
grant select on app.deletion_requests to authenticated;
grant select on app.system_settings to authenticated;

alter default privileges in schema app grant select on tables to authenticated;
