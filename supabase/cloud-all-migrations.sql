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

create extension if not exists pgcrypto with schema extensions;

create or replace function app.create_invite(
  p_tenant_id uuid,
  p_email text,
  p_role app.membership_role default 'client'
)
returns table (invite_id uuid, raw_token text)
language plpgsql
security definer
set search_path = app, public, auth, extensions
as $$
declare
  v_token text;
  v_hash text;
  v_id uuid;
begin
  if not app.has_capability(p_tenant_id, 'member.invite') or not app.require_admin_mfa() then
    raise exception 'Forbidden';
  end if;

  if p_role = 'admin' and not app.is_platform_admin() then
    raise exception 'Only platform admin can invite admins';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  insert into app.invites (tenant_id, email, role, token_hash, expires_at, created_by)
  values (
    p_tenant_id,
    lower(trim(p_email)),
    p_role,
    v_hash,
    now() + interval '7 days',
    auth.uid()
  )
  returning id into v_id;

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (p_tenant_id, auth.uid(), 'member.invite', 'invite', v_id::text, jsonb_build_object('email', lower(trim(p_email))));

  invite_id := v_id;
  raw_token := v_token;
  return next;
end;
$$;

grant execute on function app.create_invite(uuid, text, app.membership_role) to authenticated;

create or replace function app.revoke_membership(p_tenant_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if not app.has_capability(p_tenant_id, 'member.revoke') or not app.require_admin_mfa() then
    raise exception 'Forbidden';
  end if;

  update app.tenant_memberships
  set revoked_at = now()
  where tenant_id = p_tenant_id and user_id = p_user_id;

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id)
  values (p_tenant_id, auth.uid(), 'member.revoke', 'user', p_user_id::text);
end;
$$;

grant execute on function app.revoke_membership(uuid, uuid) to authenticated;

-- Allow platform admins to read all tenants they belong to (already) â€” add list helper view
create or replace view app.my_tenants
with (security_invoker = true)
as
select t.*
from app.tenants t
inner join app.tenant_memberships tm on tm.tenant_id = t.id
where tm.user_id = auth.uid()
  and tm.revoked_at is null
  and t.deleted_at is null;

grant select on app.my_tenants to authenticated;

create or replace function app.get_auth_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
declare
  v_admin_count int;
  v_is_admin boolean;
begin
  select count(*) into v_admin_count from app.platform_admins;
  select exists (
    select 1 from app.platform_admins where user_id = auth.uid()
  ) into v_is_admin;

  return jsonb_build_object(
    'admin_count', v_admin_count,
    'is_platform_admin', v_is_admin
  );
end;
$$;

grant execute on function app.get_auth_status() to authenticated;

-- Fase 2: lightweight meeting recordings (metadata + private storage)

create type app.recording_status as enum ('uploading', 'ready', 'failed');

create table app.meeting_recordings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  storage_path text not null,
  mime_type text not null default 'audio/webm',
  byte_size bigint not null default 0,
  duration_ms integer not null default 0,
  capture_mode text not null default 'microphone',
  status app.recording_status not null default 'uploading',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint meeting_recordings_path_unique unique (storage_path),
  constraint meeting_recordings_byte_size_nonneg check (byte_size >= 0),
  constraint meeting_recordings_duration_nonneg check (duration_ms >= 0),
  constraint meeting_recordings_capture_mode check (
    capture_mode in ('microphone', 'tab_audio')
  )
);

create index meeting_recordings_tenant_created_idx
  on app.meeting_recordings (tenant_id, created_at desc);

alter table app.meeting_recordings enable row level security;

create policy meeting_recordings_select_member
  on app.meeting_recordings for select to authenticated
  using (app.has_capability(tenant_id, 'source.read_internal'));

create policy meeting_recordings_select_admin_record
  on app.meeting_recordings for select to authenticated
  using (app.has_capability(tenant_id, 'meeting.record'));

-- Writes via RPC only
create policy meeting_recordings_no_direct_write
  on app.meeting_recordings for insert to authenticated
  with check (false);

create policy meeting_recordings_no_direct_update
  on app.meeting_recordings for update to authenticated
  using (false);

grant select on app.meeting_recordings to authenticated;

-- 25 MiB per file; webm/opus only (speech-optimized pipeline)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meeting-recordings',
  'meeting-recordings',
  false,
  26214400,
  array['audio/webm', 'audio/ogg', 'audio/mp4']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function app.meeting_recording_tenant_from_path(p_path text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select nullif(split_part(p_path, '/', 1), '')::uuid;
$$;

create policy meeting_recordings_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meeting-recordings'
    and app.has_capability(
      app.meeting_recording_tenant_from_path(name),
      'meeting.record'
    )
  );

create policy meeting_recordings_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'meeting-recordings'
    and (
      app.has_capability(
        app.meeting_recording_tenant_from_path(name),
        'meeting.record'
      )
      or app.has_capability(
        app.meeting_recording_tenant_from_path(name),
        'source.read_internal'
      )
    )
  );

create policy meeting_recordings_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'meeting-recordings'
    and app.has_capability(
      app.meeting_recording_tenant_from_path(name),
      'meeting.record'
    )
  );

create or replace function app.start_meeting_recording(
  p_tenant_id uuid,
  p_capture_mode text default 'microphone',
  p_mime_type text default 'audio/webm'
)
returns table (recording_id uuid, storage_path text)
language plpgsql
security definer
set search_path = app, public, auth, extensions
as $$
declare
  v_id uuid;
  v_path text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not app.has_capability(p_tenant_id, 'meeting.record') then
    raise exception 'Not allowed to record for this tenant';
  end if;

  if p_capture_mode not in ('microphone', 'tab_audio') then
    raise exception 'Invalid capture mode';
  end if;

  v_id := gen_random_uuid();
  v_path := p_tenant_id::text || '/' || v_id::text || '.webm';

  insert into app.meeting_recordings (
    id,
    tenant_id,
    storage_path,
    mime_type,
    capture_mode,
    created_by
  )
  values (v_id, p_tenant_id, v_path, p_mime_type, p_capture_mode, auth.uid());

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id)
  values (
    p_tenant_id,
    auth.uid(),
    'meeting.recording.started',
    'meeting_recording',
    v_id::text
  );

  return query select v_id, v_path;
end;
$$;

revoke all on function app.start_meeting_recording(uuid, text, text) from public;
grant execute on function app.start_meeting_recording(uuid, text, text) to authenticated;

create or replace function app.complete_meeting_recording(
  p_recording_id uuid,
  p_byte_size bigint,
  p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path = app, public, auth, extensions
as $$
declare
  v_row app.meeting_recordings;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_row
  from app.meeting_recordings
  where id = p_recording_id
  for update;

  if v_row.id is null then
    raise exception 'Recording not found';
  end if;

  if v_row.created_by <> auth.uid() then
    raise exception 'Not the recording owner';
  end if;

  if not app.has_capability(v_row.tenant_id, 'meeting.record') then
    raise exception 'Not allowed';
  end if;

  if p_byte_size > 26214400 then
    raise exception 'File exceeds 25 MiB limit';
  end if;

  update app.meeting_recordings
  set
    byte_size = p_byte_size,
    duration_ms = p_duration_ms,
    status = 'ready'
  where id = p_recording_id;

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    v_row.tenant_id,
    auth.uid(),
    'meeting.recording.completed',
    'meeting_recording',
    p_recording_id::text,
    jsonb_build_object(
      'byte_size', p_byte_size,
      'duration_ms', p_duration_ms
    )
  );
end;
$$;

revoke all on function app.complete_meeting_recording(uuid, bigint, integer) from public;
grant execute on function app.complete_meeting_recording(uuid, bigint, integer) to authenticated;

create or replace function app.fail_meeting_recording(p_recording_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth, extensions
as $$
declare
  v_row app.meeting_recordings;
begin
  select * into v_row from app.meeting_recordings where id = p_recording_id;
  if v_row.id is null or v_row.created_by <> auth.uid() then
    return;
  end if;

  update app.meeting_recordings set status = 'failed' where id = p_recording_id;
end;
$$;

revoke all on function app.fail_meeting_recording(uuid) from public;
grant execute on function app.fail_meeting_recording(uuid) to authenticated;

-- 20260330130400_tenant_vat_number.sql
alter table app.tenants
  add column if not exists vat_number text;

comment on column app.tenants.vat_number is 'Belgisch BTW-nummer, genormaliseerd (bv. BE0123456789)';

drop function if exists app.create_tenant(text, text, text, text, text, text);

create or replace function app.create_tenant(
  p_name text,
  p_website text default null,
  p_vat_number text default null,
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
  v_vat text;
begin
  if not app.is_platform_admin() or not app.require_admin_mfa() then
    raise exception 'Forbidden';
  end if;

  v_vat := nullif(
    upper(regexp_replace(trim(coalesce(p_vat_number, '')), '[\s.\-]', '', 'g')),
    ''
  );

  insert into app.tenants (
    name,
    website,
    vat_number,
    contact_name,
    contact_email,
    audit_goal,
    language
  )
  values (
    trim(p_name),
    p_website,
    v_vat,
    p_contact_name,
    p_contact_email,
    coalesce(p_audit_goal, ''),
    coalesce(p_language, 'nl')
  )
  returning * into v_tenant;

  insert into app.tenant_memberships (tenant_id, user_id, role)
  values (v_tenant.id, auth.uid(), 'admin');

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id)
  values (v_tenant.id, auth.uid(), 'tenant.create', 'tenant', v_tenant.id::text);

  return v_tenant;
end;
$$;

grant execute on function app.create_tenant(text, text, text, text, text, text, text) to authenticated;

drop function if exists app.update_tenant(uuid, text, text, text, text, text, text);

create or replace function app.update_tenant(
  p_tenant_id uuid,
  p_name text,
  p_website text,
  p_vat_number text,
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
  v_vat text;
begin
  if not app.has_capability(p_tenant_id, 'tenant.update') or not app.require_admin_mfa() then
    raise exception 'Forbidden';
  end if;

  v_vat := nullif(
    upper(regexp_replace(trim(coalesce(p_vat_number, '')), '[\s.\-]', '', 'g')),
    ''
  );

  update app.tenants
  set
    name = trim(p_name),
    website = p_website,
    vat_number = v_vat,
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

grant execute on function app.update_tenant(uuid, text, text, text, text, text, text, text) to authenticated;
