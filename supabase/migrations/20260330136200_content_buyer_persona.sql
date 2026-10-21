-- Koppel buyer persona aan contentconcepten. Draai na 20260330136100.

alter table app.blog_concepts
  add column if not exists buyer_persona_id uuid references app.persona_people (id) on delete set null;

alter table app.social_post_concepts
  add column if not exists buyer_persona_id uuid references app.persona_people (id) on delete set null;

create index if not exists blog_concepts_buyer_persona_idx on app.blog_concepts (buyer_persona_id);
create index if not exists social_post_concepts_buyer_persona_idx on app.social_post_concepts (buyer_persona_id);

create or replace function app.list_tenant_buyer_personas_for_content(p_tenant_id uuid)
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
      'id', p.id,
      'displayName', p.display_name,
      'roleTitle', p.role_title,
      'icpHeadline', left(coalesce(icp.profile->>'headline', ''), 200),
      'approved', p.evidence_level = 'client'
    ) order by case when p.evidence_level = 'client' then 0 else 1 end, p.sort_order, p.created_at)
    from app.persona_people p
    left join app.tenant_icp_profiles icp on icp.id = p.icp_profile_id and icp.archived_at is null
    where p.tenant_id = p_tenant_id and p.archived_at is null and p.active
  ), '[]'::jsonb);
end;
$$;

drop function if exists app.get_content_audience_context(uuid);

create or replace function app.get_content_audience_context(
  p_tenant_id uuid,
  p_persona_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_icp app.tenant_icp_profiles;
  v_persona app.persona_people;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  if p_persona_id is not null then
    select * into v_persona
    from app.persona_people
    where id = p_persona_id and tenant_id = p_tenant_id and archived_at is null and active;
    if v_persona.id is null then raise exception 'Buyer persona niet gevonden'; end if;
    if v_persona.icp_profile_id is not null then
      select * into v_icp from app.tenant_icp_profiles where id = v_persona.icp_profile_id and archived_at is null;
    end if;
    if v_icp.id is null then
      select * into v_icp from app.tenant_icp_profiles
      where tenant_id = p_tenant_id and archived_at is null and is_primary = true limit 1;
    end if;
    return jsonb_build_object(
      'icp', case when v_icp.id is null then null else jsonb_build_object(
        'id', v_icp.id,
        'headline', coalesce(v_icp.profile->>'headline', ''),
        'summary', coalesce(v_icp.profile->>'summary', ''),
        'offer', coalesce(v_icp.profile->>'offer', ''),
        'positioning', coalesce(v_icp.profile->>'positioning', '')
      ) end,
      'personas', jsonb_build_array(jsonb_build_object(
        'id', v_persona.id,
        'displayName', v_persona.display_name,
        'roleTitle', v_persona.role_title,
        'summary', v_persona.summary,
        'goals', v_persona.goals,
        'pains', v_persona.pains,
        'triggers', v_persona.triggers,
        'decisionCriteria', v_persona.decision_criteria,
        'objections', v_persona.objections,
        'infoNeeded', v_persona.info_needed,
        'approved', v_persona.evidence_level = 'client'
      ))
    );
  end if;

  select * into v_icp from app.tenant_icp_profiles
  where tenant_id = p_tenant_id and archived_at is null and is_primary = true limit 1;
  if v_icp.id is null then
    select * into v_icp from app.tenant_icp_profiles
    where tenant_id = p_tenant_id and archived_at is null order by updated_at desc limit 1;
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
        'id', p.id,
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

-- Replace JSON helpers (buyerPersonaId on concept)
create or replace function app._blog_concept_json(p_row app.blog_concepts)
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
declare
  v_visuals jsonb;
  v_selected jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'storagePath', v.storage_path,
    'mimeType', v.mime_type,
    'width', v.width,
    'height', v.height,
    'prompt', v.prompt,
    'styleSummary', v.style_summary,
    'altText', v.alt_text,
    'brandVersionNumber', v.brand_version_number,
    'basedOnTitle', v.based_on_title,
    'createdAt', v.created_at
  ) order by v.created_at desc), '[]'::jsonb)
  into v_visuals
  from app.blog_visuals v
  where v.concept_id = p_row.id;

  v_selected := null;
  if p_row.selected_visual_id is not null then
    select jsonb_build_object(
      'id', v.id,
      'storagePath', v.storage_path,
      'mimeType', v.mime_type,
      'width', v.width,
      'height', v.height,
      'prompt', v.prompt,
      'styleSummary', v.style_summary,
      'altText', v.alt_text,
      'brandVersionNumber', v.brand_version_number,
      'basedOnTitle', v.based_on_title,
      'createdAt', v.created_at
    )
    into v_selected
    from app.blog_visuals v
    where v.id = p_row.selected_visual_id;
  end if;

  return jsonb_build_object(
    'id', p_row.id,
    'tenantId', p_row.tenant_id,
    'mode', p_row.mode,
    'language', p_row.language,
    'lengthKey', p_row.length_key,
    'sourceText', p_row.source_text,
    'title', p_row.title,
    'bodyHtml', p_row.body_html,
    'bodyPlain', p_row.body_plain,
    'wordCount', p_row.word_count,
    'brandId', p_row.brand_id,
    'brandVersionNumber', p_row.brand_version_number,
    'brandVoiceSnapshot', p_row.brand_voice_snapshot,
    'brandVisualSnapshot', p_row.brand_visual_snapshot,
    'textAiBaseline', p_row.text_ai_baseline,
    'buyerPersonaId', p_row.buyer_persona_id,
    'selectedVisualId', p_row.selected_visual_id,
    'selectedVisual', v_selected,
    'visuals', v_visuals,
    'textJobStatus', p_row.text_job_status,
    'textJobError', p_row.text_job_error,
    'imageJobStatus', p_row.image_job_status,
    'imageJobError', p_row.image_job_error,
    'createdAt', p_row.created_at,
    'updatedAt', p_row.updated_at
  );
end;
$$;

create or replace function app.save_blog_concept(
  p_concept_id uuid,
  p_expected timestamptz,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.blog_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.blog_concepts where id = p_concept_id for update;
  if v_row.id is null then raise exception 'Concept niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if p_expected is not null and v_row.updated_at <> p_expected then
    raise exception 'Dit concept is intussen gewijzigd. Vernieuw de pagina.';
  end if;

  update app.blog_concepts set
    mode = coalesce(p_patch->>'mode', mode),
    language = coalesce(p_patch->>'language', language),
    length_key = coalesce(p_patch->>'lengthKey', length_key),
    source_text = coalesce(p_patch->>'sourceText', source_text),
    title = coalesce(p_patch->>'title', title),
    body_html = coalesce(p_patch->>'bodyHtml', body_html),
    body_plain = coalesce(p_patch->>'bodyPlain', body_plain),
    word_count = coalesce((p_patch->>'wordCount')::integer, word_count),
    text_ai_baseline = case
      when p_patch ? 'textAiBaseline' then coalesce(p_patch->'textAiBaseline', '{}'::jsonb)
      else text_ai_baseline
    end,
    buyer_persona_id = case
      when p_patch ? 'buyerPersonaId' and p_patch->>'buyerPersonaId' is null then null
      when p_patch ? 'buyerPersonaId' then (p_patch->>'buyerPersonaId')::uuid
      else buyer_persona_id
    end,
    selected_visual_id = case
      when p_patch ? 'selectedVisualId' and p_patch->>'selectedVisualId' is null then null
      when p_patch ? 'selectedVisualId' then (p_patch->>'selectedVisualId')::uuid
      else selected_visual_id
    end,
    text_job_status = coalesce(p_patch->>'textJobStatus', text_job_status),
    text_job_error = coalesce(p_patch->>'textJobError', text_job_error),
    image_job_status = coalesce(p_patch->>'imageJobStatus', image_job_status),
    image_job_error = coalesce(p_patch->>'imageJobError', image_job_error),
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_row.id
  returning * into v_row;

  return app._blog_concept_json(v_row);
end;
$$;

create or replace function app._social_post_concept_json(p_row app.social_post_concepts)
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
declare
  v_assets jsonb;
  v_selected jsonb;
begin
  select coalesce(jsonb_agg(app._social_post_asset_json(a) order by a.sort_order, a.created_at), '[]'::jsonb)
  into v_assets
  from app.social_post_assets a
  where a.concept_id = p_row.id;

  v_selected := null;
  if p_row.selected_asset_id is not null then
    select app._social_post_asset_json(a)
    into v_selected
    from app.social_post_assets a
    where a.id = p_row.selected_asset_id;
  end if;

  return jsonb_build_object(
    'id', p_row.id,
    'tenantId', p_row.tenant_id,
    'channels', to_jsonb(p_row.channels),
    'format', p_row.format,
    'topicMode', p_row.topic_mode,
    'topicText', p_row.topic_text,
    'blogConceptId', p_row.blog_concept_id,
    'meetingRecordingId', p_row.meeting_recording_id,
    'caption', p_row.caption,
    'hashtags', p_row.hashtags,
    'language', p_row.language,
    'brandId', p_row.brand_id,
    'brandVersionNumber', p_row.brand_version_number,
    'brandVoiceSnapshot', p_row.brand_voice_snapshot,
    'brandVisualSnapshot', p_row.brand_visual_snapshot,
    'textAiBaseline', p_row.text_ai_baseline,
    'buyerPersonaId', p_row.buyer_persona_id,
    'selectedAssetId', p_row.selected_asset_id,
    'selectedAsset', v_selected,
    'assets', v_assets,
    'textJobStatus', p_row.text_job_status,
    'textJobError', p_row.text_job_error,
    'imageJobStatus', p_row.image_job_status,
    'imageJobError', p_row.image_job_error,
    'createdAt', p_row.created_at,
    'updatedAt', p_row.updated_at
  );
end;
$$;

create or replace function app.save_social_post_concept(
  p_concept_id uuid,
  p_expected timestamptz,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.social_post_concepts;
  v_channels text[];
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.social_post_concepts where id = p_concept_id for update;
  if v_row.id is null then raise exception 'Concept niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if p_expected is not null and v_row.updated_at <> p_expected then
    raise exception 'Concept is ondertussen gewijzigd. Herlaad de pagina.';
  end if;

  if p_patch ? 'channels' then
    select coalesce(array_agg(value), '{}'::text[])
    into v_channels
    from jsonb_array_elements_text(coalesce(p_patch->'channels', '[]'::jsonb)) as t(value);
  else
    v_channels := v_row.channels;
  end if;

  update app.social_post_concepts set
    channels = v_channels,
    format = case when p_patch ? 'format' then p_patch->>'format' else format end,
    topic_mode = case when p_patch ? 'topicMode' then p_patch->>'topicMode' else topic_mode end,
    topic_text = case when p_patch ? 'topicText' then coalesce(p_patch->>'topicText', '') else topic_text end,
    blog_concept_id = case
      when p_patch ? 'blogConceptId' then nullif(p_patch->>'blogConceptId', '')::uuid
      else blog_concept_id
    end,
    meeting_recording_id = case
      when p_patch ? 'meetingRecordingId' then nullif(p_patch->>'meetingRecordingId', '')::uuid
      else meeting_recording_id
    end,
    caption = case when p_patch ? 'caption' then coalesce(p_patch->>'caption', '') else caption end,
    hashtags = case when p_patch ? 'hashtags' then coalesce(p_patch->>'hashtags', '') else hashtags end,
    language = case when p_patch ? 'language' then coalesce(nullif(p_patch->>'language', ''), 'nl') else language end,
    text_ai_baseline = case
      when p_patch ? 'textAiBaseline' then coalesce(p_patch->'textAiBaseline', '{}'::jsonb)
      else text_ai_baseline
    end,
    buyer_persona_id = case
      when p_patch ? 'buyerPersonaId' and p_patch->>'buyerPersonaId' is null then null
      when p_patch ? 'buyerPersonaId' then (p_patch->>'buyerPersonaId')::uuid
      else buyer_persona_id
    end,
    selected_asset_id = case
      when p_patch ? 'selectedAssetId' then nullif(p_patch->>'selectedAssetId', '')::uuid
      else selected_asset_id
    end,
    text_job_status = case when p_patch ? 'textJobStatus' then p_patch->>'textJobStatus' else text_job_status end,
    text_job_error = case when p_patch ? 'textJobError' then coalesce(p_patch->>'textJobError', '') else text_job_error end,
    image_job_status = case when p_patch ? 'imageJobStatus' then p_patch->>'imageJobStatus' else image_job_status end,
    image_job_error = case when p_patch ? 'imageJobError' then coalesce(p_patch->>'imageJobError', '') else image_job_error end,
    updated_at = now(),
    updated_by = auth.uid()
  where id = p_concept_id
  returning * into v_row;

  return app._social_post_concept_json(v_row);
end;
$$;

revoke execute on function app.list_tenant_buyer_personas_for_content(uuid) from public, anon;
grant execute on function app.list_tenant_buyer_personas_for_content(uuid) to authenticated;

revoke execute on function app.get_content_audience_context(uuid, uuid) from public, anon;
grant execute on function app.get_content_audience_context(uuid, uuid) to authenticated;
