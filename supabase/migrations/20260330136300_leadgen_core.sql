-- Leadgen: prospect research runs per tenant. Draai na 20260330136200.

create type app.leadgen_run_status as enum (
  'queued',
  'running',
  'completed',
  'completed_with_warnings',
  'failed',
  'cancelled'
);

create type app.leadgen_contact_status as enum (
  'to_contact',
  'contacted',
  'unreachable',
  'not_applicable'
);

create type app.leadgen_source_kind as enum (
  'web_search',
  'website_fetch',
  'places',
  'manual'
);

create table app.leadgen_assignment_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  name text not null default '',
  location_label text not null default '',
  place_id text,
  lat double precision,
  lng double precision,
  radius_km numeric(6, 2) not null default 25,
  assignment_text text not null default '',
  criteria jsonb not null default '{}'::jsonb,
  sources jsonb not null default '["public_internet"]'::jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leadgen_assignment_templates_tenant_idx
  on app.leadgen_assignment_templates (tenant_id, updated_at desc);

create table app.leadgen_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  template_id uuid references app.leadgen_assignment_templates (id) on delete set null,
  name text not null default '',
  status app.leadgen_run_status not null default 'queued',
  location_label text not null default '',
  place_id text,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_km numeric(6, 2) not null,
  assignment_text text not null default '',
  criteria jsonb not null default '{}'::jsonb,
  sources jsonb not null default '["public_internet"]'::jsonb,
  interpretation jsonb not null default '{}'::jsonb,
  progress jsonb not null default jsonb_build_object('phase', 'queued', 'message', 'In wachtrij'),
  error_message text,
  warnings jsonb not null default '[]'::jsonb,
  result_count integer not null default 0,
  config_hash text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  deleted_at timestamptz
);

create index leadgen_runs_tenant_idx on app.leadgen_runs (tenant_id, created_at desc) where deleted_at is null;
create index leadgen_runs_active_idx on app.leadgen_runs (tenant_id, status) where deleted_at is null and status in ('queued', 'running');

create table app.leadgen_prospects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  display_name text not null default '',
  website_host text,
  website_url text,
  contact_status app.leadgen_contact_status not null default 'to_contact',
  exclude_from_future_runs boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index leadgen_prospects_host_uidx
  on app.leadgen_prospects (tenant_id, website_host)
  where website_host is not null and btrim(website_host) <> '';

create table app.leadgen_prospect_establishments (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references app.leadgen_prospects (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  address_text text not null default '',
  municipality text not null default '',
  lat double precision,
  lng double precision,
  location_confidence text not null default 'unknown',
  place_id text,
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);

create index leadgen_establishments_prospect_idx on app.leadgen_prospect_establishments (prospect_id);

create table app.leadgen_run_prospects (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references app.leadgen_runs (id) on delete cascade,
  prospect_id uuid not null references app.leadgen_prospects (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  distance_km numeric(8, 2),
  geo_eligible boolean not null default false,
  geo_verified boolean not null default false,
  assessment_summary text not null default '',
  signals jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  assessed_at timestamptz,
  sort_order integer not null default 0,
  unique (run_id, prospect_id)
);

create index leadgen_run_prospects_run_idx on app.leadgen_run_prospects (run_id, sort_order);

create table app.leadgen_evidence_sources (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references app.leadgen_runs (id) on delete cascade,
  run_prospect_id uuid references app.leadgen_run_prospects (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  kind app.leadgen_source_kind not null default 'web_search',
  title text not null default '',
  url text not null default '',
  excerpt text not null default '',
  retrieved_at timestamptz not null default now()
);

create index leadgen_evidence_run_idx on app.leadgen_evidence_sources (run_prospect_id);

create table app.leadgen_contacts (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references app.leadgen_prospects (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  email text,
  phone text,
  contact_page_url text,
  source_kind app.leadgen_source_kind not null default 'website_fetch',
  source_url text,
  retrieved_at timestamptz not null default now()
);

create index leadgen_contacts_prospect_idx on app.leadgen_contacts (prospect_id);

create table app.leadgen_prospect_notes (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references app.leadgen_prospects (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  body text not null default '',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table app.leadgen_status_history (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references app.leadgen_prospects (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  old_status app.leadgen_contact_status,
  new_status app.leadgen_contact_status not null,
  changed_by uuid references auth.users (id),
  changed_at timestamptz not null default now()
);

-- JSON helpers
create or replace function app._leadgen_run_json(p_row app.leadgen_runs)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'tenantId', p_row.tenant_id,
    'name', p_row.name,
    'status', p_row.status::text,
    'locationLabel', p_row.location_label,
    'radiusKm', p_row.radius_km,
    'resultCount', p_row.result_count,
    'createdAt', p_row.created_at,
    'updatedAt', p_row.updated_at,
    'completedAt', p_row.completed_at,
    'errorMessage', coalesce(p_row.error_message, ''),
    'progress', p_row.progress,
    'config', jsonb_build_object(
      'locationLabel', p_row.location_label,
      'placeId', p_row.place_id,
      'lat', p_row.center_lat,
      'lng', p_row.center_lng,
      'radiusKm', p_row.radius_km,
      'assignmentText', p_row.assignment_text,
      'criteria', p_row.criteria,
      'sources', p_row.sources,
      'interpretation', p_row.interpretation
    )
  );
$$;

create or replace function app.list_leadgen_runs(p_tenant_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  return coalesce((
    select jsonb_agg(app._leadgen_run_json(r) order by r.updated_at desc)
    from (
      select * from app.leadgen_runs
      where tenant_id = p_tenant_id and deleted_at is null
      order by updated_at desc
      limit greatest(least(p_limit, 100), 1)
    ) r
  ), '[]'::jsonb);
end;
$$;

create or replace function app.get_leadgen_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.leadgen_runs;
begin
  select * into v_row from app.leadgen_runs where id = p_run_id and deleted_at is null;
  if v_row.id is null then return null; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  return app._leadgen_run_json(v_row);
end;
$$;

create or replace function app.create_leadgen_run(p_tenant_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.leadgen_runs;
  v_name text;
  v_lat double precision;
  v_lng double precision;
  v_radius numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  v_lat := (p_payload->>'lat')::double precision;
  v_lng := (p_payload->>'lng')::double precision;
  v_radius := coalesce((p_payload->>'radiusKm')::numeric, 25);
  if v_lat is null or v_lng is null then raise exception 'Locatie ontbreekt'; end if;
  if v_radius < 1 or v_radius > 200 then raise exception 'Straal ongeldig'; end if;

  v_name := coalesce(nullif(trim(p_payload->>'name'), ''), nullif(trim(p_payload->>'autoName'), ''), 'Nieuwe zoektocht');

  insert into app.leadgen_runs (
    tenant_id, name, location_label, place_id, center_lat, center_lng, radius_km,
    assignment_text, criteria, sources, interpretation, created_by, config_hash
  ) values (
    p_tenant_id,
    v_name,
    coalesce(p_payload->>'locationLabel', ''),
    nullif(p_payload->>'placeId', ''),
    v_lat,
    v_lng,
    v_radius,
    coalesce(p_payload->>'assignmentText', ''),
    coalesce(p_payload->'criteria', '{}'::jsonb),
    coalesce(p_payload->'sources', '["public_internet"]'::jsonb),
    coalesce(p_payload->'interpretation', '{}'::jsonb),
    auth.uid(),
    nullif(p_payload->>'configHash', '')
  )
  returning * into v_row;

  return app._leadgen_run_json(v_row);
end;
$$;

create or replace function app.rename_leadgen_run(p_run_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.leadgen_runs;
begin
  select * into v_row from app.leadgen_runs where id = p_run_id and deleted_at is null;
  if v_row.id is null then raise exception 'Run niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  update app.leadgen_runs set name = left(trim(p_name), 200), updated_at = now() where id = p_run_id
  returning * into v_row;
  return app._leadgen_run_json(v_row);
end;
$$;

create or replace function app.soft_delete_leadgen_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.leadgen_runs;
begin
  select * into v_row from app.leadgen_runs where id = p_run_id and deleted_at is null;
  if v_row.id is null then return; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  update app.leadgen_runs
  set deleted_at = now(), status = case when status in ('queued', 'running') then 'cancelled'::app.leadgen_run_status else status end,
      updated_at = now(), completed_at = coalesce(completed_at, now())
  where id = p_run_id;
end;
$$;

create or replace function app.cancel_leadgen_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.leadgen_runs;
begin
  select * into v_row from app.leadgen_runs where id = p_run_id and deleted_at is null;
  if v_row.id is null then raise exception 'Run niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  update app.leadgen_runs
  set status = 'cancelled', updated_at = now(), completed_at = now(),
      progress = jsonb_set(coalesce(progress, '{}'::jsonb), '{message}', '"Geannuleerd"'::jsonb)
  where id = p_run_id and status in ('queued', 'running')
  returning * into v_row;

  return app._leadgen_run_json(v_row);
end;
$$;

create or replace function app.list_leadgen_run_prospects(
  p_run_id uuid,
  p_search text default '',
  p_status text default '',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_run app.leadgen_runs;
begin
  select * into v_run from app.leadgen_runs where id = p_run_id and deleted_at is null;
  if v_run.id is null then raise exception 'Run niet gevonden'; end if;
  if not app.has_capability(v_run.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'runProspectId', rp.id,
      'displayName', p.display_name,
      'websiteUrl', p.website_url,
      'websiteHost', p.website_host,
      'municipality', coalesce(e.municipality, ''),
      'distanceKm', rp.distance_km,
      'geoEligible', rp.geo_eligible,
      'geoVerified', rp.geo_verified,
      'email', (select c.email from app.leadgen_contacts c where c.prospect_id = p.id order by c.retrieved_at desc limit 1),
      'phone', (select c.phone from app.leadgen_contacts c where c.prospect_id = p.id order by c.retrieved_at desc limit 1),
      'contactPageUrl', (select c.contact_page_url from app.leadgen_contacts c where c.prospect_id = p.id order by c.retrieved_at desc limit 1),
      'contactStatus', p.contact_status::text,
      'sourceCount', (select count(*)::int from app.leadgen_evidence_sources es where es.run_prospect_id = rp.id),
      'assessedAt', rp.assessed_at
    ) order by rp.sort_order, rp.id)
    from app.leadgen_run_prospects rp
    inner join app.leadgen_prospects p on p.id = rp.prospect_id
    left join app.leadgen_prospect_establishments e on e.prospect_id = p.id and e.is_primary = true
    where rp.run_id = p_run_id
      and (p_status = '' or p.contact_status::text = p_status)
      and (p_search = '' or p.display_name ilike '%' || p_search || '%' or coalesce(p.website_host, '') ilike '%' || p_search || '%')
    limit greatest(least(p_limit, 200), 1)
    offset greatest(p_offset, 0)
  ), '[]'::jsonb);
end;
$$;

create or replace function app.update_leadgen_prospect_status(
  p_prospect_id uuid,
  p_status app.leadgen_contact_status
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_old app.leadgen_contact_status;
  v_tenant uuid;
begin
  select contact_status, tenant_id into v_old, v_tenant from app.leadgen_prospects where id = p_prospect_id;
  if v_tenant is null then raise exception 'Prospect niet gevonden'; end if;
  if not app.has_capability(v_tenant, 'audit.edit') then raise exception 'Forbidden'; end if;

  update app.leadgen_prospects
  set contact_status = p_status,
      exclude_from_future_runs = case when p_status = 'not_applicable' then true else exclude_from_future_runs end,
      updated_at = now()
  where id = p_prospect_id;

  insert into app.leadgen_status_history (prospect_id, tenant_id, old_status, new_status, changed_by)
  values (p_prospect_id, v_tenant, v_old, p_status, auth.uid());
end;
$$;

create or replace function app.upsert_leadgen_prospect_note(p_prospect_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant uuid;
  v_note app.leadgen_prospect_notes;
begin
  select tenant_id into v_tenant from app.leadgen_prospects where id = p_prospect_id;
  if v_tenant is null then raise exception 'Prospect niet gevonden'; end if;
  if not app.has_capability(v_tenant, 'audit.edit') then raise exception 'Forbidden'; end if;

  insert into app.leadgen_prospect_notes (prospect_id, tenant_id, body, created_by)
  values (p_prospect_id, v_tenant, left(trim(p_body), 4000), auth.uid())
  returning * into v_note;

  return jsonb_build_object('id', v_note.id, 'body', v_note.body, 'createdAt', v_note.created_at);
end;
$$;

create or replace function app.get_leadgen_prospect_detail(p_run_id uuid, p_prospect_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_run app.leadgen_runs;
  v_rp app.leadgen_run_prospects;
  v_p app.leadgen_prospects;
  v_e app.leadgen_prospect_establishments;
begin
  select * into v_run from app.leadgen_runs where id = p_run_id and deleted_at is null;
  if v_run.id is null then raise exception 'Run niet gevonden'; end if;
  if not app.has_capability(v_run.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select * into v_rp from app.leadgen_run_prospects where run_id = p_run_id and prospect_id = p_prospect_id;
  if v_rp.id is null then raise exception 'Prospect niet in deze run'; end if;
  select * into v_p from app.leadgen_prospects where id = p_prospect_id;
  select * into v_e from app.leadgen_prospect_establishments where prospect_id = p_prospect_id and is_primary = true limit 1;

  return jsonb_build_object(
    'prospect', jsonb_build_object(
      'id', v_p.id,
      'runProspectId', v_rp.id,
      'displayName', v_p.display_name,
      'websiteUrl', v_p.website_url,
      'websiteHost', v_p.website_host,
      'municipality', coalesce(v_e.municipality, ''),
      'distanceKm', v_rp.distance_km,
      'geoEligible', v_rp.geo_eligible,
      'geoVerified', v_rp.geo_verified,
      'contactStatus', v_p.contact_status::text,
      'establishmentAddress', coalesce(v_e.address_text, ''),
      'assessmentSummary', v_rp.assessment_summary,
      'signals', v_rp.signals,
      'limitations', v_rp.limitations,
      'assessedAt', v_rp.assessed_at,
      'researchRunAt', v_run.completed_at
    ),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', es.id, 'title', es.title, 'url', es.url, 'kind', es.kind::text,
        'excerpt', es.excerpt, 'retrievedAt', es.retrieved_at
      ) order by es.retrieved_at desc)
      from app.leadgen_evidence_sources es where es.run_prospect_id = v_rp.id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'body', n.body, 'createdAt', n.created_at, 'authorLabel', 'Gebruiker'
      ) order by n.created_at desc)
      from app.leadgen_prospect_notes n where n.prospect_id = p_prospect_id
    ), '[]'::jsonb),
    'statusHistory', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', h.new_status::text, 'changedAt', h.changed_at, 'authorLabel', 'Gebruiker'
      ) order by h.changed_at desc)
      from app.leadgen_status_history h where h.prospect_id = p_prospect_id
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_build_object(
        'email', (select email from app.leadgen_contacts c where c.prospect_id = p_prospect_id and c.email is not null limit 1),
        'phone', (select phone from app.leadgen_contacts c where c.prospect_id = p_prospect_id and c.phone is not null limit 1),
        'contactPageUrl', (select contact_page_url from app.leadgen_contacts c where c.prospect_id = p_prospect_id and c.contact_page_url is not null limit 1)
      )
    ), '{}'::jsonb)
  );
end;
$$;

-- Worker RPCs (service_role only)
create or replace function app.leadgen_worker_claim_run()
returns app.leadgen_runs
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.leadgen_runs;
begin
  select * into v_row
  from app.leadgen_runs
  where deleted_at is null and status = 'queued'
  order by created_at asc
  for update skip locked
  limit 1;

  if v_row.id is null then return null; end if;

  update app.leadgen_runs
  set status = 'running', started_at = coalesce(started_at, now()), updated_at = now(),
      progress = jsonb_build_object('phase', 'preparing', 'message', 'Opdracht voorbereiden')
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function app.leadgen_worker_get_run(p_run_id uuid)
returns app.leadgen_runs
language sql
security definer
set search_path = app, public, auth
as $$
  select * from app.leadgen_runs where id = p_run_id limit 1;
$$;

create or replace function app.leadgen_worker_update_progress(
  p_run_id uuid,
  p_status app.leadgen_run_status,
  p_progress jsonb,
  p_result_count integer default null,
  p_error_message text default null,
  p_warnings jsonb default null
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  update app.leadgen_runs
  set
    status = p_status,
    progress = coalesce(p_progress, progress),
    result_count = coalesce(p_result_count, result_count),
    error_message = p_error_message,
    warnings = coalesce(p_warnings, warnings),
    updated_at = now(),
    completed_at = case when p_status in ('completed', 'completed_with_warnings', 'failed', 'cancelled') then now() else completed_at end
  where id = p_run_id and deleted_at is null;
end;
$$;

revoke all on table app.leadgen_runs from public, anon, authenticated;
revoke all on table app.leadgen_prospects from public, anon, authenticated;
revoke all on table app.leadgen_run_prospects from public, anon, authenticated;
revoke all on table app.leadgen_evidence_sources from public, anon, authenticated;
revoke all on table app.leadgen_contacts from public, anon, authenticated;
revoke all on table app.leadgen_prospect_notes from public, anon, authenticated;
revoke all on table app.leadgen_status_history from public, anon, authenticated;
revoke all on table app.leadgen_prospect_establishments from public, anon, authenticated;
revoke all on table app.leadgen_assignment_templates from public, anon, authenticated;

grant select, insert, update, delete on app.leadgen_runs to service_role;
grant select, insert, update, delete on app.leadgen_prospects to service_role;
grant select, insert, update, delete on app.leadgen_run_prospects to service_role;
grant select, insert, update, delete on app.leadgen_evidence_sources to service_role;
grant select, insert, update, delete on app.leadgen_contacts to service_role;
grant select, insert, update, delete on app.leadgen_prospect_establishments to service_role;
grant select, insert, update, delete on app.leadgen_assignment_templates to service_role;

grant execute on function app.list_leadgen_runs(uuid, integer) to authenticated;
grant execute on function app.get_leadgen_run(uuid) to authenticated;
grant execute on function app.create_leadgen_run(uuid, jsonb) to authenticated;
grant execute on function app.rename_leadgen_run(uuid, text) to authenticated;
grant execute on function app.soft_delete_leadgen_run(uuid) to authenticated;
grant execute on function app.cancel_leadgen_run(uuid) to authenticated;
grant execute on function app.list_leadgen_run_prospects(uuid, text, text, integer, integer) to authenticated;
grant execute on function app.update_leadgen_prospect_status(uuid, app.leadgen_contact_status) to authenticated;
grant execute on function app.upsert_leadgen_prospect_note(uuid, text) to authenticated;
grant execute on function app.get_leadgen_prospect_detail(uuid, uuid) to authenticated;

grant execute on function app.leadgen_worker_claim_run() to service_role;
grant execute on function app.leadgen_worker_get_run(uuid) to service_role;
grant execute on function app.leadgen_worker_update_progress(uuid, app.leadgen_run_status, jsonb, integer, text, jsonb) to service_role;

create or replace function app.leadgen_worker_insert_result(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_run_id uuid := (p_payload->>'runId')::uuid;
  v_tenant_id uuid;
  v_prospect_id uuid;
  v_run_prospect_id uuid;
  v_host text := nullif(lower(trim(p_payload->>'websiteHost')), '');
  v_existing uuid;
begin
  select tenant_id into v_tenant_id from app.leadgen_runs where id = v_run_id and deleted_at is null;
  if v_tenant_id is null then return null; end if;

  if v_host is not null then
    select id into v_existing from app.leadgen_prospects where tenant_id = v_tenant_id and website_host = v_host limit 1;
  end if;

  if v_existing is null then
    insert into app.leadgen_prospects (tenant_id, display_name, website_host, website_url, contact_status, exclude_from_future_runs)
    values (
      v_tenant_id,
      coalesce(p_payload->>'displayName', 'Onbekend'),
      v_host,
      nullif(p_payload->>'websiteUrl', ''),
      coalesce((p_payload->>'contactStatus')::app.leadgen_contact_status, 'to_contact'),
      coalesce((p_payload->>'excludeFromFuture')::boolean, false)
    )
    returning id into v_prospect_id;
  else
    v_prospect_id := v_existing;
    update app.leadgen_prospects
    set display_name = case when btrim(display_name) = '' then coalesce(p_payload->>'displayName', display_name) else display_name end,
        website_url = coalesce(nullif(p_payload->>'websiteUrl', ''), website_url),
        updated_at = now()
    where id = v_prospect_id;
  end if;

  insert into app.leadgen_run_prospects (
    run_id, prospect_id, tenant_id, distance_km, geo_eligible, geo_verified,
    assessment_summary, signals, limitations, assessed_at, sort_order
  ) values (
    v_run_id, v_prospect_id, v_tenant_id,
    (p_payload->>'distanceKm')::numeric,
    coalesce((p_payload->>'geoEligible')::boolean, false),
    coalesce((p_payload->>'geoVerified')::boolean, false),
    coalesce(p_payload->>'assessmentSummary', ''),
    coalesce(p_payload->'signals', '[]'::jsonb),
    coalesce(p_payload->'limitations', '[]'::jsonb),
    case when p_payload ? 'assessedAt' then (p_payload->>'assessedAt')::timestamptz else null end,
    coalesce((p_payload->>'sortOrder')::int, 0)
  )
  on conflict (run_id, prospect_id) do update set
    distance_km = excluded.distance_km,
    geo_eligible = excluded.geo_eligible,
    geo_verified = excluded.geo_verified,
    assessment_summary = excluded.assessment_summary,
    signals = excluded.signals,
    limitations = excluded.limitations,
    assessed_at = excluded.assessed_at
  returning id into v_run_prospect_id;

  if coalesce(p_payload->>'municipality', '') <> '' or coalesce(p_payload->>'addressText', '') <> '' then
    insert into app.leadgen_prospect_establishments (
      prospect_id, tenant_id, address_text, municipality, lat, lng, location_confidence, is_primary
    ) values (
      v_prospect_id, v_tenant_id,
      coalesce(p_payload->>'addressText', ''),
      coalesce(p_payload->>'municipality', ''),
      (p_payload->>'lat')::double precision,
      (p_payload->>'lng')::double precision,
      coalesce(p_payload->>'locationConfidence', 'unknown'),
      true
    )
    on conflict do nothing;
  end if;

  if p_payload ? 'evidence' then
    insert into app.leadgen_evidence_sources (run_id, run_prospect_id, tenant_id, kind, title, url, excerpt)
    select v_run_id, v_run_prospect_id, v_tenant_id,
      coalesce((item->>'kind')::app.leadgen_source_kind, 'web_search'),
      coalesce(item->>'title', ''),
      coalesce(item->>'url', ''),
      coalesce(item->>'excerpt', '')
    from jsonb_array_elements(p_payload->'evidence') item;
  end if;

  if p_payload ? 'contacts' then
    insert into app.leadgen_contacts (prospect_id, tenant_id, email, phone, contact_page_url, source_kind, source_url)
    values (
      v_prospect_id, v_tenant_id,
      nullif(p_payload->'contacts'->>'email', ''),
      nullif(p_payload->'contacts'->>'phone', ''),
      nullif(p_payload->'contacts'->>'contactPageUrl', ''),
      'website_fetch',
      nullif(p_payload->'contacts'->>'sourceUrl', '')
    );
  end if;

  update app.leadgen_runs set result_count = (
    select count(*)::int from app.leadgen_run_prospects where run_id = v_run_id and geo_eligible = true
  ), updated_at = now()
  where id = v_run_id;

  return v_run_prospect_id;
end;
$$;

grant execute on function app.leadgen_worker_insert_result(jsonb) to service_role;
