-- Meerdere ICP-profielen per klant. Draai na 20260330135900.

create table if not exists app.tenant_icp_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  is_primary boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  version_number integer not null default 1 check (version_number >= 1),
  profile jsonb not null default '{}'::jsonb,
  source_document_saved_at timestamptz,
  ai_generated_at timestamptz,
  sort_order integer not null default 0,
  archived_at timestamptz,
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenant_icp_profiles_tenant_idx
  on app.tenant_icp_profiles (tenant_id, archived_at nulls first, sort_order, created_at desc);

create unique index if not exists tenant_icp_profiles_one_primary_per_tenant
  on app.tenant_icp_profiles (tenant_id)
  where is_primary = true and archived_at is null;

alter table app.tenant_icp_profiles enable row level security;

create or replace function app._tenant_icp_profile_json(p_row app.tenant_icp_profiles)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'tenantId', p_row.tenant_id,
    'isPrimary', p_row.is_primary,
    'status', p_row.status,
    'versionNumber', p_row.version_number,
    'profile', p_row.profile,
    'sourceDocumentSavedAt', p_row.source_document_saved_at,
    'aiGeneratedAt', p_row.ai_generated_at,
    'updatedAt', p_row.updated_at
  );
$$;

create or replace function app._tenant_icp_for_edit(p_icp_id uuid)
returns app.tenant_icp_profiles
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.tenant_icp_profiles;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.tenant_icp_profiles where id = p_icp_id and archived_at is null;
  if v_row.id is null then raise exception 'ICP niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  return v_row;
end;
$$;

create or replace function app.list_tenant_icp_profiles(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'tenantId', p.tenant_id,
        'isPrimary', p.is_primary,
        'status', p.status,
        'versionNumber', p.version_number,
        'headline', left(coalesce(p.profile->>'headline', ''), 200),
        'updatedAt', p.updated_at
      )
      order by p.is_primary desc, p.sort_order, p.created_at
    )
    from app.tenant_icp_profiles p
    where p.tenant_id = p_tenant_id and p.archived_at is null
  ), '[]'::jsonb);
end;
$$;

create or replace function app.get_tenant_icp_profile(p_icp_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.tenant_icp_profiles;
begin
  v_row := app._tenant_icp_for_edit(p_icp_id);
  return app._tenant_icp_profile_json(v_row);
end;
$$;

create or replace function app.create_tenant_icp_profile(
  p_tenant_id uuid,
  p_profile jsonb,
  p_is_primary boolean default false,
  p_source_document_saved_at timestamptz default null,
  p_ai_generated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.tenant_icp_profiles;
  v_count integer;
  v_primary boolean;
  v_sort integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Ongeldig ICP-profiel';
  end if;

  select count(*) into v_count
  from app.tenant_icp_profiles
  where tenant_id = p_tenant_id and archived_at is null;

  v_primary := p_is_primary or v_count = 0;
  if v_primary then
    update app.tenant_icp_profiles set is_primary = false where tenant_id = p_tenant_id and archived_at is null;
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort
  from app.tenant_icp_profiles where tenant_id = p_tenant_id;

  insert into app.tenant_icp_profiles (
    tenant_id, is_primary, status, version_number, profile, sort_order,
    source_document_saved_at, ai_generated_at, updated_by
  ) values (
    p_tenant_id,
    v_primary,
    'draft',
    1,
    p_profile,
    v_sort,
    p_source_document_saved_at,
    p_ai_generated_at,
    auth.uid()
  )
  returning * into v_row;

  return app._tenant_icp_profile_json(v_row);
end;
$$;

create or replace function app.save_tenant_icp_profile(
  p_icp_id uuid,
  p_profile jsonb,
  p_status text default null,
  p_bump_version boolean default false,
  p_expected timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.tenant_icp_profiles;
  v_status text;
  v_version integer;
begin
  v_row := app._tenant_icp_for_edit(p_icp_id);
  if p_expected is not null and v_row.updated_at <> p_expected then
    raise exception 'ICP is intussen gewijzigd. Herlaad de pagina.';
  end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Ongeldig ICP-profiel';
  end if;

  v_status := nullif(btrim(coalesce(p_status, '')), '');
  if v_status is not null and v_status not in ('draft', 'approved') then
    raise exception 'Ongeldige status';
  end if;

  v_version := v_row.version_number;
  if p_bump_version then v_version := v_version + 1; end if;
  if v_row.status = 'approved' and v_status = 'draft' then
    v_version := v_version + 1;
  end if;

  update app.tenant_icp_profiles
  set profile = p_profile,
      status = coalesce(v_status, v_row.status),
      version_number = v_version,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_icp_id
  returning * into v_row;

  return app._tenant_icp_profile_json(v_row);
end;
$$;

create or replace function app.set_tenant_icp_primary(p_icp_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.tenant_icp_profiles;
begin
  v_row := app._tenant_icp_for_edit(p_icp_id);
  update app.tenant_icp_profiles set is_primary = false where tenant_id = v_row.tenant_id and archived_at is null;
  update app.tenant_icp_profiles set is_primary = true, updated_at = now() where id = p_icp_id
  returning * into v_row;
  return app._tenant_icp_profile_json(v_row);
end;
$$;

create or replace function app.archive_tenant_icp_profile(p_icp_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.tenant_icp_profiles;
  v_next uuid;
begin
  v_row := app._tenant_icp_for_edit(p_icp_id);
  update app.tenant_icp_profiles
  set archived_at = now(), is_primary = false, updated_at = now()
  where id = p_icp_id;

  if v_row.is_primary then
    select id into v_next
    from app.tenant_icp_profiles
    where tenant_id = v_row.tenant_id and archived_at is null and id <> p_icp_id
    order by sort_order, created_at
    limit 1;
    if v_next is not null then
      update app.tenant_icp_profiles set is_primary = true where id = v_next;
    end if;
  end if;
end;
$$;

revoke execute on function app.list_tenant_icp_profiles(uuid) from public, anon;
revoke execute on function app.get_tenant_icp_profile(uuid) from public, anon;
revoke execute on function app.create_tenant_icp_profile(uuid, jsonb, boolean, timestamptz, timestamptz) from public, anon;
revoke execute on function app.save_tenant_icp_profile(uuid, jsonb, text, boolean, timestamptz) from public, anon;
revoke execute on function app.set_tenant_icp_primary(uuid) from public, anon;
revoke execute on function app.archive_tenant_icp_profile(uuid) from public, anon;

grant execute on function app.list_tenant_icp_profiles(uuid) to authenticated;
grant execute on function app.get_tenant_icp_profile(uuid) to authenticated;
grant execute on function app.create_tenant_icp_profile(uuid, jsonb, boolean, timestamptz, timestamptz) to authenticated;
grant execute on function app.save_tenant_icp_profile(uuid, jsonb, text, boolean, timestamptz) to authenticated;
grant execute on function app.set_tenant_icp_primary(uuid) to authenticated;
grant execute on function app.archive_tenant_icp_profile(uuid) to authenticated;
