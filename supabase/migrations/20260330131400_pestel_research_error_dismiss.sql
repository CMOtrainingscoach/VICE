-- PESTEL: toon alleen fout van de meest recente job (indien failed) + melding sluiten

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
  v_last_research_error text;
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
      services_offerings,
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
      '',
      jsonb_build_array(
        case when v_tenant.language = 'nl' then 'België' else v_tenant.language end
      ),
      'Komende 12 maanden',
      left(trim(v_tenant.audit_goal), 4000),
      '',
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

  select case
    when j.status = 'failed'::app.pestel_research_job_status then
      coalesce(
        nullif(trim(j.error_message), ''),
        nullif(trim(j.progress->>'message'), '')
      )
    else null
  end
  into v_last_research_error
  from app.pestel_research_jobs j
  where j.version_id = v_version.id
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
      'services_offerings', v_version.services_offerings,
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
    'active_research_job', v_job,
    'last_research_error', v_last_research_error
  );
end;
$$;

grant execute on function app.get_pestel_workbench(uuid) to authenticated;

create or replace function app.dismiss_pestel_research_error(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.pestel_versions;
  v_latest app.pestel_research_jobs;
begin
  select * into v_version from app.pestel_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'Versie niet gevonden';
  end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  select * into v_latest
  from app.pestel_research_jobs
  where version_id = p_version_id
  order by created_at desc
  limit 1;

  if v_latest.id is null or v_latest.status <> 'failed'::app.pestel_research_job_status then
    return;
  end if;

  update app.pestel_research_jobs
  set
    error_message = null,
    progress = coalesce(progress, '{}'::jsonb) || jsonb_build_object(
      'phase', 'dismissed',
      'message', ''
    )
  where id = v_latest.id;
end;
$$;

grant execute on function app.dismiss_pestel_research_error(uuid) to authenticated;
