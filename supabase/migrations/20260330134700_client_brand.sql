-- Actieve merkdefinitie per klant, manueel ingevuld.
-- Gebruikt later als context voor contentgeneratie.
-- Draai na 20260330134600.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-kit',
  'brand-kit',
  false,
  8388608,
  array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'font/woff', 'font/woff2', 'application/font-woff', 'application/font-woff2']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists app.client_brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references app.tenants (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  version_number integer not null default 1,
  brand_name text not null default '',
  tagline text not null default '',
  positioning text not null default '',
  voice text not null default '',
  typography jsonb not null default '{}'::jsonb,
  colors jsonb not null default '[]'::jsonb,
  visual jsonb not null default '{}'::jsonb,
  prompt_templates jsonb not null default '[]'::jsonb,
  logo_path text not null default '',
  logo_name text not null default '',
  source_note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  approved_at timestamptz,
  approved_by uuid references auth.users (id)
);

alter table app.client_brands enable row level security;

create or replace function app._client_brand_defaults()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'h1', jsonb_build_object('family', '', 'weight', '400', 'size', '48', 'lineHeight', '56', 'mobileSize', '32', 'mobileLineHeight', '40', 'sample', ''),
    'h2', jsonb_build_object('family', '', 'weight', '400', 'size', '32', 'lineHeight', '40', 'mobileSize', '26', 'mobileLineHeight', '34', 'sample', ''),
    'h3', jsonb_build_object('family', '', 'weight', '600', 'size', '24', 'lineHeight', '32', 'mobileSize', '20', 'mobileLineHeight', '28', 'sample', ''),
    'body', jsonb_build_object('family', '', 'weight', '400', 'size', '16', 'lineHeight', '26', 'mobileSize', '16', 'mobileLineHeight', '26', 'sample', '')
  );
$$;

create or replace function app._client_brand_json(p_row app.client_brands)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'tenantId', p_row.tenant_id,
    'status', p_row.status,
    'versionNumber', p_row.version_number,
    'brandName', p_row.brand_name,
    'tagline', p_row.tagline,
    'positioning', p_row.positioning,
    'voice', p_row.voice,
    'typography', coalesce(nullif(p_row.typography, '{}'::jsonb), app._client_brand_defaults()),
    'colors', coalesce(p_row.colors, '[]'::jsonb),
    'visual', coalesce(p_row.visual, '{}'::jsonb),
    'promptTemplates', coalesce(p_row.prompt_templates, '[]'::jsonb),
    'logoPath', p_row.logo_path,
    'logoName', p_row.logo_name,
    'sourceNote', p_row.source_note,
    'updatedAt', p_row.updated_at,
    'approvedAt', p_row.approved_at
  );
$$;

create or replace function app.get_client_brand(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.client_brands;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit')
     and not app.has_capability(p_tenant_id, 'dashboard.read_published') then
    raise exception 'Forbidden';
  end if;
  select name into v_name from app.tenants where id = p_tenant_id and deleted_at is null;
  if v_name is null then raise exception 'Klant niet gevonden'; end if;

  v_row := null;
  select * into v_row from app.client_brands where tenant_id = p_tenant_id;
  if v_row.id is null then
    return jsonb_build_object('tenantName', v_name, 'brand', null);
  end if;
  return jsonb_build_object('tenantName', v_name, 'brand', app._client_brand_json(v_row));
end;
$$;

create or replace function app.start_client_brand(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.client_brands;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  select name into v_name from app.tenants where id = p_tenant_id and deleted_at is null;
  if v_name is null then raise exception 'Klant niet gevonden'; end if;

  insert into app.client_brands (tenant_id, brand_name, typography, updated_by)
  values (p_tenant_id, v_name, app._client_brand_defaults(), auth.uid())
  on conflict (tenant_id) do nothing;

  select * into v_row from app.client_brands where tenant_id = p_tenant_id;
  return app._client_brand_json(v_row);
end;
$$;

create or replace function app.save_client_brand(p_tenant_id uuid, p_expected timestamptz, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.client_brands;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select * into v_row from app.client_brands where tenant_id = p_tenant_id for update;
  if v_row.id is null then raise exception 'Merkdefinitie niet gevonden. Start eerst Brand.'; end if;
  if v_row.status <> 'draft' then
    raise exception 'Goedgekeurde versie is alleen-lezen. Klik eerst op Bewerken.';
  end if;
  if p_expected is not null and v_row.updated_at <> p_expected then
    raise exception 'Deze versie is intussen gewijzigd. Vernieuw de pagina.';
  end if;

  update app.client_brands set
    brand_name = coalesce(p_patch->>'brandName', brand_name),
    tagline = coalesce(p_patch->>'tagline', tagline),
    positioning = coalesce(p_patch->>'positioning', positioning),
    voice = coalesce(p_patch->>'voice', voice),
    typography = case when p_patch ? 'typography' then coalesce(p_patch->'typography', typography) else typography end,
    colors = case when p_patch ? 'colors' then coalesce(p_patch->'colors', colors) else colors end,
    visual = case when p_patch ? 'visual' then coalesce(p_patch->'visual', visual) else visual end,
    prompt_templates = case when p_patch ? 'promptTemplates' then coalesce(p_patch->'promptTemplates', prompt_templates) else prompt_templates end,
    source_note = coalesce(p_patch->>'sourceNote', source_note),
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_row.id
  returning * into v_row;

  return app._client_brand_json(v_row);
end;
$$;

create or replace function app.set_client_brand_logo(p_tenant_id uuid, p_expected timestamptz, p_path text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.client_brands;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  select * into v_row from app.client_brands where tenant_id = p_tenant_id for update;
  if v_row.id is null then raise exception 'Merkdefinitie niet gevonden'; end if;
  if v_row.status <> 'draft' then raise exception 'Goedgekeurde versie is alleen-lezen. Klik eerst op Bewerken.'; end if;
  if p_expected is not null and v_row.updated_at <> p_expected then
    raise exception 'Deze versie is intussen gewijzigd. Vernieuw de pagina.';
  end if;
  update app.client_brands set
    logo_path = coalesce(p_path, ''),
    logo_name = coalesce(p_name, ''),
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_row.id
  returning * into v_row;
  return app._client_brand_json(v_row);
end;
$$;

create or replace function app.approve_client_brand(p_tenant_id uuid, p_expected timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.client_brands;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  select * into v_row from app.client_brands where tenant_id = p_tenant_id for update;
  if v_row.id is null then raise exception 'Merkdefinitie niet gevonden'; end if;
  if v_row.status <> 'draft' then raise exception 'Deze versie is al goedgekeurd.'; end if;
  if p_expected is not null and v_row.updated_at <> p_expected then
    raise exception 'Deze versie is intussen gewijzigd. Vernieuw de pagina.';
  end if;
  update app.client_brands set
    status = 'approved',
    approved_at = now(),
    approved_by = auth.uid(),
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_row.id
  returning * into v_row;
  return app._client_brand_json(v_row);
end;
$$;

create or replace function app.reopen_client_brand(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.client_brands;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  select * into v_row from app.client_brands where tenant_id = p_tenant_id for update;
  if v_row.id is null then raise exception 'Merkdefinitie niet gevonden'; end if;
  if v_row.status = 'draft' then return app._client_brand_json(v_row); end if;
  update app.client_brands set
    status = 'draft',
    version_number = version_number + 1,
    approved_at = null,
    approved_by = null,
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_row.id
  returning * into v_row;
  return app._client_brand_json(v_row);
end;
$$;

revoke execute on function app.get_client_brand(uuid) from public, anon;
revoke execute on function app.start_client_brand(uuid) from public, anon;
revoke execute on function app.save_client_brand(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function app.set_client_brand_logo(uuid, timestamptz, text, text) from public, anon;
revoke execute on function app.approve_client_brand(uuid, timestamptz) from public, anon;
revoke execute on function app.reopen_client_brand(uuid) from public, anon;
revoke execute on function app._client_brand_defaults() from public, anon, authenticated;
revoke execute on function app._client_brand_json(app.client_brands) from public, anon, authenticated;

grant execute on function app.get_client_brand(uuid) to authenticated;
grant execute on function app.start_client_brand(uuid) to authenticated;
grant execute on function app.save_client_brand(uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.set_client_brand_logo(uuid, timestamptz, text, text) to authenticated;
grant execute on function app.approve_client_brand(uuid, timestamptz) to authenticated;
grant execute on function app.reopen_client_brand(uuid) to authenticated;
