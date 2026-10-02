-- Strategische audit · stap 6: BCG-matrix
-- Ruwe input, bronnen en de berekende positie blijven gescheiden.
-- Onbekend is nooit nul. De klasse volgt uit vaste grenzen, niet uit vrije AI-tekst.

create type app.bcg_version_status as enum (
  'not_started', 'draft', 'in_review', 'approved', 'needs_revision'
);

create type app.bcg_item_kind as enum ('product', 'service', 'group', 'unit');

create type app.bcg_review as enum ('pending', 'reviewed');

create type app.bcg_overlap as enum ('unset', 'count', 'excluded');

create type app.bcg_ai_state as enum ('none', 'proposed', 'accepted', 'rejected');

create type app.bcg_ref_type as enum (
  'tenant_profile', 'meeting', 'pestel_insight', 'pestel_input',
  'porter_scope', 'porter_force', 'porter_factor',
  'five_c_item', 'five_c_synthesis', 'swot_item', 'vrio_resource', 'manual'
);

create table app.bcg_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  version_number integer not null,
  status app.bcg_version_status not null default 'not_started',
  scope_label text not null default '',
  market_label text not null default '',
  geography text not null default '',
  segment text not null default '',
  period_label text not null default '',
  period_kind text not null default '' check (period_kind in ('', 'year', 'quarter', 'multi_year', 'other')),
  measure_basis text not null default '' check (measure_basis in ('', 'value', 'volume')),
  currency text not null default '',
  unit_label text not null default '',
  growth_threshold numeric,
  growth_threshold_note text not null default '',
  growth_threshold_source text not null default '',
  share_threshold numeric not null default 1,
  thresholds_confirmed boolean not null default false,
  qualitative boolean not null default false,
  qualitative_reason text not null default '',
  synthesis_text text not null default '',
  synthesis_reviewed boolean not null default false,
  publish_figures boolean not null default false,
  published_at timestamptz,
  published_by uuid references auth.users (id),
  ai_questions jsonb not null default '[]'::jsonb,
  ai_generated_at timestamptz,
  vrio_version_id uuid references app.vrio_versions (id) on delete set null,
  swot_version_id uuid references app.swot_versions (id) on delete set null,
  five_c_version_id uuid references app.five_c_versions (id) on delete set null,
  porter_version_id uuid references app.porter_versions (id) on delete set null,
  pestel_version_id uuid references app.pestel_versions (id) on delete set null,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, version_number)
);

create index bcg_versions_tenant_idx on app.bcg_versions (tenant_id, version_number desc);

create table app.bcg_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.bcg_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  title text not null default '',
  description text not null default '',
  kind app.bcg_item_kind not null default 'service',
  origin text not null default 'manual' check (origin in ('five_c', 'dossier', 'manual', 'ai')),
  five_c_item_id uuid references app.five_c_items (id) on delete set null,
  parent_item_id uuid references app.bcg_items (id) on delete set null,
  overlap_key text not null default '',
  overlap_mode app.bcg_overlap not null default 'unset',
  selected boolean not null default true,
  exclusion_reason text not null default '',
  market_definition text not null default '',
  geography text not null default '',
  segment text not null default '',
  period_label text not null default '',
  period_kind text not null default '' check (period_kind in ('', 'year', 'quarter', 'multi_year', 'other')),
  measure_basis text not null default '' check (measure_basis in ('', 'value', 'volume')),
  currency text not null default '',
  unit_label text not null default '',
  scope_confirmed boolean not null default false,
  growth_method text not null default 'none' check (growth_method in ('none', 'direct', 'from_size')),
  growth_percent numeric,
  size_previous numeric,
  size_current numeric,
  size_scale text not null default 'units' check (size_scale in ('units', 'thousands', 'millions')),
  growth_evidence text not null default '' check (growth_evidence in ('', 'measured', 'provided', 'forecast', 'estimate')),
  share_method text not null default 'none' check (share_method in ('none', 'from_shares', 'from_amounts')),
  own_share numeric,
  leader_share numeric,
  own_amount numeric,
  leader_amount numeric,
  amount_scale text not null default 'units' check (amount_scale in ('units', 'thousands', 'millions')),
  client_is_leader boolean not null default false,
  leader_name text not null default '',
  share_evidence text not null default '' check (share_evidence in ('', 'measured', 'provided', 'forecast', 'estimate')),
  figures_conflict text not null default '',
  conflict_accepted boolean not null default false,
  figures_confirmed boolean not null default false,
  manual_lock boolean not null default false,
  advisor_note text not null default '',
  open_question text not null default '',
  question_status text not null default 'open' check (question_status in ('open', 'queued_meeting', 'answered')),
  gap_reason text not null default '',
  growth_result numeric,
  relative_result numeric,
  review_status app.bcg_review not null default 'pending',
  needs_revision boolean not null default false,
  revision_note text not null default '',
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  ai_state app.bcg_ai_state not null default 'none',
  ai_payload jsonb not null default '{}'::jsonb,
  ai_generated_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index bcg_items_version_idx on app.bcg_items (version_id) where deleted_at is null;

create table app.bcg_item_refs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references app.bcg_items (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  ref_type app.bcg_ref_type not null,
  ref_id uuid,
  label text not null default '',
  excerpt text not null default '',
  slot text not null default 'general' check (slot in ('market', 'growth', 'share', 'general')),
  created_at timestamptz not null default now()
);

create index bcg_item_refs_item_idx on app.bcg_item_refs (item_id);

create table app.bcg_ai_history (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.bcg_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  item_id uuid references app.bcg_items (id) on delete cascade,
  proposal jsonb not null default '{}'::jsonb,
  decision text not null check (decision in ('accepted', 'rejected', 'superseded', 'proposed')),
  decided_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table app.bcg_versions enable row level security;
alter table app.bcg_items enable row level security;
alter table app.bcg_item_refs enable row level security;
alter table app.bcg_ai_history enable row level security;

-- ---------------------------------------------------------------------------
-- Rekenen. Leeg blijft null. Een noemer van nul levert geen resultaat.
-- ---------------------------------------------------------------------------

create or replace function app._bcg_num(p text)
returns numeric
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := btrim(coalesce(p, ''));
  if v = '' then
    return null;
  end if;
  if left(v, 1) = '=' then
    raise exception 'Formules worden niet uitgevoerd';
  end if;
  if v !~ '^-?[0-9]+([.][0-9]+)?$' then
    raise exception 'Ongeldig getal';
  end if;
  return round(v::numeric, 4);
end;
$$;

create or replace function app.bcg_growth(
  p_method text,
  p_direct numeric,
  p_prev numeric,
  p_curr numeric,
  p_prev_scale text,
  p_curr_scale text
)
returns numeric
language plpgsql
immutable
as $$
begin
  if p_method = 'direct' then
    if p_direct is null then return null; end if;
    return round(p_direct, 4);
  end if;
  if p_method = 'from_size' then
    if p_prev is null or p_curr is null then return null; end if;
    if p_prev_scale is distinct from p_curr_scale then return null; end if;
    if p_prev = 0 then return null; end if;
    return round((p_curr - p_prev) / p_prev * 100, 4);
  end if;
  return null;
end;
$$;

create or replace function app.bcg_relative(
  p_method text,
  p_own_share numeric,
  p_leader_share numeric,
  p_own_amount numeric,
  p_leader_amount numeric,
  p_own_scale text,
  p_leader_scale text
)
returns numeric
language plpgsql
immutable
as $$
begin
  if p_method = 'from_shares' then
    if p_own_share is null or p_leader_share is null then return null; end if;
    if p_own_share < 0 or p_own_share > 100 or p_leader_share < 0 or p_leader_share > 100 then return null; end if;
    if p_leader_share = 0 then return null; end if;
    return round(p_own_share / p_leader_share, 4);
  end if;
  if p_method = 'from_amounts' then
    if p_own_scale is distinct from p_leader_scale then return null; end if;
    if p_own_amount is null or p_leader_amount is null then return null; end if;
    if p_own_amount < 0 or p_leader_amount < 0 or p_leader_amount = 0 then return null; end if;
    return round(p_own_amount / p_leader_amount, 4);
  end if;
  return null;
end;
$$;

create or replace function app.bcg_quadrant(
  p_growth numeric,
  p_relative numeric,
  p_growth_threshold numeric,
  p_share_threshold numeric
)
returns text
language sql
immutable
as $$
  select case
    when p_growth is null or p_relative is null or p_growth_threshold is null or p_share_threshold is null then null
    when p_growth >= p_growth_threshold and p_relative >= p_share_threshold then 'star'
    when p_growth >= p_growth_threshold then 'question_mark'
    when p_relative >= p_share_threshold then 'cash_cow'
    else 'dog'
  end;
$$;

create or replace function app.bcg_item_placeable(p_item app.bcg_items, p_version app.bcg_versions)
returns boolean
language plpgsql
stable
as $$
declare
  v_growth numeric;
  v_relative numeric;
begin
  if p_version.qualitative then
    return false;
  end if;
  if p_item.figures_conflict <> '' and not p_item.conflict_accepted then return false; end if;
  if p_version.period_kind <> '' and p_item.period_kind <> '' and p_version.period_kind <> p_item.period_kind then return false; end if;
  if p_item.period_kind = '' or p_item.measure_basis = '' or not p_item.scope_confirmed then return false; end if;
  if not p_version.thresholds_confirmed or p_version.growth_threshold is null then return false; end if;
  if btrim(p_item.leader_name) = '' then return false; end if;
  v_growth := app.bcg_growth(p_item.growth_method, p_item.growth_percent, p_item.size_previous, p_item.size_current, p_item.size_scale, p_item.size_scale);
  v_relative := app.bcg_relative(p_item.share_method, p_item.own_share, p_item.leader_share, p_item.own_amount, p_item.leader_amount, p_item.amount_scale, p_item.amount_scale);
  if v_growth is null or v_relative is null then return false; end if;
  if p_item.client_is_leader and p_item.share_method = 'from_shares'
     and p_item.own_share is not null and p_item.leader_share is not null
     and p_item.own_share <= p_item.leader_share then
    return false;
  end if;
  if p_item.client_is_leader and p_item.share_method = 'from_amounts'
     and p_item.own_amount is not null and p_item.leader_amount is not null
     and p_item.own_amount <= p_item.leader_amount then
    return false;
  end if;
  return app.bcg_quadrant(v_growth, v_relative, p_version.growth_threshold, p_version.share_threshold) is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function app._bcg_version_for_edit(p_version_id uuid)
returns app.bcg_versions
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.bcg_versions;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_row from app.bcg_versions where id = p_version_id;
  if v_row.id is null then
    raise exception 'Versie niet gevonden';
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  if v_row.status = 'approved'::app.bcg_version_status then
    raise exception 'Goedgekeurde BCG-versie is alleen-lezen; maak een nieuwe conceptversie';
  end if;
  return v_row;
end;
$$;

create or replace function app._bcg_touch(p_version_id uuid)
returns void
language sql
security definer
set search_path = app, public, auth
as $$
  update app.bcg_versions
  set updated_at = now(),
      status = case
        when status = 'not_started'::app.bcg_version_status then 'draft'::app.bcg_version_status
        else status
      end
  where id = p_version_id;
$$;

create or replace function app._bcg_reopen_item(p_item_id uuid)
returns void
language sql
security definer
set search_path = app, public, auth
as $$
  update app.bcg_items
  set review_status = 'pending'::app.bcg_review, reviewed_by = null, reviewed_at = null, updated_at = now()
  where id = p_item_id;
  update app.bcg_versions v
  set synthesis_reviewed = false
  from app.bcg_items i
  where i.id = p_item_id and v.id = i.version_id;
$$;

create or replace function app._bcg_store_results(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.bcg_items;
begin
  select * into v_item from app.bcg_items where id = p_item_id;
  if v_item.id is null then
    return;
  end if;
  update app.bcg_items
  set
    growth_result = app.bcg_growth(v_item.growth_method, v_item.growth_percent, v_item.size_previous, v_item.size_current, v_item.size_scale, v_item.size_scale),
    relative_result = app.bcg_relative(v_item.share_method, v_item.own_share, v_item.leader_share, v_item.own_amount, v_item.leader_amount, v_item.amount_scale, v_item.amount_scale)
  where id = p_item_id;
end;
$$;

create or replace function app._bcg_ref_valid(
  p_version app.bcg_versions,
  p_type app.bcg_ref_type,
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
      return exists (select 1 from app.meeting_recordings m where m.id = p_id and m.tenant_id = p_version.tenant_id);
    when 'pestel_insight' then
      return exists (
        select 1 from app.pestel_insights i
        where i.id = p_id and i.tenant_id = p_version.tenant_id and i.version_id = p_version.pestel_version_id and i.deleted_at is null
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
        where pf.id = p_id and pf.tenant_id = p_version.tenant_id and pf.version_id = p_version.porter_version_id and pf.deleted_at is null
      );
    when 'five_c_item' then
      return exists (
        select 1 from app.five_c_items fi
        where fi.id = p_id and fi.tenant_id = p_version.tenant_id and fi.version_id = p_version.five_c_version_id and fi.deleted_at is null
      );
    when 'swot_item' then
      return exists (
        select 1 from app.swot_items si
        where si.id = p_id and si.tenant_id = p_version.tenant_id and si.version_id = p_version.swot_version_id and si.deleted_at is null
      );
    when 'vrio_resource' then
      return exists (
        select 1 from app.vrio_resources r
        where r.id = p_id and r.tenant_id = p_version.tenant_id and r.version_id = p_version.vrio_version_id and r.deleted_at is null
      );
  end case;
  return false;
end;
$$;

create or replace function app._bcg_replace_refs(p_item_id uuid, p_version app.bcg_versions, p_refs jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_ref jsonb;
  v_type app.bcg_ref_type;
  v_id uuid;
  v_slot text;
begin
  delete from app.bcg_item_refs where item_id = p_item_id;
  if p_refs is null or jsonb_typeof(p_refs) <> 'array' then
    return;
  end if;
  for v_ref in select value from jsonb_array_elements(p_refs) limit 20
  loop
    begin
      v_type := (v_ref->>'ref_type')::app.bcg_ref_type;
    exception when others then
      raise exception 'Onbekend brontype';
    end;
    v_id := nullif(v_ref->>'ref_id', '')::uuid;
    if not app._bcg_ref_valid(p_version, v_type, v_id) then
      raise exception 'Bron hoort niet bij deze klant of analyseversie';
    end if;
    v_slot := coalesce(v_ref->>'slot', 'general');
    if v_slot not in ('market', 'growth', 'share', 'general') then
      v_slot := 'general';
    end if;
    insert into app.bcg_item_refs (item_id, tenant_id, ref_type, ref_id, label, excerpt, slot)
    values (
      p_item_id, p_version.tenant_id, v_type, v_id,
      left(coalesce(v_ref->>'label', ''), 500),
      left(coalesce(v_ref->>'excerpt', ''), 2000),
      v_slot
    );
  end loop;
end;
$$;

create or replace function app._bcg_overlap_open(p_version_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
declare
  v_groups text[] := '{}';
  v_g text;
  v_size integer;
  v_count integer;
  v_excl integer;
begin
  for v_g in
    select distinct case
      when i.overlap_key <> '' then 'k:' || i.overlap_key
      when i.parent_item_id is not null and exists (
        select 1 from app.bcg_items p
        where p.id = i.parent_item_id and p.version_id = i.version_id and p.selected and p.deleted_at is null
      ) then 'p:' || i.parent_item_id::text
      when exists (
        select 1 from app.bcg_items c
        where c.parent_item_id = i.id and c.version_id = i.version_id and c.selected and c.deleted_at is null
      ) then 'p:' || i.id::text
      else null
    end
    from app.bcg_items i
    where i.version_id = p_version_id and i.deleted_at is null and i.selected
  loop
    if v_g is null or v_g = any (v_groups) then
      continue;
    end if;
    v_groups := array_append(v_groups, v_g);
    select count(*),
           count(*) filter (where mode = 'count'),
           count(*) filter (where mode = 'excluded')
      into v_size, v_count, v_excl
    from (
      select i.overlap_mode::text as mode
      from app.bcg_items i
      where i.version_id = p_version_id and i.deleted_at is null and i.selected
        and (
          (left(v_g, 2) = 'k:' and i.overlap_key = substr(v_g, 3))
          or (left(v_g, 2) = 'p:' and (i.id::text = substr(v_g, 3) or i.parent_item_id::text = substr(v_g, 3)))
        )
    ) s;
    if v_size > 1 and not (v_count = 1 and v_count + v_excl = v_size) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- Upstream-ids worden in get_bcg_workbench en add_bcg_scope gezet.
-- Een niet-toegewezen rijvariabele mag hier niet veld voor veld gevuld worden.
create or replace function app._bcg_txt(p numeric)
returns text
language sql
immutable
as $$
  select case when p is null then null else trim(to_char(p, 'FM999999999990.9999')) end;
$$;

create or replace function app.get_bcg_workbench(p_tenant_id uuid, p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
  v_vrio app.vrio_versions;
  v_swot app.swot_versions;
  v_five app.five_c_versions;
  v_porter app.porter_versions;
  v_pestel app.pestel_versions;
  v_tenant app.tenants;
  v_next integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  select * into v_tenant from app.tenants where id = p_tenant_id and deleted_at is null;
  if v_tenant.id is null then raise exception 'Klant niet gevonden'; end if;

  v_version := null;
  if p_version_id is not null then
    select * into v_version from app.bcg_versions where id = p_version_id and tenant_id = p_tenant_id;
    if v_version.id is null then raise exception 'Analyse niet gevonden'; end if;
  else
    select * into v_version from app.bcg_versions
    where tenant_id = p_tenant_id and status <> 'approved'::app.bcg_version_status
    order by version_number desc limit 1;
    if v_version.id is null then
      v_version := null;
      select * into v_version from app.bcg_versions
      where tenant_id = p_tenant_id order by version_number desc limit 1;
    end if;
  end if;

  if v_version.id is null then
    v_vrio := null;
    select * into v_vrio from app.vrio_versions
    where tenant_id = p_tenant_id and status = 'approved'::app.vrio_version_status
    order by version_number desc limit 1;
    select coalesce(max(version_number), 0) + 1 into v_next from app.bcg_versions where tenant_id = p_tenant_id;
    insert into app.bcg_versions (
      tenant_id, version_number, status, created_by,
      vrio_version_id, swot_version_id, five_c_version_id, porter_version_id, pestel_version_id
    ) values (
      p_tenant_id, v_next, 'not_started', auth.uid(), v_vrio.id,
      coalesce(v_vrio.swot_version_id, (select id from app.swot_versions where tenant_id = p_tenant_id and status = 'approved'::app.swot_version_status order by version_number desc limit 1)),
      coalesce(v_vrio.five_c_version_id, (select id from app.five_c_versions where tenant_id = p_tenant_id and status = 'approved'::app.five_c_version_status order by version_number desc limit 1)),
      coalesce(v_vrio.porter_version_id, (select id from app.porter_versions where tenant_id = p_tenant_id and status = 'approved'::app.porter_version_status order by version_number desc limit 1)),
      coalesce(v_vrio.pestel_version_id, (select id from app.pestel_versions where tenant_id = p_tenant_id and status = 'approved'::app.pestel_version_status order by version_number desc limit 1))
    ) returning * into v_version;
  end if;

  v_vrio := null; v_swot := null; v_five := null; v_porter := null; v_pestel := null;
  select * into v_vrio from app.vrio_versions where id = v_version.vrio_version_id;
  select * into v_swot from app.swot_versions where id = v_version.swot_version_id;
  select * into v_five from app.five_c_versions where id = v_version.five_c_version_id;
  select * into v_porter from app.porter_versions where id = v_version.porter_version_id;
  select * into v_pestel from app.pestel_versions where id = v_version.pestel_version_id;

  return jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id,
      'version_number', v_version.version_number,
      'status', v_version.status,
      'scope_label', v_version.scope_label,
      'market_label', v_version.market_label,
      'geography', v_version.geography,
      'segment', v_version.segment,
      'period_label', v_version.period_label,
      'period_kind', v_version.period_kind,
      'measure_basis', v_version.measure_basis,
      'currency', v_version.currency,
      'unit_label', v_version.unit_label,
      'growth_threshold', app._bcg_txt(v_version.growth_threshold),
      'growth_threshold_note', v_version.growth_threshold_note,
      'growth_threshold_source', v_version.growth_threshold_source,
      'share_threshold', app._bcg_txt(v_version.share_threshold),
      'thresholds_confirmed', v_version.thresholds_confirmed,
      'qualitative', v_version.qualitative,
      'qualitative_reason', v_version.qualitative_reason,
      'synthesis_text', v_version.synthesis_text,
      'synthesis_reviewed', v_version.synthesis_reviewed,
      'publish_figures', v_version.publish_figures,
      'published_at', v_version.published_at,
      'ai_questions', v_version.ai_questions,
      'ai_generated_at', v_version.ai_generated_at,
      'vrio_version_id', v_version.vrio_version_id,
      'swot_version_id', v_version.swot_version_id,
      'five_c_version_id', v_version.five_c_version_id,
      'porter_version_id', v_version.porter_version_id,
      'pestel_version_id', v_version.pestel_version_id,
      'approved_at', v_version.approved_at,
      'updated_at', v_version.updated_at
    ),
    'upstream', jsonb_build_object(
      'vrio', case when v_vrio.id is null then null else jsonb_build_object('id', v_vrio.id, 'version_number', v_vrio.version_number, 'status', v_vrio.status) end,
      'swot', case when v_swot.id is null then null else jsonb_build_object('id', v_swot.id, 'version_number', v_swot.version_number, 'status', v_swot.status) end,
      'five_c', case when v_five.id is null then null else jsonb_build_object('id', v_five.id, 'version_number', v_five.version_number, 'status', v_five.status) end,
      'porter', case when v_porter.id is null then null else jsonb_build_object('id', v_porter.id, 'version_number', v_porter.version_number, 'status', v_porter.status) end,
      'pestel', case when v_pestel.id is null then null else jsonb_build_object('id', v_pestel.id, 'version_number', v_pestel.version_number, 'status', v_pestel.status) end
    ),
    'scopes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'version_number', s.version_number, 'status', s.status, 'scope_label', s.scope_label
      ) order by s.version_number desc)
      from app.bcg_versions s where s.tenant_id = p_tenant_id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg((
        jsonb_build_object(
          'id', i.id, 'title', i.title, 'description', i.description, 'kind', i.kind, 'origin', i.origin,
          'five_c_item_id', i.five_c_item_id, 'parent_item_id', i.parent_item_id,
          'overlap_key', i.overlap_key, 'overlap_mode', i.overlap_mode,
          'selected', i.selected, 'exclusion_reason', i.exclusion_reason,
          'market_definition', i.market_definition, 'geography', i.geography, 'segment', i.segment,
          'period_label', i.period_label, 'period_kind', i.period_kind, 'measure_basis', i.measure_basis,
          'currency', i.currency, 'unit_label', i.unit_label, 'scope_confirmed', i.scope_confirmed,
          'growth_method', i.growth_method, 'growth_percent', app._bcg_txt(i.growth_percent),
          'size_previous', app._bcg_txt(i.size_previous), 'size_current', app._bcg_txt(i.size_current),
          'size_scale', i.size_scale, 'growth_evidence', i.growth_evidence,
          'share_method', i.share_method, 'own_share', app._bcg_txt(i.own_share),
          'leader_share', app._bcg_txt(i.leader_share), 'own_amount', app._bcg_txt(i.own_amount),
          'leader_amount', app._bcg_txt(i.leader_amount), 'amount_scale', i.amount_scale,
          'client_is_leader', i.client_is_leader, 'leader_name', i.leader_name, 'share_evidence', i.share_evidence
        ) || jsonb_build_object(
          'figures_conflict', i.figures_conflict, 'conflict_accepted', i.conflict_accepted,
          'figures_confirmed', i.figures_confirmed, 'manual_lock', i.manual_lock,
          'advisor_note', i.advisor_note, 'open_question', i.open_question, 'question_status', i.question_status,
          'gap_reason', i.gap_reason, 'review_status', i.review_status, 'needs_revision', i.needs_revision,
          'revision_note', i.revision_note, 'reviewed_at', i.reviewed_at,
          'ai_state', i.ai_state, 'ai_payload', i.ai_payload, 'ai_generated_at', i.ai_generated_at,
          'sort_order', i.sort_order, 'updated_at', i.updated_at,
          'refs', coalesce((
            select jsonb_agg(jsonb_build_object(
              'ref_type', r.ref_type, 'ref_id', r.ref_id, 'label', r.label, 'excerpt', r.excerpt, 'slot', r.slot
            ) order by r.created_at)
            from app.bcg_item_refs r where r.item_id = i.id
          ), '[]'::jsonb)
        )
      ) order by i.sort_order, i.created_at)
      from app.bcg_items i
      where i.version_id = v_version.id and i.deleted_at is null
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'item_id', h.item_id, 'decision', h.decision, 'created_at', h.created_at
      ) order by h.created_at desc)
      from (select * from app.bcg_ai_history where version_id = v_version.id order by created_at desc limit 30) h
    ), '[]'::jsonb),
    'inputs', jsonb_build_object(
      'tenant', jsonb_build_object('id', v_tenant.id, 'name', v_tenant.name, 'website', v_tenant.website, 'audit_goal', v_tenant.audit_goal),
      'swot_items', coalesce((
        select jsonb_agg(jsonb_build_object('id', si.id, 'quadrant', si.quadrant, 'statement', si.statement) order by si.quadrant, si.sort_order)
        from app.swot_items si where si.version_id = v_version.swot_version_id and si.deleted_at is null
      ), '[]'::jsonb),
      'five_c_items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', fi.id, 'c_key', fi.c_key, 'title', fi.title,
          'finding', left(fi.finding, 2000), 'client_relevance', left(fi.client_relevance, 1000)
        ) order by fi.c_key, fi.sort_order)
        from app.five_c_items fi
        where fi.version_id = v_version.five_c_version_id and fi.deleted_at is null
          and fi.review_status <> 'rejected'::app.five_c_review
          and fi.content_type <> 'input_needed'::app.five_c_content_type
      ), '[]'::jsonb),
      'five_c_synthesis', case when v_five.id is null then null else left(v_five.synthesis_text, 4000) end,
      'porter_forces', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id, 'force_key', f.force_key, 'intensity', f.intensity,
          'headline_factor', f.headline_factor, 'motivation', left(f.motivation, 1500)
        ) order by f.sort_order)
        from app.porter_forces f where f.version_id = v_version.porter_version_id
      ), '[]'::jsonb),
      'porter_scope', case when v_porter.id is null then null else jsonb_build_object(
        'id', v_porter.id, 'market_sector', v_porter.market_sector,
        'known_competitors', v_porter.known_competitors, 'synthesis_text', left(v_porter.synthesis_text, 3000)
      ) end,
      'pestel_insights', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ins.id, 'dimension', ins.dimension, 'title', ins.title, 'observation', left(ins.observation, 1500)
        ) order by ins.dimension, ins.sort_order)
        from app.pestel_insights ins
        where ins.version_id = v_version.pestel_version_id and ins.deleted_at is null
          and ins.review_status <> 'rejected'::app.pestel_insight_review
      ), '[]'::jsonb),
      'vrio_resources', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'title', r.title, 'description', left(r.description, 1000),
          'outcome', app.vrio_outcome(
            coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'value'), 'not_assessed'),
            coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'rarity'), 'not_assessed'),
            coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'imitability'), 'not_assessed'),
            coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'organization'), 'not_assessed')
          )
        ) order by r.sort_order)
        from app.vrio_resources r
        where r.version_id = v_version.vrio_version_id and r.deleted_at is null and r.selected
      ), '[]'::jsonb),
      'meetings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'title', coalesce(nullif(trim(m.title), ''), to_char(m.created_at, 'YYYY-MM-DD HH24:MI')),
          'created_at', m.created_at,
          'text', left(coalesce(nullif(trim(m.summary_text), ''), left(coalesce(m.full_text, ''), 3000)), 3000)
        ) order by m.created_at desc)
        from (select * from app.meeting_recordings where tenant_id = p_tenant_id and transcript_status = 'ready' order by created_at desc limit 8) m
      ), '[]'::jsonb),
      'documents', coalesce((
        select jsonb_agg(jsonb_build_object('id', inp.id, 'kind', inp.kind, 'label', inp.label, 'excerpt', left(coalesce(inp.excerpt, ''), 2000)) order by inp.sort_order)
        from app.pestel_version_research_inputs inp
        where inp.version_id = v_version.pestel_version_id and inp.kind in ('document', 'note')
      ), '[]'::jsonb)
    )
  );
end;
$$;
create or replace function app.save_bcg_scope(
  p_version_id uuid,
  p_scope_label text,
  p_market text,
  p_geography text,
  p_segment text,
  p_period text,
  p_period_kind text,
  p_basis text,
  p_currency text,
  p_unit text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
  v_kind text;
  v_basis text;
begin
  v_version := app._bcg_version_for_edit(p_version_id);
  v_kind := coalesce(p_period_kind, '');
  v_basis := coalesce(p_basis, '');
  if v_kind not in ('', 'year', 'quarter', 'multi_year', 'other') then
    raise exception 'Onbekende meetperiode';
  end if;
  if v_basis not in ('', 'value', 'volume') then
    raise exception 'Onbekende meetbasis';
  end if;
  if v_version.market_label is distinct from left(btrim(coalesce(p_market, '')), 300)
     or v_version.period_label is distinct from left(btrim(coalesce(p_period, '')), 120)
     or v_version.period_kind is distinct from v_kind
     or v_version.measure_basis is distinct from v_basis
     or v_version.geography is distinct from left(btrim(coalesce(p_geography, '')), 200) then
    update app.bcg_items
    set needs_revision = true,
        review_status = 'pending'::app.bcg_review,
        reviewed_by = null,
        reviewed_at = null,
        revision_note = 'Afbakening van de analyse gewijzigd',
        updated_at = now()
    where version_id = p_version_id and deleted_at is null and selected;
    update app.bcg_versions set synthesis_reviewed = false where id = p_version_id;
  end if;
  update app.bcg_versions
  set scope_label = left(btrim(coalesce(p_scope_label, '')), 200),
      market_label = left(btrim(coalesce(p_market, '')), 300),
      geography = left(btrim(coalesce(p_geography, '')), 200),
      segment = left(btrim(coalesce(p_segment, '')), 200),
      period_label = left(btrim(coalesce(p_period, '')), 120),
      period_kind = v_kind,
      measure_basis = v_basis,
      currency = left(btrim(coalesce(p_currency, '')), 12),
      unit_label = left(btrim(coalesce(p_unit, '')), 40)
  where id = p_version_id;
  perform app._bcg_touch(p_version_id);
end;
$$;

create or replace function app.save_bcg_thresholds(
  p_version_id uuid,
  p_growth text,
  p_note text,
  p_source text,
  p_share text,
  p_confirm boolean
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
  v_growth numeric;
  v_share numeric;
begin
  v_version := app._bcg_version_for_edit(p_version_id);
  v_growth := app._bcg_num(p_growth);
  v_share := coalesce(app._bcg_num(p_share), 1);
  if v_share <= 0 then
    raise exception 'De grens voor relatief marktaandeel moet groter zijn dan nul';
  end if;
  if coalesce(p_confirm, false) and v_growth is null then
    raise exception 'Leg een groeigrens vast. 10%% is geen verplichte standaard.';
  end if;
  if coalesce(p_confirm, false) and length(btrim(coalesce(p_note, ''))) < 8 then
    raise exception 'Motiveer waarom deze groeigrens bij deze markt past';
  end if;
  update app.bcg_versions
  set growth_threshold = v_growth,
      growth_threshold_note = left(btrim(coalesce(p_note, '')), 2000),
      growth_threshold_source = left(btrim(coalesce(p_source, '')), 500),
      share_threshold = v_share,
      thresholds_confirmed = coalesce(p_confirm, false) and v_growth is not null,
      synthesis_reviewed = false
  where id = p_version_id;
  update app.bcg_items
  set review_status = 'pending'::app.bcg_review, reviewed_by = null, reviewed_at = null, updated_at = now()
  where version_id = p_version_id and deleted_at is null and selected;
  perform app._bcg_touch(p_version_id);
end;
$$;

create or replace function app.set_bcg_qualitative(p_version_id uuid, p_on boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
begin
  v_version := app._bcg_version_for_edit(p_version_id);
  if coalesce(p_on, false) and length(btrim(coalesce(p_reason, ''))) < 20 then
    raise exception 'Leg vast waarom een kwantitatieve BCG hier niet past';
  end if;
  update app.bcg_versions
  set qualitative = coalesce(p_on, false),
      qualitative_reason = left(btrim(coalesce(p_reason, '')), 2000),
      synthesis_reviewed = false
  where id = p_version_id;
  perform app._bcg_touch(p_version_id);
end;
$$;

create or replace function app.upsert_bcg_item(
  p_version_id uuid,
  p_item_id uuid,
  p_payload jsonb,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
  v_old app.bcg_items;
  v_id uuid;
  v_title text;
  v_kind text;
  v_growth_method text;
  v_share_method text;
  v_scale text;
  v_amount_scale text;
  v_period text;
  v_basis text;
  v_growth_ev text;
  v_share_ev text;
  v_question text;
begin
  v_version := app._bcg_version_for_edit(p_version_id);
  v_title := left(btrim(coalesce(p_payload->>'title', '')), 300);
  if length(v_title) < 2 then raise exception 'Geef het aanbod een naam'; end if;
  v_kind := coalesce(p_payload->>'kind', 'service');
  if v_kind not in ('product', 'service', 'group', 'unit') then raise exception 'Onbekend type aanbod'; end if;
  v_growth_method := coalesce(nullif(p_payload->>'growth_method', ''), 'none');
  v_share_method := coalesce(nullif(p_payload->>'share_method', ''), 'none');
  v_scale := coalesce(nullif(p_payload->>'size_scale', ''), 'units');
  v_amount_scale := coalesce(nullif(p_payload->>'amount_scale', ''), 'units');
  v_period := coalesce(p_payload->>'period_kind', '');
  v_basis := coalesce(p_payload->>'measure_basis', '');
  v_growth_ev := coalesce(p_payload->>'growth_evidence', '');
  v_share_ev := coalesce(p_payload->>'share_evidence', '');
  v_question := coalesce(p_payload->>'question_status', 'open');
  if v_growth_method not in ('none', 'direct', 'from_size') then raise exception 'Onbekende groeimethode'; end if;
  if v_share_method not in ('none', 'from_shares', 'from_amounts') then raise exception 'Onbekende methode voor marktaandeel'; end if;
  if v_scale not in ('units', 'thousands', 'millions') or v_amount_scale not in ('units', 'thousands', 'millions') then
    raise exception 'Onbekende schaal';
  end if;
  if v_period not in ('', 'year', 'quarter', 'multi_year', 'other') then raise exception 'Onbekende periode'; end if;
  if v_basis not in ('', 'value', 'volume') then raise exception 'Onbekende meetbasis'; end if;
  if v_growth_ev not in ('', 'measured', 'provided', 'forecast', 'estimate')
     or v_share_ev not in ('', 'measured', 'provided', 'forecast', 'estimate') then
    raise exception 'Onbekende bewijsstatus';
  end if;
  if v_question not in ('open', 'queued_meeting', 'answered') then v_question := 'open'; end if;

  if p_item_id is not null then
    v_old := null;
    select * into v_old from app.bcg_items where id = p_item_id and version_id = p_version_id and deleted_at is null;
    if v_old.id is null then raise exception 'Portfolio-item niet gevonden'; end if;
    if p_expected_updated_at is not null and v_old.updated_at <> p_expected_updated_at then
      raise exception 'Dit item is intussen gewijzigd. Herlaad de analyse.';
    end if;
    update app.bcg_items
    set title = v_title,
        description = left(btrim(coalesce(p_payload->>'description', '')), 4000),
        kind = v_kind::app.bcg_item_kind,
        market_definition = left(btrim(coalesce(p_payload->>'market_definition', '')), 500),
        geography = left(btrim(coalesce(p_payload->>'geography', '')), 200),
        segment = left(btrim(coalesce(p_payload->>'segment', '')), 200),
        period_label = left(btrim(coalesce(p_payload->>'period_label', '')), 120),
        period_kind = v_period,
        measure_basis = v_basis,
        currency = left(btrim(coalesce(p_payload->>'currency', '')), 12),
        unit_label = left(btrim(coalesce(p_payload->>'unit_label', '')), 40),
        scope_confirmed = coalesce((p_payload->>'scope_confirmed')::boolean, false),
        growth_method = v_growth_method,
        growth_percent = app._bcg_num(p_payload->>'growth_percent'),
        size_previous = app._bcg_num(p_payload->>'size_previous'),
        size_current = app._bcg_num(p_payload->>'size_current'),
        size_scale = v_scale,
        growth_evidence = v_growth_ev,
        share_method = v_share_method,
        own_share = app._bcg_num(p_payload->>'own_share'),
        leader_share = app._bcg_num(p_payload->>'leader_share'),
        own_amount = app._bcg_num(p_payload->>'own_amount'),
        leader_amount = app._bcg_num(p_payload->>'leader_amount'),
        amount_scale = v_amount_scale,
        client_is_leader = coalesce((p_payload->>'client_is_leader')::boolean, false),
        leader_name = left(btrim(coalesce(p_payload->>'leader_name', '')), 200),
        share_evidence = v_share_ev,
        figures_conflict = left(btrim(coalesce(p_payload->>'figures_conflict', '')), 1000),
        conflict_accepted = coalesce((p_payload->>'conflict_accepted')::boolean, false),
        figures_confirmed = coalesce((p_payload->>'figures_confirmed')::boolean, false),
        manual_lock = true,
        advisor_note = left(btrim(coalesce(p_payload->>'advisor_note', '')), 4000),
        open_question = left(btrim(coalesce(p_payload->>'open_question', '')), 1000),
        question_status = v_question,
        gap_reason = left(btrim(coalesce(p_payload->>'gap_reason', '')), 1000),
        needs_revision = false,
        updated_at = now()
    where id = p_item_id
    returning id into v_id;
  else
    insert into app.bcg_items (
      version_id, tenant_id, title, description, kind, origin, five_c_item_id,
      market_definition, geography, segment, period_label, period_kind, measure_basis,
      currency, unit_label, scope_confirmed, growth_method, growth_percent, size_previous, size_current,
      size_scale, growth_evidence, share_method, own_share, leader_share, own_amount, leader_amount,
      amount_scale, client_is_leader, leader_name, share_evidence, figures_conflict, conflict_accepted,
      manual_lock, advisor_note, open_question, question_status, gap_reason, sort_order, created_by
    ) values (
      p_version_id, v_version.tenant_id, v_title,
      left(btrim(coalesce(p_payload->>'description', '')), 4000),
      v_kind::app.bcg_item_kind,
      case when coalesce(p_payload->>'origin', 'manual') in ('five_c', 'dossier', 'manual', 'ai') then coalesce(p_payload->>'origin', 'manual') else 'manual' end,
      nullif(p_payload->>'five_c_item_id', '')::uuid,
      left(btrim(coalesce(p_payload->>'market_definition', v_version.market_label)), 500),
      left(btrim(coalesce(p_payload->>'geography', v_version.geography)), 200),
      left(btrim(coalesce(p_payload->>'segment', v_version.segment)), 200),
      left(btrim(coalesce(p_payload->>'period_label', v_version.period_label)), 120),
      case when v_period = '' then v_version.period_kind else v_period end,
      case when v_basis = '' then v_version.measure_basis else v_basis end,
      left(btrim(coalesce(p_payload->>'currency', v_version.currency)), 12),
      left(btrim(coalesce(p_payload->>'unit_label', v_version.unit_label)), 40),
      coalesce((p_payload->>'scope_confirmed')::boolean, false),
      v_growth_method, app._bcg_num(p_payload->>'growth_percent'), app._bcg_num(p_payload->>'size_previous'), app._bcg_num(p_payload->>'size_current'),
      v_scale, v_growth_ev, v_share_method, app._bcg_num(p_payload->>'own_share'), app._bcg_num(p_payload->>'leader_share'),
      app._bcg_num(p_payload->>'own_amount'), app._bcg_num(p_payload->>'leader_amount'), v_amount_scale,
      coalesce((p_payload->>'client_is_leader')::boolean, false),
      left(btrim(coalesce(p_payload->>'leader_name', '')), 200),
      v_share_ev, left(btrim(coalesce(p_payload->>'figures_conflict', '')), 1000),
      coalesce((p_payload->>'conflict_accepted')::boolean, false),
      true,
      left(btrim(coalesce(p_payload->>'advisor_note', '')), 4000),
      left(btrim(coalesce(p_payload->>'open_question', '')), 1000),
      v_question, left(btrim(coalesce(p_payload->>'gap_reason', '')), 1000),
      coalesce((select max(sort_order) + 1 from app.bcg_items where version_id = p_version_id and deleted_at is null), 0),
      auth.uid()
    ) returning id into v_id;
  end if;

  perform app._bcg_replace_refs(v_id, v_version, p_payload->'refs');
  perform app._bcg_store_results(v_id);
  perform app._bcg_reopen_item(v_id);
  perform app._bcg_touch(p_version_id);
  return v_id;
end;
$$;

create or replace function app.set_bcg_selection(p_item_id uuid, p_selected boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.bcg_items;
begin
  v_item := null;
  select * into v_item from app.bcg_items where id = p_item_id and deleted_at is null;
  if v_item.id is null then raise exception 'Portfolio-item niet gevonden'; end if;
  perform app._bcg_version_for_edit(v_item.version_id);
  if not coalesce(p_selected, false) and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Geef een reden om dit aanbod uit te sluiten';
  end if;
  update app.bcg_items
  set selected = coalesce(p_selected, false),
      exclusion_reason = case when coalesce(p_selected, false) then '' else left(btrim(p_reason), 1000) end,
      updated_at = now()
  where id = p_item_id;
  perform app._bcg_touch(v_item.version_id);
end;
$$;

create or replace function app.set_bcg_overlap(p_item_id uuid, p_mode text, p_key text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.bcg_items;
  v_mode text;
begin
  v_item := null;
  select * into v_item from app.bcg_items where id = p_item_id and deleted_at is null;
  if v_item.id is null then raise exception 'Portfolio-item niet gevonden'; end if;
  perform app._bcg_version_for_edit(v_item.version_id);
  v_mode := coalesce(p_mode, 'unset');
  if v_mode not in ('unset', 'count', 'excluded') then raise exception 'Onbekende overlapkeuze'; end if;
  update app.bcg_items
  set overlap_mode = v_mode::app.bcg_overlap,
      overlap_key = left(btrim(coalesce(p_key, overlap_key)), 80),
      updated_at = now()
  where id = p_item_id;
  perform app._bcg_touch(v_item.version_id);
end;
$$;

create or replace function app.split_bcg_item(p_item_id uuid, p_titles jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.bcg_items;
  v_version app.bcg_versions;
  v_title text;
  v_count integer;
begin
  v_item := null;
  select * into v_item from app.bcg_items where id = p_item_id and deleted_at is null;
  if v_item.id is null then raise exception 'Portfolio-item niet gevonden'; end if;
  v_version := app._bcg_version_for_edit(v_item.version_id);
  if jsonb_typeof(p_titles) <> 'array' then raise exception 'Geef minstens twee delen'; end if;
  select count(*) into v_count from jsonb_array_elements_text(p_titles) t where length(btrim(t)) >= 2;
  if v_count < 2 or v_count > 6 then raise exception 'Splits in twee tot zes aanbiedingen'; end if;
  update app.bcg_items
  set selected = false,
      exclusion_reason = 'Opgesplitst in aparte aanbiedingen',
      overlap_mode = 'excluded'::app.bcg_overlap,
      updated_at = now()
  where id = p_item_id;
  for v_title in select btrim(value) from jsonb_array_elements_text(p_titles) where length(btrim(value)) >= 2
  loop
    insert into app.bcg_items (
      version_id, tenant_id, title, kind, origin, parent_item_id,
      market_definition, geography, segment, period_label, period_kind, measure_basis,
      currency, unit_label, selected, manual_lock, sort_order, created_by
    ) values (
      v_item.version_id, v_item.tenant_id, left(v_title, 300),
      case when v_item.kind = 'group'::app.bcg_item_kind then 'service'::app.bcg_item_kind else v_item.kind end,
      'manual', p_item_id,
      v_item.market_definition, v_item.geography, v_item.segment, v_item.period_label, v_item.period_kind, v_item.measure_basis,
      v_item.currency, v_item.unit_label, true, false,
      coalesce((select max(sort_order) + 1 from app.bcg_items where version_id = v_item.version_id), 0),
      auth.uid()
    );
  end loop;
  perform app._bcg_reopen_item(p_item_id);
  perform app._bcg_touch(v_version.id);
end;
$$;

create or replace function app.set_bcg_review(p_item_id uuid, p_reviewed boolean, p_gap text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.bcg_items;
  v_version app.bcg_versions;
begin
  v_item := null;
  select * into v_item from app.bcg_items where id = p_item_id and deleted_at is null;
  if v_item.id is null then raise exception 'Portfolio-item niet gevonden'; end if;
  v_version := app._bcg_version_for_edit(v_item.version_id);
  if coalesce(p_reviewed, false) then
    if p_gap is not null then
      update app.bcg_items set gap_reason = left(btrim(p_gap), 1000) where id = p_item_id;
      v_item.gap_reason := left(btrim(p_gap), 1000);
    end if;
    if not app.bcg_item_placeable(v_item, v_version) and length(btrim(v_item.gap_reason)) < 10 and not v_version.qualitative then
      raise exception 'Leg vast waarom dit aanbod niet geplaatst kan worden';
    end if;
    update app.bcg_items
    set review_status = 'reviewed'::app.bcg_review,
        figures_confirmed = true,
        manual_lock = true,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    where id = p_item_id;
  else
    update app.bcg_items
    set review_status = 'pending'::app.bcg_review, reviewed_by = null, reviewed_at = null, updated_at = now()
    where id = p_item_id;
    update app.bcg_versions set synthesis_reviewed = false where id = v_item.version_id;
  end if;
end;
$$;

create or replace function app.adopt_bcg_offerings(p_version_id uuid)
returns integer
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
  v_count integer := 0;
  v_item app.five_c_items;
begin
  v_version := app._bcg_version_for_edit(p_version_id);
  if v_version.five_c_version_id is null then
    raise exception 'Er is nog geen goedgekeurde 5C om aanbod uit over te nemen';
  end if;
  for v_item in
    select * from app.five_c_items fi
    where fi.version_id = v_version.five_c_version_id
      and fi.deleted_at is null
      and fi.c_key = 'company'::app.five_c_key
      and fi.review_status <> 'rejected'::app.five_c_review
      and length(btrim(fi.title)) >= 2
      and not exists (
        select 1 from app.bcg_items i
        where i.version_id = p_version_id and i.five_c_item_id = fi.id and i.deleted_at is null
      )
  loop
    insert into app.bcg_items (
      version_id, tenant_id, title, description, kind, origin, five_c_item_id,
      market_definition, geography, segment, period_label, period_kind, measure_basis,
      currency, unit_label, selected, manual_lock, sort_order, created_by
    ) values (
      p_version_id, v_version.tenant_id, left(btrim(v_item.title), 300), left(v_item.finding, 4000),
      'service', 'five_c', v_item.id,
      v_version.market_label, v_version.geography, v_version.segment, v_version.period_label,
      v_version.period_kind, v_version.measure_basis, v_version.currency, v_version.unit_label,
      true, false,
      coalesce((select max(sort_order) + 1 from app.bcg_items where version_id = p_version_id and deleted_at is null), 0),
      auth.uid()
    );
    v_count := v_count + 1;
  end loop;
  if v_count > 0 then perform app._bcg_touch(p_version_id); end if;
  return v_count;
end;
$$;
create or replace function app.save_bcg_ai_result(p_version_id uuid, p_payload jsonb, p_model text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
  v_row jsonb;
  v_item app.bcg_items;
  v_body jsonb;
  v_apply boolean;
  v_locked boolean;
begin
  v_version := app._bcg_version_for_edit(p_version_id);
  if jsonb_typeof(p_payload->'items') = 'array' then
    for v_row in select value from jsonb_array_elements(p_payload->'items')
    loop
      v_item := null;
      select * into v_item from app.bcg_items
      where id = nullif(v_row->>'item_id', '')::uuid and version_id = p_version_id and deleted_at is null;
      if v_item.id is null then continue; end if;
      v_body := coalesce(v_row->'payload', '{}'::jsonb);
      v_apply := coalesce((v_row->>'apply')::boolean, false);
      v_locked := v_item.manual_lock or v_item.figures_confirmed
        or v_item.growth_percent is not null or v_item.size_previous is not null or v_item.size_current is not null
        or v_item.own_share is not null or v_item.leader_share is not null
        or v_item.own_amount is not null or v_item.leader_amount is not null
        or btrim(v_item.market_definition) <> '' or btrim(v_item.leader_name) <> '';
      if v_apply and not v_locked then
        update app.bcg_items
        set market_definition = case when btrim(coalesce(v_body->>'market_definition', '')) <> '' then left(v_body->>'market_definition', 500) else market_definition end,
            geography = case when btrim(coalesce(v_body->>'geography', '')) <> '' then left(v_body->>'geography', 200) else geography end,
            segment = case when btrim(coalesce(v_body->>'segment', '')) <> '' then left(v_body->>'segment', 200) else segment end,
            period_label = case when btrim(coalesce(v_body->>'period_label', '')) <> '' then left(v_body->>'period_label', 120) else period_label end,
            measure_basis = case when coalesce(v_body->>'measure_basis', '') in ('value', 'volume') then v_body->>'measure_basis' else measure_basis end,
            growth_method = case when coalesce(v_body->>'growth_method', '') in ('direct', 'from_size') then v_body->>'growth_method' else growth_method end,
            growth_percent = coalesce(app._bcg_num(v_body->>'growth_percent'), growth_percent),
            size_previous = coalesce(app._bcg_num(v_body->>'size_previous'), size_previous),
            size_current = coalesce(app._bcg_num(v_body->>'size_current'), size_current),
            share_method = case when coalesce(v_body->>'share_method', '') in ('from_shares', 'from_amounts') then v_body->>'share_method' else share_method end,
            own_share = coalesce(app._bcg_num(v_body->>'own_share'), own_share),
            leader_share = coalesce(app._bcg_num(v_body->>'leader_share'), leader_share),
            own_amount = coalesce(app._bcg_num(v_body->>'own_amount'), own_amount),
            leader_amount = coalesce(app._bcg_num(v_body->>'leader_amount'), leader_amount),
            leader_name = case when btrim(coalesce(v_body->>'leader_name', '')) <> '' then left(v_body->>'leader_name', 200) else leader_name end,
            open_question = case when btrim(coalesce(v_body->>'open_question', '')) <> '' then left(v_body->>'open_question', 1000) else open_question end,
            figures_conflict = left(btrim(coalesce(v_body->>'conflict', '')), 1000),
            growth_evidence = case when coalesce(v_body->>'growth_evidence', '') in ('measured', 'provided', 'forecast', 'estimate') then v_body->>'growth_evidence' else growth_evidence end,
            share_evidence = case when coalesce(v_body->>'share_evidence', '') in ('measured', 'provided', 'forecast', 'estimate') then v_body->>'share_evidence' else share_evidence end,
            ai_state = 'accepted'::app.bcg_ai_state,
            ai_payload = '{}'::jsonb,
            ai_generated_at = now(),
            updated_at = now()
        where id = v_item.id;
        if jsonb_typeof(v_body->'refs') = 'array' and not exists (select 1 from app.bcg_item_refs r where r.item_id = v_item.id) then
          perform app._bcg_replace_refs(v_item.id, v_version, v_body->'refs');
        end if;
        perform app._bcg_store_results(v_item.id);
        perform app._bcg_reopen_item(v_item.id);
        insert into app.bcg_ai_history (version_id, tenant_id, item_id, proposal, decision, decided_by)
        values (p_version_id, v_version.tenant_id, v_item.id, v_body, 'accepted', auth.uid());
      else
        update app.bcg_items
        set ai_state = 'proposed'::app.bcg_ai_state, ai_payload = v_body, ai_generated_at = now(), updated_at = now()
        where id = v_item.id;
        insert into app.bcg_ai_history (version_id, tenant_id, item_id, proposal, decision, decided_by)
        values (p_version_id, v_version.tenant_id, v_item.id, v_body, 'proposed', auth.uid());
      end if;
    end loop;
  end if;
  update app.bcg_versions
  set ai_questions = coalesce(p_payload->'questions', '[]'::jsonb),
      ai_generated_at = now(),
      synthesis_reviewed = false
  where id = p_version_id;
  perform app._bcg_touch(p_version_id);
end;
$$;

create or replace function app.resolve_bcg_ai_proposal(p_item_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.bcg_items;
  v_version app.bcg_versions;
  v_body jsonb;
begin
  v_item := null;
  select * into v_item from app.bcg_items where id = p_item_id and deleted_at is null;
  if v_item.id is null then raise exception 'Portfolio-item niet gevonden'; end if;
  v_version := app._bcg_version_for_edit(v_item.version_id);
  if v_item.ai_state <> 'proposed'::app.bcg_ai_state then
    raise exception 'Er staat geen voorstel open';
  end if;
  v_body := v_item.ai_payload;
  if coalesce(p_accept, false) then
    if v_item.manual_lock or v_item.figures_confirmed then
      raise exception 'Bevestigde of handmatige cijfers worden niet overschreven';
    end if;
    update app.bcg_items
    set market_definition = case when btrim(coalesce(v_body->>'market_definition', '')) <> '' then left(v_body->>'market_definition', 500) else market_definition end,
        geography = case when btrim(coalesce(v_body->>'geography', '')) <> '' then left(v_body->>'geography', 200) else geography end,
        segment = case when btrim(coalesce(v_body->>'segment', '')) <> '' then left(v_body->>'segment', 200) else segment end,
        period_label = case when btrim(coalesce(v_body->>'period_label', '')) <> '' then left(v_body->>'period_label', 120) else period_label end,
        measure_basis = case when coalesce(v_body->>'measure_basis', '') in ('value', 'volume') then v_body->>'measure_basis' else measure_basis end,
        growth_method = case when coalesce(v_body->>'growth_method', '') in ('direct', 'from_size') then v_body->>'growth_method' else growth_method end,
        growth_percent = coalesce(app._bcg_num(v_body->>'growth_percent'), growth_percent),
        size_previous = coalesce(app._bcg_num(v_body->>'size_previous'), size_previous),
        size_current = coalesce(app._bcg_num(v_body->>'size_current'), size_current),
        share_method = case when coalesce(v_body->>'share_method', '') in ('from_shares', 'from_amounts') then v_body->>'share_method' else share_method end,
        own_share = coalesce(app._bcg_num(v_body->>'own_share'), own_share),
        leader_share = coalesce(app._bcg_num(v_body->>'leader_share'), leader_share),
        own_amount = coalesce(app._bcg_num(v_body->>'own_amount'), own_amount),
        leader_amount = coalesce(app._bcg_num(v_body->>'leader_amount'), leader_amount),
        leader_name = case when btrim(coalesce(v_body->>'leader_name', '')) <> '' then left(v_body->>'leader_name', 200) else leader_name end,
        open_question = case when btrim(coalesce(v_body->>'open_question', '')) <> '' then left(v_body->>'open_question', 1000) else open_question end,
        figures_conflict = left(btrim(coalesce(v_body->>'conflict', figures_conflict)), 1000),
        growth_evidence = case when coalesce(v_body->>'growth_evidence', '') in ('measured', 'provided', 'forecast', 'estimate') then v_body->>'growth_evidence' else growth_evidence end,
        share_evidence = case when coalesce(v_body->>'share_evidence', '') in ('measured', 'provided', 'forecast', 'estimate') then v_body->>'share_evidence' else share_evidence end,
        ai_state = 'accepted'::app.bcg_ai_state,
        ai_payload = '{}'::jsonb,
        updated_at = now()
    where id = p_item_id;
    if jsonb_typeof(v_body->'refs') = 'array' and not exists (select 1 from app.bcg_item_refs r where r.item_id = p_item_id) then
      perform app._bcg_replace_refs(p_item_id, v_version, v_body->'refs');
    end if;
    perform app._bcg_store_results(p_item_id);
    perform app._bcg_reopen_item(p_item_id);
    insert into app.bcg_ai_history (version_id, tenant_id, item_id, proposal, decision, decided_by)
    values (v_item.version_id, v_item.tenant_id, p_item_id, v_body, 'accepted', auth.uid());
  else
    update app.bcg_items
    set ai_state = 'rejected'::app.bcg_ai_state, ai_payload = '{}'::jsonb, updated_at = now()
    where id = p_item_id;
    insert into app.bcg_ai_history (version_id, tenant_id, item_id, proposal, decision, decided_by)
    values (v_item.version_id, v_item.tenant_id, p_item_id, v_body, 'rejected', auth.uid());
  end if;
  perform app._bcg_touch(v_item.version_id);
end;
$$;

create or replace function app.save_bcg_synthesis(p_version_id uuid, p_text text, p_reviewed boolean)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
  v_text text;
begin
  v_version := app._bcg_version_for_edit(p_version_id);
  v_text := left(btrim(coalesce(p_text, '')), 12000);
  if coalesce(p_reviewed, false) and length(v_text) < 20 then
    raise exception 'Schrijf eerst wat dit portfolio betekent';
  end if;
  update app.bcg_versions
  set synthesis_text = v_text,
      synthesis_reviewed = coalesce(p_reviewed, false),
      status = case
        when coalesce(p_reviewed, false) then 'in_review'::app.bcg_version_status
        when status = 'in_review'::app.bcg_version_status then 'draft'::app.bcg_version_status
        when status = 'not_started'::app.bcg_version_status then 'draft'::app.bcg_version_status
        else status
      end,
      updated_at = now()
  where id = p_version_id;
end;
$$;

create or replace function app.approve_bcg_version(p_version_id uuid, p_expected_updated_at timestamptz)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
  v_item app.bcg_items;
  v_selected integer;
begin
  v_version := app._bcg_version_for_edit(p_version_id);
  if p_expected_updated_at is not null and v_version.updated_at <> p_expected_updated_at then
    raise exception 'Versie is intussen gewijzigd; herlaad de pagina';
  end if;
  if not v_version.synthesis_reviewed or length(btrim(v_version.synthesis_text)) < 20 then
    raise exception 'Beoordeel eerst de synthese';
  end if;
  if v_version.qualitative and length(btrim(v_version.qualitative_reason)) < 20 then
    raise exception 'De kwalitatieve bespreking heeft nog geen reden';
  end if;
  if not v_version.qualitative and (not v_version.thresholds_confirmed or v_version.growth_threshold is null) then
    raise exception 'Bevestig eerst de groeigrens';
  end if;
  select count(*) into v_selected from app.bcg_items
  where version_id = p_version_id and deleted_at is null and selected;
  if v_selected = 0 and not v_version.qualitative then
    raise exception 'Selecteer minstens één aanbod';
  end if;
  if app._bcg_overlap_open(p_version_id) then
    raise exception 'Kies welk overlappend aanbod meetelt. Hetzelfde aanbod telt niet dubbel.';
  end if;
  for v_item in
    select * from app.bcg_items where version_id = p_version_id and deleted_at is null and selected
  loop
    if v_item.review_status <> 'reviewed'::app.bcg_review then
      raise exception 'Beoordeel elk geselecteerd aanbod, of leg een datagat vast';
    end if;
    if not v_version.qualitative and not app.bcg_item_placeable(v_item, v_version) and length(btrim(v_item.gap_reason)) < 10 then
      raise exception 'Niet-plaatsbaar aanbod heeft een vastgelegde reden nodig';
    end if;
  end loop;
  update app.bcg_versions
  set status = 'approved'::app.bcg_version_status,
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  where id = p_version_id;
end;
$$;

create or replace function app.create_bcg_revision(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_source app.bcg_versions;
  v_new uuid;
  v_item app.bcg_items;
  v_new_item uuid;
  v_map jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_source := null;
  select * into v_source from app.bcg_versions where id = p_version_id;
  if v_source.id is null then raise exception 'Versie niet gevonden'; end if;
  if not app.has_capability(v_source.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_source.status <> 'approved'::app.bcg_version_status then
    raise exception 'Alleen een goedgekeurde versie kan herzien worden';
  end if;
  insert into app.bcg_versions (
    tenant_id, version_number, status, scope_label, market_label, geography, segment, period_label,
    period_kind, measure_basis, currency, unit_label, growth_threshold, growth_threshold_note,
    growth_threshold_source, share_threshold, thresholds_confirmed, qualitative, qualitative_reason,
    synthesis_text, vrio_version_id, swot_version_id, five_c_version_id, porter_version_id, pestel_version_id, created_by
  ) values (
    v_source.tenant_id,
    (select coalesce(max(version_number), 0) + 1 from app.bcg_versions where tenant_id = v_source.tenant_id),
    'draft', v_source.scope_label, v_source.market_label, v_source.geography, v_source.segment, v_source.period_label,
    v_source.period_kind, v_source.measure_basis, v_source.currency, v_source.unit_label, v_source.growth_threshold,
    v_source.growth_threshold_note, v_source.growth_threshold_source, v_source.share_threshold, v_source.thresholds_confirmed,
    v_source.qualitative, v_source.qualitative_reason, v_source.synthesis_text,
    v_source.vrio_version_id, v_source.swot_version_id, v_source.five_c_version_id, v_source.porter_version_id, v_source.pestel_version_id,
    auth.uid()
  ) returning id into v_new;

  for v_item in select * from app.bcg_items where version_id = v_source.id and deleted_at is null order by sort_order, created_at
  loop
    insert into app.bcg_items (
      version_id, tenant_id, title, description, kind, origin, five_c_item_id, overlap_key, overlap_mode,
      selected, exclusion_reason, market_definition, geography, segment, period_label, period_kind, measure_basis,
      currency, unit_label, scope_confirmed, growth_method, growth_percent, size_previous, size_current, size_scale,
      growth_evidence, share_method, own_share, leader_share, own_amount, leader_amount, amount_scale,
      client_is_leader, leader_name, share_evidence, figures_conflict, conflict_accepted, figures_confirmed, manual_lock,
      advisor_note, open_question, question_status, gap_reason, growth_result, relative_result, sort_order, created_by
    ) values (
      v_new, v_item.tenant_id, v_item.title, v_item.description, v_item.kind, v_item.origin, v_item.five_c_item_id,
      v_item.overlap_key, v_item.overlap_mode, v_item.selected, v_item.exclusion_reason, v_item.market_definition,
      v_item.geography, v_item.segment, v_item.period_label, v_item.period_kind, v_item.measure_basis, v_item.currency,
      v_item.unit_label, v_item.scope_confirmed, v_item.growth_method, v_item.growth_percent, v_item.size_previous,
      v_item.size_current, v_item.size_scale, v_item.growth_evidence, v_item.share_method, v_item.own_share,
      v_item.leader_share, v_item.own_amount, v_item.leader_amount, v_item.amount_scale, v_item.client_is_leader,
      v_item.leader_name, v_item.share_evidence, v_item.figures_conflict, v_item.conflict_accepted, v_item.figures_confirmed,
      v_item.manual_lock, v_item.advisor_note, v_item.open_question, v_item.question_status, v_item.gap_reason,
      v_item.growth_result, v_item.relative_result, v_item.sort_order, auth.uid()
    ) returning id into v_new_item;
    v_map := v_map || jsonb_build_object(v_item.id::text, v_new_item::text);
    insert into app.bcg_item_refs (item_id, tenant_id, ref_type, ref_id, label, excerpt, slot)
    select v_new_item, tenant_id, ref_type, ref_id, label, excerpt, slot
    from app.bcg_item_refs where item_id = v_item.id;
  end loop;

  update app.bcg_items child
  set parent_item_id = nullif(v_map->>old.parent_item_id::text, '')::uuid
  from app.bcg_items old
  where old.version_id = v_source.id
    and old.parent_item_id is not null
    and child.id = nullif(v_map->>old.id::text, '')::uuid;

  return v_new;
end;
$$;

create or replace function app.add_bcg_scope(p_tenant_id uuid, p_label text)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_id uuid;
  v_vrio app.vrio_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if length(btrim(coalesce(p_label, ''))) < 2 then raise exception 'Geef deze portfolioanalyse een naam'; end if;
  v_vrio := null;
  select * into v_vrio from app.vrio_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.vrio_version_status
  order by version_number desc limit 1;
  insert into app.bcg_versions (
    tenant_id, version_number, status, scope_label, created_by,
    vrio_version_id, swot_version_id, five_c_version_id, porter_version_id, pestel_version_id
  ) values (
    p_tenant_id,
    (select coalesce(max(version_number), 0) + 1 from app.bcg_versions where tenant_id = p_tenant_id),
    'draft', left(btrim(p_label), 200), auth.uid(), v_vrio.id,
    coalesce(v_vrio.swot_version_id, (select id from app.swot_versions where tenant_id = p_tenant_id and status = 'approved'::app.swot_version_status order by version_number desc limit 1)),
    coalesce(v_vrio.five_c_version_id, (select id from app.five_c_versions where tenant_id = p_tenant_id and status = 'approved'::app.five_c_version_status order by version_number desc limit 1)),
    coalesce(v_vrio.porter_version_id, (select id from app.porter_versions where tenant_id = p_tenant_id and status = 'approved'::app.porter_version_status order by version_number desc limit 1)),
    coalesce(v_vrio.pestel_version_id, (select id from app.pestel_versions where tenant_id = p_tenant_id and status = 'approved'::app.pestel_version_status order by version_number desc limit 1))
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function app.publish_bcg_version(p_version_id uuid, p_publish_figures boolean)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_version := null;
  select * into v_version from app.bcg_versions where id = p_version_id;
  if v_version.id is null then raise exception 'Versie niet gevonden'; end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_version.status <> 'approved'::app.bcg_version_status then
    raise exception 'Alleen een goedgekeurde versie kan worden gepubliceerd';
  end if;
  if not coalesce(p_publish_figures, false)
     and v_version.synthesis_text ~ '[€$]|[0-9]+[.,][0-9]{1,2}\s?%|[0-9]+\s?[×x]' then
    raise exception 'De synthese bevat cijfers terwijl de matrixcijfers niet worden vrijgegeven';
  end if;
  update app.bcg_versions
  set publish_figures = coalesce(p_publish_figures, false),
      published_at = now(),
      published_by = auth.uid()
  where id = p_version_id;
end;
$$;

create or replace function app.unpublish_bcg_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_version := null;
  select * into v_version from app.bcg_versions where id = p_version_id;
  if v_version.id is null then raise exception 'Versie niet gevonden'; end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  update app.bcg_versions set published_at = null, published_by = null where id = p_version_id;
end;
$$;

create or replace function app.get_bcg_published(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'dashboard.read_published')
     and not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  v_version := null;
  select * into v_version from app.bcg_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.bcg_version_status and published_at is not null
  order by version_number desc limit 1;
  if v_version.id is null then
    return jsonb_build_object('published', false);
  end if;
  return jsonb_build_object(
    'published', true,
    'version_number', v_version.version_number,
    'published_at', v_version.published_at,
    'scope_label', v_version.scope_label,
    'market_label', v_version.market_label,
    'period_label', v_version.period_label,
    'period_kind', v_version.period_kind,
    'measure_basis', v_version.measure_basis,
    'qualitative', v_version.qualitative,
    'qualitative_reason', v_version.qualitative_reason,
    'synthesis', v_version.synthesis_text,
    'figures_included', v_version.publish_figures and not v_version.qualitative,
    'growth_threshold', case when v_version.publish_figures then v_version.growth_threshold else null end,
    'share_threshold', case when v_version.publish_figures then v_version.share_threshold else null end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', i.title,
        'market_definition', i.market_definition,
        'geography', i.geography,
        'segment', i.segment,
        'period_label', i.period_label,
        'measure_basis', i.measure_basis,
        'placeable', app.bcg_item_placeable(i, v_version),
        'gap_reason', i.gap_reason,
        'open_question', i.open_question,
        'growth', case when v_version.publish_figures and not v_version.qualitative then i.growth_result else null end,
        'relative', case when v_version.publish_figures and not v_version.qualitative then i.relative_result else null end,
        'growth_evidence', case when v_version.publish_figures then i.growth_evidence else '' end,
        'share_evidence', case when v_version.publish_figures then i.share_evidence else '' end
      ) order by i.sort_order)
      from app.bcg_items i
      where i.version_id = v_version.id and i.deleted_at is null and i.selected
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function app.get_bcg_context(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  v_version := null;
  select * into v_version from app.bcg_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.bcg_version_status
  order by version_number desc limit 1;
  if v_version.id is null then
    return jsonb_build_object('approved', false);
  end if;
  return jsonb_build_object(
    'approved', true,
    'version_number', v_version.version_number,
    'qualitative', v_version.qualitative,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', i.title,
        'placeable', app.bcg_item_placeable(i, v_version),
        'quadrant', case
          when v_version.qualitative then null
          when app.bcg_item_placeable(i, v_version) then app.bcg_quadrant(i.growth_result, i.relative_result, v_version.growth_threshold, v_version.share_threshold)
          else null
        end
      ) order by i.sort_order)
      from app.bcg_items i
      where i.version_id = v_version.id and i.deleted_at is null and i.selected
    ), '[]'::jsonb)
  );
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
  v_bcg uuid;
  v_vc uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

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
  select id into v_bcg from app.bcg_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.bcg_version_status
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
    'bcg_approved', v_bcg is not null,
    'bcg_version_id', v_bcg,
    'value_chain_approved', v_vc is not null,
    'value_chain_version_id', v_vc
  );
end;
$$;

grant execute on function app.get_bcg_workbench(uuid, uuid) to authenticated;
grant execute on function app.save_bcg_scope(uuid, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function app.save_bcg_thresholds(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function app.set_bcg_qualitative(uuid, boolean, text) to authenticated;
grant execute on function app.upsert_bcg_item(uuid, uuid, jsonb, timestamptz) to authenticated;
grant execute on function app.set_bcg_selection(uuid, boolean, text) to authenticated;
grant execute on function app.set_bcg_overlap(uuid, text, text) to authenticated;
grant execute on function app.split_bcg_item(uuid, jsonb) to authenticated;
grant execute on function app.set_bcg_review(uuid, boolean, text) to authenticated;
grant execute on function app.adopt_bcg_offerings(uuid) to authenticated;
grant execute on function app.save_bcg_ai_result(uuid, jsonb, text) to authenticated;
grant execute on function app.resolve_bcg_ai_proposal(uuid, boolean) to authenticated;
grant execute on function app.save_bcg_synthesis(uuid, text, boolean) to authenticated;
grant execute on function app.approve_bcg_version(uuid, timestamptz) to authenticated;
grant execute on function app.create_bcg_revision(uuid) to authenticated;
grant execute on function app.add_bcg_scope(uuid, text) to authenticated;
grant execute on function app.publish_bcg_version(uuid, boolean) to authenticated;
grant execute on function app.unpublish_bcg_version(uuid) to authenticated;
grant execute on function app.get_bcg_published(uuid) to authenticated;
grant execute on function app.get_bcg_context(uuid) to authenticated;
grant execute on function app.get_audit_framework_progress(uuid) to authenticated;

revoke execute on function app._bcg_num(text) from public, anon, authenticated;
revoke execute on function app._bcg_txt(numeric) from public, anon, authenticated;
revoke execute on function app._bcg_version_for_edit(uuid) from public, anon, authenticated;
revoke execute on function app._bcg_touch(uuid) from public, anon, authenticated;
revoke execute on function app._bcg_reopen_item(uuid) from public, anon, authenticated;
revoke execute on function app._bcg_store_results(uuid) from public, anon, authenticated;
revoke execute on function app._bcg_ref_valid(app.bcg_versions, app.bcg_ref_type, uuid) from public, anon, authenticated;
revoke execute on function app._bcg_replace_refs(uuid, app.bcg_versions, jsonb) from public, anon, authenticated;
revoke execute on function app._bcg_overlap_open(uuid) from public, anon, authenticated;
revoke execute on function app.bcg_growth(text, numeric, numeric, numeric, text, text) from public, anon, authenticated;
revoke execute on function app.bcg_relative(text, numeric, numeric, numeric, numeric, text, text) from public, anon, authenticated;
revoke execute on function app.bcg_quadrant(numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke execute on function app.bcg_item_placeable(app.bcg_items, app.bcg_versions) from public, anon, authenticated;
