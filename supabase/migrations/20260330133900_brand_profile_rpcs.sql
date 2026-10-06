-- RPC's voor de merkhandleiding. Draai direct na 20260330133800.

create or replace function app.get_brand_profile(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_profile app.brand_profiles;
  v_version app.brand_profile_versions;
  v_name text;
  v_edit boolean;
  v_newer jsonb;
  v_docs jsonb;
  v_base jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_edit := app.has_capability(p_tenant_id, 'audit.edit');
  if not v_edit and not app.has_capability(p_tenant_id, 'dashboard.read_published') then
    raise exception 'Forbidden';
  end if;
  v_name := null;
  select name into v_name from app.tenants where id = p_tenant_id and deleted_at is null;
  if v_name is null then raise exception 'Klant niet gevonden'; end if;
  v_profile := null;
  select * into v_profile from app.brand_profiles where tenant_id = p_tenant_id;

  if not v_edit then
    v_version := null;
    if v_profile is not null and v_profile.published_version_id is not null then
      select * into v_version from app.brand_profile_versions where id = v_profile.published_version_id;
    end if;
    if v_version is null then
      return jsonb_build_object('access', 'published', 'empty', true, 'tenantName', v_name);
    end if;
    return jsonb_build_object('access', 'published', 'empty', false, 'tenantName', v_name, 'publishedVersionId', v_version.id, 'version', app._brand_profile_version_json(v_version))
      || app._brand_profile_children(v_version.id, false);
  end if;

  v_version := null;
  if v_profile is not null then
    select * into v_version
    from app.brand_profile_versions
    where profile_id = v_profile.id
    order by version_number desc
    limit 1;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'status', d.status, 'savedAt', d.saved_at, 'brandVersionId', d.brand_version_id
  ) order by d.saved_at desc), '[]'::jsonb)
  into v_docs
  from app.audit_context_documents d
  where d.tenant_id = p_tenant_id;

  v_newer := null;
  if v_version is not null and v_version.source_document_id is not null then
    select jsonb_build_object('id', d.id, 'status', d.status, 'savedAt', d.saved_at)
    into v_newer
    from app.audit_context_documents d
    where d.tenant_id = p_tenant_id
      and (
        (d.id = v_version.source_document_id and md5(d.markdown) is distinct from v_version.source_hash)
        or (d.id is distinct from v_version.source_document_id and v_version.source_saved_at is not null and d.saved_at > v_version.source_saved_at)
      )
    order by d.saved_at desc
    limit 1;
  end if;

  v_base := jsonb_build_object(
    'access', 'edit',
    'tenantName', v_name,
    'publishedVersionId', case when v_profile is null then null else v_profile.published_version_id end,
    'documents', coalesce(v_docs, '[]'::jsonb),
    'newerSource', v_newer,
    'version', case when v_version is null then 'null'::jsonb else app._brand_profile_version_json(v_version) end
  );
  if v_version is null then
    return v_base || jsonb_build_object(
      'styles', '[]'::jsonb, 'fonts', '[]'::jsonb, 'colors', '[]'::jsonb, 'assets', '[]'::jsonb,
      'reviews', '[]'::jsonb, 'prompts', '[]'::jsonb, 'provenance', '[]'::jsonb
    );
  end if;
  return v_base || app._brand_profile_children(v_version.id, true);
end;
$$;

create or replace function app.get_brand_profile_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_doc app.audit_context_documents;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_doc := null;
  select * into v_doc from app.audit_context_documents where id = p_document_id;
  if v_doc is null then raise exception 'Auditdocument niet gevonden'; end if;
  if not app.has_capability(v_doc.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  return jsonb_build_object(
    'id', v_doc.id,
    'tenantId', v_doc.tenant_id,
    'status', v_doc.status,
    'savedAt', v_doc.saved_at,
    'markdown', v_doc.markdown,
    'hash', md5(v_doc.markdown)
  );
end;
$$;

create or replace function app.start_brand_profile(p_tenant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_profile app.brand_profiles;
  v_id uuid;
  v_number integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if not exists (select 1 from app.tenants where id = p_tenant_id and deleted_at is null) then
    raise exception 'Klant niet gevonden';
  end if;
  insert into app.brand_profiles (tenant_id) values (p_tenant_id) on conflict (tenant_id) do nothing;
  v_profile := null;
  select * into v_profile from app.brand_profiles where tenant_id = p_tenant_id for update;
  v_id := null;
  select id into v_id from app.brand_profile_versions
  where profile_id = v_profile.id and status = 'draft'
  order by version_number desc
  limit 1;
  if v_id is not null then return v_id; end if;
  v_number := null;
  select max(version_number) into v_number from app.brand_profile_versions where profile_id = v_profile.id;
  if v_number is not null then
    select id into v_id from app.brand_profile_versions
    where profile_id = v_profile.id and version_number = v_number;
    return v_id;
  end if;
  insert into app.brand_profile_versions (profile_id, tenant_id, version_number, updated_by)
  values (v_profile.id, p_tenant_id, 1, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function app.apply_brand_profile_import(p_version_id uuid, p_expected timestamptz, p_document_id uuid, p_payload jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
  v_doc app.audit_context_documents;
  v_item jsonb;
  v_key text;
  v_value text;
  v_hex text;
  v_role text;
  v_current text;
begin
  v_row := app._brand_profile_lock(p_version_id, p_expected);
  v_doc := null;
  select * into v_doc from app.audit_context_documents where id = p_document_id;
  if v_doc is null or v_doc.tenant_id <> v_row.tenant_id then raise exception 'Auditdocument niet gevonden'; end if;
  if v_row.source_document_id = p_document_id and v_row.source_hash = md5(v_doc.markdown) then
    return v_row.updated_at;
  end if;

  if p_payload ? 'brandName' and p_payload->'brandName' <> 'null'::jsonb then
    v_value := coalesce(p_payload->'brandName'->>'value', '');
    if v_value <> '' and not ('brandName' = any(v_row.manual_keys)) and v_row.brand_name = '' then
      update app.brand_profile_versions set brand_name = v_value where id = v_row.id;
      insert into app.brand_profile_provenance (version_id, tenant_id, field_key, origin, document_id, content_hash, section_path, passage, method)
      values (v_row.id, v_row.tenant_id, 'brandName', 'established', v_doc.id, md5(v_doc.markdown), coalesce(p_payload->'brandName'->>'sectionPath', ''), coalesce(p_payload->'brandName'->>'passage', ''), 'heading');
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'fields', '[]'::jsonb))
  loop
    v_key := coalesce(v_item->>'key', '');
    v_value := coalesce(v_item->>'value', '');
    if v_key = '' or v_value = '' or v_key = any(v_row.manual_keys) then continue; end if;
    v_current := case v_key
      when 'essence' then v_row.essence
      when 'positioning' then v_row.positioning
      when 'promise' then v_row.promise
      when 'audience' then v_row.audience
      when 'values' then v_row.values_text
      when 'voice' then coalesce(v_row.voice->>'summary', '')
      when 'visual' then coalesce(v_row.visual->>'summary', '')
      else ''
    end;
    if v_current <> '' and v_current is distinct from v_value then
      insert into app.brand_profile_reviews (version_id, tenant_id, section, label, origin, section_path, passage, proposal)
      select v_row.id, v_row.tenant_id, 'overview', 'Nieuwe bronwaarde · ' || v_key, 'established', coalesce(v_item->>'sectionPath', ''), coalesce(v_item->>'passage', ''),
        jsonb_build_object('kind', 'field', 'key', v_key, 'value', v_value)
      where not exists (
        select 1 from app.brand_profile_reviews r
        where r.version_id = v_row.id and r.passage = coalesce(v_item->>'passage', '') and r.decision = 'pending'
      );
      continue;
    end if;
    if v_key = 'essence' then update app.brand_profile_versions set essence = v_value where id = v_row.id;
    elsif v_key = 'positioning' then update app.brand_profile_versions set positioning = v_value where id = v_row.id;
    elsif v_key = 'promise' then update app.brand_profile_versions set promise = v_value where id = v_row.id;
    elsif v_key = 'audience' then update app.brand_profile_versions set audience = v_value where id = v_row.id;
    elsif v_key = 'values' then update app.brand_profile_versions set values_text = v_value where id = v_row.id;
    elsif v_key = 'voice' then update app.brand_profile_versions set voice = jsonb_set(coalesce(voice, '{}'::jsonb), '{summary}', to_jsonb(v_value), true) where id = v_row.id;
    elsif v_key = 'visual' then update app.brand_profile_versions set visual = jsonb_set(coalesce(visual, '{}'::jsonb), '{summary}', to_jsonb(v_value), true) where id = v_row.id;
    else continue;
    end if;
    insert into app.brand_profile_provenance (version_id, tenant_id, field_key, origin, document_id, content_hash, section_path, passage, method)
    values (v_row.id, v_row.tenant_id, v_key, 'established', v_doc.id, md5(v_doc.markdown), coalesce(v_item->>'sectionPath', ''), coalesce(v_item->>'passage', ''), coalesce(v_item->>'method', 'guideline'));
    select * into v_row from app.brand_profile_versions where id = p_version_id;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'reviews', '[]'::jsonb))
  loop
    insert into app.brand_profile_reviews (version_id, tenant_id, section, label, origin, section_path, passage, proposal)
    select v_row.id, v_row.tenant_id, coalesce(v_item->>'section', 'overview'), coalesce(v_item->>'label', 'Bron'), coalesce(v_item->>'origin', 'observed'),
      coalesce(v_item->>'sectionPath', ''), coalesce(v_item->>'passage', ''), v_item->'proposal'
    where not exists (
      select 1 from app.brand_profile_reviews r
      where r.version_id = v_row.id and r.label = coalesce(v_item->>'label', 'Bron') and r.passage = coalesce(v_item->>'passage', '') and r.decision = 'pending'
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'colors', '[]'::jsonb))
  loop
    v_hex := upper(coalesce(v_item->>'hex', ''));
    v_role := coalesce(v_item->>'role', 'unknown');
    if v_hex !~ '^#[0-9A-F]{6}$' then continue; end if;
    if v_role not in ('primary', 'secondary', 'accent', 'background', 'text', 'support', 'unknown') then v_role := 'unknown'; end if;
    insert into app.brand_profile_colors (version_id, tenant_id, name, hex, rgb, role, note, sort)
    select v_row.id, v_row.tenant_id, left(coalesce(v_item->>'name', 'Kleur'), 80), v_hex, app._brand_profile_rgb(v_hex), v_role, coalesce(v_item->>'note', ''),
      coalesce((select max(sort) + 1 from app.brand_profile_colors c where c.version_id = v_row.id), 0)
    where not exists (
      select 1 from app.brand_profile_colors c where c.version_id = v_row.id and c.hex = v_hex and c.archived_at is null
    );
    insert into app.brand_profile_provenance (version_id, tenant_id, field_key, origin, document_id, content_hash, section_path, passage, method)
    values (v_row.id, v_row.tenant_id, 'color:' || v_hex, 'established', v_doc.id, md5(v_doc.markdown), coalesce(v_item->>'sectionPath', ''), coalesce(v_item->>'passage', ''), 'guideline');
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'styles', '[]'::jsonb))
  loop
    insert into app.brand_profile_styles (version_id, tenant_id, role, family, size, unit, sort)
    select v_row.id, v_row.tenant_id, coalesce(v_item->>'role', 'Merkfont'), coalesce(v_item->>'family', ''), coalesce(v_item->>'size', ''), coalesce(v_item->>'unit', ''),
      coalesce((select max(sort) + 1 from app.brand_profile_styles s where s.version_id = v_row.id), 0)
    where coalesce(v_item->>'family', '') <> ''
      and not exists (
        select 1 from app.brand_profile_styles s
        where s.version_id = v_row.id and s.family = coalesce(v_item->>'family', '') and s.role = coalesce(v_item->>'role', 'Merkfont') and s.archived_at is null
      );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'prompts', '[]'::jsonb))
  loop
    insert into app.brand_profile_prompts (version_id, tenant_id, name, body, source_passage, composed)
    select v_row.id, v_row.tenant_id, coalesce(v_item->>'name', 'Prompt uit richtlijn'), coalesce(v_item->>'body', ''), coalesce(v_item->>'passage', ''), false
    where coalesce(v_item->>'body', '') <> ''
      and not exists (
        select 1 from app.brand_profile_prompts p where p.version_id = v_row.id and p.body = coalesce(v_item->>'body', '') and p.archived_at is null
      );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'assetNotes', '[]'::jsonb))
  loop
    insert into app.brand_profile_assets (version_id, tenant_id, kind, name, missing_note, export_allowed)
    select v_row.id, v_row.tenant_id, 'primary', left(coalesce(v_item->>'name', 'Asset'), 120), 'Bestand niet gekoppeld. Upload of koppel het zelf. Er is niets automatisch opgehaald.', false
    where not exists (
      select 1 from app.brand_profile_assets a where a.version_id = v_row.id and a.name = left(coalesce(v_item->>'name', 'Asset'), 120) and a.archived_at is null
    );
  end loop;

  update app.brand_profile_versions
  set source_document_id = v_doc.id,
      source_hash = md5(v_doc.markdown),
      source_status = v_doc.status,
      source_saved_at = v_doc.saved_at,
      import_warnings = coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'warnings', '[]'::jsonb))), '{}')
  where id = v_row.id;
  return app._brand_profile_touch(v_row.id);
end;
$$;

create or replace function app.save_brand_profile_fields(p_version_id uuid, p_expected timestamptz, p_patch jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
  v_keys text[] := '{}';
begin
  v_row := app._brand_profile_lock(p_version_id, p_expected);
  if p_patch ? 'brandName' then
    update app.brand_profile_versions set brand_name = coalesce(p_patch->>'brandName', '') where id = v_row.id;
    v_keys := v_keys || 'brandName';
  end if;
  if p_patch ? 'essence' then
    update app.brand_profile_versions set essence = coalesce(p_patch->>'essence', '') where id = v_row.id;
    v_keys := v_keys || 'essence';
  end if;
  if p_patch ? 'positioning' then
    update app.brand_profile_versions set positioning = coalesce(p_patch->>'positioning', '') where id = v_row.id;
    v_keys := v_keys || 'positioning';
  end if;
  if p_patch ? 'promise' then
    update app.brand_profile_versions set promise = coalesce(p_patch->>'promise', '') where id = v_row.id;
    v_keys := v_keys || 'promise';
  end if;
  if p_patch ? 'audience' then
    update app.brand_profile_versions set audience = coalesce(p_patch->>'audience', '') where id = v_row.id;
    v_keys := v_keys || 'audience';
  end if;
  if p_patch ? 'valuesText' then
    update app.brand_profile_versions set values_text = coalesce(p_patch->>'valuesText', '') where id = v_row.id;
    v_keys := v_keys || 'values';
  end if;
  if p_patch ? 'voice' then
    update app.brand_profile_versions set voice = coalesce(p_patch->'voice', '{}'::jsonb) where id = v_row.id;
    v_keys := v_keys || 'voice';
  end if;
  if p_patch ? 'visual' then
    update app.brand_profile_versions set visual = coalesce(p_patch->'visual', '{}'::jsonb) where id = v_row.id;
    v_keys := v_keys || 'visual';
  end if;
  if p_patch ? 'notApplicable' then
    update app.brand_profile_versions
    set not_applicable = coalesce(array(select jsonb_array_elements_text(p_patch->'notApplicable')), '{}')
    where id = v_row.id;
  end if;
  update app.brand_profile_versions
  set manual_keys = (
    select coalesce(array_agg(distinct key), '{}')
    from unnest(v_row.manual_keys || v_keys) as key
  )
  where id = v_row.id;
  insert into app.brand_profile_provenance (version_id, tenant_id, field_key, origin, content_hash, section_path, passage, method)
  select v_row.id, v_row.tenant_id, key, 'strategist', '', 'Strategistinput', '', 'strategist'
  from unnest(v_keys) as key;
  return app._brand_profile_touch(v_row.id);
end;
$$;

create or replace function app.upsert_brand_profile_color(p_version_id uuid, p_expected timestamptz, p_color jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
  v_id uuid;
  v_hex text;
  v_role text;
begin
  v_row := app._brand_profile_lock(p_version_id, p_expected);
  v_hex := upper(coalesce(p_color->>'hex', ''));
  if v_hex !~ '^#[0-9A-F]{6}$' then raise exception 'Ongeldige kleurcode. Gebruik een hexwaarde zoals #1B3A4B.'; end if;
  v_role := coalesce(p_color->>'role', 'unknown');
  if v_role not in ('primary', 'secondary', 'accent', 'background', 'text', 'support', 'unknown') then v_role := 'unknown'; end if;
  v_id := nullif(p_color->>'id', '')::uuid;
  if v_id is null then
    insert into app.brand_profile_colors (version_id, tenant_id, name, hex, rgb, role, note, cmyk, pantone, sort)
    values (
      v_row.id, v_row.tenant_id, left(coalesce(p_color->>'name', ''), 80), v_hex, app._brand_profile_rgb(v_hex), v_role,
      coalesce(p_color->>'note', ''), coalesce(p_color->>'cmyk', ''), coalesce(p_color->>'pantone', ''), coalesce((p_color->>'sort')::int, 0)
    );
  else
    update app.brand_profile_colors
    set name = left(coalesce(p_color->>'name', ''), 80), hex = v_hex, rgb = app._brand_profile_rgb(v_hex), role = v_role,
        note = coalesce(p_color->>'note', ''), cmyk = coalesce(p_color->>'cmyk', ''), pantone = coalesce(p_color->>'pantone', ''),
        sort = coalesce((p_color->>'sort')::int, sort)
    where id = v_id and version_id = v_row.id and archived_at is null;
    if not found then raise exception 'Kleur niet gevonden'; end if;
  end if;
  return app._brand_profile_touch(v_row.id);
end;
$$;

create or replace function app.upsert_brand_profile_style(p_version_id uuid, p_expected timestamptz, p_style jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
  v_id uuid;
begin
  v_row := app._brand_profile_lock(p_version_id, p_expected);
  v_id := nullif(p_style->>'id', '')::uuid;
  if v_id is null then
    insert into app.brand_profile_styles (
      version_id, tenant_id, role, family, weight, italic, size, unit, line_height, letter_spacing, transform, usage, fallback, sample, mobile_size, mobile_unit, sort
    ) values (
      v_row.id, v_row.tenant_id, coalesce(p_style->>'role', ''), coalesce(p_style->>'family', ''), coalesce(p_style->>'weight', ''),
      coalesce((p_style->>'italic')::boolean, false), coalesce(p_style->>'size', ''), coalesce(p_style->>'unit', ''),
      coalesce(p_style->>'lineHeight', ''), coalesce(p_style->>'letterSpacing', ''), coalesce(p_style->>'transform', ''),
      coalesce(p_style->>'usage', ''), coalesce(p_style->>'fallback', ''), coalesce(p_style->>'sample', ''),
      coalesce(p_style->>'mobileSize', ''), coalesce(p_style->>'mobileUnit', ''), coalesce((p_style->>'sort')::int, 0)
    );
  else
    update app.brand_profile_styles
    set role = coalesce(p_style->>'role', role), family = coalesce(p_style->>'family', family), weight = coalesce(p_style->>'weight', ''),
        italic = coalesce((p_style->>'italic')::boolean, false), size = coalesce(p_style->>'size', ''), unit = coalesce(p_style->>'unit', ''),
        line_height = coalesce(p_style->>'lineHeight', ''), letter_spacing = coalesce(p_style->>'letterSpacing', ''),
        transform = coalesce(p_style->>'transform', ''), usage = coalesce(p_style->>'usage', ''), fallback = coalesce(p_style->>'fallback', ''),
        sample = coalesce(p_style->>'sample', ''), mobile_size = coalesce(p_style->>'mobileSize', ''), mobile_unit = coalesce(p_style->>'mobileUnit', ''),
        sort = coalesce((p_style->>'sort')::int, sort)
    where id = v_id and version_id = v_row.id and archived_at is null;
    if not found then raise exception 'Tekststijl niet gevonden'; end if;
  end if;
  return app._brand_profile_touch(v_row.id);
end;
$$;

create or replace function app.archive_brand_profile_item(p_version_id uuid, p_expected timestamptz, p_kind text, p_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
  v_count integer;
begin
  v_row := app._brand_profile_lock(p_version_id, p_expected);
  if p_kind = 'color' then
    update app.brand_profile_colors set archived_at = now() where id = p_id and version_id = v_row.id and archived_at is null;
  elsif p_kind = 'style' then
    update app.brand_profile_styles set archived_at = now() where id = p_id and version_id = v_row.id and archived_at is null;
  elsif p_kind = 'asset' then
    update app.brand_profile_assets set archived_at = now() where id = p_id and version_id = v_row.id and archived_at is null;
  elsif p_kind = 'prompt' then
    update app.brand_profile_prompts set archived_at = now() where id = p_id and version_id = v_row.id and archived_at is null;
  else
    raise exception 'Onbekend onderdeel';
  end if;
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'Onderdeel niet gevonden'; end if;
  return app._brand_profile_touch(v_row.id);
end;
$$;

create or replace function app.register_brand_profile_file(p_version_id uuid, p_expected timestamptz, p_kind text, p_file jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
  v_path text;
begin
  v_row := app._brand_profile_lock(p_version_id, p_expected);
  v_path := coalesce(p_file->>'path', '');
  if v_path not like v_row.tenant_id::text || '/' || v_row.id::text || '/%' then
    raise exception 'Ongeldig pad';
  end if;
  if p_kind = 'font' then
    if coalesce((p_file->>'useConfirmed')::boolean, false) is not true then
      raise exception 'Bevestig dat dit font gebruikt mag worden.';
    end if;
    insert into app.brand_profile_fonts (version_id, tenant_id, name, storage_path, weights, italic, variable, origin, license_note, export_allowed, use_confirmed)
    values (
      v_row.id, v_row.tenant_id, coalesce(p_file->>'name', ''), v_path, coalesce(p_file->>'weights', ''),
      coalesce((p_file->>'italic')::boolean, false), coalesce((p_file->>'variable')::boolean, false),
      'upload', coalesce(p_file->>'licenseNote', ''), coalesce((p_file->>'exportAllowed')::boolean, false), true
    );
  elsif p_kind = 'asset' then
    insert into app.brand_profile_assets (version_id, tenant_id, kind, name, storage_path, format, reference_status, export_allowed, missing_note)
    values (
      v_row.id, v_row.tenant_id, coalesce(p_file->>'kind', 'primary'), coalesce(p_file->>'name', ''), v_path,
      coalesce(p_file->>'format', ''), coalesce(p_file->>'referenceStatus', 'official'),
      coalesce((p_file->>'exportAllowed')::boolean, false), ''
    );
  else
    raise exception 'Onbekend bestand';
  end if;
  return app._brand_profile_touch(v_row.id);
end;
$$;

create or replace function app.update_brand_profile_asset(p_version_id uuid, p_expected timestamptz, p_asset jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
  v_kind text;
  v_status text;
begin
  v_row := app._brand_profile_lock(p_version_id, p_expected);
  v_kind := coalesce(p_asset->>'kind', 'primary');
  v_status := coalesce(p_asset->>'referenceStatus', 'official');
  if v_kind not in ('primary', 'alternate', 'wordmark', 'mark', 'light', 'dark', 'mono', 'favicon', 'reference') then
    raise exception 'Onbekende variant';
  end if;
  if v_status not in ('official', 'approved_reference', 'inspiration', 'ai_example') then
    raise exception 'Onbekende status';
  end if;
  update app.brand_profile_assets
  set kind = v_kind, name = coalesce(p_asset->>'name', name), usage = coalesce(p_asset->>'usage', ''),
      background = coalesce(p_asset->>'background', ''), min_size = coalesce(p_asset->>'minSize', ''),
      clear_space = coalesce(p_asset->>'clearSpace', ''), restrictions = coalesce(p_asset->>'restrictions', ''),
      reference_status = v_status, export_allowed = coalesce((p_asset->>'exportAllowed')::boolean, false),
      width = coalesce(p_asset->>'width', ''), height = coalesce(p_asset->>'height', '')
  where id = (p_asset->>'id')::uuid and version_id = v_row.id and archived_at is null;
  if not found then raise exception 'Asset niet gevonden'; end if;
  return app._brand_profile_touch(v_row.id);
end;
$$;

create or replace function app.resolve_brand_profile_review(p_version_id uuid, p_expected timestamptz, p_review_id uuid, p_decision text, p_value text)
returns timestamptz
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
  v_review app.brand_profile_reviews;
  v_kind text;
  v_key text;
  v_text text;
  v_hex text;
  v_role text;
begin
  v_row := app._brand_profile_lock(p_version_id, p_expected);
  if p_decision not in ('accept', 'dismiss', 'keep', 'combine') then raise exception 'Onbekende keuze'; end if;
  v_review := null;
  select * into v_review from app.brand_profile_reviews where id = p_review_id and version_id = v_row.id and decision = 'pending';
  if v_review is null then raise exception 'Beoordeling niet gevonden'; end if;
  if p_decision in ('dismiss', 'keep') then
    update app.brand_profile_reviews set decision = 'dismissed' where id = v_review.id;
    if p_decision = 'keep' and v_review.proposal is not null and v_review.proposal->>'key' is not null then
      update app.brand_profile_versions
      set manual_keys = (select coalesce(array_agg(distinct key), '{}') from unnest(v_row.manual_keys || array[v_review.proposal->>'key']) as key)
      where id = v_row.id;
    end if;
    return app._brand_profile_touch(v_row.id);
  end if;
  v_kind := coalesce(v_review.proposal->>'kind', '');
  v_text := case when p_decision = 'combine' then coalesce(p_value, '') else coalesce(v_review.proposal->>'value', p_value, '') end;
  if v_kind = 'field' or p_decision = 'combine' then
    v_key := coalesce(v_review.proposal->>'key', '');
    if v_key = 'essence' then update app.brand_profile_versions set essence = v_text where id = v_row.id;
    elsif v_key = 'positioning' then update app.brand_profile_versions set positioning = v_text where id = v_row.id;
    elsif v_key = 'promise' then update app.brand_profile_versions set promise = v_text where id = v_row.id;
    elsif v_key = 'audience' then update app.brand_profile_versions set audience = v_text where id = v_row.id;
    elsif v_key = 'values' then update app.brand_profile_versions set values_text = v_text where id = v_row.id;
    elsif v_key = 'brandName' then update app.brand_profile_versions set brand_name = v_text where id = v_row.id;
    elsif v_key = 'voice' or v_kind = 'voice' then
      update app.brand_profile_versions set voice = jsonb_set(coalesce(voice, '{}'::jsonb), '{summary}', to_jsonb(v_text), true) where id = v_row.id;
      v_key := 'voice';
    elsif v_key = 'visual' or v_kind = 'visual' then
      update app.brand_profile_versions set visual = jsonb_set(coalesce(visual, '{}'::jsonb), '{summary}', to_jsonb(v_text), true) where id = v_row.id;
      v_key := 'visual';
    elsif v_key = '' then
      raise exception 'Kies welk veld deze tekst wordt.';
    end if;
    if v_key <> '' then
      update app.brand_profile_versions
      set manual_keys = (select coalesce(array_agg(distinct key), '{}') from unnest(manual_keys || array[v_key]) as key)
      where id = v_row.id;
    end if;
  elsif v_kind = 'color' then
    v_hex := upper(coalesce(v_review.proposal->>'hex', ''));
    v_role := coalesce(v_review.proposal->>'role', 'unknown');
    if v_hex !~ '^#[0-9A-F]{6}$' then raise exception 'Deze bron noemt geen geldige kleurcode.'; end if;
    if v_role not in ('primary', 'secondary', 'accent', 'background', 'text', 'support', 'unknown') then v_role := 'unknown'; end if;
    insert into app.brand_profile_colors (version_id, tenant_id, name, hex, rgb, role)
    select v_row.id, v_row.tenant_id, coalesce(v_review.proposal->>'name', 'Kleur'), v_hex, app._brand_profile_rgb(v_hex), v_role
    where not exists (select 1 from app.brand_profile_colors c where c.version_id = v_row.id and c.hex = v_hex and c.archived_at is null);
  elsif v_kind = 'font' then
    insert into app.brand_profile_styles (version_id, tenant_id, role, family, size, unit)
    values (v_row.id, v_row.tenant_id, coalesce(v_review.proposal->>'role', 'Merkfont'), coalesce(v_review.proposal->>'family', ''), coalesce(v_review.proposal->>'size', ''), coalesce(v_review.proposal->>'unit', ''));
  elsif v_kind = 'voice' then
    update app.brand_profile_versions set voice = jsonb_set(coalesce(voice, '{}'::jsonb), '{summary}', to_jsonb(v_text), true) where id = v_row.id;
  elsif v_kind = 'visual' then
    update app.brand_profile_versions set visual = jsonb_set(coalesce(visual, '{}'::jsonb), '{summary}', to_jsonb(v_text), true) where id = v_row.id;
  else
    raise exception 'Deze passage heeft geen veld om over te nemen. Vul het merk handmatig aan.';
  end if;
  update app.brand_profile_reviews set decision = 'accepted' where id = v_review.id;
  insert into app.brand_profile_provenance (version_id, tenant_id, field_key, origin, section_path, passage, method)
  values (v_row.id, v_row.tenant_id, coalesce(v_review.proposal->>'key', v_kind), 'strategist', v_review.section_path, v_review.passage, 'accepted');
  return app._brand_profile_touch(v_row.id);
end;
$$;

create or replace function app.insert_brand_profile_reviews(p_version_id uuid, p_expected timestamptz, p_reviews jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
  v_item jsonb;
begin
  v_row := app._brand_profile_lock(p_version_id, p_expected);
  for v_item in select value from jsonb_array_elements(coalesce(p_reviews, '[]'::jsonb))
  loop
    insert into app.brand_profile_reviews (version_id, tenant_id, section, label, origin, section_path, passage, proposal)
    select v_row.id, v_row.tenant_id, coalesce(v_item->>'section', 'overview'), coalesce(v_item->>'label', 'Bron'), coalesce(v_item->>'origin', 'observed'),
      coalesce(v_item->>'sectionPath', ''), coalesce(v_item->>'passage', ''), v_item->'proposal'
    where not exists (
      select 1 from app.brand_profile_reviews r
      where r.version_id = v_row.id and r.label = coalesce(v_item->>'label', 'Bron') and r.passage = coalesce(v_item->>'passage', '') and r.decision = 'pending'
    );
  end loop;
  return app._brand_profile_touch(v_row.id);
end;
$$;

create or replace function app.upsert_brand_profile_prompt(p_version_id uuid, p_expected timestamptz, p_prompt jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
  v_id uuid;
begin
  v_row := app._brand_profile_lock(p_version_id, p_expected);
  v_id := nullif(p_prompt->>'id', '')::uuid;
  if v_id is null then
    insert into app.brand_profile_prompts (version_id, tenant_id, name, purpose, situation, body, exclusions, composed, source_passage)
    values (
      v_row.id, v_row.tenant_id, coalesce(p_prompt->>'name', 'Template'), coalesce(p_prompt->>'purpose', ''),
      coalesce(p_prompt->>'situation', ''), coalesce(p_prompt->>'body', ''), coalesce(p_prompt->>'exclusions', ''),
      coalesce((p_prompt->>'composed')::boolean, true), coalesce(p_prompt->>'sourcePassage', '')
    );
  else
    update app.brand_profile_prompts
    set name = coalesce(p_prompt->>'name', name), purpose = coalesce(p_prompt->>'purpose', ''), situation = coalesce(p_prompt->>'situation', ''),
        body = coalesce(p_prompt->>'body', ''), exclusions = coalesce(p_prompt->>'exclusions', ''), updated_at = now()
    where id = v_id and version_id = v_row.id and archived_at is null;
    if not found then raise exception 'Template niet gevonden'; end if;
  end if;
  return app._brand_profile_touch(v_row.id);
end;
$$;

create or replace function app.save_brand_prompt_instance(p_version_id uuid, p_template_id uuid, p_input jsonb, p_output text)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_row := null;
  select * into v_row from app.brand_profile_versions where id = p_version_id;
  if v_row is null then raise exception 'Merkprofiel niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') and not app.has_capability(v_row.tenant_id, 'dashboard.read_published') then
    raise exception 'Forbidden';
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') and v_row.status <> 'published' then
    raise exception 'Forbidden';
  end if;
  insert into app.brand_prompt_instances (version_id, tenant_id, template_id, input, output, created_by)
  values (v_row.id, v_row.tenant_id, p_template_id, coalesce(p_input, '{}'::jsonb), coalesce(p_output, ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function app.approve_brand_profile(p_version_id uuid, p_expected timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
  v_pending integer;
  v_snapshot jsonb;
begin
  v_row := app._brand_profile_lock(p_version_id, p_expected);
  if not app.has_capability(v_row.tenant_id, 'audit.approve') and not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  select count(*) into v_pending from app.brand_profile_reviews where version_id = v_row.id and decision = 'pending';
  if v_pending > 0 then
    raise exception 'Er staan nog bronnen ter beoordeling. Neem ze over of laat ze weg voordat je goedkeurt.';
  end if;
  v_snapshot := jsonb_build_object('version', app._brand_profile_version_json(v_row)) || app._brand_profile_children(v_row.id, false);
  update app.brand_profile_versions
  set status = 'approved', approved_at = now(), approved_by = auth.uid(), approved_snapshot = v_snapshot
  where id = v_row.id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_row.tenant_id, auth.uid(), 'brand.profile.approve', 'brand_profile_version', v_row.id::text, '{}'::jsonb);
  return app._brand_profile_touch(v_row.id);
end;
$$;

create or replace function app.publish_brand_profile(p_version_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_row := null;
  select * into v_row from app.brand_profile_versions where id = p_version_id for update;
  if v_row is null then raise exception 'Merkprofiel niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'dashboard.publish') and not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  if v_row.status <> 'approved' and v_row.status <> 'published' then
    raise exception 'Keur de merkdefinitie eerst goed. Publiceren is een aparte stap.';
  end if;
  update app.brand_profile_versions
  set status = 'approved'
  where profile_id = v_row.profile_id and status = 'published' and id <> v_row.id;
  update app.brand_profile_versions
  set status = 'published', published_at = now(), published_by = auth.uid()
  where id = v_row.id;
  update app.brand_profiles set published_version_id = v_row.id where id = v_row.profile_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_row.tenant_id, auth.uid(), 'brand.profile.publish', 'brand_profile_version', v_row.id::text, '{}'::jsonb);
  return now();
end;
$$;

create or replace function app.fork_brand_profile(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
  v_new uuid;
  v_number integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_row := null;
  select * into v_row from app.brand_profile_versions where id = p_version_id for update;
  if v_row is null then raise exception 'Merkprofiel niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_row.status = 'draft' then return v_row.id; end if;
  if exists (select 1 from app.brand_profile_versions where profile_id = v_row.profile_id and status = 'draft') then
    select id into v_new from app.brand_profile_versions where profile_id = v_row.profile_id and status = 'draft' order by version_number desc limit 1;
    return v_new;
  end if;
  select coalesce(max(version_number), 0) + 1 into v_number from app.brand_profile_versions where profile_id = v_row.profile_id;
  insert into app.brand_profile_versions (
    profile_id, tenant_id, version_number, source_document_id, source_hash, source_status, source_saved_at,
    brand_name, essence, positioning, promise, audience, values_text, voice, visual, import_warnings, manual_keys, not_applicable, updated_by
  ) values (
    v_row.profile_id, v_row.tenant_id, v_number, v_row.source_document_id, v_row.source_hash, v_row.source_status, v_row.source_saved_at,
    v_row.brand_name, v_row.essence, v_row.positioning, v_row.promise, v_row.audience, v_row.values_text, v_row.voice, v_row.visual,
    v_row.import_warnings, v_row.manual_keys, v_row.not_applicable, auth.uid()
  ) returning id into v_new;
  insert into app.brand_profile_styles (version_id, tenant_id, role, family, weight, italic, size, unit, line_height, letter_spacing, transform, usage, fallback, sample, mobile_size, mobile_unit, sort)
  select v_new, tenant_id, role, family, weight, italic, size, unit, line_height, letter_spacing, transform, usage, fallback, sample, mobile_size, mobile_unit, sort
  from app.brand_profile_styles where version_id = v_row.id and archived_at is null;
  insert into app.brand_profile_fonts (version_id, tenant_id, name, storage_path, weights, italic, variable, origin, license_note, export_allowed, use_confirmed)
  select v_new, tenant_id, name, storage_path, weights, italic, variable, origin, license_note, export_allowed, use_confirmed
  from app.brand_profile_fonts where version_id = v_row.id;
  insert into app.brand_profile_colors (version_id, tenant_id, name, hex, rgb, role, note, cmyk, pantone, sort)
  select v_new, tenant_id, name, hex, rgb, role, note, cmyk, pantone, sort
  from app.brand_profile_colors where version_id = v_row.id and archived_at is null;
  insert into app.brand_profile_assets (version_id, tenant_id, kind, name, storage_path, format, width, height, usage, background, min_size, clear_space, restrictions, reference_status, export_allowed, missing_note)
  select v_new, tenant_id, kind, name, storage_path, format, width, height, usage, background, min_size, clear_space, restrictions, reference_status, export_allowed, missing_note
  from app.brand_profile_assets where version_id = v_row.id and archived_at is null;
  insert into app.brand_profile_prompts (version_id, tenant_id, name, purpose, situation, body, exclusions, composed, source_passage)
  select v_new, tenant_id, name, purpose, situation, body, exclusions, composed, source_passage
  from app.brand_profile_prompts where version_id = v_row.id and archived_at is null;
  insert into app.brand_profile_provenance (version_id, tenant_id, field_key, origin, document_id, content_hash, section_path, passage, method, imported_at)
  select v_new, tenant_id, field_key, origin, document_id, content_hash, section_path, passage, method, imported_at
  from app.brand_profile_provenance where version_id = v_row.id;
  return v_new;
end;
$$;

revoke execute on function app.get_brand_profile(uuid) from public, anon;
revoke execute on function app.get_brand_profile_document(uuid) from public, anon;
revoke execute on function app.start_brand_profile(uuid) from public, anon;
revoke execute on function app.apply_brand_profile_import(uuid, timestamptz, uuid, jsonb) from public, anon;
revoke execute on function app.save_brand_profile_fields(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function app.upsert_brand_profile_color(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function app.upsert_brand_profile_style(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function app.archive_brand_profile_item(uuid, timestamptz, text, uuid) from public, anon;
revoke execute on function app.register_brand_profile_file(uuid, timestamptz, text, jsonb) from public, anon;
revoke execute on function app.update_brand_profile_asset(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function app.resolve_brand_profile_review(uuid, timestamptz, uuid, text, text) from public, anon;
revoke execute on function app.insert_brand_profile_reviews(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function app.upsert_brand_profile_prompt(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function app.save_brand_prompt_instance(uuid, uuid, jsonb, text) from public, anon;
revoke execute on function app.approve_brand_profile(uuid, timestamptz) from public, anon;
revoke execute on function app.publish_brand_profile(uuid) from public, anon;
revoke execute on function app.fork_brand_profile(uuid) from public, anon;

grant execute on function app.get_brand_profile(uuid) to authenticated;
grant execute on function app.get_brand_profile_document(uuid) to authenticated;
grant execute on function app.start_brand_profile(uuid) to authenticated;
grant execute on function app.apply_brand_profile_import(uuid, timestamptz, uuid, jsonb) to authenticated;
grant execute on function app.save_brand_profile_fields(uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.upsert_brand_profile_color(uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.upsert_brand_profile_style(uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.archive_brand_profile_item(uuid, timestamptz, text, uuid) to authenticated;
grant execute on function app.register_brand_profile_file(uuid, timestamptz, text, jsonb) to authenticated;
grant execute on function app.update_brand_profile_asset(uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.resolve_brand_profile_review(uuid, timestamptz, uuid, text, text) to authenticated;
grant execute on function app.insert_brand_profile_reviews(uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.upsert_brand_profile_prompt(uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.save_brand_prompt_instance(uuid, uuid, jsonb, text) to authenticated;
grant execute on function app.approve_brand_profile(uuid, timestamptz) to authenticated;
grant execute on function app.publish_brand_profile(uuid) to authenticated;
grant execute on function app.fork_brand_profile(uuid) to authenticated;


