-- Keyword research (Google Ads) per tenant + blog bron "keyword". Draai na 20260330135600.

create table if not exists app.tenant_keyword_research_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  country_code text not null check (country_code in ('BE', 'NL')),
  city text not null default '',
  scope text not null check (scope in ('national', 'local')),
  seed_terms jsonb not null default '[]'::jsonb,
  language text not null default 'nl',
  seed_model text not null default '',
  row_count integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index tenant_keyword_research_runs_tenant_idx
  on app.tenant_keyword_research_runs (tenant_id, created_at desc);

create table if not exists app.tenant_keyword_research_rows (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references app.tenant_keyword_research_runs (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  keyword text not null,
  avg_monthly_searches integer not null default 0,
  competition text not null default '',
  cpc_low double precision,
  cpc_high double precision,
  unique (run_id, keyword)
);

create index tenant_keyword_research_rows_tenant_idx
  on app.tenant_keyword_research_rows (tenant_id, avg_monthly_searches desc);

alter table app.tenant_keyword_research_runs enable row level security;
alter table app.tenant_keyword_research_rows enable row level security;

-- Blog bron: keyword
alter table app.blog_concept_sources
  drop constraint if exists blog_concept_sources_kind_check;

alter table app.blog_concept_sources
  add constraint blog_concept_sources_kind_check
  check (kind in ('meeting', 'document', 'keyword'));

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
    elsif v_kind = 'keyword' then
      if length(btrim(v_label)) = 0 then
        raise exception 'Keyword-bron vereist een zoekterm';
      end if;
      if length(btrim(v_excerpt)) < 10 then
        raise exception 'Keyword-bron vereist metrics in excerpt';
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

create or replace function app.list_tenant_keyword_research(
  p_tenant_id uuid,
  p_min_volume integer default 0,
  p_limit integer default 200,
  p_run_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_run app.tenant_keyword_research_runs;
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  if p_run_id is not null then
    select * into v_run
    from app.tenant_keyword_research_runs
    where id = p_run_id and tenant_id = p_tenant_id;
  else
    select * into v_run
    from app.tenant_keyword_research_runs
    where tenant_id = p_tenant_id
    order by created_at desc
    limit 1;
  end if;

  if v_run.id is null then
    return jsonb_build_object('run', null, 'rows', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'keyword', r.keyword,
    'avgMonthlySearches', r.avg_monthly_searches,
    'competition', r.competition,
    'cpcLow', r.cpc_low,
    'cpcHigh', r.cpc_high
  ) order by r.avg_monthly_searches desc), '[]'::jsonb)
  into v_rows
  from (
    select *
    from app.tenant_keyword_research_rows
    where run_id = v_run.id
      and avg_monthly_searches >= greatest(p_min_volume, 0)
    order by avg_monthly_searches desc
    limit greatest(least(p_limit, 500), 1)
  ) r;

  return jsonb_build_object(
    'run', jsonb_build_object(
      'id', v_run.id,
      'countryCode', v_run.country_code,
      'city', v_run.city,
      'scope', v_run.scope,
      'seedTerms', v_run.seed_terms,
      'language', v_run.language,
      'rowCount', v_run.row_count,
      'createdAt', v_run.created_at
    ),
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

create or replace function app.list_tenant_keyword_research_runs(p_tenant_id uuid, p_limit integer default 10)
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
      'id', r.id,
      'countryCode', r.country_code,
      'city', r.city,
      'scope', r.scope,
      'rowCount', r.row_count,
      'createdAt', r.created_at
    ) order by r.created_at desc)
    from (
      select *
      from app.tenant_keyword_research_runs
      where tenant_id = p_tenant_id
      order by created_at desc
      limit greatest(least(p_limit, 50), 1)
    ) r
  ), '[]'::jsonb);
end;
$$;

revoke all on table app.tenant_keyword_research_runs from public, anon, authenticated;
revoke all on table app.tenant_keyword_research_rows from public, anon, authenticated;

grant select, insert, update, delete on app.tenant_keyword_research_runs to service_role;
grant select, insert, update, delete on app.tenant_keyword_research_rows to service_role;

grant execute on function app.list_tenant_keyword_research(uuid, integer, integer, uuid) to authenticated;
grant execute on function app.list_tenant_keyword_research_runs(uuid, integer) to authenticated;
