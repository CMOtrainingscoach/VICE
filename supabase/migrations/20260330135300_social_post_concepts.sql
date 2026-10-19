-- Socialmediapost-concepten onder Content. Draai na 20260330135200.
-- Alleen concept-opslag; publiceren volgt later.

create table if not exists app.social_post_concepts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  channels text[] not null default '{}'::text[],
  format text not null default 'single' check (format in ('single', 'carousel', 'reel')),
  topic_mode text not null default 'manual' check (topic_mode in ('manual', 'blog', 'meeting')),
  topic_text text not null default '',
  blog_concept_id uuid references app.blog_concepts (id) on delete set null,
  meeting_recording_id uuid references app.meeting_recordings (id) on delete set null,
  caption text not null default '',
  hashtags text not null default '',
  language text not null default 'nl',
  brand_id uuid references app.client_brands (id) on delete set null,
  brand_version_number integer,
  brand_voice_snapshot text not null default '',
  brand_visual_snapshot jsonb not null default '{}'::jsonb,
  selected_asset_id uuid,
  text_job_status text not null default 'idle' check (text_job_status in ('idle', 'queued', 'running', 'ready', 'failed')),
  text_job_error text not null default '',
  image_job_status text not null default 'idle' check (image_job_status in ('idle', 'queued', 'running', 'ready', 'failed')),
  image_job_error text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table if not exists app.social_post_assets (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references app.social_post_concepts (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  storage_path text not null,
  mime_type text not null default 'image/png',
  width integer,
  height integer,
  kind text not null default 'ai' check (kind in ('ai', 'upload')),
  prompt text not null default '',
  style_summary text not null default '',
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

alter table app.social_post_concepts
  drop constraint if exists social_post_concepts_selected_asset_fkey;
alter table app.social_post_concepts
  add constraint social_post_concepts_selected_asset_fkey
  foreign key (selected_asset_id) references app.social_post_assets (id) on delete set null;

create index if not exists social_post_concepts_tenant_updated_idx
  on app.social_post_concepts (tenant_id, updated_at desc);
create index if not exists social_post_assets_concept_idx
  on app.social_post_assets (concept_id, sort_order, created_at);

alter table app.social_post_concepts enable row level security;
alter table app.social_post_assets enable row level security;

create or replace function app._social_post_asset_json(p_row app.social_post_assets)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'storagePath', p_row.storage_path,
    'mimeType', p_row.mime_type,
    'width', p_row.width,
    'height', p_row.height,
    'kind', p_row.kind,
    'prompt', p_row.prompt,
    'styleSummary', p_row.style_summary,
    'altText', p_row.alt_text,
    'sortOrder', p_row.sort_order,
    'createdAt', p_row.created_at
  );
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

create or replace function app.list_social_post_concepts(p_tenant_id uuid)
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
    'id', c.id,
    'caption', left(c.caption, 120),
    'topicText', left(c.topic_text, 120),
    'format', c.format,
    'channels', to_jsonb(c.channels),
    'updatedAt', c.updated_at
  ) order by c.updated_at desc), '[]'::jsonb)
  into v_rows
  from app.social_post_concepts c
  where c.tenant_id = p_tenant_id;

  return v_rows;
end;
$$;

create or replace function app.get_social_post_concept(p_concept_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.social_post_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.social_post_concepts where id = p_concept_id;
  if v_row.id is null then raise exception 'Concept niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  return app._social_post_concept_json(v_row);
end;
$$;

create or replace function app.create_social_post_concept(
  p_tenant_id uuid,
  p_channels text[],
  p_format text,
  p_topic_mode text,
  p_topic_text text,
  p_blog_concept_id uuid,
  p_meeting_recording_id uuid,
  p_brand_id uuid,
  p_brand_version_number integer,
  p_brand_voice_snapshot text,
  p_brand_visual_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.social_post_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if p_format not in ('single', 'carousel', 'reel') then raise exception 'Onbekend formaat'; end if;
  if p_topic_mode not in ('manual', 'blog', 'meeting') then raise exception 'Onbekende bron'; end if;

  insert into app.social_post_concepts (
    tenant_id, channels, format, topic_mode, topic_text,
    blog_concept_id, meeting_recording_id,
    brand_id, brand_version_number, brand_voice_snapshot, brand_visual_snapshot,
    created_by, updated_by
  ) values (
    p_tenant_id,
    coalesce(p_channels, '{}'::text[]),
    p_format,
    p_topic_mode,
    coalesce(p_topic_text, ''),
    p_blog_concept_id,
    p_meeting_recording_id,
    p_brand_id,
    p_brand_version_number,
    coalesce(p_brand_voice_snapshot, ''),
    coalesce(p_brand_visual_snapshot, '{}'::jsonb),
    auth.uid(),
    auth.uid()
  )
  returning * into v_row;

  return app._social_post_concept_json(v_row);
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

create or replace function app.add_social_post_asset(
  p_concept_id uuid,
  p_path text,
  p_mime text,
  p_width integer,
  p_height integer,
  p_kind text,
  p_prompt text,
  p_style_summary text,
  p_alt_text text,
  p_select boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_concept app.social_post_concepts;
  v_asset app.social_post_assets;
  v_sort integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_concept from app.social_post_concepts where id = p_concept_id for update;
  if v_concept.id is null then raise exception 'Concept niet gevonden'; end if;
  if not app.has_capability(v_concept.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if p_kind not in ('ai', 'upload') then raise exception 'Onbekend assettype'; end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort
  from app.social_post_assets where concept_id = p_concept_id;

  insert into app.social_post_assets (
    concept_id, tenant_id, storage_path, mime_type, width, height,
    kind, prompt, style_summary, alt_text, sort_order, created_by
  ) values (
    p_concept_id, v_concept.tenant_id, p_path, coalesce(p_mime, 'image/png'),
    p_width, p_height, p_kind, coalesce(p_prompt, ''), coalesce(p_style_summary, ''),
    coalesce(p_alt_text, ''), v_sort, auth.uid()
  )
  returning * into v_asset;

  update app.social_post_concepts set
    selected_asset_id = case when p_select then v_asset.id else selected_asset_id end,
    image_job_status = 'ready',
    image_job_error = '',
    updated_at = now(),
    updated_by = auth.uid()
  where id = p_concept_id;

  return app.get_social_post_concept(p_concept_id);
end;
$$;

create or replace function app.delete_social_post_asset(p_asset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_asset app.social_post_assets;
  v_concept app.social_post_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_asset from app.social_post_assets where id = p_asset_id;
  if v_asset.id is null then raise exception 'Asset niet gevonden'; end if;
  select * into v_concept from app.social_post_concepts where id = v_asset.concept_id;
  if not app.has_capability(v_concept.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  if v_concept.selected_asset_id = p_asset_id then
    update app.social_post_concepts set selected_asset_id = null where id = v_concept.id;
  end if;

  delete from app.social_post_assets where id = p_asset_id;

  return jsonb_build_object(
    'concept', app.get_social_post_concept(v_concept.id),
    'storagePath', v_asset.storage_path,
    'assetId', p_asset_id
  );
end;
$$;

create or replace function app.delete_social_post_concept(p_concept_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.social_post_concepts;
  v_paths jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.social_post_concepts where id = p_concept_id;
  if v_row.id is null then raise exception 'Concept niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select coalesce(jsonb_agg(to_jsonb(a.storage_path)), '[]'::jsonb)
  into v_paths
  from app.social_post_assets a
  where a.concept_id = p_concept_id;

  update app.social_post_concepts set selected_asset_id = null where id = p_concept_id;
  delete from app.social_post_concepts where id = p_concept_id;

  return jsonb_build_object(
    'id', p_concept_id,
    'tenantId', v_row.tenant_id,
    'storagePaths', coalesce(v_paths, '[]'::jsonb)
  );
end;
$$;

revoke execute on function app.list_social_post_concepts(uuid) from public, anon;
revoke execute on function app.get_social_post_concept(uuid) from public, anon;
revoke execute on function app.create_social_post_concept(uuid, text[], text, text, text, uuid, uuid, uuid, integer, text, jsonb) from public, anon;
revoke execute on function app.save_social_post_concept(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function app.add_social_post_asset(uuid, text, text, integer, integer, text, text, text, text, boolean) from public, anon;
revoke execute on function app.delete_social_post_asset(uuid) from public, anon;
revoke execute on function app.delete_social_post_concept(uuid) from public, anon;

grant execute on function app.list_social_post_concepts(uuid) to authenticated;
grant execute on function app.get_social_post_concept(uuid) to authenticated;
grant execute on function app.create_social_post_concept(uuid, text[], text, text, text, uuid, uuid, uuid, integer, text, jsonb) to authenticated;
grant execute on function app.save_social_post_concept(uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.add_social_post_asset(uuid, text, text, integer, integer, text, text, text, text, boolean) to authenticated;
grant execute on function app.delete_social_post_asset(uuid) to authenticated;
grant execute on function app.delete_social_post_concept(uuid) to authenticated;
