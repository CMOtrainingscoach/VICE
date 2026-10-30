-- Advertentie-creatives (Phase 1: voorbereiden, geen publish). Draai na 20260330136413.

create table if not exists app.ad_folders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists app.ad_concepts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  folder_id uuid references app.ad_folders (id) on delete set null,
  internal_name text not null default '',
  platform text not null check (platform in ('google_search', 'meta')),
  format text not null check (format in ('rsa', 'single_image', 'carousel')),
  meta_placements text[] not null default '{}'::text[],
  status text not null default 'draft' check (status in ('draft', 'ready_for_export', 'archived')),
  multi_language_enabled boolean not null default false,
  primary_language text not null default 'nl',
  legal_review_required boolean not null default false,
  legal_review_cleared boolean not null default false,
  legal_note text not null default '',
  payload jsonb not null default '{}'::jsonb,
  locale_payloads jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}'::text[],
  template_key text not null default '',
  beeld_composition_id uuid references app.beeld_compositions (id) on delete set null,
  selected_asset_id uuid,
  brand_id uuid references app.client_brands (id) on delete set null,
  brand_version_number integer,
  brand_voice_snapshot text not null default '',
  brand_visual_snapshot jsonb not null default '{}'::jsonb,
  buyer_persona_id uuid references app.persona_people (id) on delete set null,
  brand_character_id uuid references app.brand_characters (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table if not exists app.ad_concept_assets (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references app.ad_concepts (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  storage_path text not null,
  mime_type text not null default 'image/png',
  width integer,
  height integer,
  kind text not null default 'upload' check (kind in ('upload', 'beeld')),
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

alter table app.ad_concepts
  drop constraint if exists ad_concepts_selected_asset_fkey;
alter table app.ad_concepts
  add constraint ad_concepts_selected_asset_fkey
  foreign key (selected_asset_id) references app.ad_concept_assets (id) on delete set null;

create index ad_concepts_tenant_updated_idx on app.ad_concepts (tenant_id, updated_at desc);
create index ad_concepts_folder_idx on app.ad_concepts (folder_id);
create index ad_folders_tenant_idx on app.ad_folders (tenant_id, sort_order);
create index ad_concept_assets_concept_idx on app.ad_concept_assets (concept_id, sort_order);

alter table app.ad_folders enable row level security;
alter table app.ad_concepts enable row level security;
alter table app.ad_concept_assets enable row level security;

create or replace function app._ad_concept_asset_json(p_row app.ad_concept_assets)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', p_row.id,
    'storagePath', p_row.storage_path,
    'mimeType', p_row.mime_type,
    'width', p_row.width,
    'height', p_row.height,
    'kind', p_row.kind,
    'altText', p_row.alt_text,
    'sortOrder', p_row.sort_order,
    'createdAt', p_row.created_at
  );
$$;

create or replace function app._ad_concept_json(p_row app.ad_concepts)
returns jsonb
language plpgsql stable security definer set search_path = app, public, auth
as $$
declare
  v_assets jsonb;
  v_selected jsonb;
  v_folder_name text;
begin
  select coalesce(jsonb_agg(app._ad_concept_asset_json(a) order by a.sort_order, a.created_at), '[]'::jsonb)
  into v_assets from app.ad_concept_assets a where a.concept_id = p_row.id;

  v_selected := null;
  if p_row.selected_asset_id is not null then
    select app._ad_concept_asset_json(a) into v_selected
    from app.ad_concept_assets a where a.id = p_row.selected_asset_id;
  end if;

  select f.name into v_folder_name from app.ad_folders f where f.id = p_row.folder_id;

  return jsonb_build_object(
    'id', p_row.id,
    'tenantId', p_row.tenant_id,
    'folderId', p_row.folder_id,
    'folderName', v_folder_name,
    'internalName', p_row.internal_name,
    'platform', p_row.platform,
    'format', p_row.format,
    'metaPlacements', to_jsonb(p_row.meta_placements),
    'status', p_row.status,
    'multiLanguageEnabled', p_row.multi_language_enabled,
    'primaryLanguage', p_row.primary_language,
    'legalReviewRequired', p_row.legal_review_required,
    'legalReviewCleared', p_row.legal_review_cleared,
    'legalNote', p_row.legal_note,
    'payload', p_row.payload,
    'localePayloads', p_row.locale_payloads,
    'tags', to_jsonb(p_row.tags),
    'templateKey', p_row.template_key,
    'beeldCompositionId', p_row.beeld_composition_id,
    'selectedAssetId', p_row.selected_asset_id,
    'selectedAsset', v_selected,
    'assets', v_assets,
    'brandId', p_row.brand_id,
    'brandVersionNumber', p_row.brand_version_number,
    'brandVoiceSnapshot', p_row.brand_voice_snapshot,
    'brandVisualSnapshot', p_row.brand_visual_snapshot,
    'buyerPersonaId', p_row.buyer_persona_id,
    'brandCharacterId', p_row.brand_character_id,
    'createdAt', p_row.created_at,
    'updatedAt', p_row.updated_at
  );
end;
$$;

create or replace function app.list_ad_folders(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'name', f.name, 'sortOrder', f.sort_order
    ) order by f.sort_order, f.name), '[]'::jsonb)
    from app.ad_folders f where f.tenant_id = p_tenant_id
  );
end;
$$;

create or replace function app.upsert_ad_folder(p_tenant_id uuid, p_folder_id uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_row app.ad_folders;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if trim(p_name) = '' then raise exception 'Mapnaam is verplicht'; end if;

  if p_folder_id is not null then
    update app.ad_folders set name = trim(p_name), updated_at = now()
    where id = p_folder_id and tenant_id = p_tenant_id returning * into v_row;
    if v_row.id is null then raise exception 'Map niet gevonden'; end if;
  else
    insert into app.ad_folders (tenant_id, name) values (p_tenant_id, trim(p_name))
    returning * into v_row;
  end if;
  return jsonb_build_object('id', v_row.id, 'name', v_row.name, 'sortOrder', v_row.sort_order);
end;
$$;

create or replace function app.list_ad_concepts(p_tenant_id uuid, p_folder_id uuid default null)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'internalName', c.internal_name,
      'platform', c.platform,
      'format', c.format,
      'status', c.status,
      'folderId', c.folder_id,
      'tags', to_jsonb(c.tags),
      'legalReviewRequired', c.legal_review_required,
      'legalReviewCleared', c.legal_review_cleared,
      'updatedAt', c.updated_at
    ) order by c.updated_at desc), '[]'::jsonb)
    from app.ad_concepts c
    where c.tenant_id = p_tenant_id
      and c.status <> 'archived'
      and (p_folder_id is null or c.folder_id = p_folder_id)
  );
end;
$$;

create or replace function app.get_ad_concept(p_concept_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_row app.ad_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.ad_concepts where id = p_concept_id;
  if v_row.id is null then raise exception 'Advertentie niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  return app._ad_concept_json(v_row);
end;
$$;

create or replace function app.create_ad_concept(
  p_tenant_id uuid,
  p_platform text,
  p_format text,
  p_meta_placements text[],
  p_folder_id uuid,
  p_template_key text,
  p_payload jsonb,
  p_internal_name text,
  p_brand_id uuid,
  p_brand_version_number integer,
  p_brand_voice_snapshot text,
  p_brand_visual_snapshot jsonb
)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_row app.ad_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if p_platform not in ('google_search', 'meta') then raise exception 'Onbekend platform'; end if;
  if p_format not in ('rsa', 'single_image', 'carousel') then raise exception 'Onbekend formaat'; end if;

  insert into app.ad_concepts (
    tenant_id, platform, format, meta_placements, folder_id, template_key, payload,
    internal_name, brand_id, brand_version_number, brand_voice_snapshot, brand_visual_snapshot,
    created_by, updated_by
  ) values (
    p_tenant_id, p_platform, p_format, coalesce(p_meta_placements, '{}'::text[]),
    p_folder_id, coalesce(p_template_key, ''), coalesce(p_payload, '{}'::jsonb),
    coalesce(p_internal_name, ''), p_brand_id, p_brand_version_number,
    coalesce(p_brand_voice_snapshot, ''), coalesce(p_brand_visual_snapshot, '{}'::jsonb),
    auth.uid(), auth.uid()
  ) returning * into v_row;

  return app._ad_concept_json(v_row);
end;
$$;

create or replace function app.save_ad_concept(p_concept_id uuid, p_expected timestamptz, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare
  v_row app.ad_concepts;
  v_tags text[];
  v_meta text[];
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.ad_concepts where id = p_concept_id for update;
  if v_row.id is null then raise exception 'Advertentie niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if p_expected is not null and v_row.updated_at <> p_expected then
    raise exception 'Advertentie is ondertussen gewijzigd. Herlaad de pagina.';
  end if;

  if p_patch ? 'tags' then
    select coalesce(array_agg(value), '{}'::text[]) into v_tags
    from jsonb_array_elements_text(coalesce(p_patch->'tags', '[]'::jsonb)) as t(value);
  else v_tags := v_row.tags; end if;

  if p_patch ? 'metaPlacements' then
    select coalesce(array_agg(value), '{}'::text[]) into v_meta
    from jsonb_array_elements_text(coalesce(p_patch->'metaPlacements', '[]'::jsonb)) as t(value);
  else v_meta := v_row.meta_placements; end if;

  update app.ad_concepts set
    internal_name = case when p_patch ? 'internalName' then coalesce(p_patch->>'internalName', '') else internal_name end,
    folder_id = case when p_patch ? 'folderId' then nullif(p_patch->>'folderId', '')::uuid else folder_id end,
    status = case when p_patch ? 'status' then coalesce(p_patch->>'status', status) else status end,
    multi_language_enabled = case when p_patch ? 'multiLanguageEnabled' then coalesce((p_patch->>'multiLanguageEnabled')::boolean, false) else multi_language_enabled end,
    primary_language = case when p_patch ? 'primaryLanguage' then coalesce(p_patch->>'primaryLanguage', primary_language) else primary_language end,
    legal_review_required = case when p_patch ? 'legalReviewRequired' then coalesce((p_patch->>'legalReviewRequired')::boolean, false) else legal_review_required end,
    legal_review_cleared = case when p_patch ? 'legalReviewCleared' then coalesce((p_patch->>'legalReviewCleared')::boolean, false) else legal_review_cleared end,
    legal_note = case when p_patch ? 'legalNote' then coalesce(p_patch->>'legalNote', '') else legal_note end,
    payload = case when p_patch ? 'payload' then coalesce(p_patch->'payload', '{}'::jsonb) else payload end,
    locale_payloads = case when p_patch ? 'localePayloads' then coalesce(p_patch->'localePayloads', '{}'::jsonb) else locale_payloads end,
    tags = v_tags,
    meta_placements = v_meta,
    beeld_composition_id = case when p_patch ? 'beeldCompositionId' then nullif(p_patch->>'beeldCompositionId', '')::uuid else beeld_composition_id end,
    selected_asset_id = case when p_patch ? 'selectedAssetId' then nullif(p_patch->>'selectedAssetId', '')::uuid else selected_asset_id end,
    buyer_persona_id = case when p_patch ? 'buyerPersonaId' then nullif(p_patch->>'buyerPersonaId', '')::uuid else buyer_persona_id end,
    brand_character_id = case when p_patch ? 'brandCharacterId' then nullif(p_patch->>'brandCharacterId', '')::uuid else brand_character_id end,
    updated_at = now(),
    updated_by = auth.uid()
  where id = p_concept_id returning * into v_row;

  return app._ad_concept_json(v_row);
end;
$$;

create or replace function app.add_ad_concept_asset(
  p_concept_id uuid, p_path text, p_mime text, p_width integer, p_height integer,
  p_kind text, p_alt_text text, p_select boolean default true
)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_concept app.ad_concepts; v_asset app.ad_concept_assets; v_sort integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_concept from app.ad_concepts where id = p_concept_id for update;
  if v_concept.id is null then raise exception 'Advertentie niet gevonden'; end if;
  if not app.has_capability(v_concept.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort from app.ad_concept_assets where concept_id = p_concept_id;

  insert into app.ad_concept_assets (concept_id, tenant_id, storage_path, mime_type, width, height, kind, alt_text, sort_order, created_by)
  values (p_concept_id, v_concept.tenant_id, p_path, coalesce(p_mime, 'image/png'), p_width, p_height,
    case when p_kind = 'beeld' then 'beeld' else 'upload' end, coalesce(p_alt_text, ''), v_sort, auth.uid())
  returning * into v_asset;

  if p_select then
    update app.ad_concepts set selected_asset_id = v_asset.id, updated_at = now(), updated_by = auth.uid()
    where id = p_concept_id;
  end if;

  return app.get_ad_concept(p_concept_id);
end;
$$;

create or replace function app.delete_ad_concept_asset(p_asset_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_asset app.ad_concept_assets; v_concept app.ad_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_asset from app.ad_concept_assets where id = p_asset_id for update;
  if v_asset.id is null then raise exception 'Asset niet gevonden'; end if;
  if not app.has_capability(v_asset.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  select * into v_concept from app.ad_concepts where id = v_asset.concept_id for update;
  delete from app.ad_concept_assets where id = p_asset_id;
  if v_concept.selected_asset_id = p_asset_id then
    update app.ad_concepts set selected_asset_id = null, updated_at = now(), updated_by = auth.uid() where id = v_concept.id;
  end if;
  return app.get_ad_concept(v_concept.id);
end;
$$;

create or replace function app.delete_ad_concept(p_concept_id uuid)
returns void language plpgsql security definer set search_path = app, public, auth as $$
declare v_row app.ad_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.ad_concepts where id = p_concept_id for update;
  if v_row.id is null then raise exception 'Advertentie niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  delete from app.ad_concepts where id = p_concept_id;
end;
$$;

revoke all on function app._ad_concept_asset_json(app.ad_concept_assets) from public, anon, authenticated;
revoke execute on function app.list_ad_folders(uuid) from public, anon;
revoke execute on function app.upsert_ad_folder(uuid, uuid, text) from public, anon;
revoke execute on function app.list_ad_concepts(uuid, uuid) from public, anon;
revoke execute on function app.get_ad_concept(uuid) from public, anon;
revoke execute on function app.create_ad_concept(uuid, text, text, text[], uuid, text, jsonb, text, uuid, integer, text, jsonb) from public, anon;
revoke execute on function app.save_ad_concept(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function app.add_ad_concept_asset(uuid, text, text, integer, integer, text, text, boolean) from public, anon;
revoke execute on function app.delete_ad_concept_asset(uuid) from public, anon;
revoke execute on function app.delete_ad_concept(uuid) from public, anon;

grant execute on function app.list_ad_folders(uuid) to authenticated;
grant execute on function app.upsert_ad_folder(uuid, uuid, text) to authenticated;
grant execute on function app.list_ad_concepts(uuid, uuid) to authenticated;
grant execute on function app.get_ad_concept(uuid) to authenticated;
grant execute on function app.create_ad_concept(uuid, text, text, text[], uuid, text, jsonb, text, uuid, integer, text, jsonb) to authenticated;
grant execute on function app.save_ad_concept(uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.add_ad_concept_asset(uuid, text, text, integer, integer, text, text, boolean) to authenticated;
grant execute on function app.delete_ad_concept_asset(uuid) to authenticated;
grant execute on function app.delete_ad_concept(uuid) to authenticated;
