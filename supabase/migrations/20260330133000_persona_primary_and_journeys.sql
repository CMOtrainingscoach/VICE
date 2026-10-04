-- Primaire en secundaire persona's, en een eigen klantreis per persona.
-- Draai na 20260330132900. Eerdere migraties niet opnieuw draaien.

alter table app.persona_people
  add column if not exists audience_rank text not null default 'secondary';

alter table app.persona_people
  drop constraint if exists persona_people_audience_rank_check;

alter table app.persona_people
  add constraint persona_people_audience_rank_check
  check (audience_rank in ('primary', 'secondary'));

update app.persona_people p
set audience_rank = 'primary'
where p.archived_at is null
  and p.active
  and p.id in (
    select distinct on (version_id) id
    from app.persona_people
    where archived_at is null and active
    order by version_id, sort_order, created_at
  )
  and not exists (
    select 1 from app.persona_people q
    where q.version_id = p.version_id and q.archived_at is null and q.audience_rank = 'primary'
  );

update app.persona_journeys j
set primary_persona_id = p.id
from app.persona_people p
where j.archived_at is null
  and j.primary_persona_id is null
  and p.version_id = j.version_id
  and p.archived_at is null
  and p.audience_rank = 'primary'
  and not exists (
    select 1 from app.persona_journeys other
    where other.version_id = j.version_id
      and other.kind = j.kind
      and other.primary_persona_id = p.id
      and other.archived_at is null
      and other.id <> j.id
  );

drop index if exists app.persona_journeys_one_kind;

create unique index if not exists persona_journeys_one_per_persona
  on app.persona_journeys (version_id, primary_persona_id, kind)
  where archived_at is null and primary_persona_id is not null;

create unique index if not exists persona_people_one_primary
  on app.persona_people (version_id)
  where archived_at is null and audience_rank = 'primary';

create or replace function app._persona_ensure_primary(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_next uuid;
begin
  if exists (
    select 1 from app.persona_people
    where version_id = p_version_id and archived_at is null and active
      and ai_state <> 'proposed' and audience_rank = 'primary'
  ) then
    return;
  end if;
  update app.persona_people
  set audience_rank = 'secondary'
  where version_id = p_version_id and archived_at is null and audience_rank = 'primary';
  select id into v_next from app.persona_people
  where version_id = p_version_id and archived_at is null and active and ai_state <> 'proposed'
  order by sort_order, created_at
  limit 1;
  if v_next is not null then
    update app.persona_people set audience_rank = 'primary' where id = v_next;
  end if;
end;
$$;

create or replace function app.upsert_persona(p_version_id uuid, p_persona_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
  v_id uuid;
  v_title text;
  v_level text;
  v_rank text;
  v_active boolean;
begin
  v_version := app._persona_for_edit(p_version_id);
  v_title := left(btrim(coalesce(p_payload->>'role_title', '')), 200);
  if length(v_title) < 2 then raise exception 'Geef de functierol een naam'; end if;
  v_level := coalesce(nullif(p_payload->>'evidence_level', ''), 'hypothesis');
  if v_level not in ('supported', 'client', 'strategist', 'hypothesis', 'unknown') then v_level := 'hypothesis'; end if;
  v_active := coalesce((p_payload->>'active')::boolean, true);
  v_rank := case
    when p_payload->>'audience_rank' in ('primary', 'secondary') then p_payload->>'audience_rank'
    else 'secondary'
  end;
  if not v_active then v_rank := 'secondary'; end if;
  if v_rank = 'secondary' and not exists (
    select 1 from app.persona_people
    where version_id = p_version_id and archived_at is null and active and audience_rank = 'primary'
      and id is distinct from p_persona_id
  ) then
    v_rank := 'primary';
  end if;
  if v_rank = 'primary' then
    update app.persona_people
    set audience_rank = 'secondary', updated_at = now()
    where version_id = p_version_id and archived_at is null and audience_rank = 'primary'
      and id is distinct from p_persona_id;
  end if;
  if p_persona_id is null then
    insert into app.persona_people (
      version_id, tenant_id, role_title, display_name, summary, decision_roles, relevance,
      goals, outcomes, responsibilities, success_criteria, pains, barriers, risks, consequences,
      triggers, decision_criteria, objections, info_needed, other_roles, touchpoints,
      questions, arguments, proof_needed, channels, assumptions, open_question, conflict_note,
      hypothesis, evidence_level, active, audience_rank, origin, manual_lock, sort_order
    ) values (
      p_version_id, v_version.tenant_id, v_title,
      left(coalesce(p_payload->>'display_name', ''), 80),
      left(coalesce(p_payload->>'summary', ''), 800),
      app._persona_roles(p_payload->'decision_roles'),
      left(coalesce(p_payload->>'relevance', ''), 800),
      left(coalesce(p_payload->>'goals', ''), 800),
      left(coalesce(p_payload->>'outcomes', ''), 800),
      left(coalesce(p_payload->>'responsibilities', ''), 800),
      left(coalesce(p_payload->>'success_criteria', ''), 800),
      left(coalesce(p_payload->>'pains', ''), 800),
      left(coalesce(p_payload->>'barriers', ''), 800),
      left(coalesce(p_payload->>'risks', ''), 800),
      left(coalesce(p_payload->>'consequences', ''), 800),
      left(coalesce(p_payload->>'triggers', ''), 800),
      left(coalesce(p_payload->>'decision_criteria', ''), 800),
      left(coalesce(p_payload->>'objections', ''), 800),
      left(coalesce(p_payload->>'info_needed', ''), 800),
      left(coalesce(p_payload->>'other_roles', ''), 500),
      left(coalesce(p_payload->>'touchpoints', ''), 500),
      left(coalesce(p_payload->>'questions', ''), 800),
      left(coalesce(p_payload->>'arguments', ''), 800),
      left(coalesce(p_payload->>'proof_needed', ''), 800),
      left(coalesce(p_payload->>'channels', ''), 400),
      left(coalesce(p_payload->>'assumptions', ''), 800),
      left(coalesce(p_payload->>'open_question', ''), 800),
      left(coalesce(p_payload->>'conflict_note', ''), 500),
      coalesce((p_payload->>'hypothesis')::boolean, true),
      v_level, v_active, v_rank, 'manual', true,
      coalesce((select max(sort_order) + 1 from app.persona_people where version_id = p_version_id and archived_at is null), 0)
    ) returning id into v_id;
  else
    update app.persona_people set
      role_title = v_title,
      display_name = left(coalesce(p_payload->>'display_name', ''), 80),
      summary = left(coalesce(p_payload->>'summary', ''), 800),
      decision_roles = app._persona_roles(p_payload->'decision_roles'),
      relevance = left(coalesce(p_payload->>'relevance', ''), 800),
      goals = left(coalesce(p_payload->>'goals', ''), 800),
      outcomes = left(coalesce(p_payload->>'outcomes', ''), 800),
      responsibilities = left(coalesce(p_payload->>'responsibilities', ''), 800),
      success_criteria = left(coalesce(p_payload->>'success_criteria', ''), 800),
      pains = left(coalesce(p_payload->>'pains', ''), 800),
      barriers = left(coalesce(p_payload->>'barriers', ''), 800),
      risks = left(coalesce(p_payload->>'risks', ''), 800),
      consequences = left(coalesce(p_payload->>'consequences', ''), 800),
      triggers = left(coalesce(p_payload->>'triggers', ''), 800),
      decision_criteria = left(coalesce(p_payload->>'decision_criteria', ''), 800),
      objections = left(coalesce(p_payload->>'objections', ''), 800),
      info_needed = left(coalesce(p_payload->>'info_needed', ''), 800),
      other_roles = left(coalesce(p_payload->>'other_roles', ''), 500),
      touchpoints = left(coalesce(p_payload->>'touchpoints', ''), 500),
      questions = left(coalesce(p_payload->>'questions', ''), 800),
      arguments = left(coalesce(p_payload->>'arguments', ''), 800),
      proof_needed = left(coalesce(p_payload->>'proof_needed', ''), 800),
      channels = left(coalesce(p_payload->>'channels', ''), 400),
      assumptions = left(coalesce(p_payload->>'assumptions', ''), 800),
      open_question = left(coalesce(p_payload->>'open_question', ''), 800),
      conflict_note = left(coalesce(p_payload->>'conflict_note', ''), 500),
      hypothesis = coalesce((p_payload->>'hypothesis')::boolean, true),
      evidence_level = v_level,
      active = v_active,
      audience_rank = v_rank,
      manual_lock = true,
      ai_state = 'none',
      updated_at = now()
    where id = p_persona_id and version_id = p_version_id and archived_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Persona niet gevonden'; end if;
  end if;
  perform app._persona_ensure_primary(p_version_id);
  update app.persona_versions
  set personas_confirmed = false, journeys_confirmed = false
  where id = p_version_id;
  perform app._persona_touch(p_version_id);
  return v_id;
end;
$$;

create or replace function app.archive_persona(p_persona_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.persona_people;
  v_used integer;
begin
  v_item := null;
  select * into v_item from app.persona_people where id = p_persona_id and archived_at is null;
  if v_item is null then raise exception 'Persona niet gevonden'; end if;
  perform app._persona_for_edit(v_item.version_id);
  select count(*) into v_used from app.persona_journeys
  where version_id = v_item.version_id and archived_at is null and primary_persona_id = p_persona_id;
  update app.persona_people
  set archived_at = now(), active = false, audience_rank = 'secondary', updated_at = now()
  where id = p_persona_id;
  update app.persona_journeys
  set archived_at = now(), updated_at = now()
  where version_id = v_item.version_id and archived_at is null and primary_persona_id = p_persona_id;
  update app.persona_phases
  set involved_persona_ids = array_remove(involved_persona_ids, p_persona_id)
  where version_id = v_item.version_id;
  perform app._persona_ensure_primary(v_item.version_id);
  update app.persona_versions
  set personas_confirmed = false,
      journeys_confirmed = false,
      review_note = case when v_used > 0 then 'Een persona is gearchiveerd. De bijbehorende klantreis is mee gearchiveerd.' else review_note end
  where id = v_item.version_id;
  perform app._persona_touch(v_item.version_id);
end;
$$;

create or replace function app.confirm_personas(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_bad integer;
  v_primary integer;
begin
  perform app._persona_for_edit(p_version_id);
  perform app._persona_ensure_primary(p_version_id);
  if not exists (
    select 1 from app.persona_people
    where version_id = p_version_id and archived_at is null and active and ai_state <> 'proposed'
  ) then
    raise exception 'Er is nog geen actieve persona.';
  end if;
  select count(*) into v_primary from app.persona_people
  where version_id = p_version_id and archived_at is null and active and ai_state <> 'proposed' and audience_rank = 'primary';
  if v_primary <> 1 then
    raise exception 'Kies precies één primaire persona. De anderen zijn secundair.';
  end if;
  select count(*) into v_bad from app.persona_people
  where version_id = p_version_id and archived_at is null and active and ai_state <> 'proposed'
    and (
      length(btrim(role_title)) < 2
      or (length(btrim(goals)) < 8 and length(btrim(pains)) < 8)
      or (length(btrim(relevance)) < 8 and not hypothesis)
    );
  if v_bad > 0 then
    raise exception 'Elke actieve persona heeft een functierol, een doel of behoefte, en een relatie met het ICP of een hypothese.';
  end if;
  update app.persona_versions set personas_confirmed = true, current_step = 'journey' where id = p_version_id;
  perform app._persona_touch(p_version_id);
end;
$$;

create or replace function app.ensure_persona_journey(p_version_id uuid, p_kind text, p_primary uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
  v_id uuid;
  v_person app.persona_people;
begin
  v_version := app._persona_for_edit(p_version_id);
  if p_kind not in ('current', 'desired') then raise exception 'Onbekend reistype'; end if;
  if p_primary is null then raise exception 'Kies de persona voor deze klantreis.'; end if;
  v_person := null;
  select * into v_person from app.persona_people
  where id = p_primary and version_id = p_version_id and archived_at is null and active;
  if v_person is null then raise exception 'Deze persona hoort niet bij de actieve set.'; end if;
  select id into v_id from app.persona_journeys
  where version_id = p_version_id and kind = p_kind and primary_persona_id = p_primary and archived_at is null;
  if v_id is null then
    insert into app.persona_journeys (version_id, tenant_id, kind, title, primary_persona_id, hypothesis)
    values (
      p_version_id, v_version.tenant_id, p_kind,
      case when p_kind = 'desired' then 'Gewenste reis' else 'Huidige reis' end,
      p_primary, true
    ) returning id into v_id;
  end if;
  perform app._persona_touch(p_version_id);
  return v_id;
end;
$$;

drop function if exists app.derive_desired_journey(uuid);

create or replace function app.derive_desired_journey(p_version_id uuid, p_persona_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
  v_current app.persona_journeys;
  v_new uuid;
  v_phase app.persona_phases;
begin
  v_version := app._persona_for_edit(p_version_id);
  if p_persona_id is null then raise exception 'Kies de persona voor de gewenste reis.'; end if;
  if exists (
    select 1 from app.persona_journeys
    where version_id = p_version_id and kind = 'desired' and primary_persona_id = p_persona_id and archived_at is null
  ) then
    raise exception 'Deze persona heeft al een gewenste reis. Bewerk die verder.';
  end if;
  v_current := null;
  select * into v_current from app.persona_journeys
  where version_id = p_version_id and kind = 'current' and primary_persona_id = p_persona_id and archived_at is null;
  if v_current is null then
    raise exception 'Deze persona heeft nog geen huidige reis. Start de gewenste reis leeg, of bouw eerst de huidige.';
  end if;
  insert into app.persona_journeys (version_id, tenant_id, kind, title, primary_persona_id, based_on_id, hypothesis, route_note)
  values (p_version_id, v_version.tenant_id, 'desired', 'Gewenste reis', p_persona_id, v_current.id, true, 'Voorstel op basis van de huidige reis van deze persona. Nog niet gerealiseerd.')
  returning id into v_new;
  for v_phase in
    select * from app.persona_phases where journey_id = v_current.id and archived_at is null order by sort_order
  loop
    insert into app.persona_phases (
      journey_id, version_id, tenant_id, name, goal, actions, questions, info_need, decision_criteria, barriers, next_step,
      touchpoints, channels, involved_persona_ids, company_side, content_needed, assumption, open_question, emotion,
      hypothesis, sort_order
    ) values (
      v_new, p_version_id, v_version.tenant_id, v_phase.name, v_phase.goal, v_phase.actions, v_phase.questions,
      v_phase.info_need, v_phase.decision_criteria, v_phase.barriers, v_phase.next_step,
      v_phase.touchpoints, v_phase.channels, v_phase.involved_persona_ids, v_phase.company_side, v_phase.content_needed,
      v_phase.assumption, v_phase.open_question, v_phase.emotion, true, v_phase.sort_order
    );
  end loop;
  update app.persona_versions set journeys_confirmed = false where id = p_version_id;
  perform app._persona_touch(p_version_id);
  return v_new;
end;
$$;

create or replace function app.confirm_journeys(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  perform app._persona_for_edit(p_version_id);
  if not exists (
    select 1 from app.persona_people p
    join app.persona_journeys j on j.primary_persona_id = p.id and j.archived_at is null
    join app.persona_phases ph on ph.journey_id = j.id and ph.archived_at is null
    where p.version_id = p_version_id and p.archived_at is null and p.active and p.audience_rank = 'primary'
      and length(btrim(ph.goal)) >= 8
  ) then
    raise exception 'De primaire persona heeft een klantreis nodig met minstens één klantdoel.';
  end if;
  update app.persona_versions set journeys_confirmed = true, current_step = 'finish' where id = p_version_id;
  perform app._persona_touch(p_version_id);
end;
$$;

create or replace function app.get_persona_workbench(p_tenant_id uuid, p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
  v_tenant app.tenants;
  v_stp app.stp_versions;
  v_latest uuid;
  v_five uuid;
  v_next integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  v_tenant := null;
  select * into v_tenant from app.tenants where id = p_tenant_id and deleted_at is null;
  if v_tenant is null then raise exception 'Klant niet gevonden'; end if;
  v_version := null;
  if p_version_id is not null then
    select * into v_version from app.persona_versions where id = p_version_id and tenant_id = p_tenant_id;
    if v_version is null then raise exception 'Persona-analyse niet gevonden'; end if;
  else
    select * into v_version from app.persona_versions
    where tenant_id = p_tenant_id and status <> 'approved'
    order by version_number desc limit 1;
    if v_version is null then
      select * into v_version from app.persona_versions
      where tenant_id = p_tenant_id order by version_number desc limit 1;
    end if;
  end if;
  v_stp := null;
  v_latest := null;
  select * into v_stp from app.stp_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.stp_version_status
  order by version_number desc limit 1;
  if v_stp is null then
    select * into v_stp from app.stp_versions
    where tenant_id = p_tenant_id order by version_number desc limit 1;
  else
    v_latest := v_stp.id;
  end if;
  if v_version is null then
    select coalesce(max(version_number), 0) + 1 into v_next from app.persona_versions where tenant_id = p_tenant_id;
    insert into app.persona_versions (tenant_id, version_number, status, stp_version_id, created_by)
    values (p_tenant_id, v_next, 'not_started', case when v_stp is null then null else v_stp.id end, auth.uid())
    returning * into v_version;
  elsif v_version.status <> 'approved'
    and (v_version.personas_confirmed or v_version.journeys_confirmed)
    and v_version.stp_version_id is distinct from v_latest
    and v_latest is not null then
    update app.persona_versions
    set needs_review = true,
        review_note = 'Het ICP heeft een nieuwere goedgekeurde versie. Kijk persona''s en klantreis na.'
    where id = v_version.id and not needs_review;
    select * into v_version from app.persona_versions where id = v_version.id;
  end if;
  v_stp := null;
  v_five := null;
  if v_version.stp_version_id is not null then
    select * into v_stp from app.stp_versions where id = v_version.stp_version_id;
    if v_stp is not null then v_five := v_stp.five_c_version_id; end if;
  end if;
  return jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id, 'version_number', v_version.version_number, 'status', v_version.status,
      'current_step', v_version.current_step, 'stp_version_id', v_version.stp_version_id,
      'personas_confirmed', v_version.personas_confirmed, 'journeys_confirmed', v_version.journeys_confirmed,
      'accepted_uncertainty', v_version.accepted_uncertainty, 'open_questions', v_version.open_questions,
      'needs_review', v_version.needs_review, 'review_note', v_version.review_note,
      'published_at', v_version.published_at, 'approved_at', v_version.approved_at, 'updated_at', v_version.updated_at
    ),
    'icp', case when v_stp is null then jsonb_build_object('present', false) else jsonb_build_object(
      'present', true, 'approved', v_stp.status = 'approved'::app.stp_version_status,
      'id', v_stp.id, 'version_number', v_stp.version_number, 'name', v_stp.icp_name, 'summary', v_stp.icp_summary,
      'offering', v_stp.offering, 'geography', v_stp.geography, 'need', v_stp.icp_need, 'sector', v_stp.icp_sector,
      'stage', v_stp.icp_stage, 'sentence', v_stp.position_sentence, 'promise', v_stp.promise
    ) end,
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'role_title', p.role_title, 'display_name', p.display_name, 'summary', p.summary,
        'decision_roles', p.decision_roles, 'relevance', p.relevance,
        'goals', p.goals, 'outcomes', p.outcomes, 'responsibilities', p.responsibilities, 'success_criteria', p.success_criteria,
        'pains', p.pains, 'barriers', p.barriers, 'risks', p.risks, 'consequences', p.consequences,
        'triggers', p.triggers, 'decision_criteria', p.decision_criteria, 'objections', p.objections,
        'info_needed', p.info_needed, 'other_roles', p.other_roles, 'touchpoints', p.touchpoints,
        'questions', p.questions, 'arguments', p.arguments, 'proof_needed', p.proof_needed, 'channels', p.channels,
        'assumptions', p.assumptions, 'open_question', p.open_question, 'conflict_note', p.conflict_note,
        'hypothesis', p.hypothesis, 'evidence_level', p.evidence_level, 'active', p.active, 'audience_rank', p.audience_rank,
        'manual_lock', p.manual_lock, 'origin', p.origin, 'ai_state', p.ai_state, 'ai_payload', p.ai_payload,
        'overlap_note', p.overlap_note, 'illustration_prompt', p.illustration_prompt,
        'selected_portrait_id', p.selected_portrait_id, 'archived_at', p.archived_at, 'sort_order', p.sort_order,
        'portraits', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', r.id, 'status', r.status, 'storage_path', r.storage_path, 'error_message', r.error_message, 'created_at', r.created_at
          ) order by r.created_at desc)
          from app.persona_portraits r where r.persona_id = p.id
        ), '[]'::jsonb),
        'refs', coalesce((
          select jsonb_agg(jsonb_build_object('ref_type', f.ref_type, 'ref_id', f.ref_id, 'label', f.label, 'excerpt', f.excerpt))
          from app.persona_refs f where f.persona_id = p.id
        ), '[]'::jsonb)
      ) order by case when p.audience_rank = 'primary' then 0 else 1 end, p.sort_order, p.created_at)
      from app.persona_people p where p.version_id = v_version.id
    ), '[]'::jsonb),
    'journeys', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id, 'kind', j.kind, 'title', j.title, 'primary_persona_id', j.primary_persona_id,
        'based_on_id', j.based_on_id, 'route_note', j.route_note, 'hypothesis', j.hypothesis,
        'ai_proposal', j.ai_proposal, 'archived_at', j.archived_at,
        'phases', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ph.id, 'name', ph.name, 'goal', ph.goal, 'actions', ph.actions, 'questions', ph.questions,
            'info_need', ph.info_need, 'decision_criteria', ph.decision_criteria, 'barriers', ph.barriers, 'next_step', ph.next_step,
            'touchpoints', ph.touchpoints, 'channels', ph.channels, 'involved_persona_ids', ph.involved_persona_ids,
            'company_side', ph.company_side, 'content_needed', ph.content_needed,
            'assumption', ph.assumption, 'open_question', ph.open_question, 'emotion', ph.emotion,
            'improvement', ph.improvement, 'proposed_action', ph.proposed_action, 'contribution', ph.contribution,
            'owner_name', ph.owner_name, 'priority', ph.priority, 'hypothesis', ph.hypothesis,
            'sort_order', ph.sort_order, 'archived_at', ph.archived_at
          ) order by ph.sort_order, ph.created_at)
          from app.persona_phases ph where ph.journey_id = j.id
        ), '[]'::jsonb)
      ) order by j.kind, j.created_at)
      from app.persona_journeys j where j.version_id = v_version.id
    ), '[]'::jsonb),
    'inputs', jsonb_build_object(
      'tenant', jsonb_build_object('id', v_tenant.id, 'name', v_tenant.name),
      'five_c_items', coalesce((
        select jsonb_agg(jsonb_build_object('id', fi.id, 'c_key', fi.c_key, 'title', fi.title, 'finding', left(fi.finding, 800)))
        from app.five_c_items fi
        where v_five is not null and fi.version_id = v_five and fi.deleted_at is null
          and fi.review_status <> 'rejected'::app.five_c_review
          and fi.content_type <> 'input_needed'::app.five_c_content_type
          and fi.c_key in ('customers', 'company')
      ), '[]'::jsonb),
      'meetings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'title', coalesce(nullif(trim(m.title), ''), to_char(m.created_at, 'YYYY-MM-DD')),
          'text', left(coalesce(nullif(trim(m.summary_text), ''), left(coalesce(m.full_text, ''), 1200)), 1200)
        ) order by m.created_at desc)
        from (select * from app.meeting_recordings where tenant_id = p_tenant_id and transcript_status = 'ready' order by created_at desc limit 6) m
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function app.create_persona_revision(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_source app.persona_versions;
  v_new uuid;
  v_next integer;
  v_person app.persona_people;
  v_map jsonb := '{}'::jsonb;
  v_jmap jsonb := '{}'::jsonb;
  v_new_person uuid;
  v_journey app.persona_journeys;
  v_new_journey uuid;
  v_phase app.persona_phases;
  v_involved uuid[];
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_source := null;
  select * into v_source from app.persona_versions where id = p_version_id;
  if v_source is null then raise exception 'Versie niet gevonden'; end if;
  if not app.has_capability(v_source.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_source.status <> 'approved' then raise exception 'Een herziening start vanaf een goedgekeurde versie'; end if;
  select coalesce(max(version_number), 0) + 1 into v_next from app.persona_versions where tenant_id = v_source.tenant_id;
  insert into app.persona_versions (
    tenant_id, version_number, status, current_step, stp_version_id, personas_confirmed, journeys_confirmed,
    accepted_uncertainty, open_questions, created_by
  ) values (
    v_source.tenant_id, v_next, 'draft', 'finish', v_source.stp_version_id, true, true,
    v_source.accepted_uncertainty, v_source.open_questions, auth.uid()
  ) returning id into v_new;
  for v_person in select * from app.persona_people where version_id = p_version_id and archived_at is null
  loop
    insert into app.persona_people (
      version_id, tenant_id, role_title, display_name, summary, decision_roles, relevance, goals, outcomes,
      responsibilities, success_criteria, pains, barriers, risks, consequences, triggers, decision_criteria,
      objections, info_needed, other_roles, touchpoints, questions, arguments, proof_needed, channels,
      assumptions, open_question, conflict_note, hypothesis, evidence_level, active, audience_rank, manual_lock, origin,
      illustration_prompt, sort_order
    ) values (
      v_new, v_source.tenant_id, v_person.role_title, v_person.display_name, v_person.summary, v_person.decision_roles,
      v_person.relevance, v_person.goals, v_person.outcomes, v_person.responsibilities, v_person.success_criteria,
      v_person.pains, v_person.barriers, v_person.risks, v_person.consequences, v_person.triggers, v_person.decision_criteria,
      v_person.objections, v_person.info_needed, v_person.other_roles, v_person.touchpoints, v_person.questions,
      v_person.arguments, v_person.proof_needed, v_person.channels, v_person.assumptions, v_person.open_question,
      v_person.conflict_note, v_person.hypothesis, v_person.evidence_level, v_person.active, v_person.audience_rank, true, v_person.origin,
      v_person.illustration_prompt, v_person.sort_order
    ) returning id into v_new_person;
    v_map := v_map || jsonb_build_object(v_person.id::text, v_new_person);
    insert into app.persona_portraits (persona_id, version_id, tenant_id, storage_path, status, visual_prompt, provider, model, created_by)
    select v_new_person, v_new, tenant_id, storage_path, status, visual_prompt, provider, model, auth.uid()
    from app.persona_portraits
    where id = v_person.selected_portrait_id and status = 'ready';
    update app.persona_people
    set selected_portrait_id = (select id from app.persona_portraits where persona_id = v_new_person and status = 'ready' order by created_at desc limit 1)
    where id = v_new_person;
  end loop;
  for v_journey in
    select * from app.persona_journeys
    where version_id = p_version_id and archived_at is null
    order by case when kind = 'current' then 0 else 1 end, created_at
  loop
    insert into app.persona_journeys (version_id, tenant_id, kind, title, primary_persona_id, based_on_id, route_note, hypothesis)
    values (
      v_new, v_source.tenant_id, v_journey.kind, v_journey.title,
      nullif(v_map->>v_journey.primary_persona_id::text, '')::uuid,
      nullif(v_jmap->>v_journey.based_on_id::text, '')::uuid,
      v_journey.route_note, v_journey.hypothesis
    ) returning id into v_new_journey;
    v_jmap := v_jmap || jsonb_build_object(v_journey.id::text, v_new_journey);
    for v_phase in select * from app.persona_phases where journey_id = v_journey.id and archived_at is null order by sort_order
    loop
      v_involved := '{}'::uuid[];
      select coalesce(array_agg((v_map->>old_id)::uuid), '{}'::uuid[])
      into v_involved
      from unnest(v_phase.involved_persona_ids) as old_id
      where v_map ? old_id::text;
      if v_involved is null then v_involved := '{}'::uuid[]; end if;
      insert into app.persona_phases (
        journey_id, version_id, tenant_id, name, goal, actions, questions, info_need, decision_criteria, barriers, next_step,
        touchpoints, channels, involved_persona_ids, company_side, content_needed, assumption, open_question, emotion,
        improvement, proposed_action, contribution, owner_name, priority, hypothesis, sort_order
      ) values (
        v_new_journey, v_new, v_source.tenant_id, v_phase.name, v_phase.goal, v_phase.actions, v_phase.questions,
        v_phase.info_need, v_phase.decision_criteria, v_phase.barriers, v_phase.next_step, v_phase.touchpoints, v_phase.channels,
        v_involved, v_phase.company_side, v_phase.content_needed, v_phase.assumption, v_phase.open_question, v_phase.emotion,
        v_phase.improvement, v_phase.proposed_action, v_phase.contribution, v_phase.owner_name, v_phase.priority,
        v_phase.hypothesis, v_phase.sort_order
      );
    end loop;
  end loop;
  return v_new;
end;
$$;

create or replace function app.get_persona_published(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not (app.has_capability(p_tenant_id, 'dashboard.read_published') or app.has_capability(p_tenant_id, 'audit.edit')) then
    raise exception 'Forbidden';
  end if;
  v_version := null;
  select * into v_version from app.persona_versions
  where tenant_id = p_tenant_id and status = 'approved' and published_at is not null
  order by version_number desc limit 1;
  if v_version is null then return jsonb_build_object('published', false); end if;
  return jsonb_build_object(
    'published', true,
    'version_number', v_version.version_number,
    'published_at', v_version.published_at,
    'open_questions', v_version.open_questions,
    'accepted_uncertainty', v_version.accepted_uncertainty,
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'role_title', p.role_title,
        'summary', p.summary,
        'audience_rank', p.audience_rank,
        'storage_path', coalesce((select r.storage_path from app.persona_portraits r where r.id = p.selected_portrait_id and r.status = 'ready'), '')
      ) order by case when p.audience_rank = 'primary' then 0 else 1 end, p.sort_order)
      from app.persona_people p
      where p.version_id = v_version.id and p.archived_at is null and p.active
    ), '[]'::jsonb),
    'journeys', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', j.kind,
        'title', j.title,
        'primary_persona_id', j.primary_persona_id,
        'role_title', coalesce((select p.role_title from app.persona_people p where p.id = j.primary_persona_id), ''),
        'phases', coalesce((
          select jsonb_agg(jsonb_build_object('name', ph.name, 'goal', ph.goal, 'barriers', ph.barriers, 'improvement', ph.improvement) order by ph.sort_order)
          from app.persona_phases ph where ph.journey_id = j.id and ph.archived_at is null
        ), '[]'::jsonb)
      ))
      from app.persona_journeys j where j.version_id = v_version.id and j.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function app.derive_desired_journey(uuid, uuid) to authenticated;
revoke execute on function app._persona_ensure_primary(uuid) from public, anon, authenticated;
