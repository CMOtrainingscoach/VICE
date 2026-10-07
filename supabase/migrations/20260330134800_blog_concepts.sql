-- Blogconcepten onder Content. Draai na 20260330134700.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-assets',
  'content-assets',
  false,
  12582912,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table app.blog_concepts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  mode text not null default 'new' check (mode in ('new', 'rewrite')),
  language text not null default 'nl',
  length_key text not null default 'medium' check (length_key in ('short', 'medium', 'long')),
  source_text text not null default '',
  title text not null default '',
  body_html text not null default '',
  body_plain text not null default '',
  word_count integer not null default 0,
  brand_id uuid references app.client_brands (id) on delete set null,
  brand_version_number integer,
  brand_voice_snapshot text not null default '',
  brand_visual_snapshot jsonb not null default '{}'::jsonb,
  selected_visual_id uuid,
  text_job_status text not null default 'idle' check (text_job_status in ('idle', 'queued', 'running', 'ready', 'failed')),
  text_job_error text not null default '',
  image_job_status text not null default 'idle' check (image_job_status in ('idle', 'queued', 'running', 'ready', 'failed')),
  image_job_error text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table app.blog_revisions (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references app.blog_concepts (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  kind text not null check (kind in ('manual', 'generate', 'rewrite')),
  title text not null default '',
  body_html text not null default '',
  body_plain text not null default '',
  instruction text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create table app.blog_visuals (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references app.blog_concepts (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  storage_path text not null,
  mime_type text not null default 'image/png',
  width integer,
  height integer,
  prompt text not null default '',
  style_summary text not null default '',
  alt_text text not null default '',
  brand_version_number integer,
  based_on_title text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

alter table app.blog_concepts
  add constraint blog_concepts_selected_visual_fkey
  foreign key (selected_visual_id) references app.blog_visuals (id) on delete set null;

create index blog_concepts_tenant_updated_idx on app.blog_concepts (tenant_id, updated_at desc);
create index blog_revisions_concept_idx on app.blog_revisions (concept_id, created_at desc);
create index blog_visuals_concept_idx on app.blog_visuals (concept_id, created_at desc);

alter table app.blog_concepts enable row level security;
alter table app.blog_revisions enable row level security;
alter table app.blog_visuals enable row level security;

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

create or replace function app.list_blog_concepts(p_tenant_id uuid)
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
    'title', nullif(c.title, ''),
    'sourceText', left(c.source_text, 120),
    'updatedAt', c.updated_at,
    'wordCount', c.word_count,
    'brandVersionNumber', c.brand_version_number
  ) order by c.updated_at desc), '[]'::jsonb)
  into v_rows
  from app.blog_concepts c
  where c.tenant_id = p_tenant_id;
  return v_rows;
end;
$$;

create or replace function app.get_blog_concept(p_concept_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.blog_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.blog_concepts where id = p_concept_id;
  if v_row.id is null then raise exception 'Concept niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  return app._blog_concept_json(v_row);
end;
$$;

create or replace function app.create_blog_concept(
  p_tenant_id uuid,
  p_mode text,
  p_language text,
  p_length_key text,
  p_source_text text,
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
  v_row app.blog_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if not exists (select 1 from app.tenants where id = p_tenant_id and deleted_at is null) then
    raise exception 'Klant niet gevonden';
  end if;
  if p_mode not in ('new', 'rewrite') then raise exception 'Onbekende modus'; end if;
  if p_length_key not in ('short', 'medium', 'long') then raise exception 'Onbekende lengte'; end if;

  insert into app.blog_concepts (
    tenant_id, mode, language, length_key, source_text,
    brand_id, brand_version_number, brand_voice_snapshot, brand_visual_snapshot,
    created_by, updated_by
  ) values (
    p_tenant_id, p_mode, coalesce(nullif(btrim(p_language), ''), 'nl'), p_length_key, coalesce(p_source_text, ''),
    p_brand_id, p_brand_version_number, coalesce(p_brand_voice_snapshot, ''), coalesce(p_brand_visual_snapshot, '{}'::jsonb),
    auth.uid(), auth.uid()
  )
  returning * into v_row;

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (p_tenant_id, auth.uid(), 'blog.concept.create', 'blog_concept', v_row.id::text, '{}'::jsonb);

  return app._blog_concept_json(v_row);
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

create or replace function app.add_blog_revision(
  p_concept_id uuid,
  p_kind text,
  p_title text,
  p_body_html text,
  p_body_plain text,
  p_instruction text default ''
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select tenant_id into v_tenant from app.blog_concepts where id = p_concept_id;
  if v_tenant is null then raise exception 'Concept niet gevonden'; end if;
  if not app.has_capability(v_tenant, 'audit.edit') then raise exception 'Forbidden'; end if;
  if p_kind not in ('manual', 'generate', 'rewrite') then raise exception 'Onbekende revisie'; end if;
  insert into app.blog_revisions (concept_id, tenant_id, kind, title, body_html, body_plain, instruction, created_by)
  values (p_concept_id, v_tenant, p_kind, coalesce(p_title, ''), coalesce(p_body_html, ''), coalesce(p_body_plain, ''), coalesce(p_instruction, ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function app.add_blog_visual(
  p_concept_id uuid,
  p_path text,
  p_mime text,
  p_width integer,
  p_height integer,
  p_prompt text,
  p_style_summary text,
  p_alt_text text,
  p_brand_version_number integer,
  p_based_on_title text,
  p_select boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.blog_concepts;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.blog_concepts where id = p_concept_id for update;
  if v_row.id is null then raise exception 'Concept niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  insert into app.blog_visuals (
    concept_id, tenant_id, storage_path, mime_type, width, height, prompt, style_summary, alt_text,
    brand_version_number, based_on_title, created_by
  ) values (
    p_concept_id, v_row.tenant_id, p_path, coalesce(p_mime, 'image/png'), p_width, p_height,
    coalesce(p_prompt, ''), coalesce(p_style_summary, ''), coalesce(p_alt_text, ''),
    p_brand_version_number, coalesce(p_based_on_title, ''), auth.uid()
  )
  returning id into v_id;

  if coalesce(p_select, true) then
    update app.blog_concepts set
      selected_visual_id = v_id,
      image_job_status = 'ready',
      image_job_error = '',
      updated_at = now(),
      updated_by = auth.uid()
    where id = p_concept_id
    returning * into v_row;
  else
    select * into v_row from app.blog_concepts where id = p_concept_id;
  end if;

  return app._blog_concept_json(v_row);
end;
$$;

create or replace function app.update_blog_visual_alt(p_visual_id uuid, p_alt_text text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select tenant_id into v_tenant from app.blog_visuals where id = p_visual_id;
  if v_tenant is null then raise exception 'Visual niet gevonden'; end if;
  if not app.has_capability(v_tenant, 'audit.edit') then raise exception 'Forbidden'; end if;
  update app.blog_visuals set alt_text = coalesce(p_alt_text, '') where id = p_visual_id;
end;
$$;

revoke execute on function app.list_blog_concepts(uuid) from public, anon;
revoke execute on function app.get_blog_concept(uuid) from public, anon;
revoke execute on function app.create_blog_concept(uuid, text, text, text, text, uuid, integer, text, jsonb) from public, anon;
revoke execute on function app.save_blog_concept(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function app.add_blog_revision(uuid, text, text, text, text, text) from public, anon;
revoke execute on function app.add_blog_visual(uuid, text, text, integer, integer, text, text, text, integer, text, boolean) from public, anon;
revoke execute on function app.update_blog_visual_alt(uuid, text) from public, anon;
revoke execute on function app._blog_concept_json(app.blog_concepts) from public, anon, authenticated;

grant execute on function app.list_blog_concepts(uuid) to authenticated;
grant execute on function app.get_blog_concept(uuid) to authenticated;
grant execute on function app.create_blog_concept(uuid, text, text, text, text, uuid, integer, text, jsonb) to authenticated;
grant execute on function app.save_blog_concept(uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.add_blog_revision(uuid, text, text, text, text, text) to authenticated;
grant execute on function app.add_blog_visual(uuid, text, text, integer, integer, text, text, text, integer, text, boolean) to authenticated;
grant execute on function app.update_blog_visual_alt(uuid, text) to authenticated;
