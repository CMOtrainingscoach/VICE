-- Eigen foto's bij een persona. Draai na 20260330133100. Eerdere migraties niet opnieuw.

update storage.buckets
set allowed_mime_types = array['image/png', 'image/webp', 'image/jpeg']
where id = 'persona-portraits';

create or replace function app.register_persona_photo(p_persona_id uuid, p_path text)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.persona_people;
  v_id uuid;
begin
  v_item := null;
  select * into v_item from app.persona_people where id = p_persona_id and archived_at is null;
  if v_item is null then raise exception 'Persona niet gevonden'; end if;
  perform app._persona_for_edit(v_item.version_id);
  if p_path is null
    or p_path !~ ('^' || v_item.tenant_id::text || '/' || v_item.id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
  then
    raise exception 'Ongeldig fotopad';
  end if;
  insert into app.persona_portraits (
    persona_id, version_id, tenant_id, storage_path, status, visual_prompt, provider, model, created_by
  ) values (
    p_persona_id, v_item.version_id, v_item.tenant_id, p_path, 'ready', '', 'upload', '', auth.uid()
  ) returning id into v_id;
  update app.persona_people
  set selected_portrait_id = v_id, updated_at = now()
  where id = p_persona_id;
  perform app._persona_touch(v_item.version_id);
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    v_item.tenant_id, auth.uid(), 'persona.portrait', 'persona', p_persona_id::text,
    jsonb_build_object('portrait_id', v_id, 'source', 'upload')
  );
  return v_id;
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
            'id', r.id, 'status', r.status, 'storage_path', r.storage_path, 'provider', r.provider,
            'error_message', r.error_message, 'created_at', r.created_at
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
        'storage_path', coalesce((select r.storage_path from app.persona_portraits r where r.id = p.selected_portrait_id and r.status = 'ready'), ''),
        'provider', coalesce((select r.provider from app.persona_portraits r where r.id = p.selected_portrait_id and r.status = 'ready'), '')
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

grant execute on function app.register_persona_photo(uuid, text) to authenticated;
