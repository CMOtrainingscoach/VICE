-- AI-scan vult de audit eerst. Een latere strategistwijziging blijft staan. Draai na 20260330133300.

alter table app.brand_findings
  add column if not exists manual_lock boolean not null default false;

alter table app.brand_versions
  add column if not exists conclusion_locked boolean not null default false;

update app.brand_findings set manual_lock = true where archived_at is null;

update app.brand_versions
set conclusion_locked = true
where length(btrim(coalesce(verdict, ''))) > 0
   or length(btrim(coalesce(strongest, ''))) > 0
   or length(btrim(coalesce(weakest, ''))) > 0
   or length(btrim(coalesce(unassessed, ''))) > 0
   or length(btrim(coalesce(gap_summary, ''))) > 0
   or length(btrim(coalesce(perception_observed, ''))) > 0;

create or replace function app.upsert_brand_finding(p_version_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_id uuid;
begin
  v_row := app._brand_for_edit(p_version_id);
  v_id := nullif(p_payload->>'id', '')::uuid;
  if v_id is null then
    insert into app.brand_findings (
      version_id, tenant_id, page_id, source_id, lens, observation, meaning, proposal,
      hypothesis, persona_label, phase_label, manual_lock
    ) values (
      p_version_id, v_row.tenant_id,
      nullif(p_payload->>'page_id', '')::uuid,
      nullif(p_payload->>'source_id', '')::uuid,
      case when p_payload->>'lens' in ('visual', 'text', 'journey') then p_payload->>'lens' else 'text' end,
      left(coalesce(p_payload->>'observation', ''), 1200),
      left(coalesce(p_payload->>'meaning', ''), 1200),
      left(coalesce(p_payload->>'proposal', ''), 800),
      coalesce((p_payload->>'hypothesis')::boolean, true),
      left(coalesce(p_payload->>'persona_label', ''), 160),
      left(coalesce(p_payload->>'phase_label', ''), 160),
      true
    ) returning id into v_id;
  else
    update app.brand_findings
    set observation = left(coalesce(p_payload->>'observation', observation), 1200),
        meaning = left(coalesce(p_payload->>'meaning', meaning), 1200),
        proposal = left(coalesce(p_payload->>'proposal', proposal), 800),
        hypothesis = coalesce((p_payload->>'hypothesis')::boolean, hypothesis),
        persona_label = left(coalesce(p_payload->>'persona_label', persona_label), 160),
        phase_label = left(coalesce(p_payload->>'phase_label', phase_label), 160),
        manual_lock = true
    where id = v_id and version_id = p_version_id;
  end if;
  perform app._brand_touch(p_version_id);
  return v_id;
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
begin
  v_row := app._brand_for_edit(p_version_id);
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'findings', '[]'::jsonb))
  loop
    v_page := null;
    v_source := null;
    v_locked := null;
    v_open := null;
    v_lens := case when v_item->>'lens' in ('visual', 'text', 'journey') then v_item->>'lens' else 'text' end;
    select id into v_page from app.brand_pages
    where version_id = p_version_id and url = left(coalesce(v_item->>'page_url', ''), 400) and included
    limit 1;
    if coalesce(v_item->>'source_label', '') <> '' then
      select id into v_source from app.brand_sources
      where version_id = p_version_id and archived_at is null and label = left(v_item->>'source_label', 200)
      limit 1;
    end if;
    select id into v_locked from app.brand_findings
    where version_id = p_version_id and archived_at is null and manual_lock and lens = v_lens
      and page_id is not distinct from v_page and source_id is not distinct from v_source
    limit 1;
    if v_locked is not null then continue; end if;
    select id into v_open from app.brand_findings
    where version_id = p_version_id and archived_at is null and not manual_lock and lens = v_lens
      and page_id is not distinct from v_page and source_id is not distinct from v_source
    limit 1;
    if v_open is null then
      insert into app.brand_findings (
        version_id, tenant_id, page_id, source_id, lens, observation, meaning, proposal,
        hypothesis, persona_label, phase_label, manual_lock
      ) values (
        p_version_id, v_row.tenant_id, v_page, v_source, v_lens,
        left(coalesce(v_item->>'observation', ''), 1200),
        left(coalesce(v_item->>'meaning', ''), 1200),
        left(coalesce(v_item->>'proposal', ''), 800),
        coalesce((v_item->>'hypothesis')::boolean, true),
        left(coalesce(v_item->>'persona_label', ''), 160),
        left(coalesce(v_item->>'phase_label', ''), 160),
        false
      );
    else
      update app.brand_findings
      set observation = left(coalesce(v_item->>'observation', ''), 1200),
          meaning = left(coalesce(v_item->>'meaning', ''), 1200),
          proposal = left(coalesce(v_item->>'proposal', ''), 800),
          hypothesis = coalesce((v_item->>'hypothesis')::boolean, true),
          persona_label = left(coalesce(v_item->>'persona_label', ''), 160),
          phase_label = left(coalesce(v_item->>'phase_label', ''), 160)
      where id = v_open;
    end if;
  end loop;
  perform app._brand_touch(p_version_id);
end;
$$;

create or replace function app.save_brand_conclusion(p_version_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  perform app._brand_for_edit(p_version_id);
  update app.brand_versions
  set verdict = left(coalesce(p_payload->>'verdict', verdict), 800),
      strongest = left(coalesce(p_payload->>'strongest', strongest), 800),
      weakest = left(coalesce(p_payload->>'weakest', weakest), 800),
      unassessed = left(coalesce(p_payload->>'unassessed', unassessed), 800),
      gap_summary = left(coalesce(p_payload->>'gap_summary', gap_summary), 800),
      positioning_intended = left(coalesce(p_payload->>'positioning_intended', positioning_intended), 800),
      perception_observed = left(coalesce(p_payload->>'perception_observed', perception_observed), 800),
      accepted_uncertainty = left(coalesce(p_payload->>'accepted_uncertainty', accepted_uncertainty), 1000),
      open_questions = left(coalesce(p_payload->>'open_questions', open_questions), 2000),
      conclusion_locked = true
  where id = p_version_id;
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
        perception_observed = case when length(btrim(coalesce(p_payload->>'perception_observed', ''))) > 0 and (v_replace or length(btrim(perception_observed)) = 0) then left(p_payload->>'perception_observed', 800) else perception_observed end
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

revoke execute on function app.apply_brand_scan(uuid, jsonb) from public, anon;
grant execute on function app.apply_brand_scan(uuid, jsonb) to authenticated;
