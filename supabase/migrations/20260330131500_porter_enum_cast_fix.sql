-- Porter: cast status/review strings to enum types in RPCs

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
    )
  );
end;
$$;

grant execute on function app.get_porter_workbench(uuid) to authenticated;

create or replace function app.update_porter_scope(
  p_version_id uuid,
  p_market_sector text,
  p_offering_description text,
  p_geo_markets jsonb,
  p_client_segment text,
  p_time_horizon text,
  p_research_question text,
  p_known_competitors jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.porter_versions;
begin
  select * into v_row from app.porter_versions where id = p_version_id;
  if v_row.id is null then
    raise exception 'Version not found';
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  update app.porter_versions
  set
    market_sector = left(trim(coalesce(p_market_sector, '')), 500),
    offering_description = left(trim(coalesce(p_offering_description, '')), 4000),
    geo_markets = coalesce(p_geo_markets, '[]'::jsonb),
    client_segment = left(trim(coalesce(p_client_segment, '')), 4000),
    time_horizon = left(trim(coalesce(p_time_horizon, '')), 200),
    research_question = left(trim(coalesce(p_research_question, '')), 2000),
    known_competitors = coalesce(p_known_competitors, '[]'::jsonb),
    scope_updated_at = now(),
    results_stale = true,
    status = case
      when status = 'not_started'::app.porter_version_status
      then 'draft'::app.porter_version_status
      else status
    end,
    updated_at = now()
  where id = p_version_id;
end;
$$;

grant execute on function app.update_porter_scope(
  uuid, text, text, jsonb, text, text, text, jsonb
) to authenticated;

create or replace function app.upsert_porter_force(
  p_version_id uuid,
  p_force_id uuid,
  p_force_key app.porter_force_key,
  p_intensity app.porter_intensity,
  p_motivation text,
  p_client_relevance text,
  p_advisor_note text,
  p_headline_factor text,
  p_mark_reviewed boolean
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.porter_versions;
  v_id uuid;
begin
  select * into v_version from app.porter_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'Version not found';
  end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  update app.porter_forces
  set
    intensity = coalesce(p_intensity, intensity),
    motivation = left(trim(coalesce(p_motivation, '')), 8000),
    client_relevance = left(trim(coalesce(p_client_relevance, '')), 4000),
    advisor_note = left(trim(coalesce(p_advisor_note, '')), 4000),
    headline_factor = left(trim(coalesce(p_headline_factor, '')), 500),
    review_status = case
      when p_mark_reviewed then 'reviewed'::app.porter_force_review
      else review_status
    end,
    updated_at = now()
  where id = p_force_id
    and version_id = p_version_id
  returning id into v_id;

  if v_id is null then
    insert into app.porter_forces (
      version_id, tenant_id, force_key, intensity, motivation,
      client_relevance, advisor_note, headline_factor, review_status
    )
    values (
      p_version_id,
      v_version.tenant_id,
      p_force_key,
      coalesce(p_intensity, 'unknown'::app.porter_intensity),
      left(trim(coalesce(p_motivation, '')), 8000),
      left(trim(coalesce(p_client_relevance, '')), 4000),
      left(trim(coalesce(p_advisor_note, '')), 4000),
      left(trim(coalesce(p_headline_factor, '')), 500),
      (
        case when p_mark_reviewed then 'reviewed' else 'pending' end
      )::app.porter_force_review
    )
    returning id into v_id;
  end if;

  update app.porter_versions
  set
    status = case
      when status = 'not_started'::app.porter_version_status
      then 'draft'::app.porter_version_status
      else status
    end,
    synthesis_stale = true,
    updated_at = now()
  where id = p_version_id;

  return v_id;
end;
$$;

grant execute on function app.upsert_porter_force(
  uuid, uuid, app.porter_force_key, app.porter_intensity,
  text, text, text, text, boolean
) to authenticated;

create or replace function app.update_porter_synthesis(
  p_version_id uuid,
  p_synthesis_text text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.porter_versions;
begin
  select * into v_row from app.porter_versions where id = p_version_id;
  if v_row.id is null then
    raise exception 'Version not found';
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  update app.porter_versions
  set
    synthesis_text = left(trim(coalesce(p_synthesis_text, '')), 12000),
    synthesis_stale = false,
    synthesis_reviewed = false,
    status = case
      when status = 'not_started'::app.porter_version_status
      then 'draft'::app.porter_version_status
      else status
    end,
    updated_at = now()
  where id = p_version_id;
end;
$$;

grant execute on function app.update_porter_synthesis(uuid, text) to authenticated;
