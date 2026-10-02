-- Strategische audit · stap 7: waardeketen
-- Activiteiten, bronnen, financiële imports en toewijzingen staan apart.
-- Een onbekend bedrag blijft null en telt nooit als nul.
-- Totalen en verdeelsleutels worden in de database gecontroleerd; het model mag alleen voorstellen.

create type app.vc_version_status as enum (
  'not_started', 'draft', 'in_review', 'approved', 'needs_revision'
);
create type app.vc_business_type as enum ('service', 'production', 'trade', 'mixed');
create type app.vc_category as enum (
  'inbound', 'operations', 'outbound', 'marketing_sales', 'after_sales',
  'infrastructure', 'people', 'technology', 'procurement'
);
create type app.vc_execution as enum ('internal', 'external', 'mixed', 'unknown');
create type app.vc_time_basis as enum ('measured', 'estimate', 'unknown');
create type app.vc_review as enum ('pending', 'reviewed');
create type app.vc_evidence as enum ('provided', 'observed', 'hypothesis');
create type app.vc_question_status as enum ('open', 'answered', 'queued_meeting', 'accepted_open');
create type app.vc_ref_type as enum (
  'tenant_profile', 'meeting', 'pestel_insight', 'pestel_input',
  'porter_scope', 'porter_force', 'porter_factor',
  'five_c_item', 'five_c_synthesis', 'swot_item', 'vrio_resource', 'manual'
);
create type app.vc_scale as enum ('units', 'thousands', 'millions');
create type app.vc_figure_type as enum ('actual', 'budget', 'forecast');
create type app.vc_finance_scope as enum ('company', 'department', 'product_group', 'service');
create type app.vc_line_kind as enum ('detail', 'subtotal', 'total');
create type app.vc_extract_status as enum ('proposed', 'confirmed', 'excluded', 'uncertain');
create type app.vc_alloc_status as enum ('proposed', 'confirmed');
create type app.vc_action_status as enum ('proposed', 'confirmed', 'dismissed');
create type app.vc_ai_state as enum ('none', 'proposed', 'accepted', 'rejected');

create table app.finance_grants (
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  can_read boolean not null default false,
  can_upload boolean not null default false,
  granted_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table app.finance_grants enable row level security;

create or replace function app.has_capability(p_tenant_id uuid, p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
declare
  v_role app.membership_role;
begin
  if app.is_platform_admin() then
    if p_capability in (
      'tenant.create', 'tenant.read', 'tenant.update', 'tenant.archive', 'tenant.delete',
      'member.invite', 'member.revoke'
    ) then
      return app.is_member(p_tenant_id) or p_capability = 'tenant.create';
    end if;
    if app.is_member(p_tenant_id) and app.membership_role(p_tenant_id) = 'admin' then
      return true;
    end if;
    if p_capability = 'tenant.create' then
      return true;
    end if;
    return false;
  end if;

  if not app.is_member(p_tenant_id) then
    return false;
  end if;

  v_role := app.membership_role(p_tenant_id);

  if v_role = 'admin' then
    return p_capability in (
      'tenant.read', 'tenant.update', 'source.create', 'source.read_internal',
      'meeting.record', 'transcript.edit', 'task.review', 'audit.edit', 'audit.approve',
      'dashboard.publish', 'member.invite', 'member.revoke',
      'finance.read', 'finance.edit', 'finance.upload'
    );
  end if;

  if v_role = 'client' then
    if p_capability = 'finance.read' then
      return exists (
        select 1 from app.finance_grants g
        where g.tenant_id = p_tenant_id and g.user_id = auth.uid() and g.can_read
      );
    end if;
    if p_capability = 'finance.upload' then
      return exists (
        select 1 from app.finance_grants g
        where g.tenant_id = p_tenant_id and g.user_id = auth.uid() and g.can_upload
      );
    end if;
    return p_capability in (
      'tenant.read', 'source.create', 'dashboard.read_published', 'feedback.create', 'export.create'
    );
  end if;

  return false;
end;
$$;

create table app.vc_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  version_number integer not null,
  status app.vc_version_status not null default 'not_started',
  pestel_version_id uuid references app.pestel_versions (id) on delete set null,
  porter_version_id uuid references app.porter_versions (id) on delete set null,
  five_c_version_id uuid references app.five_c_versions (id) on delete set null,
  swot_version_id uuid references app.swot_versions (id) on delete set null,
  vrio_version_id uuid references app.vrio_versions (id) on delete set null,
  synthesis_text text not null default '',
  synthesis_public text not null default '',
  synthesis_reviewed boolean not null default false,
  publish_financials boolean not null default false,
  finance_deferred boolean not null default false,
  cost_rate numeric(20, 4),
  cost_rate_confirmed boolean not null default false,
  cost_rate_currency text not null default 'EUR',
  cost_rate_unit text not null default 'hour',
  ai_generated_at timestamptz,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, version_number)
);

create table app.vc_chains (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.vc_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  offering text not null default '',
  business_type app.vc_business_type not null default 'service',
  market text not null default '',
  period_label text not null default '',
  goal text not null default '',
  scope_confirmed boolean not null default false,
  needs_revision boolean not null default false,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.vc_activities (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references app.vc_chains (id) on delete cascade,
  version_id uuid not null references app.vc_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  name text not null default '',
  category app.vc_category not null,
  description text not null default '',
  inputs_text text not null default '',
  outputs_text text not null default '',
  customer_value text not null default '',
  capabilities_note text not null default '',
  owner_name text not null default '',
  execution app.vc_execution not null default 'unknown',
  time_value numeric(20, 4),
  time_unit text not null default '',
  time_scope text not null default '',
  time_basis app.vc_time_basis not null default 'unknown',
  time_source text not null default '',
  bottleneck_observation text not null default '',
  bottleneck_explanation text not null default '',
  bottleneck_improvement text not null default '',
  bottleneck_effect text not null default '',
  bottleneck_motivation text not null default '',
  open_question text not null default '',
  question_status app.vc_question_status not null default 'open',
  question_answer text not null default '',
  advisor_note text not null default '',
  evidence_level app.vc_evidence not null default 'hypothesis',
  not_applicable boolean not null default false,
  na_reason text not null default '',
  review_status app.vc_review not null default 'pending',
  needs_revision boolean not null default false,
  revision_note text not null default '',
  manual_lock boolean not null default false,
  origin text not null default 'manual' check (origin in ('ai', 'manual')),
  ai_state app.vc_ai_state not null default 'none',
  ai_description text not null default '',
  ai_customer_value text not null default '',
  ai_bottleneck text not null default '',
  ai_open_question text not null default '',
  sort_order integer not null default 0,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table app.vc_subactivities (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references app.vc_activities (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create table app.vc_activity_refs (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references app.vc_activities (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  ref_type app.vc_ref_type not null,
  ref_id uuid,
  label text not null default '',
  excerpt text not null default '',
  interpretation boolean not null default false,
  created_at timestamptz not null default now()
);

create table app.vc_dependencies (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references app.vc_activities (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  to_activity_id uuid references app.vc_activities (id) on delete set null,
  vrio_resource_id uuid references app.vrio_resources (id) on delete set null,
  partner_label text not null default '',
  kind text not null default 'other',
  description text not null default '',
  evidence_level app.vc_evidence not null default 'hypothesis',
  created_at timestamptz not null default now()
);

create table app.vc_imports (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.vc_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  chain_id uuid references app.vc_chains (id) on delete set null,
  file_kind text not null check (file_kind in ('xlsx', 'csv', 'pdf', 'pasted')),
  file_name text not null default '',
  content_hash text not null default '',
  entity_label text not null default '',
  period_label text not null default '',
  currency text not null default 'EUR',
  scale app.vc_scale not null default 'units',
  figure_type app.vc_figure_type not null default 'actual',
  scope_level app.vc_finance_scope not null default 'company',
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index vc_imports_hash_uidx on app.vc_imports (version_id, content_hash)
where content_hash <> '';

create table app.vc_lines (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references app.vc_imports (id) on delete cascade,
  version_id uuid not null references app.vc_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  row_index integer not null default 0,
  account_code text not null default '',
  description text not null default '',
  amount numeric(20, 4),
  source_location text not null default '',
  line_kind app.vc_line_kind not null default 'detail',
  extract_status app.vc_extract_status not null default 'proposed',
  in_scope boolean not null default true,
  out_scope_reason text not null default '',
  is_revenue boolean not null default false,
  uncertain boolean not null default false,
  formula boolean not null default false,
  possible_duplicate boolean not null default false,
  category_label text not null default '',
  owner_activity_id uuid references app.vc_activities (id) on delete set null
);

create table app.vc_allocations (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references app.vc_lines (id) on delete cascade,
  version_id uuid not null references app.vc_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  activity_id uuid not null references app.vc_activities (id) on delete restrict,
  amount numeric(20, 4),
  method text not null default 'direct',
  motivation text not null default '',
  formula text not null default '',
  status app.vc_alloc_status not null default 'proposed',
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table app.vc_actions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.vc_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  activity_id uuid references app.vc_activities (id) on delete set null,
  title text not null default '',
  problem text not null default '',
  expected_outcome text not null default '',
  owner_name text not null default '',
  evaluation text not null default '',
  deadline text not null default '',
  status app.vc_action_status not null default 'proposed',
  created_at timestamptz not null default now()
);

create table app.vc_ai_history (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.vc_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  activity_id uuid references app.vc_activities (id) on delete set null,
  proposed jsonb not null default '{}'::jsonb,
  decision text not null check (decision in ('accepted', 'rejected', 'superseded', 'proposed')),
  decided_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table app.vc_versions enable row level security;
alter table app.vc_chains enable row level security;
alter table app.vc_activities enable row level security;
alter table app.vc_subactivities enable row level security;
alter table app.vc_activity_refs enable row level security;
alter table app.vc_dependencies enable row level security;
alter table app.vc_imports enable row level security;
alter table app.vc_lines enable row level security;
alter table app.vc_allocations enable row level security;
alter table app.vc_actions enable row level security;
alter table app.vc_ai_history enable row level security;

create index vc_activities_chain_idx on app.vc_activities (chain_id) where archived_at is null;
create index vc_lines_import_idx on app.vc_lines (import_id);
create index vc_allocations_line_idx on app.vc_allocations (line_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function app._vc_version_for_edit(p_version_id uuid)
returns app.vc_versions
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.vc_versions;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_row from app.vc_versions where id = p_version_id;
  if v_row.id is null then
    raise exception 'Versie niet gevonden';
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  if v_row.status = 'approved'::app.vc_version_status then
    raise exception 'Goedgekeurde waardeketen is alleen-lezen; maak een nieuwe conceptversie';
  end if;
  return v_row;
end;
$$;

create or replace function app._vc_require_finance(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if not app.has_capability(p_tenant_id, 'finance.edit')
     and not app.has_capability(p_tenant_id, 'finance.upload') then
    raise exception 'Forbidden';
  end if;
end;
$$;

create or replace function app._vc_touch(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  update app.vc_versions
  set updated_at = now(),
      status = case
        when status = 'not_started'::app.vc_version_status then 'draft'::app.vc_version_status
        else status
      end,
      synthesis_reviewed = false
  where id = p_version_id;
end;
$$;

create or replace function app._vc_ref_valid(
  p_version app.vc_versions,
  p_type app.vc_ref_type,
  p_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
begin
  case p_type
    when 'tenant_profile' then
      return p_id is null or p_id = p_version.tenant_id;
    when 'manual', 'five_c_synthesis' then
      return true;
    when 'meeting' then
      return exists (
        select 1 from app.meeting_recordings m
        where m.id = p_id and m.tenant_id = p_version.tenant_id
      );
    when 'pestel_insight' then
      return exists (
        select 1 from app.pestel_insights i
        where i.id = p_id and i.tenant_id = p_version.tenant_id
          and i.version_id = p_version.pestel_version_id and i.deleted_at is null
      );
    when 'pestel_input' then
      return exists (
        select 1 from app.pestel_version_research_inputs inp
        where inp.id = p_id and inp.version_id = p_version.pestel_version_id
      );
    when 'porter_scope' then
      return p_id is not null and p_id = p_version.porter_version_id;
    when 'porter_force' then
      return exists (
        select 1 from app.porter_forces f
        where f.id = p_id and f.tenant_id = p_version.tenant_id and f.version_id = p_version.porter_version_id
      );
    when 'porter_factor' then
      return exists (
        select 1 from app.porter_factors pf
        where pf.id = p_id and pf.tenant_id = p_version.tenant_id
          and pf.version_id = p_version.porter_version_id and pf.deleted_at is null
      );
    when 'five_c_item' then
      return exists (
        select 1 from app.five_c_items fi
        where fi.id = p_id and fi.tenant_id = p_version.tenant_id
          and fi.version_id = p_version.five_c_version_id and fi.deleted_at is null
      );
    when 'swot_item' then
      return exists (
        select 1 from app.swot_items si
        where si.id = p_id and si.tenant_id = p_version.tenant_id
          and si.version_id = p_version.swot_version_id and si.deleted_at is null
      );
    when 'vrio_resource' then
      return exists (
        select 1 from app.vrio_resources r
        where r.id = p_id and r.tenant_id = p_version.tenant_id
          and r.version_id = p_version.vrio_version_id and r.deleted_at is null
      );
  end case;
  return false;
end;
$$;

create or replace function app._vc_replace_refs(
  p_activity_id uuid,
  p_version app.vc_versions,
  p_refs jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_ref jsonb;
  v_type app.vc_ref_type;
  v_id uuid;
begin
  delete from app.vc_activity_refs where activity_id = p_activity_id;
  for v_ref in select * from jsonb_array_elements(coalesce(p_refs, '[]'::jsonb))
  loop
    v_type := (v_ref->>'ref_type')::app.vc_ref_type;
    v_id := nullif(v_ref->>'ref_id', '')::uuid;
    if not app._vc_ref_valid(p_version, v_type, v_id) then
      raise exception 'Ongeldige bronverwijzing voor deze klant';
    end if;
    insert into app.vc_activity_refs (activity_id, tenant_id, ref_type, ref_id, label, excerpt, interpretation)
    values (
      p_activity_id, p_version.tenant_id, v_type, v_id,
      left(coalesce(v_ref->>'label', ''), 240),
      left(coalesce(v_ref->>'excerpt', ''), 600),
      coalesce((v_ref->>'interpretation')::boolean, false)
    );
  end loop;
end;
$$;

create or replace function app._vc_amount(p_text text)
returns numeric
language plpgsql
immutable
as $$
begin
  if p_text is null or btrim(p_text) = '' then
    return null;
  end if;
  return btrim(p_text)::numeric;
exception when others then
  raise exception 'Bedrag is geen geldig getal';
end;
$$;

-- ---------------------------------------------------------------------------
-- Workbench
-- ---------------------------------------------------------------------------

create or replace function app.get_vc_workbench(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.vc_versions;
  v_vrio_approved app.vrio_versions;
  v_tenant app.tenants;
  v_finance boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  v_finance := app.has_capability(p_tenant_id, 'finance.read');

  select * into v_tenant from app.tenants where id = p_tenant_id and deleted_at is null;
  if v_tenant.id is null then
    raise exception 'Klant niet gevonden';
  end if;

  select * into v_vrio_approved
  from app.vrio_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.vrio_version_status
  order by version_number desc limit 1;

  select * into v_version
  from app.vc_versions
  where tenant_id = p_tenant_id and status <> 'approved'::app.vc_version_status
  order by version_number desc limit 1;

  if v_version.id is null then
    select * into v_version from app.vc_versions
    where tenant_id = p_tenant_id order by version_number desc limit 1;
  end if;

  if v_version.id is null then
    insert into app.vc_versions (
      tenant_id, version_number, status,
      vrio_version_id, swot_version_id, five_c_version_id, porter_version_id, pestel_version_id, created_by
    )
    values (
      p_tenant_id, 1, 'not_started',
      v_vrio_approved.id,
      coalesce(v_vrio_approved.swot_version_id, (select id from app.swot_versions where tenant_id = p_tenant_id and status = 'approved'::app.swot_version_status order by version_number desc limit 1)),
      coalesce(v_vrio_approved.five_c_version_id, (select id from app.five_c_versions where tenant_id = p_tenant_id and status = 'approved'::app.five_c_version_status order by version_number desc limit 1)),
      coalesce(v_vrio_approved.porter_version_id, (select id from app.porter_versions where tenant_id = p_tenant_id and status = 'approved'::app.porter_version_status order by version_number desc limit 1)),
      coalesce(v_vrio_approved.pestel_version_id, (select id from app.pestel_versions where tenant_id = p_tenant_id and status = 'approved'::app.pestel_version_status order by version_number desc limit 1)),
      auth.uid()
    )
    returning * into v_version;

    insert into app.vc_chains (version_id, tenant_id, business_type)
    values (v_version.id, p_tenant_id, 'service');
  end if;

  return jsonb_build_object(
    'finance_access', v_finance,
    'version', jsonb_build_object(
      'id', v_version.id,
      'version_number', v_version.version_number,
      'status', v_version.status,
      'pestel_version_id', v_version.pestel_version_id,
      'porter_version_id', v_version.porter_version_id,
      'five_c_version_id', v_version.five_c_version_id,
      'swot_version_id', v_version.swot_version_id,
      'vrio_version_id', v_version.vrio_version_id,
      'synthesis_text', v_version.synthesis_text,
      'synthesis_public', v_version.synthesis_public,
      'synthesis_reviewed', v_version.synthesis_reviewed,
      'publish_financials', v_version.publish_financials,
      'finance_deferred', v_version.finance_deferred,
      'cost_rate', case when v_finance then v_version.cost_rate else null end,
      'cost_rate_confirmed', v_version.cost_rate_confirmed,
      'cost_rate_currency', case when v_finance then v_version.cost_rate_currency else '' end,
      'cost_rate_unit', v_version.cost_rate_unit,
      'ai_generated_at', v_version.ai_generated_at,
      'approved_at', v_version.approved_at,
      'updated_at', v_version.updated_at
    ),
    'upstream', jsonb_build_object(
      'pestel', (select jsonb_build_object('id', id, 'version_number', version_number, 'status', status) from app.pestel_versions where id = v_version.pestel_version_id),
      'porter', (select jsonb_build_object('id', id, 'version_number', version_number, 'status', status) from app.porter_versions where id = v_version.porter_version_id),
      'five_c', (select jsonb_build_object('id', id, 'version_number', version_number, 'status', status) from app.five_c_versions where id = v_version.five_c_version_id),
      'swot', (select jsonb_build_object('id', id, 'version_number', version_number, 'status', status) from app.swot_versions where id = v_version.swot_version_id),
      'vrio', (select jsonb_build_object('id', id, 'version_number', version_number, 'status', status) from app.vrio_versions where id = v_version.vrio_version_id),
      'latest_vrio_approved', case when v_vrio_approved.id is null then null else jsonb_build_object('id', v_vrio_approved.id, 'version_number', v_vrio_approved.version_number) end
    ),
    'chains', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'offering', c.offering,
        'business_type', c.business_type,
        'market', c.market,
        'period_label', c.period_label,
        'goal', c.goal,
        'scope_confirmed', c.scope_confirmed,
        'needs_revision', c.needs_revision,
        'sort_order', c.sort_order,
        'activities', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', a.id,
            'chain_id', a.chain_id,
            'name', a.name,
            'category', a.category,
            'description', a.description,
            'inputs_text', a.inputs_text,
            'outputs_text', a.outputs_text,
            'customer_value', a.customer_value,
            'capabilities_note', a.capabilities_note,
            'owner_name', a.owner_name,
            'execution', a.execution,
            'time_value', a.time_value,
            'time_unit', a.time_unit,
            'time_scope', a.time_scope,
            'time_basis', a.time_basis,
            'time_source', a.time_source,
            'bottleneck_observation', a.bottleneck_observation,
            'bottleneck_explanation', a.bottleneck_explanation,
            'bottleneck_improvement', a.bottleneck_improvement,
            'bottleneck_effect', a.bottleneck_effect,
            'bottleneck_motivation', a.bottleneck_motivation,
            'open_question', a.open_question,
            'question_status', a.question_status,
            'question_answer', a.question_answer,
            'advisor_note', a.advisor_note,
            'evidence_level', a.evidence_level,
            'not_applicable', a.not_applicable,
            'na_reason', a.na_reason,
            'review_status', a.review_status,
            'needs_revision', a.needs_revision,
            'revision_note', a.revision_note,
            'manual_lock', a.manual_lock,
            'origin', a.origin,
            'ai_state', a.ai_state,
            'ai_description', a.ai_description,
            'ai_customer_value', a.ai_customer_value,
            'ai_bottleneck', a.ai_bottleneck,
            'ai_open_question', a.ai_open_question,
            'sort_order', a.sort_order,
            'updated_at', a.updated_at,
            'refs', coalesce((
              select jsonb_agg(jsonb_build_object(
                'ref_type', r.ref_type, 'ref_id', r.ref_id, 'label', r.label,
                'excerpt', r.excerpt, 'interpretation', r.interpretation
              ) order by r.created_at)
              from app.vc_activity_refs r where r.activity_id = a.id
            ), '[]'::jsonb),
            'subactivities', coalesce((
              select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'sort_order', s.sort_order) order by s.sort_order)
              from app.vc_subactivities s where s.activity_id = a.id
            ), '[]'::jsonb),
            'dependencies', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', d.id, 'to_activity_id', d.to_activity_id, 'vrio_resource_id', d.vrio_resource_id,
                'partner_label', d.partner_label, 'kind', d.kind, 'description', d.description,
                'evidence_level', d.evidence_level
              ))
              from app.vc_dependencies d where d.activity_id = a.id
            ), '[]'::jsonb)
          ) order by a.sort_order, a.created_at)
          from app.vc_activities a
          where a.chain_id = c.id and a.archived_at is null
        ), '[]'::jsonb)
      ) order by c.sort_order, c.created_at)
      from app.vc_chains c
      where c.version_id = v_version.id and c.archived_at is null
    ), '[]'::jsonb),
    'imports', case when not v_finance then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'chain_id', i.chain_id, 'file_kind', i.file_kind, 'file_name', i.file_name,
        'entity_label', i.entity_label, 'period_label', i.period_label, 'currency', i.currency,
        'scale', i.scale, 'figure_type', i.figure_type, 'scope_level', i.scope_level, 'status', i.status,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', l.id, 'import_id', l.import_id, 'row_index', l.row_index, 'account_code', l.account_code,
            'description', l.description, 'amount', l.amount, 'source_location', l.source_location,
            'line_kind', l.line_kind, 'extract_status', l.extract_status, 'in_scope', l.in_scope,
            'out_scope_reason', l.out_scope_reason, 'is_revenue', l.is_revenue, 'uncertain', l.uncertain,
            'formula', l.formula, 'possible_duplicate', l.possible_duplicate, 'category_label', l.category_label,
            'owner_activity_id', l.owner_activity_id
          ) order by l.row_index)
          from app.vc_lines l where l.import_id = i.id
        ), '[]'::jsonb)
      ) order by i.created_at)
      from app.vc_imports i where i.version_id = v_version.id
    ), '[]'::jsonb) end,
    'allocations', case when not v_finance then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', al.id, 'line_id', al.line_id, 'activity_id', al.activity_id, 'amount', al.amount,
        'method', al.method, 'motivation', al.motivation, 'formula', al.formula, 'status', al.status
      ))
      from app.vc_allocations al where al.version_id = v_version.id
    ), '[]'::jsonb) end,
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ac.id, 'activity_id', ac.activity_id, 'title', ac.title, 'problem', ac.problem,
        'expected_outcome', ac.expected_outcome, 'owner_name', ac.owner_name,
        'evaluation', ac.evaluation, 'deadline', ac.deadline, 'status', ac.status
      ) order by ac.created_at)
      from app.vc_actions ac where ac.version_id = v_version.id
    ), '[]'::jsonb),
    'inputs', jsonb_build_object(
      'tenant', jsonb_build_object('id', v_tenant.id, 'name', v_tenant.name, 'website', v_tenant.website, 'audit_goal', v_tenant.audit_goal),
      'swot_items', coalesce((
        select jsonb_agg(jsonb_build_object('id', si.id, 'quadrant', si.quadrant, 'statement', si.statement) order by si.sort_order)
        from app.swot_items si
        where si.version_id = v_version.swot_version_id and si.deleted_at is null
      ), '[]'::jsonb),
      'five_c_items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', fi.id, 'c_key', fi.c_key, 'title', fi.title, 'finding', left(fi.finding, 1500),
          'client_relevance', left(fi.client_relevance, 800), 'evidence_level', fi.evidence_level
        ) order by fi.c_key, fi.sort_order)
        from app.five_c_items fi
        where fi.version_id = v_version.five_c_version_id and fi.deleted_at is null
          and fi.review_status <> 'rejected'::app.five_c_review
          and fi.content_type <> 'input_needed'::app.five_c_content_type
      ), '[]'::jsonb),
      'five_c_synthesis', (select left(synthesis_text, 4000) from app.five_c_versions where id = v_version.five_c_version_id),
      'porter_forces', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id, 'force_key', f.force_key, 'intensity', f.intensity,
          'headline_factor', f.headline_factor, 'motivation', left(f.motivation, 1500)
        ) order by f.sort_order)
        from app.porter_forces f where f.version_id = v_version.porter_version_id
      ), '[]'::jsonb),
      'porter_scope', (select jsonb_build_object('id', p.id, 'market_sector', p.market_sector, 'synthesis_text', left(p.synthesis_text, 2000)) from app.porter_versions p where p.id = v_version.porter_version_id),
      'pestel_insights', coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'dimension', i.dimension, 'title', i.title, 'observation', left(i.observation, 1200)) order by i.dimension, i.sort_order)
        from app.pestel_insights i
        where i.version_id = v_version.pestel_version_id and i.deleted_at is null
          and i.review_status <> 'rejected'::app.pestel_insight_review
      ), '[]'::jsonb),
      'meetings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'title', coalesce(nullif(trim(m.title), ''), to_char(m.created_at, 'YYYY-MM-DD')),
          'text', left(coalesce(nullif(trim(m.summary_text), ''), left(coalesce(m.full_text, ''), 3000)), 3000)
        ) order by m.created_at desc)
        from (
          select * from app.meeting_recordings
          where tenant_id = p_tenant_id and transcript_status = 'ready'
          order by created_at desc limit 12
        ) m
      ), '[]'::jsonb),
      'documents', coalesce((
        select jsonb_agg(jsonb_build_object('id', inp.id, 'kind', inp.kind, 'label', inp.label, 'excerpt', left(coalesce(inp.excerpt, ''), 2000)))
        from app.pestel_version_research_inputs inp
        where inp.version_id = v_version.pestel_version_id and inp.kind in ('document', 'note')
      ), '[]'::jsonb),
      'vrio_resources', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'title', r.title, 'description', left(r.description, 1000), 'evidence_level', r.evidence_level,
          'outcome', app.vrio_outcome(
            coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'value'), 'not_assessed'),
            coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'rarity'), 'not_assessed'),
            coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'imitability'), 'not_assessed'),
            coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'organization'), 'not_assessed')
          )
        ))
        from app.vrio_resources r
        where r.version_id = v_version.vrio_version_id and r.deleted_at is null and r.selected
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Keten en activiteiten
-- ---------------------------------------------------------------------------

create or replace function app.save_vc_chain(
  p_chain_id uuid,
  p_offering text,
  p_business_type text,
  p_market text,
  p_period text,
  p_goal text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_chain app.vc_chains;
  v_version app.vc_versions;
  v_changed boolean;
begin
  select * into v_chain from app.vc_chains where id = p_chain_id and archived_at is null;
  if v_chain.id is null then
    raise exception 'Waardeketen niet gevonden';
  end if;
  v_version := app._vc_version_for_edit(v_chain.version_id);
  v_changed := v_chain.scope_confirmed and (
    v_chain.offering is distinct from left(btrim(coalesce(p_offering, '')), 200)
    or v_chain.business_type::text is distinct from p_business_type
    or v_chain.market is distinct from left(btrim(coalesce(p_market, '')), 200)
    or v_chain.period_label is distinct from left(btrim(coalesce(p_period, '')), 120)
  );
  update app.vc_chains
  set offering = left(btrim(coalesce(p_offering, '')), 200),
      business_type = p_business_type::app.vc_business_type,
      market = left(btrim(coalesce(p_market, '')), 200),
      period_label = left(btrim(coalesce(p_period, '')), 120),
      goal = left(btrim(coalesce(p_goal, '')), 500),
      scope_confirmed = char_length(btrim(coalesce(p_offering, ''))) >= 2,
      needs_revision = v_changed or needs_revision,
      updated_at = now()
  where id = p_chain_id;
  if v_changed then
    update app.vc_activities
    set needs_revision = true,
        revision_note = 'Afbakening gewijzigd',
        review_status = 'pending'::app.vc_review
    where chain_id = p_chain_id and archived_at is null;
  end if;
  perform app._vc_touch(v_version.id);
end;
$$;

create or replace function app.add_vc_chain(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.vc_versions;
  v_id uuid;
begin
  v_version := app._vc_version_for_edit(p_version_id);
  insert into app.vc_chains (version_id, tenant_id, business_type, sort_order)
  values (
    v_version.id, v_version.tenant_id, 'service',
    (select coalesce(max(sort_order), 0) + 1 from app.vc_chains where version_id = v_version.id)
  )
  returning id into v_id;
  perform app._vc_touch(v_version.id);
  return v_id;
end;
$$;

create or replace function app.upsert_vc_activity(
  p_chain_id uuid,
  p_activity_id uuid,
  p_name text,
  p_category text,
  p_description text,
  p_inputs text,
  p_outputs text,
  p_customer_value text,
  p_capabilities text,
  p_owner text,
  p_execution text,
  p_time_value text,
  p_time_unit text,
  p_time_scope text,
  p_time_basis text,
  p_time_source text,
  p_observation text,
  p_explanation text,
  p_improvement text,
  p_effect text,
  p_motivation text,
  p_open_question text,
  p_question_status text,
  p_question_answer text,
  p_advisor_note text,
  p_evidence text,
  p_refs jsonb,
  p_subactivities jsonb,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_chain app.vc_chains;
  v_version app.vc_versions;
  v_id uuid;
  v_existing app.vc_activities;
  v_sub jsonb;
begin
  select * into v_chain from app.vc_chains where id = p_chain_id and archived_at is null;
  if v_chain.id is null then
    raise exception 'Waardeketen niet gevonden';
  end if;
  v_version := app._vc_version_for_edit(v_chain.version_id);
  if char_length(btrim(coalesce(p_name, ''))) < 2 then
    raise exception 'Geef de activiteit een naam';
  end if;

  if p_activity_id is not null then
    select * into v_existing from app.vc_activities where id = p_activity_id and chain_id = p_chain_id and archived_at is null;
    if v_existing.id is null then
      raise exception 'Activiteit niet gevonden';
    end if;
    if p_expected_updated_at is not null and v_existing.updated_at <> p_expected_updated_at then
      raise exception 'Deze activiteit is intussen gewijzigd. Herlaad en probeer opnieuw.';
    end if;
    update app.vc_activities set
      name = left(btrim(p_name), 160),
      category = p_category::app.vc_category,
      description = left(coalesce(p_description, ''), 4000),
      inputs_text = left(coalesce(p_inputs, ''), 2000),
      outputs_text = left(coalesce(p_outputs, ''), 2000),
      customer_value = left(coalesce(p_customer_value, ''), 2000),
      capabilities_note = left(coalesce(p_capabilities, ''), 2000),
      owner_name = left(coalesce(p_owner, ''), 160),
      execution = coalesce(nullif(p_execution, ''), 'unknown')::app.vc_execution,
      time_value = app._vc_amount(p_time_value),
      time_unit = left(coalesce(p_time_unit, ''), 40),
      time_scope = left(coalesce(p_time_scope, ''), 160),
      time_basis = coalesce(nullif(p_time_basis, ''), 'unknown')::app.vc_time_basis,
      time_source = left(coalesce(p_time_source, ''), 240),
      bottleneck_observation = left(coalesce(p_observation, ''), 2000),
      bottleneck_explanation = left(coalesce(p_explanation, ''), 2000),
      bottleneck_improvement = left(coalesce(p_improvement, ''), 2000),
      bottleneck_effect = left(coalesce(p_effect, ''), 40),
      bottleneck_motivation = left(coalesce(p_motivation, ''), 1000),
      open_question = left(coalesce(p_open_question, ''), 500),
      question_status = coalesce(nullif(p_question_status, ''), 'open')::app.vc_question_status,
      question_answer = left(coalesce(p_question_answer, ''), 2000),
      advisor_note = left(coalesce(p_advisor_note, ''), 2000),
      evidence_level = coalesce(nullif(p_evidence, ''), 'hypothesis')::app.vc_evidence,
      manual_lock = true,
      origin = case when origin = 'ai' and manual_lock then origin else 'manual' end,
      review_status = 'pending'::app.vc_review,
      updated_at = now()
    where id = p_activity_id;
    v_id := p_activity_id;
  else
    insert into app.vc_activities (
      chain_id, version_id, tenant_id, name, category, description, inputs_text, outputs_text,
      customer_value, capabilities_note, owner_name, execution, time_value, time_unit, time_scope,
      time_basis, time_source, bottleneck_observation, bottleneck_explanation, bottleneck_improvement,
      bottleneck_effect, bottleneck_motivation, open_question, question_status, question_answer,
      advisor_note, evidence_level, manual_lock, origin, sort_order
    ) values (
      p_chain_id, v_version.id, v_version.tenant_id, left(btrim(p_name), 160), p_category::app.vc_category,
      left(coalesce(p_description, ''), 4000), left(coalesce(p_inputs, ''), 2000), left(coalesce(p_outputs, ''), 2000),
      left(coalesce(p_customer_value, ''), 2000), left(coalesce(p_capabilities, ''), 2000), left(coalesce(p_owner, ''), 160),
      coalesce(nullif(p_execution, ''), 'unknown')::app.vc_execution, app._vc_amount(p_time_value),
      left(coalesce(p_time_unit, ''), 40), left(coalesce(p_time_scope, ''), 160),
      coalesce(nullif(p_time_basis, ''), 'unknown')::app.vc_time_basis, left(coalesce(p_time_source, ''), 240),
      left(coalesce(p_observation, ''), 2000), left(coalesce(p_explanation, ''), 2000), left(coalesce(p_improvement, ''), 2000),
      left(coalesce(p_effect, ''), 40), left(coalesce(p_motivation, ''), 1000),
      left(coalesce(p_open_question, ''), 500), coalesce(nullif(p_question_status, ''), 'open')::app.vc_question_status,
      left(coalesce(p_question_answer, ''), 2000), left(coalesce(p_advisor_note, ''), 2000),
      coalesce(nullif(p_evidence, ''), 'hypothesis')::app.vc_evidence, true, 'manual',
      (select coalesce(max(sort_order), 0) + 1 from app.vc_activities where chain_id = p_chain_id)
    ) returning id into v_id;
  end if;

  perform app._vc_replace_refs(v_id, v_version, p_refs);
  delete from app.vc_subactivities where activity_id = v_id;
  for v_sub in select * from jsonb_array_elements(coalesce(p_subactivities, '[]'::jsonb))
  loop
    if char_length(btrim(coalesce(v_sub->>'name', ''))) >= 2 then
      insert into app.vc_subactivities (activity_id, tenant_id, name, sort_order)
      values (v_id, v_version.tenant_id, left(btrim(v_sub->>'name'), 160), coalesce((v_sub->>'sort_order')::int, 0));
    end if;
  end loop;
  perform app._vc_touch(v_version.id);
  return v_id;
end;
$$;

create or replace function app.archive_vc_activity(p_activity_id uuid, p_detach boolean)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_activity app.vc_activities;
  v_alloc int;
begin
  select * into v_activity from app.vc_activities where id = p_activity_id and archived_at is null;
  if v_activity.id is null then
    raise exception 'Activiteit niet gevonden';
  end if;
  perform app._vc_version_for_edit(v_activity.version_id);
  select count(*) into v_alloc from app.vc_allocations where activity_id = p_activity_id and amount is not null;
  if v_alloc > 0 and not coalesce(p_detach, false) then
    raise exception 'Deze activiteit heeft % kostentoewijzing(en). Bevestig dat die terug naar niet-toegewezen gaan.', v_alloc;
  end if;
  if v_alloc > 0 then
    delete from app.vc_allocations where activity_id = p_activity_id;
    update app.vc_lines set owner_activity_id = null where owner_activity_id = p_activity_id;
  end if;
  update app.vc_activities set archived_at = now() where id = p_activity_id;
  perform app._vc_touch(v_activity.version_id);
end;
$$;

create or replace function app.merge_vc_activities(p_target_id uuid, p_source_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_target app.vc_activities;
  v_source app.vc_activities;
begin
  select * into v_target from app.vc_activities where id = p_target_id and archived_at is null;
  select * into v_source from app.vc_activities where id = p_source_id and archived_at is null;
  if v_target.id is null or v_source.id is null or v_target.chain_id <> v_source.chain_id then
    raise exception 'Activiteiten kunnen niet worden samengevoegd';
  end if;
  perform app._vc_version_for_edit(v_target.version_id);
  update app.vc_activity_refs set activity_id = p_target_id where activity_id = p_source_id;
  update app.vc_subactivities set activity_id = p_target_id where activity_id = p_source_id;
  update app.vc_dependencies set activity_id = p_target_id where activity_id = p_source_id;
  update app.vc_allocations set activity_id = p_target_id where activity_id = p_source_id;
  update app.vc_lines set owner_activity_id = p_target_id where owner_activity_id = p_source_id;
  update app.vc_activities set archived_at = now() where id = p_source_id;
  update app.vc_activities set manual_lock = true, review_status = 'pending'::app.vc_review, updated_at = now() where id = p_target_id;
  perform app._vc_touch(v_target.version_id);
end;
$$;

create or replace function app.set_vc_applicability(p_activity_id uuid, p_applicable boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_activity app.vc_activities;
begin
  select * into v_activity from app.vc_activities where id = p_activity_id and archived_at is null;
  if v_activity.id is null then
    raise exception 'Activiteit niet gevonden';
  end if;
  perform app._vc_version_for_edit(v_activity.version_id);
  if not p_applicable and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Geef een reden waarom deze activiteit niet van toepassing is';
  end if;
  update app.vc_activities
  set not_applicable = not p_applicable,
      na_reason = case when p_applicable then '' else left(btrim(p_reason), 500) end,
      updated_at = now()
  where id = p_activity_id;
  perform app._vc_touch(v_activity.version_id);
end;
$$;

create or replace function app.set_vc_activity_review(p_activity_id uuid, p_reviewed boolean)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_activity app.vc_activities;
begin
  select * into v_activity from app.vc_activities where id = p_activity_id and archived_at is null;
  if v_activity.id is null then
    raise exception 'Activiteit niet gevonden';
  end if;
  perform app._vc_version_for_edit(v_activity.version_id);
  if p_reviewed and char_length(btrim(v_activity.name)) < 2 then
    raise exception 'Een lege activiteit kan niet beoordeeld zijn';
  end if;
  update app.vc_activities
  set review_status = case when p_reviewed then 'reviewed'::app.vc_review else 'pending'::app.vc_review end,
      needs_revision = case when p_reviewed then false else needs_revision end,
      reviewed_by = case when p_reviewed then auth.uid() else null end,
      reviewed_at = case when p_reviewed then now() else null end,
      updated_at = now()
  where id = p_activity_id;
end;
$$;

create or replace function app.save_vc_dependency(
  p_activity_id uuid,
  p_dependency_id uuid,
  p_to_activity_id uuid,
  p_vrio_resource_id uuid,
  p_partner_label text,
  p_kind text,
  p_description text,
  p_evidence text
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_activity app.vc_activities;
  v_id uuid;
begin
  select * into v_activity from app.vc_activities where id = p_activity_id and archived_at is null;
  if v_activity.id is null then
    raise exception 'Activiteit niet gevonden';
  end if;
  perform app._vc_version_for_edit(v_activity.version_id);
  if p_dependency_id is null then
    insert into app.vc_dependencies (
      activity_id, tenant_id, to_activity_id, vrio_resource_id, partner_label, kind, description, evidence_level
    ) values (
      p_activity_id, v_activity.tenant_id, p_to_activity_id, p_vrio_resource_id,
      left(coalesce(p_partner_label, ''), 200), left(coalesce(p_kind, 'other'), 40),
      left(coalesce(p_description, ''), 1000), coalesce(nullif(p_evidence, ''), 'hypothesis')::app.vc_evidence
    ) returning id into v_id;
  else
    update app.vc_dependencies set
      to_activity_id = p_to_activity_id,
      vrio_resource_id = p_vrio_resource_id,
      partner_label = left(coalesce(p_partner_label, ''), 200),
      kind = left(coalesce(p_kind, 'other'), 40),
      description = left(coalesce(p_description, ''), 1000),
      evidence_level = coalesce(nullif(p_evidence, ''), 'hypothesis')::app.vc_evidence
    where id = p_dependency_id and activity_id = p_activity_id
    returning id into v_id;
  end if;
  perform app._vc_touch(v_activity.version_id);
  return v_id;
end;
$$;

create or replace function app.delete_vc_dependency(p_dependency_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_dep app.vc_dependencies;
  v_activity app.vc_activities;
begin
  select * into v_dep from app.vc_dependencies where id = p_dependency_id;
  if v_dep.id is null then
    return;
  end if;
  select * into v_activity from app.vc_activities where id = v_dep.activity_id;
  perform app._vc_version_for_edit(v_activity.version_id);
  delete from app.vc_dependencies where id = p_dependency_id;
  perform app._vc_touch(v_activity.version_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- AI: voorstellen, nooit een goedkeuring of definitieve toewijzing
-- ---------------------------------------------------------------------------

create or replace function app.save_vc_ai_result(
  p_chain_id uuid,
  p_activities jsonb,
  p_synthesis text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_chain app.vc_chains;
  v_version app.vc_versions;
  v_row jsonb;
  v_existing app.vc_activities;
  v_id uuid;
begin
  select * into v_chain from app.vc_chains where id = p_chain_id and archived_at is null;
  if v_chain.id is null then
    raise exception 'Waardeketen niet gevonden';
  end if;
  v_version := app._vc_version_for_edit(v_chain.version_id);

  for v_row in select * from jsonb_array_elements(coalesce(p_activities, '[]'::jsonb))
  loop
    v_existing := null;
    if nullif(v_row->>'activity_id', '') is not null then
      select * into v_existing from app.vc_activities
      where id = (v_row->>'activity_id')::uuid and chain_id = p_chain_id and archived_at is null;
    end if;
    if v_existing.id is null then
      select * into v_existing from app.vc_activities
      where chain_id = p_chain_id and archived_at is null
        and category = (v_row->>'category')::app.vc_category
        and lower(name) = lower(left(btrim(v_row->>'name'), 160))
      limit 1;
    end if;

    if v_existing.id is not null and (v_existing.manual_lock or v_existing.review_status = 'reviewed'::app.vc_review) then
      update app.vc_activities set
        ai_state = 'proposed'::app.vc_ai_state,
        ai_description = left(coalesce(v_row->>'description', ''), 4000),
        ai_customer_value = left(coalesce(v_row->>'customer_value', ''), 2000),
        ai_bottleneck = left(coalesce(v_row->>'bottleneck_observation', ''), 2000),
        ai_open_question = left(coalesce(v_row->>'open_question', ''), 500)
      where id = v_existing.id;
      insert into app.vc_ai_history (version_id, tenant_id, activity_id, proposed, decision)
      values (v_version.id, v_version.tenant_id, v_existing.id, v_row, 'proposed');
    else
      if v_existing.id is null then
        insert into app.vc_activities (
          chain_id, version_id, tenant_id, name, category, description, inputs_text, outputs_text,
          customer_value, execution, bottleneck_observation, bottleneck_explanation, bottleneck_improvement,
          open_question, evidence_level, origin, ai_state, sort_order
        ) values (
          p_chain_id, v_version.id, v_version.tenant_id,
          left(btrim(v_row->>'name'), 160), (v_row->>'category')::app.vc_category,
          left(coalesce(v_row->>'description', ''), 4000),
          left(coalesce(v_row->>'inputs_text', ''), 2000),
          left(coalesce(v_row->>'outputs_text', ''), 2000),
          left(coalesce(v_row->>'customer_value', ''), 2000),
          coalesce(nullif(v_row->>'execution', ''), 'unknown')::app.vc_execution,
          left(coalesce(v_row->>'bottleneck_observation', ''), 2000),
          left(coalesce(v_row->>'bottleneck_explanation', ''), 2000),
          left(coalesce(v_row->>'bottleneck_improvement', ''), 2000),
          left(coalesce(v_row->>'open_question', ''), 500),
          coalesce(nullif(v_row->>'evidence_level', ''), 'hypothesis')::app.vc_evidence,
          'ai', 'accepted'::app.vc_ai_state,
          (select coalesce(max(sort_order), 0) + 1 from app.vc_activities where chain_id = p_chain_id)
        ) returning id into v_id;
      else
        update app.vc_activities set
          description = left(coalesce(v_row->>'description', ''), 4000),
          inputs_text = left(coalesce(v_row->>'inputs_text', ''), 2000),
          outputs_text = left(coalesce(v_row->>'outputs_text', ''), 2000),
          customer_value = left(coalesce(v_row->>'customer_value', ''), 2000),
          execution = coalesce(nullif(v_row->>'execution', ''), 'unknown')::app.vc_execution,
          bottleneck_observation = left(coalesce(v_row->>'bottleneck_observation', ''), 2000),
          bottleneck_explanation = left(coalesce(v_row->>'bottleneck_explanation', ''), 2000),
          bottleneck_improvement = left(coalesce(v_row->>'bottleneck_improvement', ''), 2000),
          open_question = left(coalesce(v_row->>'open_question', ''), 500),
          evidence_level = coalesce(nullif(v_row->>'evidence_level', ''), 'hypothesis')::app.vc_evidence,
          ai_state = 'accepted'::app.vc_ai_state,
          updated_at = now()
        where id = v_existing.id;
        v_id := v_existing.id;
      end if;
      perform app._vc_replace_refs(v_id, v_version, v_row->'refs');
      insert into app.vc_ai_history (version_id, tenant_id, activity_id, proposed, decision, decided_by)
      values (v_version.id, v_version.tenant_id, v_id, v_row, 'accepted', auth.uid());
    end if;
  end loop;

  update app.vc_versions
  set ai_generated_at = now(),
      synthesis_text = case
        when synthesis_reviewed or char_length(btrim(synthesis_text)) >= 20 then synthesis_text
        else left(coalesce(p_synthesis, ''), 8000)
      end
  where id = v_version.id;
  perform app._vc_touch(v_version.id);
end;
$$;

create or replace function app.resolve_vc_ai_proposal(p_activity_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_activity app.vc_activities;
begin
  select * into v_activity from app.vc_activities where id = p_activity_id and archived_at is null;
  if v_activity.id is null then
    raise exception 'Activiteit niet gevonden';
  end if;
  perform app._vc_version_for_edit(v_activity.version_id);
  if v_activity.ai_state <> 'proposed'::app.vc_ai_state then
    raise exception 'Er staat geen voorstel open';
  end if;
  if p_accept then
    update app.vc_activities set
      description = case when ai_description <> '' then ai_description else description end,
      customer_value = case when ai_customer_value <> '' then ai_customer_value else customer_value end,
      bottleneck_observation = case when ai_bottleneck <> '' then ai_bottleneck else bottleneck_observation end,
      open_question = case when ai_open_question <> '' then ai_open_question else open_question end,
      ai_state = 'accepted'::app.vc_ai_state,
      review_status = 'pending'::app.vc_review,
      updated_at = now()
    where id = p_activity_id;
  else
    update app.vc_activities set ai_state = 'rejected'::app.vc_ai_state, updated_at = now() where id = p_activity_id;
  end if;
  insert into app.vc_ai_history (version_id, tenant_id, activity_id, proposed, decision, decided_by)
  values (
    v_activity.version_id, v_activity.tenant_id, p_activity_id,
    jsonb_build_object('description', v_activity.ai_description),
    case when p_accept then 'accepted' else 'rejected' end,
    auth.uid()
  );
end;
$$;

create or replace function app.save_vc_synthesis(
  p_version_id uuid,
  p_text text,
  p_public text,
  p_reviewed boolean
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.vc_versions;
begin
  v_version := app._vc_version_for_edit(p_version_id);
  if p_reviewed and char_length(btrim(coalesce(p_text, ''))) < 20 then
    raise exception 'De synthese is nog te kort om als beoordeeld te gelden';
  end if;
  if p_reviewed and not v_version.publish_financials and p_public ~ '[€$]|[0-9]+[.,][0-9]{2}' then
    raise exception 'De publieke synthese bevat bedragen. Publiceer financiële details expliciet, of haal de cijfers eruit.';
  end if;
  update app.vc_versions
  set synthesis_text = left(coalesce(p_text, ''), 8000),
      synthesis_public = left(coalesce(p_public, ''), 8000),
      synthesis_reviewed = coalesce(p_reviewed, false),
      updated_at = now()
  where id = p_version_id;
end;
$$;

create or replace function app.save_vc_action(
  p_version_id uuid,
  p_action_id uuid,
  p_activity_id uuid,
  p_title text,
  p_problem text,
  p_outcome text,
  p_owner text,
  p_evaluation text,
  p_deadline text,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.vc_versions;
  v_id uuid;
  v_status app.vc_action_status;
begin
  v_version := app._vc_version_for_edit(p_version_id);
  v_status := coalesce(nullif(p_status, ''), 'proposed')::app.vc_action_status;
  if char_length(btrim(coalesce(p_title, ''))) < 3 then
    raise exception 'Geef de actie een naam';
  end if;
  if p_action_id is null then
    insert into app.vc_actions (version_id, tenant_id, activity_id, title, problem, expected_outcome, owner_name, evaluation, deadline, status)
    values (
      v_version.id, v_version.tenant_id, p_activity_id, left(btrim(p_title), 200),
      left(coalesce(p_problem, ''), 1000), left(coalesce(p_outcome, ''), 1000),
      left(coalesce(p_owner, ''), 160), left(coalesce(p_evaluation, ''), 500),
      left(coalesce(p_deadline, ''), 40), v_status
    ) returning id into v_id;
  else
    update app.vc_actions set
      activity_id = p_activity_id,
      title = left(btrim(p_title), 200),
      problem = left(coalesce(p_problem, ''), 1000),
      expected_outcome = left(coalesce(p_outcome, ''), 1000),
      owner_name = left(coalesce(p_owner, ''), 160),
      evaluation = left(coalesce(p_evaluation, ''), 500),
      deadline = left(coalesce(p_deadline, ''), 40),
      status = v_status
    where id = p_action_id and version_id = v_version.id
    returning id into v_id;
  end if;
  perform app._vc_touch(v_version.id);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Financiën
-- ---------------------------------------------------------------------------

create or replace function app.save_vc_import(
  p_version_id uuid,
  p_chain_id uuid,
  p_file_kind text,
  p_file_name text,
  p_content_hash text,
  p_entity text,
  p_period text,
  p_currency text,
  p_scale text,
  p_figure_type text,
  p_scope_level text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.vc_versions;
  v_id uuid;
  v_line jsonb;
  v_amount numeric;
  v_uncertain boolean;
  v_formula boolean;
begin
  v_version := app._vc_version_for_edit(p_version_id);
  perform app._vc_require_finance(v_version.tenant_id);
  if exists (
    select 1 from app.vc_imports
    where version_id = p_version_id and content_hash = coalesce(p_content_hash, '') and content_hash <> ''
  ) then
    raise exception 'Dit document is al geïmporteerd in deze versie';
  end if;

  insert into app.vc_imports (
    version_id, tenant_id, chain_id, file_kind, file_name, content_hash,
    entity_label, period_label, currency, scale, figure_type, scope_level, created_by
  ) values (
    v_version.id, v_version.tenant_id, p_chain_id,
    coalesce(nullif(p_file_kind, ''), 'pasted'),
    left(coalesce(p_file_name, ''), 240),
    left(coalesce(p_content_hash, ''), 128),
    left(btrim(coalesce(p_entity, '')), 200),
    left(btrim(coalesce(p_period, '')), 120),
    left(coalesce(nullif(btrim(p_currency), ''), 'EUR'), 8),
    coalesce(nullif(p_scale, ''), 'units')::app.vc_scale,
    coalesce(nullif(p_figure_type, ''), 'actual')::app.vc_figure_type,
    coalesce(nullif(p_scope_level, ''), 'company')::app.vc_finance_scope,
    auth.uid()
  ) returning id into v_id;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    v_amount := app._vc_amount(v_line->>'amount');
    v_formula := coalesce((v_line->>'formula')::boolean, false);
    v_uncertain := coalesce((v_line->>'uncertain')::boolean, false) or v_formula or v_amount is null;
    insert into app.vc_lines (
      import_id, version_id, tenant_id, row_index, account_code, description, amount, source_location,
      line_kind, extract_status, in_scope, is_revenue, uncertain, formula, possible_duplicate, category_label
    ) values (
      v_id, v_version.id, v_version.tenant_id,
      coalesce((v_line->>'row_index')::int, 0),
      left(coalesce(v_line->>'account_code', ''), 40),
      left(coalesce(v_line->>'description', ''), 400),
      v_amount,
      left(coalesce(v_line->>'source_location', ''), 80),
      coalesce(nullif(v_line->>'line_kind', ''), 'detail')::app.vc_line_kind,
      case
        when v_uncertain or v_formula then 'uncertain'::app.vc_extract_status
        else 'proposed'::app.vc_extract_status
      end,
      coalesce((v_line->>'in_scope')::boolean, true),
      coalesce((v_line->>'is_revenue')::boolean, false),
      v_uncertain, v_formula,
      coalesce((v_line->>'possible_duplicate')::boolean, false),
      left(coalesce(v_line->>'category_label', ''), 120)
    );
  end loop;
  perform app._vc_touch(v_version.id);
  return v_id;
end;
$$;

create or replace function app.set_vc_line(
  p_line_id uuid,
  p_description text,
  p_amount text,
  p_in_scope boolean,
  p_out_reason text,
  p_is_revenue boolean,
  p_status text,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_line app.vc_lines;
  v_amount numeric;
begin
  select * into v_line from app.vc_lines where id = p_line_id;
  if v_line.id is null then
    raise exception 'Regel niet gevonden';
  end if;
  perform app._vc_version_for_edit(v_line.version_id);
  perform app._vc_require_finance(v_line.tenant_id);
  v_amount := app._vc_amount(p_amount);
  update app.vc_lines set
    description = left(coalesce(p_description, description), 400),
    amount = v_amount,
    in_scope = coalesce(p_in_scope, in_scope),
    out_scope_reason = left(coalesce(p_out_reason, ''), 300),
    is_revenue = coalesce(p_is_revenue, is_revenue),
    line_kind = coalesce(nullif(p_kind, ''), line_kind::text)::app.vc_line_kind,
    uncertain = v_amount is null,
    formula = false,
    extract_status = coalesce(nullif(p_status, ''), 'proposed')::app.vc_extract_status
  where id = p_line_id;
  update app.vc_allocations set status = 'proposed'::app.vc_alloc_status, confirmed_by = null, confirmed_at = null
  where line_id = p_line_id;
  perform app._vc_touch(v_line.version_id);
end;
$$;

create or replace function app.confirm_vc_import(p_import_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_import app.vc_imports;
begin
  select * into v_import from app.vc_imports where id = p_import_id;
  if v_import.id is null then
    raise exception 'Import niet gevonden';
  end if;
  perform app._vc_version_for_edit(v_import.version_id);
  if not app.has_capability(v_import.tenant_id, 'finance.edit') then
    raise exception 'Forbidden';
  end if;
  if char_length(btrim(v_import.entity_label)) < 2 or char_length(btrim(v_import.period_label)) < 2 then
    raise exception 'Entiteit en periode zijn verplicht voor een bevestigde import';
  end if;
  update app.vc_lines
  set extract_status = 'confirmed'::app.vc_extract_status
  where import_id = p_import_id
    and extract_status = 'proposed'::app.vc_extract_status
    and amount is not null
    and not uncertain
    and not formula;
  update app.vc_imports set status = 'confirmed' where id = p_import_id;
  perform app._vc_touch(v_import.version_id);
end;
$$;

create or replace function app.save_vc_allocation(
  p_line_id uuid,
  p_activity_id uuid,
  p_amount text,
  p_method text,
  p_motivation text,
  p_formula text,
  p_confirm boolean
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_line app.vc_lines;
  v_import app.vc_imports;
  v_amount numeric;
  v_sum numeric;
  v_id uuid;
begin
  select * into v_line from app.vc_lines where id = p_line_id;
  if v_line.id is null then
    raise exception 'Regel niet gevonden';
  end if;
  perform app._vc_version_for_edit(v_line.version_id);
  if not app.has_capability(v_line.tenant_id, 'finance.edit') then
    raise exception 'Forbidden';
  end if;
  if v_line.amount is null then
    raise exception 'Een onbekend bedrag kan niet worden toegewezen en telt niet als nul';
  end if;
  if v_line.line_kind <> 'detail'::app.vc_line_kind or v_line.extract_status = 'excluded'::app.vc_extract_status then
    raise exception 'Subtotalen, totalen en uitgesloten regels worden niet toegewezen';
  end if;
  if p_confirm and v_line.extract_status <> 'confirmed'::app.vc_extract_status then
    raise exception 'Bevestig eerst de bronregel. Een voorstel is geen definitieve toewijzing.';
  end if;

  v_amount := app._vc_amount(p_amount);
  if v_amount is null then
    raise exception 'Vul een bedrag in. Leeg is onbekend, niet nul.';
  end if;
  if (v_line.amount > 0 and v_amount < 0) or (v_line.amount < 0 and v_amount > 0) then
    raise exception 'Het teken van de toewijzing moet het teken van de bron volgen';
  end if;

  select coalesce(sum(amount), 0) into v_sum
  from app.vc_allocations
  where line_id = p_line_id and activity_id <> p_activity_id and amount is not null;

  if v_line.amount >= 0 and v_sum + v_amount > v_line.amount then
    raise exception 'Er is meer toegewezen dan het beschikbare bedrag';
  end if;
  if v_line.amount < 0 and v_sum + v_amount < v_line.amount then
    raise exception 'De correctie is verder verdeeld dan het bronbedrag';
  end if;

  select * into v_import from app.vc_imports where id = v_line.import_id;
  if p_confirm and v_import.scope_level = 'company'::app.vc_finance_scope
     and abs(v_sum + v_amount) = abs(v_line.amount)
     and char_length(btrim(coalesce(p_motivation, ''))) < 20 then
    raise exception 'Dit document dekt het hele bedrijf. Een volledige toewijzing vraagt een motivatie.';
  end if;
  if p_confirm and char_length(btrim(coalesce(p_motivation, ''))) < 3 then
    raise exception 'Een bevestigde toewijzing heeft een motivatie nodig';
  end if;

  delete from app.vc_allocations where line_id = p_line_id and activity_id = p_activity_id;
  insert into app.vc_allocations (
    line_id, version_id, tenant_id, activity_id, amount, method, motivation, formula, status, confirmed_by, confirmed_at
  ) values (
    p_line_id, v_line.version_id, v_line.tenant_id, p_activity_id, v_amount,
    left(coalesce(nullif(p_method, ''), 'direct'), 40),
    left(coalesce(p_motivation, ''), 1000),
    left(coalesce(p_formula, ''), 2000),
    case when p_confirm then 'confirmed'::app.vc_alloc_status else 'proposed'::app.vc_alloc_status end,
    case when p_confirm then auth.uid() else null end,
    case when p_confirm then now() else null end
  ) returning id into v_id;
  perform app._vc_touch(v_line.version_id);
  return v_id;
end;
$$;

create or replace function app.set_vc_cost_rate(
  p_version_id uuid,
  p_rate text,
  p_currency text,
  p_unit text,
  p_confirmed boolean
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.vc_versions;
begin
  v_version := app._vc_version_for_edit(p_version_id);
  if not app.has_capability(v_version.tenant_id, 'finance.edit') then
    raise exception 'Forbidden';
  end if;
  update app.vc_versions set
    cost_rate = app._vc_amount(p_rate),
    cost_rate_currency = left(coalesce(nullif(btrim(p_currency), ''), 'EUR'), 8),
    cost_rate_unit = left(coalesce(nullif(btrim(p_unit), ''), 'hour'), 40),
    cost_rate_confirmed = coalesce(p_confirmed, false) and app._vc_amount(p_rate) is not null,
    updated_at = now()
  where id = p_version_id;
end;
$$;

create or replace function app.set_vc_finance_flags(
  p_version_id uuid,
  p_deferred boolean,
  p_publish boolean
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.vc_versions;
begin
  v_version := app._vc_version_for_edit(p_version_id);
  if coalesce(p_publish, false) then
    if not app.has_capability(v_version.tenant_id, 'finance.edit') then
      raise exception 'Forbidden';
    end if;
    if exists (
      select 1 from app.vc_lines l
      where l.version_id = p_version_id and l.in_scope and l.line_kind = 'detail'::app.vc_line_kind
        and l.extract_status in ('proposed'::app.vc_extract_status, 'uncertain'::app.vc_extract_status)
    ) or exists (
      select 1 from app.vc_allocations a
      where a.version_id = p_version_id and a.status = 'proposed'::app.vc_alloc_status
    ) then
      raise exception 'Publiceer pas wanneer bronregels en toewijzingen bevestigd zijn';
    end if;
  end if;
  update app.vc_versions
  set finance_deferred = coalesce(p_deferred, finance_deferred),
      publish_financials = coalesce(p_publish, false),
      updated_at = now()
  where id = p_version_id;
end;
$$;

create or replace function app.approve_vc_version(p_version_id uuid, p_expected_updated_at timestamptz)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.vc_versions;
  v_open int;
  v_total int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_version from app.vc_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'Versie niet gevonden';
  end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  if v_version.status = 'approved'::app.vc_version_status then
    raise exception 'Deze versie is al goedgekeurd';
  end if;
  if v_version.updated_at <> p_expected_updated_at then
    raise exception 'De versie is gewijzigd. Herlaad voor je goedkeurt.';
  end if;
  if not exists (
    select 1 from app.vc_chains c
    where c.version_id = p_version_id and c.archived_at is null and c.scope_confirmed
  ) then
    raise exception 'Bevestig eerst de afbakening';
  end if;
  select count(*) filter (where not not_applicable and review_status = 'reviewed'::app.vc_review),
         count(*) filter (where not not_applicable)
  into v_open, v_total
  from app.vc_activities
  where version_id = p_version_id and archived_at is null;
  if v_total < 1 or v_open < v_total then
    raise exception 'Nog niet elke toepasselijke activiteit is beoordeeld';
  end if;
  if not v_version.synthesis_reviewed then
    raise exception 'Beoordeel eerst de synthese';
  end if;

  update app.vc_versions
  set status = 'approved'::app.vc_version_status,
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  where id = p_version_id;
end;
$$;

create or replace function app.create_vc_revision(p_tenant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_prev app.vc_versions;
  v_new app.vc_versions;
  v_chain app.vc_chains;
  v_new_chain uuid;
  v_activity app.vc_activities;
  v_new_activity uuid;
begin
  if not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  select * into v_prev from app.vc_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.vc_version_status
  order by version_number desc limit 1;
  if v_prev.id is null then
    raise exception 'Er is geen goedgekeurde versie om te herzien';
  end if;
  if exists (
    select 1 from app.vc_versions
    where tenant_id = p_tenant_id and status <> 'approved'::app.vc_version_status
  ) then
    raise exception 'Er staat al een conceptversie open';
  end if;

  insert into app.vc_versions (
    tenant_id, version_number, status, pestel_version_id, porter_version_id, five_c_version_id,
    swot_version_id, vrio_version_id, synthesis_text, synthesis_public, finance_deferred,
    cost_rate, cost_rate_confirmed, cost_rate_currency, cost_rate_unit, created_by
  ) values (
    p_tenant_id,
    (select coalesce(max(version_number), 0) + 1 from app.vc_versions where tenant_id = p_tenant_id),
    'draft', v_prev.pestel_version_id, v_prev.porter_version_id, v_prev.five_c_version_id,
    v_prev.swot_version_id, v_prev.vrio_version_id, v_prev.synthesis_text, v_prev.synthesis_public,
    v_prev.finance_deferred, v_prev.cost_rate, v_prev.cost_rate_confirmed, v_prev.cost_rate_currency,
    v_prev.cost_rate_unit, auth.uid()
  ) returning * into v_new;

  for v_chain in select * from app.vc_chains where version_id = v_prev.id and archived_at is null
  loop
    insert into app.vc_chains (version_id, tenant_id, offering, business_type, market, period_label, goal, scope_confirmed, sort_order)
    values (v_new.id, p_tenant_id, v_chain.offering, v_chain.business_type, v_chain.market, v_chain.period_label, v_chain.goal, v_chain.scope_confirmed, v_chain.sort_order)
    returning id into v_new_chain;
    for v_activity in select * from app.vc_activities where chain_id = v_chain.id and archived_at is null
    loop
      insert into app.vc_activities (
        chain_id, version_id, tenant_id, name, category, description, inputs_text, outputs_text, customer_value,
        capabilities_note, owner_name, execution, time_value, time_unit, time_scope, time_basis, time_source,
        bottleneck_observation, bottleneck_explanation, bottleneck_improvement, bottleneck_effect, bottleneck_motivation,
        open_question, question_status, question_answer, advisor_note, evidence_level, not_applicable, na_reason,
        manual_lock, origin, sort_order
      ) values (
        v_new_chain, v_new.id, p_tenant_id, v_activity.name, v_activity.category, v_activity.description,
        v_activity.inputs_text, v_activity.outputs_text, v_activity.customer_value, v_activity.capabilities_note,
        v_activity.owner_name, v_activity.execution, v_activity.time_value, v_activity.time_unit, v_activity.time_scope,
        v_activity.time_basis, v_activity.time_source, v_activity.bottleneck_observation, v_activity.bottleneck_explanation,
        v_activity.bottleneck_improvement, v_activity.bottleneck_effect, v_activity.bottleneck_motivation,
        v_activity.open_question, v_activity.question_status, v_activity.question_answer, v_activity.advisor_note,
        v_activity.evidence_level, v_activity.not_applicable, v_activity.na_reason, v_activity.manual_lock,
        v_activity.origin, v_activity.sort_order
      ) returning id into v_new_activity;
      insert into app.vc_activity_refs (activity_id, tenant_id, ref_type, ref_id, label, excerpt, interpretation)
      select v_new_activity, tenant_id, ref_type, ref_id, label, excerpt, interpretation
      from app.vc_activity_refs where activity_id = v_activity.id;
      insert into app.vc_subactivities (activity_id, tenant_id, name, sort_order)
      select v_new_activity, tenant_id, name, sort_order from app.vc_subactivities where activity_id = v_activity.id;
    end loop;
  end loop;
  return v_new.id;
end;
$$;

create or replace function app.get_vc_published(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.vc_versions;
  v_finance boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not app.has_capability(p_tenant_id, 'dashboard.read_published')
     and not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  select * into v_version from app.vc_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.vc_version_status
  order by version_number desc limit 1;
  if v_version.id is null then
    return jsonb_build_object('published', false);
  end if;
  v_finance := v_version.publish_financials and app.has_capability(p_tenant_id, 'finance.read');
  return jsonb_build_object(
    'published', true,
    'version_number', v_version.version_number,
    'approved_at', v_version.approved_at,
    'synthesis', case when v_finance then v_version.synthesis_text else v_version.synthesis_public end,
    'financials_included', v_finance,
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', a.name, 'category', a.category, 'customer_value', a.customer_value,
        'observation', a.bottleneck_observation, 'open_question', a.open_question
      ) order by a.sort_order)
      from app.vc_activities a
      where a.version_id = v_version.id and a.archived_at is null and not a.not_applicable
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function app.grant_finance_access(
  p_tenant_id uuid,
  p_user_id uuid,
  p_can_read boolean,
  p_can_upload boolean
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if not app.is_platform_admin() or not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  insert into app.finance_grants (tenant_id, user_id, can_read, can_upload, granted_by)
  values (p_tenant_id, p_user_id, coalesce(p_can_read, false), coalesce(p_can_upload, false), auth.uid())
  on conflict (tenant_id, user_id) do update
  set can_read = excluded.can_read, can_upload = excluded.can_upload, granted_by = auth.uid(), updated_at = now();
end;
$$;

create or replace function app.get_audit_framework_progress(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_pestel uuid;
  v_porter uuid;
  v_five_c uuid;
  v_swot uuid;
  v_vrio uuid;
  v_vc uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  select id into v_pestel from app.pestel_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.pestel_version_status
  order by version_number desc limit 1;
  select id into v_porter from app.porter_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.porter_version_status
  order by version_number desc limit 1;
  select id into v_five_c from app.five_c_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.five_c_version_status
  order by version_number desc limit 1;
  select id into v_swot from app.swot_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.swot_version_status
  order by version_number desc limit 1;
  select id into v_vrio from app.vrio_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.vrio_version_status
  order by version_number desc limit 1;
  select id into v_vc from app.vc_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.vc_version_status
  order by version_number desc limit 1;

  return jsonb_build_object(
    'pestel_approved', v_pestel is not null,
    'pestel_version_id', v_pestel,
    'porter_approved', v_porter is not null,
    'porter_version_id', v_porter,
    'five_c_approved', v_five_c is not null,
    'five_c_version_id', v_five_c,
    'swot_approved', v_swot is not null,
    'swot_version_id', v_swot,
    'vrio_approved', v_vrio is not null,
    'vrio_version_id', v_vrio,
    'value_chain_approved', v_vc is not null,
    'value_chain_version_id', v_vc
  );
end;
$$;

grant execute on function app.get_vc_workbench(uuid) to authenticated;
grant execute on function app.save_vc_chain(uuid, text, text, text, text, text) to authenticated;
grant execute on function app.add_vc_chain(uuid) to authenticated;
grant execute on function app.upsert_vc_activity(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb, timestamptz) to authenticated;
grant execute on function app.archive_vc_activity(uuid, boolean) to authenticated;
grant execute on function app.merge_vc_activities(uuid, uuid) to authenticated;
grant execute on function app.set_vc_applicability(uuid, boolean, text) to authenticated;
grant execute on function app.set_vc_activity_review(uuid, boolean) to authenticated;
grant execute on function app.save_vc_dependency(uuid, uuid, uuid, uuid, text, text, text, text) to authenticated;
grant execute on function app.delete_vc_dependency(uuid) to authenticated;
grant execute on function app.save_vc_ai_result(uuid, jsonb, text) to authenticated;
grant execute on function app.resolve_vc_ai_proposal(uuid, boolean) to authenticated;
grant execute on function app.save_vc_synthesis(uuid, text, text, boolean) to authenticated;
grant execute on function app.save_vc_action(uuid, uuid, uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function app.save_vc_import(uuid, uuid, text, text, text, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function app.set_vc_line(uuid, text, text, boolean, text, boolean, text, text) to authenticated;
grant execute on function app.confirm_vc_import(uuid) to authenticated;
grant execute on function app.save_vc_allocation(uuid, uuid, text, text, text, text, boolean) to authenticated;
grant execute on function app.set_vc_cost_rate(uuid, text, text, text, boolean) to authenticated;
grant execute on function app.set_vc_finance_flags(uuid, boolean, boolean) to authenticated;
grant execute on function app.approve_vc_version(uuid, timestamptz) to authenticated;
grant execute on function app.create_vc_revision(uuid) to authenticated;
grant execute on function app.get_vc_published(uuid) to authenticated;
grant execute on function app.grant_finance_access(uuid, uuid, boolean, boolean) to authenticated;
grant execute on function app.get_audit_framework_progress(uuid) to authenticated;

revoke execute on function app._vc_version_for_edit(uuid) from public, anon, authenticated;
revoke execute on function app._vc_require_finance(uuid) from public, anon, authenticated;
revoke execute on function app._vc_touch(uuid) from public, anon, authenticated;
revoke execute on function app._vc_ref_valid(app.vc_versions, app.vc_ref_type, uuid) from public, anon, authenticated;
revoke execute on function app._vc_replace_refs(uuid, app.vc_versions, jsonb) from public, anon, authenticated;
revoke execute on function app._vc_amount(text) from public, anon, authenticated;
