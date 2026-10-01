-- PESTEL: expliciete bronnen voor AI-onderzoek (meetings, websites, documenten, notities)

create type app.pestel_research_input_kind as enum (
  'meeting',
  'website',
  'document',
  'note'
);

create table app.pestel_version_research_inputs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.pestel_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  kind app.pestel_research_input_kind not null,
  meeting_recording_id uuid references app.meeting_recordings (id) on delete cascade,
  label text not null default '',
  url text,
  excerpt text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint pestel_research_input_meeting_chk check (
    kind <> 'meeting'::app.pestel_research_input_kind
    or meeting_recording_id is not null
  ),
  constraint pestel_research_input_website_chk check (
    kind <> 'website'::app.pestel_research_input_kind
    or (url is not null and length(trim(url)) > 0)
  )
);

create index pestel_research_inputs_version_idx
  on app.pestel_version_research_inputs (version_id, sort_order, created_at);

create unique index pestel_research_inputs_one_meeting_per_version
  on app.pestel_version_research_inputs (version_id, meeting_recording_id)
  where kind = 'meeting'::app.pestel_research_input_kind;

alter table app.pestel_version_research_inputs enable row level security;

create policy pestel_research_inputs_select
  on app.pestel_version_research_inputs for select to authenticated
  using (app.has_capability(tenant_id, 'audit.edit'));

grant select on app.pestel_version_research_inputs to authenticated;

create or replace function app.replace_pestel_research_inputs(
  p_version_id uuid,
  p_inputs jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.pestel_versions;
  v_item jsonb;
  v_kind app.pestel_research_input_kind;
  v_meeting_id uuid;
  v_sort integer := 0;
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

  if p_inputs is null then
    p_inputs := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_inputs) <> 'array' then
    raise exception 'Inputs must be a JSON array';
  end if;

  delete from app.pestel_version_research_inputs where version_id = p_version_id;

  for v_item in select * from jsonb_array_elements(p_inputs)
  loop
    v_kind := (v_item->>'kind')::app.pestel_research_input_kind;
    v_meeting_id := nullif(v_item->>'meeting_recording_id', '')::uuid;

    if v_kind = 'meeting'::app.pestel_research_input_kind then
      if v_meeting_id is null then
        raise exception 'Meeting-bron vereist meeting_recording_id';
      end if;
      if not exists (
        select 1 from app.meeting_recordings r
        where r.id = v_meeting_id
          and r.tenant_id = v_version.tenant_id
          and r.transcript_status = 'ready'
      ) then
        raise exception 'Meeting niet gevonden of transcript niet klaar';
      end if;
    elsif v_kind = 'website'::app.pestel_research_input_kind then
      if coalesce(trim(v_item->>'url'), '') = '' then
        raise exception 'Website-bron vereist URL';
      end if;
    elsif v_kind = 'document'::app.pestel_research_input_kind then
      if coalesce(trim(v_item->>'label'), '') = ''
        and coalesce(trim(v_item->>'excerpt'), '') = '' then
        raise exception 'Document-bron vereist titel of inhoud';
      end if;
    elsif v_kind = 'note'::app.pestel_research_input_kind then
      if coalesce(trim(v_item->>'excerpt'), '') = '' then
        raise exception 'Notitie vereist tekst';
      end if;
    end if;

    insert into app.pestel_version_research_inputs (
      version_id,
      tenant_id,
      kind,
      meeting_recording_id,
      label,
      url,
      excerpt,
      sort_order
    )
    values (
      p_version_id,
      v_version.tenant_id,
      v_kind,
      v_meeting_id,
      left(coalesce(v_item->>'label', ''), 500),
      nullif(left(coalesce(v_item->>'url', ''), 2000), ''),
      left(coalesce(v_item->>'excerpt', ''), 12000),
      v_sort
    );

    v_sort := v_sort + 1;
  end loop;

  update app.pestel_versions
  set
    results_stale = true,
    updated_at = now()
  where id = p_version_id;
end;
$$;

grant execute on function app.replace_pestel_research_inputs(uuid, jsonb) to authenticated;

-- Workbench: research inputs + meeting review_status
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
  v_research_inputs jsonb;
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
        'title', coalesce(nullif(trim(r.title), ''), to_char(r.created_at, 'YYYY-MM-DD HH24:MI')),
        'review_status', r.review_status
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_meetings
  from app.meeting_recordings r
  where r.tenant_id = p_tenant_id
    and r.transcript_status = 'ready';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', inp.id,
        'kind', inp.kind,
        'meeting_recording_id', inp.meeting_recording_id,
        'label', inp.label,
        'url', inp.url,
        'excerpt', inp.excerpt,
        'sort_order', inp.sort_order
      )
      order by inp.sort_order, inp.created_at
    ),
    '[]'::jsonb
  )
  into v_research_inputs
  from app.pestel_version_research_inputs inp
  where inp.version_id = v_version.id;

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
    'research_inputs', v_research_inputs,
    'active_research_job', v_job
  );
end;
$$;

grant execute on function app.get_pestel_workbench(uuid) to authenticated;

create or replace function app.get_pestel_version_research_inputs(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.pestel_versions;
  v_inputs jsonb;
begin
  select * into v_version from app.pestel_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'Version not found';
  end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', inp.id,
        'kind', inp.kind,
        'meeting_recording_id', inp.meeting_recording_id,
        'label', inp.label,
        'url', inp.url,
        'excerpt', inp.excerpt,
        'sort_order', inp.sort_order
      )
      order by inp.sort_order, inp.created_at
    ),
    '[]'::jsonb
  )
  into v_inputs
  from app.pestel_version_research_inputs inp
  where inp.version_id = p_version_id;

  return v_inputs;
end;
$$;

grant execute on function app.get_pestel_version_research_inputs(uuid) to authenticated;
