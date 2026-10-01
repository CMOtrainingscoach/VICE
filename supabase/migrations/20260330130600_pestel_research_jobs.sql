-- PESTEL sprint 2: AI-onderzoek (achtergrondtaak, stapsgewijs, bronnen verplicht)

create type app.pestel_research_job_status as enum (
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled'
);

alter table app.pestel_insights
  add column if not exists research_job_id uuid;

alter table app.pestel_insight_sources
  add column if not exists is_ai_interpretation boolean not null default false;

create table app.pestel_research_jobs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.pestel_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  status app.pestel_research_job_status not null default 'queued',
  progress jsonb not null default jsonb_build_object(
    'phase', 'queued',
    'message', 'In wachtrij',
    'dimensions_done', '[]'::jsonb
  ),
  error_message text,
  insights_created integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index pestel_research_jobs_version_idx on app.pestel_research_jobs (version_id, created_at desc);

create unique index pestel_research_jobs_one_active_per_version
  on app.pestel_research_jobs (version_id)
  where status in ('queued', 'running');

create or replace function app.start_pestel_research(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.pestel_versions;
  v_existing uuid;
  v_job_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_version from app.pestel_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'Version not found';
  end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  if v_version.status = 'approved' then
    raise exception 'Approved version is read-only';
  end if;

  select id into v_existing
  from app.pestel_research_jobs
  where version_id = p_version_id and status in ('queued', 'running')
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  insert into app.pestel_research_jobs (version_id, tenant_id, created_by)
  values (p_version_id, v_version.tenant_id, auth.uid())
  returning id into v_job_id;

  update app.pestel_versions
  set status = 'research_running', updated_at = now()
  where id = p_version_id;

  return v_job_id;
end;
$$;

grant execute on function app.start_pestel_research(uuid) to authenticated;

create or replace function app.cancel_pestel_research(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_job app.pestel_research_jobs;
begin
  select * into v_job from app.pestel_research_jobs where id = p_job_id;
  if v_job.id is null then
    return;
  end if;
  if not app.has_capability(v_job.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  update app.pestel_research_jobs
  set
    status = 'cancelled',
    progress = jsonb_set(
      coalesce(progress, '{}'::jsonb),
      '{message}',
      to_jsonb('Geannuleerd'::text)
    ),
    updated_at = now(),
    completed_at = now()
  where id = p_job_id and status in ('queued', 'running');

  update app.pestel_versions
  set
    status = case
      when exists (
        select 1 from app.pestel_insights i
        where i.version_id = v_job.version_id and i.deleted_at is null
      ) then 'draft'::app.pestel_version_status
      else 'not_started'::app.pestel_version_status
    end,
    updated_at = now()
  where id = v_job.version_id;
end;
$$;

grant execute on function app.cancel_pestel_research(uuid) to authenticated;

create or replace function app.update_pestel_research_progress(
  p_job_id uuid,
  p_status app.pestel_research_job_status,
  p_progress jsonb,
  p_error_message text default null,
  p_insights_created_delta integer default 0
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_job app.pestel_research_jobs;
begin
  select * into v_job from app.pestel_research_jobs where id = p_job_id;
  if v_job.id is null then
    raise exception 'Job not found';
  end if;
  if not app.has_capability(v_job.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  update app.pestel_research_jobs
  set
    status = p_status,
    progress = coalesce(p_progress, progress),
    error_message = p_error_message,
    insights_created = insights_created + coalesce(p_insights_created_delta, 0),
    started_at = case when started_at is null and p_status = 'running' then now() else started_at end,
    completed_at = case
      when p_status in ('completed', 'failed', 'cancelled') then now()
      else completed_at
    end,
    updated_at = now()
  where id = p_job_id;

  if p_status in ('completed', 'failed', 'cancelled') then
    update app.pestel_versions
    set
      status = 'draft',
      results_stale = false,
      synthesis_stale = true,
      updated_at = now()
    where id = v_job.version_id;
  elsif p_status = 'running' then
    update app.pestel_versions
    set status = 'research_running', updated_at = now()
    where id = v_job.version_id;
  end if;
end;
$$;

grant execute on function app.update_pestel_research_progress(
  uuid, app.pestel_research_job_status, jsonb, text, integer
) to authenticated;

create or replace function app.insert_pestel_ai_insight(
  p_version_id uuid,
  p_job_id uuid,
  p_dimension app.pestel_dimension,
  p_title text,
  p_observation text,
  p_client_relevance text,
  p_opportunity_risk app.pestel_opportunity_risk,
  p_impact app.pestel_impact,
  p_impact_note text,
  p_insight_time_horizon text,
  p_evidence_level app.pestel_evidence_level,
  p_sources jsonb
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.pestel_versions;
  v_id uuid;
  v_src jsonb;
  v_meeting uuid;
begin
  select * into v_version from app.pestel_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'Version not found';
  end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  insert into app.pestel_insights (
    version_id,
    tenant_id,
    dimension,
    title,
    observation,
    client_relevance,
    opportunity_risk,
    impact,
    impact_note,
    insight_time_horizon,
    evidence_level,
    advisor_note,
    origin,
    review_status,
    research_job_id
  )
  values (
    p_version_id,
    v_version.tenant_id,
    p_dimension,
    left(trim(coalesce(p_title, '')), 300),
    left(trim(coalesce(p_observation, '')), 8000),
    left(trim(coalesce(p_client_relevance, '')), 4000),
    p_opportunity_risk,
    p_impact,
    left(trim(coalesce(p_impact_note, '')), 1000),
    left(trim(coalesce(p_insight_time_horizon, '')), 200),
    p_evidence_level,
    '',
    'ai',
    'pending',
    p_job_id
  )
  returning id into v_id;

  if p_sources is not null and jsonb_typeof(p_sources) = 'array' then
    for v_src in select * from jsonb_array_elements(p_sources)
    loop
      v_meeting := null;
      if (v_src->>'meeting_recording_id') is not null and (v_src->>'meeting_recording_id') <> '' then
        v_meeting := (v_src->>'meeting_recording_id')::uuid;
        if not exists (
          select 1 from app.meeting_recordings mr
          where mr.id = v_meeting and mr.tenant_id = v_version.tenant_id
        ) then
          v_meeting := null;
        end if;
      end if;

      insert into app.pestel_insight_sources (
        insight_id,
        tenant_id,
        source_type,
        label,
        url,
        publisher,
        excerpt,
        meeting_recording_id,
        meeting_offset_ms,
        is_ai_interpretation,
        accessed_on
      )
      values (
        v_id,
        v_version.tenant_id,
        coalesce((v_src->>'source_type')::app.pestel_source_type, 'manual'),
        left(coalesce(v_src->>'label', 'Bron'), 500),
        left(nullif(v_src->>'url', ''), 2000),
        left(nullif(v_src->>'publisher', ''), 500),
        left(coalesce(v_src->>'excerpt', ''), 4000),
        v_meeting,
        nullif(v_src->>'meeting_offset_ms', '')::integer,
        coalesce((v_src->>'is_ai_interpretation')::boolean, false),
        current_date
      );
    end loop;
  end if;

  return v_id;
end;
$$;

grant execute on function app.insert_pestel_ai_insight(
  uuid, uuid, app.pestel_dimension, text, text, text,
  app.pestel_opportunity_risk, app.pestel_impact, text, text,
  app.pestel_evidence_level, jsonb
) to authenticated;

-- Extend workbench with active research job
create or replace function app.get_pestel_workbench(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.pestel_versions;
  v_tenant app.tenants;
  v_insights jsonb;
  v_meetings jsonb;
  v_job jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  select * into v_version
  from app.pestel_versions
  where tenant_id = p_tenant_id
    and status <> 'approved'
  order by version_number desc
  limit 1;

  if v_version.id is null then
    select * into v_tenant from app.tenants where id = p_tenant_id and deleted_at is null;
    if v_tenant.id is null then
      raise exception 'Tenant not found';
    end if;

    insert into app.pestel_versions (
      tenant_id,
      version_number,
      status,
      market_sector,
      geo_markets,
      time_horizon,
      offering_audience,
      research_question,
      created_by
    )
    values (
      p_tenant_id,
      coalesce(
        (select max(version_number) + 1 from app.pestel_versions where tenant_id = p_tenant_id),
        1
      ),
      'not_started',
      left(trim(v_tenant.name), 500),
      jsonb_build_array(
        case when v_tenant.language = 'nl' then 'België' else v_tenant.language end
      ),
      'Komende 12 maanden',
      left(trim(v_tenant.audit_goal), 4000),
      '',
      auth.uid()
    )
    returning * into v_version;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'dimension', i.dimension,
        'title', i.title,
        'observation', i.observation,
        'client_relevance', i.client_relevance,
        'opportunity_risk', i.opportunity_risk,
        'impact', i.impact,
        'impact_note', i.impact_note,
        'insight_time_horizon', i.insight_time_horizon,
        'evidence_level', i.evidence_level,
        'advisor_note', i.advisor_note,
        'origin', i.origin,
        'review_status', i.review_status,
        'reject_reason', i.reject_reason,
        'sort_order', i.sort_order,
        'research_job_id', i.research_job_id,
        'sources', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', s.id,
                'source_type', s.source_type,
                'label', s.label,
                'url', s.url,
                'publisher', s.publisher,
                'published_on', s.published_on,
                'accessed_on', s.accessed_on,
                'meeting_recording_id', s.meeting_recording_id,
                'excerpt', s.excerpt,
                'meeting_offset_ms', s.meeting_offset_ms,
                'is_ai_interpretation', s.is_ai_interpretation
              )
              order by s.sort_order, s.created_at
            ),
            '[]'::jsonb
          )
          from app.pestel_insight_sources s
          where s.insight_id = i.id
        )
      )
      order by i.dimension, i.sort_order, i.created_at
    ),
    '[]'::jsonb
  )
  into v_insights
  from app.pestel_insights i
  where i.version_id = v_version.id and i.deleted_at is null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'title', coalesce(nullif(trim(r.title), ''), to_char(r.created_at, 'YYYY-MM-DD HH24:MI'))
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_meetings
  from app.meeting_recordings r
  where r.tenant_id = p_tenant_id
    and r.transcript_status = 'ready';

  select to_jsonb(j) into v_job
  from app.pestel_research_jobs j
  where j.version_id = v_version.id
    and j.status in ('queued', 'running')
  order by j.created_at desc
  limit 1;

  return jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id,
      'version_number', v_version.version_number,
      'status', v_version.status,
      'market_sector', v_version.market_sector,
      'geo_markets', v_version.geo_markets,
      'time_horizon', v_version.time_horizon,
      'offering_audience', v_version.offering_audience,
      'research_question', v_version.research_question,
      'results_stale', v_version.results_stale,
      'synthesis_text', v_version.synthesis_text,
      'synthesis_stale', v_version.synthesis_stale,
      'synthesis_reviewed', v_version.synthesis_reviewed,
      'updated_at', v_version.updated_at
    ),
    'insights', v_insights,
    'meetings', v_meetings,
    'active_research_job', v_job
  );
end;
$$;

grant execute on function app.get_pestel_workbench(uuid) to authenticated;

create or replace function app.get_pestel_research_job(p_job_id uuid)
returns app.pestel_research_jobs
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_job app.pestel_research_jobs;
begin
  select * into v_job from app.pestel_research_jobs where id = p_job_id;
  if v_job.id is null then
    raise exception 'Job not found';
  end if;
  if not app.has_capability(v_job.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  return v_job;
end;
$$;

grant execute on function app.get_pestel_research_job(uuid) to authenticated;

create or replace function app.get_pestel_version_scope(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.pestel_versions;
begin
  select * into v_row from app.pestel_versions where id = p_version_id;
  if v_row.id is null then
    raise exception 'Version not found';
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'market_sector', v_row.market_sector,
    'geo_markets', v_row.geo_markets,
    'time_horizon', v_row.time_horizon,
    'offering_audience', v_row.offering_audience,
    'research_question', v_row.research_question
  );
end;
$$;

grant execute on function app.get_pestel_version_scope(uuid) to authenticated;
