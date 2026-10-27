-- Salesbrain workflows + runs. Draai na 20260330136300.

create type app.sb_run_status as enum (
  'queued', 'running', 'completed', 'completed_with_warnings', 'failed', 'cancelled'
);

create type app.sb_workflow_status as enum ('draft', 'published', 'archived');

create table app.sb_workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  name text not null default '',
  purpose text not null default '',
  status app.sb_workflow_status not null default 'draft',
  draft_graph jsonb not null default '{}'::jsonb,
  draft_form_schema jsonb not null default '{}'::jsonb,
  published_version_id uuid,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sb_workflows_tenant_idx on app.sb_workflows (tenant_id, updated_at desc);

create table app.sb_workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references app.sb_workflows (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  version_no integer not null,
  graph jsonb not null,
  form_schema jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id),
  unique (workflow_id, version_no)
);

alter table app.sb_workflows
  add constraint sb_workflows_published_version_fk
  foreign key (published_version_id) references app.sb_workflow_versions (id) on delete set null;

create table app.sb_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  workflow_id uuid references app.sb_workflows (id) on delete set null,
  workflow_version_id uuid references app.sb_workflow_versions (id) on delete set null,
  name text not null default '',
  status app.sb_run_status not null default 'queued',
  is_test boolean not null default false,
  inputs jsonb not null default '{}'::jsonb,
  graph jsonb not null default '{}'::jsonb,
  location_label text not null default '',
  center_lat double precision not null default 0,
  center_lng double precision not null default 0,
  radius_km numeric(6, 2) not null default 25,
  progress jsonb not null default jsonb_build_object('phase', 'queued', 'message', 'In wachtrij'),
  error_message text,
  warnings jsonb not null default '[]'::jsonb,
  prospect_count integer not null default 0,
  insight_count integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  deleted_at timestamptz
);

create index sb_runs_tenant_idx on app.sb_runs (tenant_id, created_at desc) where deleted_at is null;

create table app.sb_node_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references app.sb_runs (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  node_id text not null,
  node_type text not null,
  status text not null default 'pending',
  output_ref jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz
);

create table app.sb_run_prospects (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references app.sb_runs (id) on delete cascade,
  prospect_id uuid not null references app.leadgen_prospects (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  distance_km numeric(8, 2),
  geo_eligible boolean not null default false,
  geo_verified boolean not null default false,
  assessment_summary text not null default '',
  signals jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  review_state text not null default 'pending',
  sort_order integer not null default 0,
  unique (run_id, prospect_id)
);

create table app.sb_market_insights (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references app.sb_runs (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  title text not null default '',
  summary text not null default '',
  provenance text not null default '',
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table app.sb_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  run_id uuid references app.sb_runs (id) on delete set null,
  prospect_id uuid references app.leadgen_prospects (id) on delete set null,
  workflow_version_id uuid references app.sb_workflow_versions (id) on delete set null,
  kind text not null,
  reason text not null default '',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- list workflows
create or replace function app.list_sb_workflows(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'name', w.name, 'purpose', w.purpose, 'status', w.status::text,
      'updatedAt', w.updated_at, 'publishedVersionId', w.published_version_id
    ) order by w.updated_at desc)
    from app.sb_workflows w where w.tenant_id = p_tenant_id
  ), '[]'::jsonb);
end;
$$;

create or replace function app.ensure_default_sb_workflow(p_tenant_id uuid)
returns uuid language plpgsql security definer set search_path = app, public, auth as $$
declare v_id uuid;
begin
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  select id into v_id from app.sb_workflows where tenant_id = p_tenant_id limit 1;
  if v_id is not null then return v_id; end if;
  insert into app.sb_workflows (tenant_id, name, purpose, created_by)
  values (p_tenant_id, 'Eerste marketeer — groeisignalen', 'Bedrijven met hiring-signaal voor marketing', auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function app.create_sb_run(p_tenant_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare
  v_w app.sb_workflows;
  v_ver app.sb_workflow_versions;
  v_run app.sb_runs;
  v_graph jsonb;
  v_is_test boolean := coalesce((p_payload->>'isTest')::boolean, false);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.is_member(p_tenant_id) and not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  select * into v_w from app.sb_workflows where id = (p_payload->>'workflowId')::uuid and tenant_id = p_tenant_id;
  if v_w.id is null then
    perform app.ensure_default_sb_workflow(p_tenant_id);
    select * into v_w from app.sb_workflows where tenant_id = p_tenant_id order by created_at limit 1;
  end if;

  if v_w.published_version_id is not null then
    select * into v_ver from app.sb_workflow_versions where id = v_w.published_version_id;
    v_graph := v_ver.graph;
  else
    v_graph := v_w.draft_graph;
  end if;

  insert into app.sb_runs (
    tenant_id, workflow_id, workflow_version_id, name, is_test, inputs, graph,
    location_label, center_lat, center_lng, radius_km, created_by
  ) values (
    p_tenant_id, v_w.id, v_ver.id,
    coalesce(p_payload->>'name', v_w.name),
    v_is_test,
    coalesce(p_payload->'inputs', '{}'::jsonb),
    v_graph,
    coalesce(p_payload->>'locationLabel', ''),
    coalesce((p_payload->>'lat')::double precision, 0),
    coalesce((p_payload->>'lng')::double precision, 0),
    coalesce((p_payload->>'radiusKm')::numeric, 25),
    auth.uid()
  ) returning * into v_run;

  return jsonb_build_object('id', v_run.id, 'status', v_run.status::text);
end;
$$;

create or replace function app.get_sb_run(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_r app.sb_runs;
begin
  select * into v_r from app.sb_runs where id = p_run_id and deleted_at is null;
  if v_r.id is null then return null; end if;
  if not app.is_member(v_r.tenant_id) and not app.has_capability(v_r.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  return jsonb_build_object(
    'id', v_r.id, 'name', v_r.name, 'status', v_r.status::text, 'isTest', v_r.is_test,
    'prospectCount', v_r.prospect_count, 'insightCount', v_r.insight_count,
    'progress', v_r.progress, 'errorMessage', v_r.error_message,
    'inputs', v_r.inputs, 'workflowVersionId', v_r.workflow_version_id,
    'createdAt', v_r.created_at, 'updatedAt', v_r.updated_at
  );
end;
$$;

create or replace function app.list_sb_runs(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
begin
  if not app.is_member(p_tenant_id) and not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'status', r.status::text, 'isTest', r.is_test,
      'prospectCount', r.prospect_count, 'insightCount', r.insight_count,
      'createdAt', r.created_at, 'updatedAt', r.updated_at,
      'workflowName', w.name
    ) order by r.created_at desc)
    from app.sb_runs r
    left join app.sb_workflows w on w.id = r.workflow_id
    where r.tenant_id = p_tenant_id and r.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

create or replace function app.publish_sb_workflow(p_workflow_id uuid, p_graph jsonb, p_form_schema jsonb)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare
  v_w app.sb_workflows;
  v_ver app.sb_workflow_versions;
  v_no integer;
begin
  select * into v_w from app.sb_workflows where id = p_workflow_id;
  if v_w.id is null then raise exception 'Not found'; end if;
  if not app.has_capability(v_w.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select coalesce(max(version_no), 0) + 1 into v_no from app.sb_workflow_versions where workflow_id = p_workflow_id;

  insert into app.sb_workflow_versions (workflow_id, tenant_id, version_no, graph, form_schema, published_by)
  values (p_workflow_id, v_w.tenant_id, v_no, p_graph, p_form_schema, auth.uid())
  returning * into v_ver;

  update app.sb_workflows
  set status = 'published', published_version_id = v_ver.id, draft_graph = p_graph, draft_form_schema = p_form_schema, updated_at = now()
  where id = p_workflow_id;

  return jsonb_build_object('versionId', v_ver.id, 'versionNo', v_no);
end;
$$;

-- Worker RPCs
create or replace function app.sb_worker_get_run(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_r app.sb_runs;
begin
  select * into v_r from app.sb_runs where id = p_run_id;
  if v_r.id is null then return null; end if;
  return jsonb_build_object(
    'id', v_r.id, 'tenant_id', v_r.tenant_id, 'is_test', v_r.is_test, 'status', v_r.status::text,
    'deleted_at', v_r.deleted_at, 'inputs', v_r.inputs, 'graph', v_r.graph,
    'center_lat', v_r.center_lat, 'center_lng', v_r.center_lng, 'radius_km', v_r.radius_km,
    'location_label', v_r.location_label
  );
end;
$$;

create or replace function app.sb_worker_update_progress(
  p_run_id uuid, p_status app.sb_run_status, p_progress jsonb,
  p_prospect_count integer, p_insight_count integer, p_error_message text, p_warnings jsonb
) returns void language plpgsql security definer set search_path = app, public, auth as $$
begin
  update app.sb_runs set
    status = p_status,
    progress = p_progress,
    prospect_count = coalesce(p_prospect_count, prospect_count),
    insight_count = coalesce(p_insight_count, insight_count),
    error_message = p_error_message,
    warnings = coalesce(p_warnings, warnings),
    updated_at = now(),
    started_at = case when started_at is null and p_status = 'running' then now() else started_at end,
    completed_at = case when p_status in ('completed','completed_with_warnings','failed','cancelled') then now() else completed_at end
  where id = p_run_id and deleted_at is null;
end;
$$;

create or replace function app.sb_worker_insert_prospect(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = app, public, auth as $$
declare
  v_run_id uuid := (p_payload->>'runId')::uuid;
  v_tenant_id uuid;
  v_prospect_id uuid;
  v_host text := nullif(lower(trim(p_payload->>'websiteHost')), '');
  v_existing uuid;
  v_is_test boolean := coalesce((p_payload->>'isTest')::boolean, false);
begin
  select tenant_id into v_tenant_id from app.sb_runs where id = v_run_id and deleted_at is null;
  if v_tenant_id is null then return null; end if;

  if v_host is not null then
    select id into v_existing from app.leadgen_prospects where tenant_id = v_tenant_id and website_host = v_host limit 1;
  end if;

  if v_existing is null then
    insert into app.leadgen_prospects (tenant_id, display_name, website_host, website_url)
    values (v_tenant_id, coalesce(p_payload->>'displayName','Onbekend'), v_host, nullif(p_payload->>'websiteUrl',''))
    returning id into v_prospect_id;
  else
    v_prospect_id := v_existing;
  end if;

  if not v_is_test then
    null;
  end if;

  insert into app.sb_run_prospects (
    run_id, prospect_id, tenant_id, distance_km, geo_eligible, geo_verified,
    assessment_summary, signals, limitations, sort_order
  ) values (
    v_run_id, v_prospect_id, v_tenant_id,
    (p_payload->>'distanceKm')::numeric,
    coalesce((p_payload->>'geoEligible')::boolean, false),
    coalesce((p_payload->>'geoVerified')::boolean, false),
    coalesce(p_payload->>'assessmentSummary',''),
    coalesce(p_payload->'signals','[]'::jsonb),
    coalesce(p_payload->'limitations','[]'::jsonb),
    coalesce((p_payload->>'sortOrder')::int, 0)
  ) on conflict (run_id, prospect_id) do update set
    assessment_summary = excluded.assessment_summary,
    signals = excluded.signals,
    limitations = excluded.limitations;

  return v_prospect_id;
end;
$$;

create or replace function app.sb_worker_insert_insight(
  p_run_id uuid, p_title text, p_summary text, p_provenance text
) returns uuid language plpgsql security definer set search_path = app, public, auth as $$
declare v_id uuid; v_tenant uuid;
begin
  select tenant_id into v_tenant from app.sb_runs where id = p_run_id;
  insert into app.sb_market_insights (run_id, tenant_id, title, summary, provenance)
  values (p_run_id, v_tenant, p_title, p_summary, p_provenance)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on table app.sb_workflows from public, anon, authenticated;
revoke all on table app.sb_workflow_versions from public, anon, authenticated;
revoke all on table app.sb_runs from public, anon, authenticated;
revoke all on table app.sb_node_attempts from public, anon, authenticated;
revoke all on table app.sb_run_prospects from public, anon, authenticated;
revoke all on table app.sb_market_insights from public, anon, authenticated;
revoke all on table app.sb_feedback from public, anon, authenticated;

grant select, insert, update, delete on app.sb_workflows to service_role;
grant select, insert, update, delete on app.sb_workflow_versions to service_role;
grant select, insert, update, delete on app.sb_runs to service_role;
grant select, insert, update, delete on app.sb_node_attempts to service_role;
grant select, insert, update, delete on app.sb_run_prospects to service_role;
grant select, insert, update, delete on app.sb_market_insights to service_role;
grant select, insert, update, delete on app.sb_feedback to service_role;

grant execute on function app.list_sb_workflows(uuid) to authenticated;
grant execute on function app.ensure_default_sb_workflow(uuid) to authenticated;
grant execute on function app.create_sb_run(uuid, jsonb) to authenticated;
grant execute on function app.get_sb_run(uuid) to authenticated;
grant execute on function app.list_sb_runs(uuid) to authenticated;
grant execute on function app.publish_sb_workflow(uuid, jsonb, jsonb) to authenticated;

grant execute on function app.sb_worker_get_run(uuid) to service_role;
grant execute on function app.sb_worker_update_progress(uuid, app.sb_run_status, jsonb, integer, integer, text, jsonb) to service_role;
grant execute on function app.sb_worker_insert_prospect(jsonb) to service_role;
grant execute on function app.sb_worker_insert_insight(uuid, text, text, text) to service_role;

create or replace function app.list_sb_run_prospects(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from app.sb_runs where id = p_run_id and deleted_at is null;
  if v_tenant is null then return '[]'::jsonb; end if;
  if not app.is_member(v_tenant) and not app.has_capability(v_tenant, 'audit.edit') then raise exception 'Forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'runProspectId', rp.id, 'displayName', p.display_name,
      'websiteUrl', p.website_url, 'websiteHost', p.website_host,
      'distanceKm', rp.distance_km, 'geoEligible', rp.geo_eligible, 'geoVerified', rp.geo_verified,
      'contactStatus', p.contact_status::text, 'assessmentSummary', rp.assessment_summary,
      'signals', rp.signals, 'limitations', rp.limitations, 'sourceCount', 1
    ) order by rp.sort_order)
    from app.sb_run_prospects rp
    join app.leadgen_prospects p on p.id = rp.prospect_id
    where rp.run_id = p_run_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function app.list_sb_run_prospects(uuid) to authenticated;
