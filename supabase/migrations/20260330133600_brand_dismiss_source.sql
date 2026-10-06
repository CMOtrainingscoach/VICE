-- Een verwijderde publieke link komt bij een nieuwe scan niet terug. Draai na 20260330133500.

create or replace function app.register_brand_source(p_version_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_id uuid;
  v_hash text;
  v_path text;
  v_url text;
begin
  v_row := app._brand_for_edit(p_version_id);
  v_hash := left(coalesce(p_payload->>'content_hash', ''), 80);
  v_path := coalesce(p_payload->>'storage_path', '');
  v_url := left(coalesce(p_payload->>'source_url', ''), 400);
  if v_hash <> '' and exists (
    select 1 from app.brand_sources
    where version_id = p_version_id and content_hash = v_hash and archived_at is null
  ) then
    raise exception 'Dit bestand staat al in deze versie.';
  end if;
  if v_path <> '' and v_path !~ ('^' || v_row.tenant_id::text || '/' || v_row.id::text || '/[0-9a-f-]{36}\.(pdf|docx|jpg|jpeg|png|webp)$') then
    raise exception 'Ongeldig bestandspad';
  end if;
  v_id := null;
  if v_url <> '' and v_path = '' then
    select id into v_id from app.brand_sources
    where version_id = p_version_id and source_url = v_url and archived_at is not null
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  insert into app.brand_sources (
    version_id, tenant_id, kind, material_type, label, storage_path, mime, content_hash,
    period_label, currency, channel, audience, note, status, error_message, excerpt, source_url, created_by
  ) values (
    p_version_id, v_row.tenant_id,
    case when p_payload->>'kind' in ('upload', 'note', 'public') then p_payload->>'kind' else 'upload' end,
    left(coalesce(p_payload->>'material_type', 'other'), 40),
    left(coalesce(p_payload->>'label', ''), 200),
    left(v_path, 400),
    left(coalesce(p_payload->>'mime', ''), 120),
    v_hash,
    left(coalesce(p_payload->>'period_label', ''), 120),
    case when p_payload->>'currency' in ('current', 'historical', 'unknown') then p_payload->>'currency' else 'unknown' end,
    left(coalesce(p_payload->>'channel', ''), 120),
    left(coalesce(p_payload->>'audience', ''), 160),
    left(coalesce(p_payload->>'note', ''), 800),
    case when p_payload->>'status' in ('stored', 'ready', 'partial', 'failed') then p_payload->>'status' else 'stored' end,
    left(coalesce(p_payload->>'error_message', ''), 300),
    left(coalesce(p_payload->>'excerpt', ''), 4000),
    v_url,
    auth.uid()
  ) returning id into v_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_row.tenant_id, auth.uid(), 'brand.upload', 'brand_version', p_version_id::text, jsonb_build_object('source_id', v_id, 'kind', coalesce(p_payload->>'kind', 'upload')));
  perform app._brand_touch(p_version_id);
  return v_id;
end;
$$;
