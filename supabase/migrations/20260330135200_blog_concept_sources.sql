-- Bronnen voor bloggeneratie (meetings + documentexcerpten). Draai na 20260330135100.

create table if not exists app.blog_concept_sources (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references app.blog_concepts (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  kind text not null check (kind in ('meeting', 'document')),
  meeting_recording_id uuid references app.meeting_recordings (id) on delete set null,
  label text not null default '',
  excerpt text not null default '',
  mime_type text not null default '',
  storage_path text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint blog_concept_sources_meeting_chk check (
    kind <> 'meeting' or meeting_recording_id is not null
  ),
  constraint blog_concept_sources_document_chk check (
    kind <> 'document' or length(btrim(label)) > 0 or length(btrim(excerpt)) > 0
  )
);

create index blog_concept_sources_concept_idx
  on app.blog_concept_sources (concept_id, sort_order, created_at);

create unique index blog_concept_sources_one_meeting
  on app.blog_concept_sources (concept_id, meeting_recording_id)
  where kind = 'meeting' and meeting_recording_id is not null;

alter table app.blog_concept_sources enable row level security;

create policy blog_concept_sources_select
  on app.blog_concept_sources for select to authenticated
  using (app.has_capability(tenant_id, 'audit.edit'));

grant select on app.blog_concept_sources to authenticated;

create or replace function app.list_blog_source_meetings(p_tenant_id uuid)
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
    'id', r.id,
    'title', coalesce(nullif(btrim(r.title), ''), nullif(btrim(r.subject), ''), 'Meeting'),
    'subject', coalesce(r.subject, ''),
    'createdAt', r.created_at,
    'hasSummary', length(btrim(coalesce(r.summary_text, ''))) > 40,
    'transcriptChars', length(coalesce(r.full_text, ''))
  ) order by r.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select *
    from app.meeting_recordings
    where tenant_id = p_tenant_id
      and transcript_status = 'ready'
      and length(btrim(coalesce(full_text, ''))) > 40
    order by created_at desc
    limit 40
  ) r;

  return v_rows;
end;
$$;

create or replace function app.replace_blog_concept_sources(
  p_concept_id uuid,
  p_sources jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.blog_concepts;
  v_item jsonb;
  v_kind text;
  v_meeting_id uuid;
  v_sort integer := 0;
  v_label text;
  v_excerpt text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.blog_concepts where id = p_concept_id;
  if v_row.id is null then raise exception 'Concept niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  if p_sources is null then p_sources := '[]'::jsonb; end if;
  if jsonb_typeof(p_sources) <> 'array' then raise exception 'Bronnen moeten een JSON-array zijn'; end if;

  delete from app.blog_concept_sources where concept_id = p_concept_id;

  for v_item in select * from jsonb_array_elements(p_sources)
  loop
    v_kind := coalesce(v_item->>'kind', '');
    v_meeting_id := nullif(v_item->>'meetingRecordingId', '')::uuid;
    if v_meeting_id is null then
      v_meeting_id := nullif(v_item->>'meeting_recording_id', '')::uuid;
    end if;
    v_label := coalesce(v_item->>'label', '');
    v_excerpt := coalesce(v_item->>'excerpt', '');

    if v_kind = 'meeting' then
      if v_meeting_id is null then raise exception 'Meeting-bron vereist meetingRecordingId'; end if;
      if not exists (
        select 1 from app.meeting_recordings r
        where r.id = v_meeting_id
          and r.tenant_id = v_row.tenant_id
          and r.transcript_status = 'ready'
      ) then
        raise exception 'Meeting niet gevonden of transcript niet klaar';
      end if;
      select coalesce(nullif(btrim(r.title), ''), nullif(btrim(r.subject), ''), 'Meeting')
        into v_label
      from app.meeting_recordings r where r.id = v_meeting_id;
      v_excerpt := '';
    elsif v_kind = 'document' then
      if length(btrim(v_label)) = 0 and length(btrim(v_excerpt)) = 0 then
        raise exception 'Document-bron vereist titel of inhoud';
      end if;
      if length(btrim(v_excerpt)) < 20 then
        raise exception 'Document lijkt leeg of te kort om als bron te gebruiken';
      end if;
    else
      raise exception 'Onbekend brontype';
    end if;

    insert into app.blog_concept_sources (
      concept_id, tenant_id, kind, meeting_recording_id, label, excerpt,
      mime_type, storage_path, sort_order
    ) values (
      p_concept_id,
      v_row.tenant_id,
      v_kind,
      v_meeting_id,
      coalesce(v_label, ''),
      coalesce(v_excerpt, ''),
      coalesce(v_item->>'mimeType', v_item->>'mime_type', ''),
      coalesce(v_item->>'storagePath', v_item->>'storage_path', ''),
      v_sort
    );
    v_sort := v_sort + 1;
  end loop;

  return app.get_blog_concept_sources(p_concept_id);
end;
$$;

create or replace function app.get_blog_concept_sources(p_concept_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.blog_concepts;
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.blog_concepts where id = p_concept_id;
  if v_row.id is null then raise exception 'Concept niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'kind', s.kind,
    'meetingRecordingId', s.meeting_recording_id,
    'label', s.label,
    'excerpt', s.excerpt,
    'mimeType', s.mime_type,
    'storagePath', s.storage_path,
    'sortOrder', s.sort_order
  ) order by s.sort_order, s.created_at), '[]'::jsonb)
  into v_rows
  from app.blog_concept_sources s
  where s.concept_id = p_concept_id;

  return v_rows;
end;
$$;

-- Tekst voor AI: meetingtranscript of documentexcerpt, met harde limiet per bron.
create or replace function app.resolve_blog_concept_source_texts(p_concept_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.blog_concepts;
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.blog_concepts where id = p_concept_id;
  if v_row.id is null then raise exception 'Concept niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', s.kind,
    'label', s.label,
    'text', case
      when s.kind = 'meeting' then left(
        coalesce(nullif(btrim(r.full_text), ''), r.summary_text, ''),
        24000
      )
      else left(coalesce(s.excerpt, ''), 24000)
    end
  ) order by s.sort_order, s.created_at), '[]'::jsonb)
  into v_rows
  from app.blog_concept_sources s
  left join app.meeting_recordings r on r.id = s.meeting_recording_id
  where s.concept_id = p_concept_id;

  return v_rows;
end;
$$;

revoke execute on function app.list_blog_source_meetings(uuid) from public, anon;
revoke execute on function app.replace_blog_concept_sources(uuid, jsonb) from public, anon;
revoke execute on function app.get_blog_concept_sources(uuid) from public, anon;
revoke execute on function app.resolve_blog_concept_source_texts(uuid) from public, anon;

grant execute on function app.list_blog_source_meetings(uuid) to authenticated;
grant execute on function app.replace_blog_concept_sources(uuid, jsonb) to authenticated;
grant execute on function app.get_blog_concept_sources(uuid) to authenticated;
grant execute on function app.resolve_blog_concept_source_texts(uuid) to authenticated;
