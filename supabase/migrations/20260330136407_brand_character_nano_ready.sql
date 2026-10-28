-- Nano workflow: character "ready" (geen LoRA). Draai na 20260330136406.

alter table app.brand_characters
  add column if not exists ready_status text not null default 'draft'
    check (ready_status in ('draft', 'ready', 'stale')),
  add column if not exists refs_fingerprint text not null default '',
  add column if not exists activated_at timestamptz;

create or replace function app._brand_character_refs_fingerprint(p_row app.brand_characters)
returns text
language sql
immutable
as $$
  select md5(concat_ws(
    '|',
    btrim(p_row.face_path),
    btrim(p_row.front_path),
    btrim(p_row.side_path),
    btrim(p_row.back_path),
    btrim(p_row.contingency_path),
    btrim(p_row.visual_prompt)
  ));
$$;

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
    'readyStatus', p_row.ready_status,
    'refsFingerprint', p_row.refs_fingerprint,
    'activatedAt', p_row.activated_at,
    'sortOrder', p_row.sort_order,
    'updatedAt', p_row.updated_at,
    'createdAt', p_row.created_at
  );
$$;

create or replace function app.activate_brand_character(p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_characters;
  v_fp text;
  v_ref_count integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from app.brand_characters where id = p_character_id for update;
  if v_row.id is null then raise exception 'Personage niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  if btrim(v_row.face_path) = '' then
    raise exception 'Upload minstens een gezichts-close-up (face) voordat je activeert.';
  end if;

  v_ref_count := (
    (case when btrim(v_row.face_path) <> '' then 1 else 0 end) +
    (case when btrim(v_row.front_path) <> '' then 1 else 0 end) +
    (case when btrim(v_row.side_path) <> '' then 1 else 0 end) +
    (case when btrim(v_row.back_path) <> '' then 1 else 0 end) +
    (case when btrim(v_row.contingency_path) <> '' then 1 else 0 end)
  );
  if v_ref_count < 2 then
    raise exception 'Upload minstens twee referentiebeelden (face + één andere).';
  end if;

  v_fp := app._brand_character_refs_fingerprint(v_row);

  update app.brand_characters set
    ready_status = 'ready',
    refs_fingerprint = v_fp,
    activated_at = now(),
    updated_at = now()
  where id = v_row.id
  returning * into v_row;

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
  v_fp text;
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

  if v_row.ready_status = 'ready' then
    v_fp := app._brand_character_refs_fingerprint(v_row);
    if v_fp is distinct from v_row.refs_fingerprint then
      update app.brand_characters set ready_status = 'stale', updated_at = now()
      where id = v_row.id
      returning * into v_row;
    end if;
  end if;

  return app._brand_character_json(v_row);
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
  v_fp text;
  v_old_prompt text;
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

    v_old_prompt := v_row.visual_prompt;

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

    if v_row.ready_status = 'ready'
      and p_payload ? 'visualPrompt'
      and left(coalesce(p_payload->>'visualPrompt', ''), 8000) is distinct from v_old_prompt then
      v_fp := app._brand_character_refs_fingerprint(v_row);
      if v_fp is distinct from v_row.refs_fingerprint then
        update app.brand_characters set ready_status = 'stale', updated_at = now()
        where id = v_row.id
        returning * into v_row;
      end if;
    end if;
  end if;

  return app._brand_character_json(v_row);
end;
$$;

create or replace function app.list_brand_characters_for_content(p_tenant_id uuid)
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
      'name', c.name,
      'referenceCount', (
        (case when btrim(c.face_path) <> '' then 1 else 0 end) +
        (case when btrim(c.front_path) <> '' then 1 else 0 end) +
        (case when btrim(c.side_path) <> '' then 1 else 0 end) +
        (case when btrim(c.back_path) <> '' then 1 else 0 end) +
        (case when btrim(c.contingency_path) <> '' then 1 else 0 end)
      ),
      'readyStatus', c.ready_status
    ) order by c.sort_order, c.created_at)
    from app.brand_characters c
    where c.tenant_id = p_tenant_id and c.ready_status = 'ready'
  ), '[]'::jsonb);
end;
$$;

revoke execute on function app._brand_character_refs_fingerprint(app.brand_characters) from public, anon, authenticated;
revoke execute on function app.activate_brand_character(uuid) from public, anon;
grant execute on function app.activate_brand_character(uuid) to authenticated;
