-- Terugkerende merkpersonages (Brand → Characters). Draai na 20260330136404.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-characters',
  'brand-characters',
  false,
  12582912,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists app.brand_characters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  name text not null default '',
  description text not null default '',
  visual_prompt text not null default '',
  face_path text not null default '',
  front_path text not null default '',
  side_path text not null default '',
  back_path text not null default '',
  contingency_path text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index if not exists brand_characters_tenant_idx
  on app.brand_characters (tenant_id, sort_order, created_at);

alter table app.brand_characters enable row level security;

create or replace function app._brand_character_json(p_row app.brand_characters)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'tenantId', p_row.tenant_id,
    'name', p_row.name,
    'description', p_row.description,
    'visualPrompt', p_row.visual_prompt,
    'assets', jsonb_build_object(
      'face', p_row.face_path,
      'front', p_row.front_path,
      'side', p_row.side_path,
      'back', p_row.back_path,
      'contingency', p_row.contingency_path
    ),
    'sortOrder', p_row.sort_order,
    'updatedAt', p_row.updated_at,
    'createdAt', p_row.created_at
  );
$$;

create or replace function app.list_brand_characters(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  return coalesce((
    select jsonb_agg(app._brand_character_json(c) order by c.sort_order, c.created_at)
    from app.brand_characters c
    where c.tenant_id = p_tenant_id
  ), '[]'::jsonb);
end;
$$;

create or replace function app.upsert_brand_character(
  p_tenant_id uuid,
  p_character_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_characters;
  v_name text;
  v_next_sort integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  v_name := btrim(coalesce(p_payload->>'name', ''));
  if length(v_name) < 1 then raise exception 'Naam is verplicht'; end if;
  if length(v_name) > 120 then raise exception 'Naam te lang'; end if;

  if p_character_id is null then
    select coalesce(max(sort_order), 0) + 1 into v_next_sort
    from app.brand_characters where tenant_id = p_tenant_id;
    insert into app.brand_characters (
      tenant_id, name, description, visual_prompt, sort_order, created_by
    ) values (
      p_tenant_id,
      v_name,
      left(coalesce(p_payload->>'description', ''), 4000),
      left(coalesce(p_payload->>'visualPrompt', ''), 8000),
      v_next_sort,
      auth.uid()
    )
    returning * into v_row;
  else
    select * into v_row
    from app.brand_characters
    where id = p_character_id and tenant_id = p_tenant_id
    for update;
    if v_row.id is null then raise exception 'Personage niet gevonden'; end if;

    update app.brand_characters set
      name = v_name,
      description = left(coalesce(p_payload->>'description', description), 4000),
      visual_prompt = left(coalesce(p_payload->>'visualPrompt', visual_prompt), 8000),
      sort_order = case
        when p_payload ? 'sortOrder' then greatest(0, (p_payload->>'sortOrder')::integer)
        else sort_order
      end,
      updated_at = now()
    where id = v_row.id
    returning * into v_row;
  end if;

  return app._brand_character_json(v_row);
end;
$$;

create or replace function app.set_brand_character_asset(
  p_character_id uuid,
  p_slot text,
  p_path text
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_characters;
  v_slot text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  v_slot := lower(btrim(coalesce(p_slot, '')));
  if v_slot not in ('face', 'front', 'side', 'back', 'contingency') then
    raise exception 'Ongeldig assettype';
  end if;

  select * into v_row from app.brand_characters where id = p_character_id for update;
  if v_row.id is null then raise exception 'Personage niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  if p_path is not null and btrim(p_path) <> '' then
    if p_path !~ ('^' || v_row.tenant_id::text || '/' || v_row.id::text || '/' || v_slot || '\.(png|jpe?g|webp)$') then
      raise exception 'Ongeldig bestandspad';
    end if;
  end if;

  update app.brand_characters set
    face_path = case when v_slot = 'face' then coalesce(p_path, '') else face_path end,
    front_path = case when v_slot = 'front' then coalesce(p_path, '') else front_path end,
    side_path = case when v_slot = 'side' then coalesce(p_path, '') else side_path end,
    back_path = case when v_slot = 'back' then coalesce(p_path, '') else back_path end,
    contingency_path = case when v_slot = 'contingency' then coalesce(p_path, '') else contingency_path end,
    updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return app._brand_character_json(v_row);
end;
$$;

create or replace function app.delete_brand_character(p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_characters;
  v_paths jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from app.brand_characters where id = p_character_id for update;
  if v_row.id is null then raise exception 'Personage niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select coalesce(jsonb_agg(to_jsonb(path)), '[]'::jsonb)
  into v_paths
  from unnest(array[
    v_row.face_path,
    v_row.front_path,
    v_row.side_path,
    v_row.back_path,
    v_row.contingency_path
  ]) as path
  where btrim(path) <> '';

  delete from app.brand_characters where id = v_row.id;

  return jsonb_build_object('tenantId', v_row.tenant_id, 'storagePaths', v_paths);
end;
$$;

create or replace function app.get_brand_character_lock_context(p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_characters;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from app.brand_characters where id = p_character_id;
  if v_row.id is null then raise exception 'Personage niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  return app._brand_character_json(v_row);
end;
$$;

revoke execute on function app._brand_character_json(app.brand_characters) from public, anon, authenticated;
revoke execute on function app.list_brand_characters(uuid) from public, anon;
revoke execute on function app.upsert_brand_character(uuid, uuid, jsonb) from public, anon;
revoke execute on function app.set_brand_character_asset(uuid, text, text) from public, anon;
revoke execute on function app.delete_brand_character(uuid) from public, anon;
revoke execute on function app.get_brand_character_lock_context(uuid) from public, anon;

grant execute on function app.list_brand_characters(uuid) to authenticated;
grant execute on function app.upsert_brand_character(uuid, uuid, jsonb) to authenticated;
grant execute on function app.set_brand_character_asset(uuid, text, text) to authenticated;
grant execute on function app.delete_brand_character(uuid) to authenticated;
grant execute on function app.get_brand_character_lock_context(uuid) to authenticated;
