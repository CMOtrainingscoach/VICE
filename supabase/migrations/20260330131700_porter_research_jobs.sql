-- Porter: AI-onderzoek per kracht (stapsgewijs, jobs + bronnen)

create type app.porter_research_job_status as enum (
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled'
);

create table app.porter_research_jobs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.porter_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  status app.porter_research_job_status not null default 'queued',
  progress jsonb not null default jsonb_build_object(
    'phase', 'queued',
    'message', 'In wachtrij',
    'forces_done', '[]'::jsonb
  ),
  error_message text,
  forces_updated integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index porter_research_jobs_version_idx on app.porter_research_jobs (version_id, created_at desc);

create unique index porter_research_jobs_one_active_per_version
  on app.porter_research_jobs (version_id)
  where status in ('queued', 'running');

create or replace function app.start_porter_research(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.porter_versions;
  v_existing uuid;
  v_job_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_version from app.porter_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'Versie niet gevonden';
  end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  if v_version.status = 'approved'::app.porter_version_status then
    raise exception 'Goedgekeurde versie is alleen-lezen';
  end if;

  select id into v_existing
  from app.porter_research_jobs
  where version_id = p_version_id and status in ('queued', 'running')
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  insert into app.porter_research_jobs (version_id, tenant_id, created_by)
  values (p_version_id, v_version.tenant_id, auth.uid())
  returning id into v_job_id;

  update app.porter_versions
  set status = 'research_running'::app.porter_version_status, updated_at = now()
  where id = p_version_id;

  return v_job_id;
end;
$$;

grant execute on function app.start_porter_research(uuid) to authenticated;

create or replace function app.cancel_porter_research(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_job app.porter_research_jobs;
begin
  select * into v_job from app.porter_research_jobs where id = p_job_id;
  if v_job.id is null then
    return;
  end if;
  if not app.has_capability(v_job.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  update app.porter_research_jobs
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

  update app.porter_versions
  set
    status = case
      when exists (
        select 1 from app.porter_forces pf
        where pf.version_id = v_job.version_id
          and (
            pf.intensity <> 'unknown'::app.porter_intensity
            or length(trim(pf.motivation)) > 0
            or length(trim(pf.headline_factor)) > 0
          )
      ) then 'draft'::app.porter_version_status
      else 'not_started'::app.porter_version_status
    end,
    updated_at = now()
  where id = v_job.version_id;
end;
$$;

grant execute on function app.cancel_porter_research(uuid) to authenticated;

create or replace function app.update_porter_research_progress(
  p_job_id uuid,
  p_status app.porter_research_job_status,
  p_progress jsonb,
  p_error_message text default null,
  p_forces_updated_delta integer default 0
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_job app.porter_research_jobs;
begin
  select * into v_job from app.porter_research_jobs where id = p_job_id;
  if v_job.id is null then
    raise exception 'Job not found';
  end if;
  if not app.has_capability(v_job.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  update app.porter_research_jobs
  set
    status = p_status,
    progress = coalesce(p_progress, progress),
    error_message = p_error_message,
    forces_updated = forces_updated + coalesce(p_forces_updated_delta, 0),
    started_at = case when started_at is null and p_status = 'running' then now() else started_at end,
    completed_at = case
      when p_status in ('completed', 'failed', 'cancelled') then now()
      else completed_at
    end,
    updated_at = now()
  where id = p_job_id;

  if p_status in ('completed', 'failed', 'cancelled') then
    update app.porter_versions
    set
      status = 'draft'::app.porter_version_status,
      results_stale = false,
      synthesis_stale = true,
      updated_at = now()
    where id = v_job.version_id;
  elsif p_status = 'running' then
    update app.porter_versions
    set status = 'research_running'::app.porter_version_status, updated_at = now()
    where id = v_job.version_id;
  end if;
end;
$$;

grant execute on function app.update_porter_research_progress(
  uuid, app.porter_research_job_status, jsonb, text, integer
) to authenticated;

create or replace function app.get_porter_research_job(p_job_id uuid)
returns app.porter_research_jobs
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_job app.porter_research_jobs;
begin
  select * into v_job from app.porter_research_jobs where id = p_job_id;
  if v_job.id is null then
    raise exception 'Job not found';
  end if;
  if not app.has_capability(v_job.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  return v_job;
end;
$$;

grant execute on function app.get_porter_research_job(uuid) to authenticated;

create or replace function app.get_porter_version_scope(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.porter_versions;
begin
  select * into v_row from app.porter_versions where id = p_version_id;
  if v_row.id is null then
    raise exception 'Versie niet gevonden';
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'tenant_id', v_row.tenant_id,
    'pestel_version_id', v_row.pestel_version_id,
    'market_sector', v_row.market_sector,
    'offering_description', v_row.offering_description,
    'geo_markets', v_row.geo_markets,
    'client_segment', v_row.client_segment,
    'time_horizon', v_row.time_horizon,
    'research_question', v_row.research_question,
    'known_competitors', v_row.known_competitors
  );
end;
$$;

grant execute on function app.get_porter_version_scope(uuid) to authenticated;

create or replace function app.list_porter_pestel_insights(p_pestel_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_pestel app.pestel_versions;
begin
  if p_pestel_version_id is null then
    return '[]'::jsonb;
  end if;

  select * into v_pestel from app.pestel_versions where id = p_pestel_version_id;
  if v_pestel.id is null then
    return '[]'::jsonb;
  end if;
  if not app.has_capability(v_pestel.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'dimension', i.dimension,
          'title', i.title,
          'observation', left(i.observation, 1200),
          'client_relevance', left(i.client_relevance, 800)
        )
        order by i.dimension, i.sort_order, i.created_at
      )
      from app.pestel_insights i
      where i.version_id = p_pestel_version_id
        and i.deleted_at is null
    ),
    '[]'::jsonb
  );
end;
$$;

grant execute on function app.list_porter_pestel_insights(uuid) to authenticated;

create or replace function app.list_porter_force_ids(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.porter_versions;
begin
  select * into v_version from app.porter_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'Versie niet gevonden';
  end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('id', f.id, 'force_key', f.force_key)
        order by f.sort_order
      )
      from app.porter_forces f
      where f.version_id = p_version_id
    ),
    '[]'::jsonb
  );
end;
$$;

grant execute on function app.list_porter_force_ids(uuid) to authenticated;

create or replace function app.save_porter_ai_force_analysis(
  p_version_id uuid,
  p_force_id uuid,
  p_intensity app.porter_intensity,
  p_motivation text,
  p_client_relevance text,
  p_headline_factor text,
  p_factors jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.porter_versions;
  v_force app.porter_forces;
  v_factor jsonb;
  v_src jsonb;
  v_factor_id uuid;
  v_pestel uuid;
  v_sort integer := 0;
begin
  select * into v_version from app.porter_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'Versie niet gevonden';
  end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  select * into v_force
  from app.porter_forces
  where id = p_force_id and version_id = p_version_id;

  if v_force.id is null then
    raise exception 'Kracht niet gevonden';
  end if;

  update app.porter_forces
  set
    intensity = coalesce(p_intensity, 'unknown'::app.porter_intensity),
    motivation = left(trim(coalesce(p_motivation, '')), 8000),
    client_relevance = left(trim(coalesce(p_client_relevance, '')), 4000),
    headline_factor = left(trim(coalesce(p_headline_factor, '')), 500),
    review_status = 'pending'::app.porter_force_review,
    updated_at = now()
  where id = p_force_id;

  update app.porter_factors
  set deleted_at = now(), updated_at = now()
  where force_id = p_force_id
    and origin = 'ai'::app.porter_factor_origin
    and deleted_at is null;

  if p_factors is null or jsonb_typeof(p_factors) <> 'array' then
    return;
  end if;

  for v_factor in select * from jsonb_array_elements(p_factors)
  loop
    v_pestel := null;
    if (v_factor->>'pestel_insight_id') is not null
      and (v_factor->>'pestel_insight_id') <> '' then
      v_pestel := (v_factor->>'pestel_insight_id')::uuid;
      if not exists (
        select 1 from app.pestel_insights pi
        where pi.id = v_pestel and pi.deleted_at is null
      ) then
        v_pestel := null;
      end if;
    end if;

    insert into app.porter_factors (
      force_id,
      version_id,
      tenant_id,
      title,
      observation,
      effect,
      effect_note,
      evidence_level,
      origin,
      review_status,
      pestel_insight_id,
      sort_order
    )
    values (
      p_force_id,
      p_version_id,
      v_version.tenant_id,
      left(coalesce(v_factor->>'title', 'Factor'), 300),
      left(coalesce(v_factor->>'observation', ''), 8000),
      coalesce(
        (v_factor->>'effect')::app.porter_factor_effect,
        'unclear'::app.porter_factor_effect
      ),
      left(coalesce(v_factor->>'effect_note', ''), 1000),
      coalesce(
        (v_factor->>'evidence_level')::app.porter_evidence_level,
        'hypothesis'::app.porter_evidence_level
      ),
      'ai'::app.porter_factor_origin,
      'pending'::app.porter_force_review,
      v_pestel,
      v_sort
    )
    returning id into v_factor_id;

    v_sort := v_sort + 1;

    if v_factor->'sources' is not null and jsonb_typeof(v_factor->'sources') = 'array' then
      for v_src in select * from jsonb_array_elements(v_factor->'sources')
      loop
        v_pestel := null;
        if (v_src->>'pestel_insight_id') is not null and (v_src->>'pestel_insight_id') <> '' then
          v_pestel := (v_src->>'pestel_insight_id')::uuid;
          if not exists (
            select 1 from app.pestel_insights pi
            where pi.id = v_pestel and pi.deleted_at is null
          ) then
            v_pestel := null;
          end if;
        end if;

        insert into app.porter_factor_sources (
          factor_id,
          tenant_id,
          source_type,
          label,
          url,
          publisher,
          excerpt,
          pestel_insight_id,
          sort_order
        )
        values (
          v_factor_id,
          v_version.tenant_id,
          coalesce(
            (v_src->>'source_type')::app.porter_source_type,
            'website'::app.porter_source_type
          ),
          left(coalesce(v_src->>'label', 'Bron'), 500),
          left(nullif(v_src->>'url', ''), 2000),
          left(nullif(v_src->>'publisher', ''), 500),
          left(coalesce(v_src->>'excerpt', ''), 4000),
          v_pestel,
          coalesce((v_src->>'sort_order')::integer, 0)
        );
      end loop;
    end if;
  end loop;

  update app.porter_versions
  set
    status = 'draft'::app.porter_version_status,
    synthesis_stale = true,
    results_stale = false,
    updated_at = now()
  where id = p_version_id;
end;
$$;

grant execute on function app.save_porter_ai_force_analysis(
  uuid, uuid, app.porter_intensity, text, text, text, jsonb
) to authenticated;

-- Workbench: actieve job + laatste fout
create or replace function app.get_porter_workbench(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.porter_versions;
  v_pestel app.pestel_versions;
  v_forces jsonb;
  v_pestel_insights jsonb;
  v_job jsonb;
  v_last_research_error text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  select * into v_version
  from app.porter_versions
  where tenant_id = p_tenant_id
    and status <> 'approved'::app.porter_version_status
  order by version_number desc
  limit 1;

  select * into v_pestel
  from app.pestel_versions
  where tenant_id = p_tenant_id
    and status = 'approved'::app.pestel_version_status
  order by version_number desc
  limit 1;

  if v_version.id is null then
    insert into app.porter_versions (
      tenant_id,
      version_number,
      status,
      pestel_version_id,
      market_sector,
      offering_description,
      geo_markets,
      client_segment,
      time_horizon,
      research_question,
      created_by
    )
    values (
      p_tenant_id,
      coalesce(
        (select max(version_number) + 1 from app.porter_versions where tenant_id = p_tenant_id),
        1
      ),
      (
        case when v_pestel.id is null then 'not_started' else 'draft' end
      )::app.porter_version_status,
      v_pestel.id,
      coalesce(v_pestel.market_sector, ''),
      coalesce(v_pestel.services_offerings, ''),
      coalesce(v_pestel.geo_markets, '[]'::jsonb),
      coalesce(v_pestel.offering_audience, ''),
      coalesce(v_pestel.time_horizon, ''),
      coalesce(v_pestel.research_question, ''),
      auth.uid()
    )
    returning * into v_version;
  end if;

  perform app._porter_seed_forces(v_version.id, p_tenant_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'force_key', f.force_key,
        'intensity', f.intensity,
        'motivation', f.motivation,
        'client_relevance', f.client_relevance,
        'advisor_note', f.advisor_note,
        'headline_factor', f.headline_factor,
        'review_status', f.review_status,
        'sort_order', f.sort_order,
        'factor_count', (
          select count(*)::integer from app.porter_factors pf
          where pf.force_id = f.id and pf.deleted_at is null
        ),
        'source_count', (
          select count(*)::integer
          from app.porter_factor_sources pfs
          join app.porter_factors pf on pf.id = pfs.factor_id
          where pf.force_id = f.id and pf.deleted_at is null
        )
      )
      order by f.sort_order
    ),
    '[]'::jsonb
  ) into v_forces
  from app.porter_forces f
  where f.version_id = v_version.id;

  if v_pestel.id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'dimension', i.dimension,
          'title', i.title,
          'observation', left(i.observation, 400),
          'client_relevance', left(i.client_relevance, 400)
        )
        order by i.dimension, i.sort_order
      ),
      '[]'::jsonb
    ) into v_pestel_insights
    from app.pestel_insights i
    where i.version_id = v_pestel.id
      and i.deleted_at is null
      and i.review_status = 'reviewed'::app.pestel_insight_review;
  else
    v_pestel_insights := '[]'::jsonb;
  end if;

  select to_jsonb(j) into v_job
  from app.porter_research_jobs j
  where j.version_id = v_version.id
    and j.status in ('queued', 'running')
  order by j.created_at desc
  limit 1;

  select case
    when j.status = 'failed'::app.porter_research_job_status then
      coalesce(
        nullif(trim(j.error_message), ''),
        nullif(trim(j.progress->>'message'), '')
      )
    else null
  end
  into v_last_research_error
  from app.porter_research_jobs j
  where j.version_id = v_version.id
  order by j.created_at desc
  limit 1;

  return jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id,
      'version_number', v_version.version_number,
      'status', v_version.status,
      'pestel_version_id', v_version.pestel_version_id,
      'market_sector', v_version.market_sector,
      'offering_description', v_version.offering_description,
      'geo_markets', v_version.geo_markets,
      'client_segment', v_version.client_segment,
      'time_horizon', v_version.time_horizon,
      'research_question', v_version.research_question,
      'known_competitors', v_version.known_competitors,
      'results_stale', v_version.results_stale,
      'synthesis_text', v_version.synthesis_text,
      'synthesis_stale', v_version.synthesis_stale,
      'synthesis_reviewed', v_version.synthesis_reviewed,
      'updated_at', v_version.updated_at
    ),
    'forces', v_forces,
    'pestel_context', jsonb_build_object(
      'version_id', v_pestel.id,
      'version_number', v_pestel.version_number,
      'approved', v_pestel.id is not null,
      'insights', v_pestel_insights
    ),
    'active_research_job', v_job,
    'last_research_error', v_last_research_error
  );
end;
$$;

grant execute on function app.get_porter_workbench(uuid) to authenticated;
