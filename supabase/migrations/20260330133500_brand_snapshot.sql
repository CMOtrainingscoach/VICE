-- Homepage-snapshot en pins op de website-stap. Draai na 20260330133400.

alter table app.brand_pages
  add column if not exists screenshot_path text not null default '';

alter table app.brand_findings
  add column if not exists pin_x smallint,
  add column if not exists pin_y smallint,
  add column if not exists scan_key text not null default '';

alter table app.brand_findings drop constraint if exists brand_findings_pin_x_check;
alter table app.brand_findings drop constraint if exists brand_findings_pin_y_check;
alter table app.brand_findings
  add constraint brand_findings_pin_x_check check (pin_x is null or pin_x between 0 and 100),
  add constraint brand_findings_pin_y_check check (pin_y is null or pin_y between 0 and 100);

create or replace function app.set_brand_page_screenshot(p_page_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_page app.brand_pages;
begin
  v_page := null;
  select * into v_page from app.brand_pages where id = p_page_id;
  if v_page is null then raise exception 'Pagina niet gevonden'; end if;
  perform app._brand_for_edit(v_page.version_id);
  update app.brand_pages
  set screenshot_path = left(coalesce(p_path, ''), 400)
  where id = p_page_id;
  perform app._brand_touch(v_page.version_id);
end;
$$;

create or replace function app.set_brand_source_read(p_source_id uuid, p_excerpt text, p_status text, p_error text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_source app.brand_sources;
begin
  v_source := null;
  select * into v_source from app.brand_sources where id = p_source_id and archived_at is null;
  if v_source is null then raise exception 'Bron niet gevonden'; end if;
  perform app._brand_for_edit(v_source.version_id);
  update app.brand_sources
  set excerpt = left(coalesce(p_excerpt, ''), 4000),
      status = case when p_status in ('stored', 'ready', 'partial', 'failed') then p_status else status end,
      error_message = left(coalesce(p_error, ''), 300)
  where id = p_source_id;
  perform app._brand_touch(v_source.version_id);
end;
$$;

create or replace function app.get_brand_media(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_row := null;
  select * into v_row from app.brand_versions where id = p_version_id;
  if v_row is null then raise exception 'Brand audit niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  return jsonb_build_object(
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'screenshot_path', p.screenshot_path))
      from app.brand_pages p where p.version_id = p_version_id
    ), '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'pin_x', f.pin_x, 'pin_y', f.pin_y))
      from app.brand_findings f where f.version_id = p_version_id and f.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function app.apply_brand_scan(p_version_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_item jsonb;
  v_page uuid;
  v_source uuid;
  v_locked uuid;
  v_open uuid;
  v_lens text;
  v_key text;
  v_pin_x smallint;
  v_pin_y smallint;
begin
  v_row := app._brand_for_edit(p_version_id);
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'findings', '[]'::jsonb))
  loop
    if length(btrim(coalesce(v_item->>'observation', ''))) < 20 then continue; end if;
    v_page := null;
    v_source := null;
    v_locked := null;
    v_open := null;
    v_lens := case when v_item->>'lens' in ('visual', 'text', 'journey') then v_item->>'lens' else 'text' end;
    v_key := left(coalesce(v_item->>'scan_key', ''), 80);
    v_pin_x := null;
    v_pin_y := null;
    if (v_item->>'pin_x') ~ '^[0-9]+$' then v_pin_x := least(100, greatest(0, (v_item->>'pin_x')::int)); end if;
    if (v_item->>'pin_y') ~ '^[0-9]+$' then v_pin_y := least(100, greatest(0, (v_item->>'pin_y')::int)); end if;
    select id into v_page from app.brand_pages
    where version_id = p_version_id and url = left(coalesce(v_item->>'page_url', ''), 400) and included
    limit 1;
    if coalesce(v_item->>'source_label', '') <> '' then
      select id into v_source from app.brand_sources
      where version_id = p_version_id and archived_at is null and label = left(v_item->>'source_label', 200)
      limit 1;
    end if;
    if v_key <> '' then
      select id into v_locked from app.brand_findings
      where version_id = p_version_id and archived_at is null and manual_lock and scan_key = v_key
      limit 1;
      if v_locked is not null then continue; end if;
      select id into v_open from app.brand_findings
      where version_id = p_version_id and archived_at is null and not manual_lock and scan_key = v_key
      limit 1;
    else
      select id into v_locked from app.brand_findings
      where version_id = p_version_id and archived_at is null and manual_lock and lens = v_lens
        and page_id is not distinct from v_page and source_id is not distinct from v_source
      limit 1;
      if v_locked is not null then continue; end if;
      select id into v_open from app.brand_findings
      where version_id = p_version_id and archived_at is null and not manual_lock and lens = v_lens
        and page_id is not distinct from v_page and source_id is not distinct from v_source
      limit 1;
    end if;
    if v_open is null then
      if v_key <> '' then
        update app.brand_findings set archived_at = now()
        where version_id = p_version_id and archived_at is null and not manual_lock and scan_key = ''
          and lens = v_lens and page_id is not distinct from v_page and source_id is not distinct from v_source;
      end if;
      insert into app.brand_findings (
        version_id, tenant_id, page_id, source_id, lens, observation, meaning, proposal,
        hypothesis, persona_label, phase_label, manual_lock, pin_x, pin_y, scan_key
      ) values (
        p_version_id, v_row.tenant_id, v_page, v_source, v_lens,
        left(coalesce(v_item->>'observation', ''), 1200),
        left(coalesce(v_item->>'meaning', ''), 1200),
        left(coalesce(v_item->>'proposal', ''), 800),
        coalesce((v_item->>'hypothesis')::boolean, true),
        left(coalesce(v_item->>'persona_label', ''), 160),
        left(coalesce(v_item->>'phase_label', ''), 160),
        false, v_pin_x, v_pin_y, v_key
      );
    else
      update app.brand_findings
      set observation = left(coalesce(v_item->>'observation', ''), 1200),
          meaning = left(coalesce(v_item->>'meaning', ''), 1200),
          proposal = left(coalesce(v_item->>'proposal', ''), 800),
          hypothesis = coalesce((v_item->>'hypothesis')::boolean, true),
          persona_label = left(coalesce(v_item->>'persona_label', ''), 160),
          phase_label = left(coalesce(v_item->>'phase_label', ''), 160),
          pin_x = v_pin_x,
          pin_y = v_pin_y,
          page_id = v_page,
          source_id = v_source
      where id = v_open;
    end if;
  end loop;
  perform app._brand_touch(p_version_id);
end;
$$;

create or replace function app.apply_brand_ai(p_version_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_item jsonb;
  v_replace boolean;
begin
  v_row := app._brand_for_edit(p_version_id);
  v_replace := coalesce((p_payload->>'replace_unlocked')::boolean, false);
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'dimensions', '[]'::jsonb))
  loop
    update app.brand_dimensions
    set intended = case when length(btrim(coalesce(v_item->>'intended', ''))) > 0 and (v_replace or length(btrim(intended)) = 0) then left(v_item->>'intended', 800) else intended end,
        observed = case when length(btrim(coalesce(v_item->>'observed', ''))) > 0 and (v_replace or length(btrim(observed)) = 0) then left(v_item->>'observed', 800) else observed end,
        gap_note = case when length(btrim(coalesce(v_item->>'gap_note', ''))) > 0 and (v_replace or length(btrim(gap_note)) = 0) then left(v_item->>'gap_note', 800) else gap_note end,
        evidence_status = case
          when (v_replace or evidence_status = 'unknown') and v_item->>'evidence_status' in ('sufficient', 'limited', 'conflicting', 'unknown')
          then v_item->>'evidence_status' else evidence_status end,
        judgement = case
          when (v_replace or judgement = '') and v_item->>'judgement' in ('strength', 'mixed', 'attention', 'not_assessable')
          then v_item->>'judgement' else judgement end,
        limits_note = case when length(btrim(coalesce(v_item->>'limits_note', ''))) > 0 and (v_replace or length(btrim(limits_note)) = 0) then left(v_item->>'limits_note', 500) else limits_note end,
        hypothesis = true
    where version_id = p_version_id
      and model = v_row.model
      and dimension_key = v_item->>'dimension_key'
      and archived_at is null
      and not manual_lock;
  end loop;
  if not v_row.conclusion_locked then
    update app.brand_versions
    set verdict = case when length(btrim(coalesce(p_payload->>'verdict', ''))) > 0 and (v_replace or length(btrim(verdict)) = 0) then left(p_payload->>'verdict', 800) else verdict end,
        strongest = case when length(btrim(coalesce(p_payload->>'strongest', ''))) > 0 and (v_replace or length(btrim(strongest)) = 0) then left(p_payload->>'strongest', 800) else strongest end,
        weakest = case when length(btrim(coalesce(p_payload->>'weakest', ''))) > 0 and (v_replace or length(btrim(weakest)) = 0) then left(p_payload->>'weakest', 800) else weakest end,
        unassessed = case when length(btrim(coalesce(p_payload->>'unassessed', ''))) > 0 and (v_replace or length(btrim(unassessed)) = 0) then left(p_payload->>'unassessed', 800) else unassessed end,
        gap_summary = case when length(btrim(coalesce(p_payload->>'gap_summary', ''))) > 0 and (v_replace or length(btrim(gap_summary)) = 0) then left(p_payload->>'gap_summary', 800) else gap_summary end,
        positioning_intended = case when length(btrim(coalesce(p_payload->>'positioning_intended', ''))) > 0 and (v_replace or length(btrim(positioning_intended)) = 0) then left(p_payload->>'positioning_intended', 800) else positioning_intended end,
        perception_observed = case when length(btrim(coalesce(p_payload->>'perception_observed', ''))) > 0 and (v_replace or length(btrim(perception_observed)) = 0) then left(p_payload->>'perception_observed', 800) else perception_observed end,
        accepted_uncertainty = case when length(btrim(accepted_uncertainty)) = 0 and length(btrim(coalesce(p_payload->>'accepted_uncertainty', ''))) > 0 then left(p_payload->>'accepted_uncertainty', 1000) else accepted_uncertainty end
    where id = p_version_id;
  end if;
  if v_replace then
    update app.brand_versions set image_confirmed = false where id = p_version_id;
  end if;
  if not exists (select 1 from app.brand_priorities where version_id = p_version_id and archived_at is null) then
    insert into app.brand_priorities (version_id, tenant_id, title, problem, action, kind, priority, reason)
    select p_version_id, v_row.tenant_id,
      left(coalesce(item->>'title', ''), 160),
      left(coalesce(item->>'problem', ''), 800),
      left(coalesce(item->>'action', ''), 800),
      case when item->>'kind' in ('communication', 'experience', 'research') then item->>'kind' else 'research' end,
      'medium',
      left(coalesce(item->>'reason', ''), 400)
    from jsonb_array_elements(coalesce(p_payload->'priorities', '[]'::jsonb)) item
    where length(btrim(coalesce(item->>'title', ''))) >= 2
    limit 3;
  end if;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_row.tenant_id, auth.uid(), 'brand.ai', 'brand_version', p_version_id::text, jsonb_build_object('model', v_row.model, 'replace_unlocked', v_replace));
  perform app._brand_touch(p_version_id);
end;
$$;

revoke execute on function app.set_brand_page_screenshot(uuid, text) from public, anon;
revoke execute on function app.set_brand_source_read(uuid, text, text, text) from public, anon;
revoke execute on function app.get_brand_media(uuid) from public, anon;
grant execute on function app.set_brand_page_screenshot(uuid, text) to authenticated;
grant execute on function app.set_brand_source_read(uuid, text, text, text) to authenticated;
grant execute on function app.get_brand_media(uuid) to authenticated;
