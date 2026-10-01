-- Strategische audit · PESTEL (fase 1: handmatige inzichten + versie + bronnen)

create type app.pestel_version_status as enum (
  'not_started',
  'research_running',
  'draft',
  'in_review',
  'approved',
  'needs_revision'
);

create type app.pestel_dimension as enum (
  'political',
  'economic',
  'social',
  'technological',
  'ecological',
  'legal'
);

create type app.pestel_insight_origin as enum ('manual', 'ai');

create type app.pestel_insight_review as enum (
  'pending',
  'reviewed',
  'rejected',
  'insufficient_info'
);

create type app.pestel_opportunity_risk as enum ('opportunity', 'risk', 'both', 'unclear');

create type app.pestel_impact as enum ('low', 'medium', 'high', 'unknown');

create type app.pestel_evidence_level as enum ('provided', 'observed', 'hypothesis');

create type app.pestel_source_type as enum ('website', 'document', 'meeting', 'manual');

create table app.pestel_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  version_number integer not null,
  status app.pestel_version_status not null default 'not_started',
  market_sector text not null default '',
  geo_markets jsonb not null default '[]'::jsonb,
  time_horizon text not null default '',
  offering_audience text not null default '',
  research_question text not null default '',
  scope_updated_at timestamptz not null default now(),
  results_stale boolean not null default false,
  synthesis_text text not null default '',
  synthesis_stale boolean not null default false,
  synthesis_reviewed boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, version_number)
);

create index pestel_versions_tenant_idx on app.pestel_versions (tenant_id, updated_at desc);

create table app.pestel_insights (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.pestel_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  dimension app.pestel_dimension not null,
  title text not null default '',
  observation text not null default '',
  client_relevance text not null default '',
  opportunity_risk app.pestel_opportunity_risk not null default 'unclear',
  impact app.pestel_impact not null default 'unknown',
  impact_note text not null default '',
  insight_time_horizon text not null default '',
  evidence_level app.pestel_evidence_level not null default 'hypothesis',
  advisor_note text not null default '',
  origin app.pestel_insight_origin not null default 'manual',
  review_status app.pestel_insight_review not null default 'pending',
  reject_reason text,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pestel_insights_version_idx on app.pestel_insights (version_id, dimension)
where deleted_at is null;

create table app.pestel_insight_sources (
  id uuid primary key default gen_random_uuid(),
  insight_id uuid not null references app.pestel_insights (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  source_type app.pestel_source_type not null,
  label text not null default '',
  url text,
  publisher text,
  published_on date,
  accessed_on date,
  meeting_recording_id uuid references app.meeting_recordings (id) on delete set null,
  excerpt text not null default '',
  meeting_offset_ms integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index pestel_sources_insight_idx on app.pestel_insight_sources (insight_id);

-- ---------------------------------------------------------------------------
-- Workbench: hervat laatste niet-goedgekeurde versie of maak nieuwe
-- ---------------------------------------------------------------------------
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
                'meeting_offset_ms', s.meeting_offset_ms
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
    'meetings', v_meetings
  );
end;
$$;

grant execute on function app.get_pestel_workbench(uuid) to authenticated;

create or replace function app.update_pestel_scope(
  p_version_id uuid,
  p_market_sector text,
  p_geo_markets jsonb,
  p_time_horizon text,
  p_offering_audience text,
  p_research_question text
)
returns app.pestel_versions
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.pestel_versions;
  v_changed boolean := false;
begin
  select * into v_row from app.pestel_versions where id = p_version_id for update;
  if v_row.id is null then
    raise exception 'Version not found';
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  if v_row.status = 'approved' then
    raise exception 'Approved version is read-only';
  end if;

  v_changed :=
    v_row.market_sector is distinct from left(trim(coalesce(p_market_sector, '')), 500)
    or v_row.geo_markets is distinct from coalesce(p_geo_markets, '[]'::jsonb)
    or v_row.time_horizon is distinct from left(trim(coalesce(p_time_horizon, '')), 200)
    or v_row.offering_audience is distinct from left(trim(coalesce(p_offering_audience, '')), 4000)
    or v_row.research_question is distinct from left(trim(coalesce(p_research_question, '')), 2000);

  update app.pestel_versions
  set
    market_sector = left(trim(coalesce(p_market_sector, '')), 500),
    geo_markets = coalesce(p_geo_markets, '[]'::jsonb),
    time_horizon = left(trim(coalesce(p_time_horizon, '')), 200),
    offering_audience = left(trim(coalesce(p_offering_audience, '')), 4000),
    research_question = left(trim(coalesce(p_research_question, '')), 2000),
    scope_updated_at = case when v_changed then now() else scope_updated_at end,
    results_stale = case when v_changed and exists (
      select 1 from app.pestel_insights i where i.version_id = v_row.id and i.deleted_at is null
    ) then true else results_stale end,
    status = case
      when status = 'not_started' then 'draft'::app.pestel_version_status
      else status
    end,
    updated_at = now()
  where id = p_version_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function app.update_pestel_scope(uuid, text, jsonb, text, text, text) to authenticated;

create or replace function app.upsert_pestel_insight(
  p_version_id uuid,
  p_insight_id uuid,
  p_dimension app.pestel_dimension,
  p_title text,
  p_observation text,
  p_client_relevance text,
  p_opportunity_risk app.pestel_opportunity_risk,
  p_impact app.pestel_impact,
  p_impact_note text,
  p_insight_time_horizon text,
  p_evidence_level app.pestel_evidence_level,
  p_advisor_note text,
  p_mark_reviewed boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.pestel_versions;
  v_id uuid;
begin
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

  if p_insight_id is null then
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
      review_status
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
      left(trim(coalesce(p_advisor_note, '')), 4000),
      'manual',
      case when p_mark_reviewed then 'reviewed'::app.pestel_insight_review else 'pending' end
    )
    returning id into v_id;
  else
    update app.pestel_insights
    set
      dimension = p_dimension,
      title = left(trim(coalesce(p_title, '')), 300),
      observation = left(trim(coalesce(p_observation, '')), 8000),
      client_relevance = left(trim(coalesce(p_client_relevance, '')), 4000),
      opportunity_risk = p_opportunity_risk,
      impact = p_impact,
      impact_note = left(trim(coalesce(p_impact_note, '')), 1000),
      insight_time_horizon = left(trim(coalesce(p_insight_time_horizon, '')), 200),
      evidence_level = p_evidence_level,
      advisor_note = left(trim(coalesce(p_advisor_note, '')), 4000),
      review_status = case
        when p_mark_reviewed then 'reviewed'::app.pestel_insight_review
        else review_status
      end,
      updated_at = now()
    where id = p_insight_id
      and version_id = p_version_id
      and deleted_at is null
    returning id into v_id;
  end if;

  update app.pestel_versions
  set
    status = case
      when status in ('not_started', 'research_running') then 'draft'::app.pestel_version_status
      else status
    end,
    synthesis_stale = true,
    updated_at = now()
  where id = p_version_id;

  return v_id;
end;
$$;

grant execute on function app.upsert_pestel_insight(
  uuid, uuid, app.pestel_dimension, text, text, text,
  app.pestel_opportunity_risk, app.pestel_impact, text, text,
  app.pestel_evidence_level, text, boolean
) to authenticated;

create or replace function app.delete_pestel_insight(p_insight_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.pestel_insights;
begin
  select * into v_row from app.pestel_insights where id = p_insight_id and deleted_at is null;
  if v_row.id is null then
    return;
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  update app.pestel_insights set deleted_at = now() where id = p_insight_id;
  update app.pestel_versions set synthesis_stale = true, updated_at = now() where id = v_row.version_id;
end;
$$;

grant execute on function app.delete_pestel_insight(uuid) to authenticated;

create or replace function app.update_pestel_synthesis(
  p_version_id uuid,
  p_synthesis_text text
)
returns void
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

  update app.pestel_versions
  set
    synthesis_text = left(trim(coalesce(p_synthesis_text, '')), 12000),
    synthesis_stale = false,
    synthesis_reviewed = false,
    status = case when status = 'not_started' then 'draft' else status end,
    updated_at = now()
  where id = p_version_id;
end;
$$;

grant execute on function app.update_pestel_synthesis(uuid, text) to authenticated;

create or replace function app.replace_pestel_insight_sources(
  p_insight_id uuid,
  p_sources jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_insight app.pestel_insights;
  v_src jsonb;
  v_meeting uuid;
begin
  select * into v_insight from app.pestel_insights where id = p_insight_id and deleted_at is null;
  if v_insight.id is null then
    raise exception 'Insight not found';
  end if;
  if not app.has_capability(v_insight.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  delete from app.pestel_insight_sources where insight_id = p_insight_id;

  if p_sources is null or jsonb_typeof(p_sources) <> 'array' then
    return;
  end if;

  for v_src in select * from jsonb_array_elements(p_sources)
  loop
    v_meeting := null;
    if (v_src->>'meeting_recording_id') is not null and (v_src->>'meeting_recording_id') <> '' then
      v_meeting := (v_src->>'meeting_recording_id')::uuid;
      if not exists (
        select 1 from app.meeting_recordings mr
        where mr.id = v_meeting and mr.tenant_id = v_insight.tenant_id
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
      meeting_offset_ms
    )
    values (
      p_insight_id,
      v_insight.tenant_id,
      coalesce((v_src->>'source_type')::app.pestel_source_type, 'manual'),
      left(coalesce(v_src->>'label', ''), 500),
      left(nullif(v_src->>'url', ''), 2000),
      left(nullif(v_src->>'publisher', ''), 500),
      left(coalesce(v_src->>'excerpt', ''), 4000),
      v_meeting,
      nullif(v_src->>'meeting_offset_ms', '')::integer
    );
  end loop;
end;
$$;

grant execute on function app.replace_pestel_insight_sources(uuid, jsonb) to authenticated;
