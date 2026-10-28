-- Beeldmateriaal: gelaagde composities onder Content. Draai na 20260330136407.

create table if not exists app.beeld_compositions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  title text not null default 'Nieuw beeld',
  preset_id text not null default 'instagram_feed',
  image_quality text not null default '1K' check (image_quality in ('1K', '2K', '4K')),
  brand_character_id uuid references app.brand_characters (id) on delete set null,
  style_id text not null default '',
  document jsonb not null default '{"layers":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create index if not exists beeld_compositions_tenant_updated_idx
  on app.beeld_compositions (tenant_id, updated_at desc);

alter table app.beeld_compositions enable row level security;

create or replace function app._beeld_composition_json(p_row app.beeld_compositions)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'tenantId', p_row.tenant_id,
    'title', p_row.title,
    'presetId', p_row.preset_id,
    'imageQuality', p_row.image_quality,
    'brandCharacterId', p_row.brand_character_id,
    'styleId', p_row.style_id,
    'document', p_row.document,
    'updatedAt', p_row.updated_at,
    'createdAt', p_row.created_at
  );
$$;

create or replace function app.list_beeld_compositions(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'presetId', c.preset_id,
      'updatedAt', c.updated_at
    ) order by c.updated_at desc)
    from app.beeld_compositions c
    where c.tenant_id = p_tenant_id
  ), '[]'::jsonb);
end;
$$;

create or replace function app.create_beeld_composition(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.beeld_compositions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  insert into app.beeld_compositions (tenant_id, created_by, updated_by)
  values (p_tenant_id, auth.uid(), auth.uid())
  returning * into v_row;

  return app._beeld_composition_json(v_row);
end;
$$;

create or replace function app.get_beeld_composition(p_composition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.beeld_compositions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from app.beeld_compositions where id = p_composition_id;
  if v_row.id is null then raise exception 'Compositie niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  return app._beeld_composition_json(v_row);
end;
$$;

create or replace function app.save_beeld_composition(
  p_composition_id uuid,
  p_expected timestamptz,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.beeld_compositions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from app.beeld_compositions where id = p_composition_id for update;
  if v_row.id is null then raise exception 'Compositie niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_row.updated_at is distinct from p_expected then
    raise exception 'Compositie is intussen gewijzigd. Herlaad de pagina.';
  end if;

  update app.beeld_compositions set
    title = case when p_patch ? 'title' then left(coalesce(p_patch->>'title', title), 200) else title end,
    preset_id = case when p_patch ? 'presetId' then left(coalesce(p_patch->>'presetId', preset_id), 80) else preset_id end,
    image_quality = case
      when p_patch ? 'imageQuality' and coalesce(p_patch->>'imageQuality', '') in ('1K', '2K', '4K')
      then p_patch->>'imageQuality'
      else image_quality
    end,
    brand_character_id = case
      when p_patch ? 'brandCharacterId' then nullif(p_patch->>'brandCharacterId', '')::uuid
      else brand_character_id
    end,
    style_id = case when p_patch ? 'styleId' then left(coalesce(p_patch->>'styleId', ''), 120) else style_id end,
    document = case when p_patch ? 'document' then coalesce(p_patch->'document', document) else document end,
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_row.id
  returning * into v_row;

  return app._beeld_composition_json(v_row);
end;
$$;

create or replace function app.delete_beeld_composition(p_composition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.beeld_compositions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from app.beeld_compositions where id = p_composition_id for update;
  if v_row.id is null then raise exception 'Compositie niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  delete from app.beeld_compositions where id = v_row.id;
  return jsonb_build_object('tenantId', v_row.tenant_id, 'id', v_row.id);
end;
$$;

revoke execute on function app._beeld_composition_json(app.beeld_compositions) from public, anon, authenticated;
revoke execute on function app.list_beeld_compositions(uuid) from public, anon;
revoke execute on function app.create_beeld_composition(uuid) from public, anon;
revoke execute on function app.get_beeld_composition(uuid) from public, anon;
revoke execute on function app.save_beeld_composition(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function app.delete_beeld_composition(uuid) from public, anon;

grant execute on function app.list_beeld_compositions(uuid) to authenticated;
grant execute on function app.create_beeld_composition(uuid) to authenticated;
grant execute on function app.get_beeld_composition(uuid) to authenticated;
grant execute on function app.save_beeld_composition(uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.delete_beeld_composition(uuid) to authenticated;
