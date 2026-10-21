-- Buyer persona's gekoppeld aan tenant ICP (Brand-tab). Draai na 20260330136000.

alter table app.persona_people
  add column if not exists icp_profile_id uuid references app.tenant_icp_profiles (id) on delete set null;

create index if not exists persona_people_icp_idx
  on app.persona_people (icp_profile_id, sort_order)
  where archived_at is null;

create or replace function app._ensure_brand_persona_version(p_tenant_id uuid)
returns app.persona_versions
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.persona_versions;
  v_next integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select * into v_row from app.persona_versions
  where tenant_id = p_tenant_id and status <> 'approved'
  order by version_number desc limit 1;

  if v_row.id is null then
    select * into v_row from app.persona_versions
    where tenant_id = p_tenant_id order by version_number desc limit 1;
  end if;

  if v_row.id is null or v_row.status = 'approved' then
    select coalesce(max(version_number), 0) + 1 into v_next from app.persona_versions where tenant_id = p_tenant_id;
    insert into app.persona_versions (tenant_id, version_number, status, current_step, created_by)
    values (p_tenant_id, v_next, 'draft', 'personas', auth.uid())
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

create or replace function app.list_buyer_personas_for_icp(p_icp_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_icp app.tenant_icp_profiles;
begin
  select * into v_icp from app.tenant_icp_profiles where id = p_icp_id and archived_at is null;
  if v_icp.tenant_id is null then raise exception 'ICP niet gevonden'; end if;
  if not app.has_capability(v_icp.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'displayName', p.display_name,
      'roleTitle', p.role_title,
      'summary', p.summary,
      'decisionRoles', p.decision_roles,
      'goals', p.goals,
      'pains', p.pains,
      'triggers', p.triggers,
      'decisionCriteria', p.decision_criteria,
      'objections', p.objections,
      'infoNeeded', p.info_needed,
      'channels', p.channels,
      'assumptions', p.assumptions,
      'openQuestion', p.open_question,
      'evidenceLevel', p.evidence_level,
      'active', p.active,
      'illustrationPrompt', p.illustration_prompt,
      'selectedPortraitId', p.selected_portrait_id,
      'updatedAt', p.updated_at,
      'portraits', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id,
          'status', r.status,
          'storagePath', r.storage_path,
          'visualPrompt', r.visual_prompt,
          'errorMessage', r.error_message,
          'createdAt', r.created_at
        ) order by r.created_at desc)
        from app.persona_portraits r where r.persona_id = p.id
      ), '[]'::jsonb)
    ) order by p.sort_order, p.created_at)
    from app.persona_people p
    where p.icp_profile_id = p_icp_id and p.archived_at is null and p.active
  ), '[]'::jsonb);
end;
$$;

create or replace function app.upsert_buyer_persona_for_icp(
  p_icp_id uuid,
  p_persona_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_icp app.tenant_icp_profiles;
  v_version app.persona_versions;
  v_id uuid;
begin
  select * into v_icp from app.tenant_icp_profiles where id = p_icp_id and archived_at is null;
  if v_icp.tenant_id is null then raise exception 'ICP niet gevonden'; end if;
  if not app.has_capability(v_icp.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  v_version := app._ensure_brand_persona_version(v_icp.tenant_id);
  v_id := app.upsert_persona(v_version.id, p_persona_id, p_payload);
  update app.persona_people set icp_profile_id = p_icp_id where id = v_id;
  return app.list_buyer_personas_for_icp(p_icp_id);
end;
$$;

create or replace function app.insert_ai_buyer_personas_for_icp(
  p_icp_id uuid,
  p_personas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_icp app.tenant_icp_profiles;
  v_version app.persona_versions;
  v_row jsonb;
  v_i integer := 0;
  v_id uuid;
begin
  select * into v_icp from app.tenant_icp_profiles where id = p_icp_id and archived_at is null;
  if v_icp.tenant_id is null then raise exception 'ICP niet gevonden'; end if;
  if not app.has_capability(v_icp.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if jsonb_typeof(p_personas) <> 'array' then raise exception 'Geen persona-voorstel'; end if;

  v_version := app._ensure_brand_persona_version(v_icp.tenant_id);

  for v_row in select value from jsonb_array_elements(p_personas)
  loop
    if length(btrim(coalesce(v_row->>'roleTitle', v_row->>'role_title', ''))) < 2 then
      continue;
    end if;
    insert into app.persona_people (
      version_id, tenant_id, icp_profile_id, role_title, display_name, summary, decision_roles,
      relevance, goals, pains, triggers, decision_criteria, objections, info_needed, channels,
      assumptions, open_question, hypothesis, evidence_level, active, origin, ai_state, manual_lock, sort_order
    ) values (
      v_version.id, v_icp.tenant_id, p_icp_id,
      left(btrim(coalesce(v_row->>'roleTitle', v_row->>'role_title', '')), 200),
      left(coalesce(v_row->>'displayName', v_row->>'display_name', ''), 80),
      left(coalesce(v_row->>'summary', ''), 800),
      app._persona_roles(coalesce(v_row->'decisionRoles', v_row->'decision_roles')),
      left(coalesce(v_row->>'relevance', ''), 800),
      left(coalesce(v_row->>'goals', ''), 800),
      left(coalesce(v_row->>'pains', ''), 800),
      left(coalesce(v_row->>'triggers', ''), 800),
      left(coalesce(v_row->>'decisionCriteria', v_row->>'decision_criteria', ''), 800),
      left(coalesce(v_row->>'objections', ''), 800),
      left(coalesce(v_row->>'infoNeeded', v_row->>'info_needed', ''), 800),
      left(coalesce(v_row->>'channels', ''), 800),
      left(coalesce(v_row->>'assumptions', ''), 800),
      left(coalesce(v_row->>'openQuestion', v_row->>'open_question', ''), 800),
      coalesce((v_row->>'hypothesis')::boolean, true),
      case
        when coalesce(v_row->>'evidenceLevel', v_row->>'evidence_level', '') in
          ('supported', 'client', 'strategist', 'hypothesis', 'unknown')
        then coalesce(v_row->>'evidenceLevel', v_row->>'evidence_level')
        else 'hypothesis'
      end,
      true, 'ai', 'accepted', false, v_i
    )
    returning id into v_id;
    v_i := v_i + 1;
  end loop;

  perform app._persona_touch(v_version.id);
  return app.list_buyer_personas_for_icp(p_icp_id);
end;
$$;

create or replace function app.approve_buyer_persona(p_persona_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.persona_people;
begin
  select * into v_item from app.persona_people where id = p_persona_id and archived_at is null;
  if v_item.id is null then raise exception 'Persona niet gevonden'; end if;
  perform app._persona_for_edit(v_item.version_id);
  update app.persona_people
  set evidence_level = 'client', manual_lock = true, hypothesis = false, updated_at = now()
  where id = p_persona_id;
  perform app._persona_touch(v_item.version_id);
end;
$$;

create or replace function app.get_content_audience_context(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_icp app.tenant_icp_profiles;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select * into v_icp from app.tenant_icp_profiles
  where tenant_id = p_tenant_id and archived_at is null and is_primary = true
  limit 1;
  if v_icp.id is null then
    select * into v_icp from app.tenant_icp_profiles
    where tenant_id = p_tenant_id and archived_at is null
    order by updated_at desc limit 1;
  end if;

  return jsonb_build_object(
    'icp', case when v_icp.id is null then null else jsonb_build_object(
      'id', v_icp.id,
      'headline', coalesce(v_icp.profile->>'headline', ''),
      'summary', coalesce(v_icp.profile->>'summary', ''),
      'offer', coalesce(v_icp.profile->>'offer', ''),
      'positioning', coalesce(v_icp.profile->>'positioning', '')
    ) end,
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'displayName', p.display_name,
        'roleTitle', p.role_title,
        'summary', p.summary,
        'goals', p.goals,
        'pains', p.pains,
        'triggers', p.triggers,
        'decisionCriteria', p.decision_criteria,
        'objections', p.objections,
        'approved', p.evidence_level = 'client'
      ) order by case when p.evidence_level = 'client' then 0 else 1 end, p.sort_order)
      from app.persona_people p
      where p.tenant_id = p_tenant_id and p.archived_at is null and p.active
        and (v_icp.id is null or p.icp_profile_id = v_icp.id or p.icp_profile_id is null)
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function app._ensure_brand_persona_version(uuid) from public, anon;
revoke execute on function app.list_buyer_personas_for_icp(uuid) from public, anon;
revoke execute on function app.upsert_buyer_persona_for_icp(uuid, uuid, jsonb) from public, anon;
revoke execute on function app.insert_ai_buyer_personas_for_icp(uuid, jsonb) from public, anon;
revoke execute on function app.approve_buyer_persona(uuid) from public, anon;
revoke execute on function app.get_content_audience_context(uuid) from public, anon;

grant execute on function app.list_buyer_personas_for_icp(uuid) to authenticated;
grant execute on function app.upsert_buyer_persona_for_icp(uuid, uuid, jsonb) to authenticated;
grant execute on function app.insert_ai_buyer_personas_for_icp(uuid, jsonb) to authenticated;
grant execute on function app.approve_buyer_persona(uuid) to authenticated;
grant execute on function app.get_content_audience_context(uuid) to authenticated;
