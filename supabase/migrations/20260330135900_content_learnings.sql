-- Content learning events (AI vs editor). Draai na 20260330135800.

alter table app.blog_concepts
  add column if not exists text_ai_baseline jsonb not null default '{}'::jsonb;

alter table app.social_post_concepts
  add column if not exists text_ai_baseline jsonb not null default '{}'::jsonb;

create table if not exists app.content_learning_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  brand_id uuid references app.client_brands (id) on delete set null,
  content_kind text not null check (content_kind in ('blog', 'social')),
  concept_id uuid not null,
  trigger_kind text not null check (trigger_kind in ('save', 'publish')),
  baseline_snapshot jsonb not null default '{}'::jsonb,
  final_snapshot jsonb not null default '{}'::jsonb,
  diff_summary text not null default '',
  learning_text text not null default '',
  learning_tags text[] not null default '{}'::text[],
  status text not null default 'active' check (status in ('active', 'dismissed')),
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (dedupe_key)
);

create index content_learning_events_tenant_created_idx
  on app.content_learning_events (tenant_id, created_at desc);

alter table app.content_learning_events enable row level security;

-- Extend blog JSON + save patch for textAiBaseline
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

create or replace function app.insert_content_learning_event(
  p_tenant_id uuid,
  p_brand_id uuid,
  p_content_kind text,
  p_concept_id uuid,
  p_trigger_kind text,
  p_baseline_snapshot jsonb,
  p_final_snapshot jsonb,
  p_diff_summary text,
  p_learning_text text,
  p_learning_tags text[],
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  insert into app.content_learning_events (
    tenant_id, brand_id, content_kind, concept_id, trigger_kind,
    baseline_snapshot, final_snapshot, diff_summary, learning_text, learning_tags,
    dedupe_key, created_by
  ) values (
    p_tenant_id, p_brand_id, p_content_kind, p_concept_id, p_trigger_kind,
    coalesce(p_baseline_snapshot, '{}'::jsonb),
    coalesce(p_final_snapshot, '{}'::jsonb),
    coalesce(p_diff_summary, ''),
    coalesce(p_learning_text, ''),
    coalesce(p_learning_tags, '{}'::text[]),
    p_dedupe_key,
    auth.uid()
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function app.list_content_learnings(
  p_tenant_id uuid,
  p_limit integer default 50,
  p_include_dismissed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sub.id,
    'contentKind', sub.content_kind,
    'conceptId', sub.concept_id,
    'triggerKind', sub.trigger_kind,
    'learningText', sub.learning_text,
    'learningTags', to_jsonb(sub.learning_tags),
    'diffSummary', sub.diff_summary,
    'status', sub.status,
    'createdAt', sub.created_at
  ) order by sub.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select e.*
    from app.content_learning_events e
    where e.tenant_id = p_tenant_id
      and (p_include_dismissed or e.status = 'active')
    order by e.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) sub;

  return v_rows;
end;
$$;

create or replace function app.dismiss_content_learning(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select tenant_id into v_tenant from app.content_learning_events where id = p_event_id;
  if v_tenant is null then raise exception 'Learning niet gevonden'; end if;
  if not app.has_capability(v_tenant, 'audit.edit') then raise exception 'Forbidden'; end if;

  update app.content_learning_events
  set status = 'dismissed'
  where id = p_event_id;
end;
$$;

create or replace function app.get_content_learning_prompt_block(p_tenant_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
declare
  v_block text := '';
  v_row record;
  v_len integer := 0;
  v_max integer := 2500;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  for v_row in
    select learning_text
    from app.content_learning_events
    where tenant_id = p_tenant_id and status = 'active' and btrim(learning_text) <> ''
    order by created_at desc
    limit 15
  loop
    exit when v_len >= v_max;
    v_block := v_block || case when v_block = '' then '' else E'\n' end || '- ' || v_row.learning_text;
    v_len := length(v_block);
  end loop;

  return left(v_block, v_max);
end;
$$;

revoke all on function app.insert_content_learning_event(uuid, uuid, text, uuid, text, jsonb, jsonb, text, text, text[], text) from public, anon;
revoke all on function app.list_content_learnings(uuid, integer, boolean) from public, anon;
revoke all on function app.dismiss_content_learning(uuid) from public, anon;
revoke all on function app.get_content_learning_prompt_block(uuid) from public, anon;

grant execute on function app.insert_content_learning_event(uuid, uuid, text, uuid, text, jsonb, jsonb, text, text, text[], text) to authenticated;
grant execute on function app.list_content_learnings(uuid, integer, boolean) to authenticated;
grant execute on function app.dismiss_content_learning(uuid) to authenticated;
grant execute on function app.get_content_learning_prompt_block(uuid) to authenticated;
