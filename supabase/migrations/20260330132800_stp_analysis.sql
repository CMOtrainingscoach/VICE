-- Strategische audit · stap 8: STP en één ICP per versie.
-- Onbekend blijft leeg. AI keurt niets goed en publiceert niets.

create type app.stp_version_status as enum (
  'not_started', 'draft', 'in_review', 'approved', 'needs_revision'
);

create table app.stp_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  version_number integer not null,
  status app.stp_version_status not null default 'not_started',
  current_step text not null default 'intake' check (current_step in ('intake', 'segments', 'target', 'position', 'icp')),
  offering text not null default '',
  geography text not null default '',
  scope_note text not null default '',
  scope_confirmed boolean not null default false,
  segments_confirmed boolean not null default false,
  target_confirmed boolean not null default false,
  position_confirmed boolean not null default false,
  target_motivation text not null default '',
  preference_note text not null default '',
  preference_tradeoffs text not null default '',
  preference_risks text not null default '',
  audience text not null default '',
  problem text not null default '',
  promise text not null default '',
  distinction text not null default '',
  evidence_text text not null default '',
  position_sentence text not null default '',
  claim_status text not null default 'hypothesis' check (claim_status in ('supported', 'hypothesis', 'missing', 'conflict')),
  icp_name text not null default '',
  icp_summary text not null default '',
  icp_sector text not null default '',
  icp_stage text not null default '',
  icp_size text not null default '',
  icp_structure text not null default '',
  icp_tech text not null default '',
  icp_problem text not null default '',
  icp_need text not null default '',
  icp_outcome text not null default '',
  icp_trigger text not null default '',
  icp_inaction text not null default '',
  icp_budget text not null default '',
  icp_capacity text not null default '',
  icp_conditions text not null default '',
  icp_timing text not null default '',
  assumptions text not null default '',
  open_questions text not null default '',
  accepted_uncertainty text not null default '',
  needs_review boolean not null default false,
  review_note text not null default '',
  ai_proposal jsonb not null default '{}'::jsonb,
  ai_generated_at timestamptz,
  published_at timestamptz,
  published_by uuid references auth.users (id),
  pestel_version_id uuid references app.pestel_versions (id) on delete set null,
  porter_version_id uuid references app.porter_versions (id) on delete set null,
  five_c_version_id uuid references app.five_c_versions (id) on delete set null,
  swot_version_id uuid references app.swot_versions (id) on delete set null,
  vrio_version_id uuid references app.vrio_versions (id) on delete set null,
  bcg_version_id uuid references app.bcg_versions (id) on delete set null,
  vc_version_id uuid references app.vc_versions (id) on delete set null,
  primary_segment_id uuid,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, version_number)
);

create table app.stp_segments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.stp_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  name text not null default '',
  description text not null default '',
  need text not null default '',
  traits text not null default '',
  geography text not null default '',
  trigger_text text not null default '',
  offering text not null default '',
  include_criteria text not null default '',
  exclude_criteria text not null default '',
  assumptions text not null default '',
  open_question text not null default '',
  hypothesis boolean not null default false,
  disposition text not null default 'unset' check (disposition in ('unset', 'primary', 'later', 'not_priority', 'excluded')),
  exclusion_reason text not null default '',
  overlap_note text not null default '',
  manual_lock boolean not null default false,
  origin text not null default 'manual' check (origin in ('ai', 'manual')),
  ai_state text not null default 'none' check (ai_state in ('none', 'proposed', 'accepted', 'rejected')),
  ai_payload jsonb not null default '{}'::jsonb,
  merged_into uuid,
  archived_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app.stp_versions
  add constraint stp_versions_primary_segment_fk
  foreign key (primary_segment_id) references app.stp_segments (id) on delete set null;

create table app.stp_scores (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references app.stp_segments (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  dimension text not null check (dimension in ('need', 'offer', 'capability', 'reach', 'delivery', 'commercial')),
  rating text not null default 'unknown' check (rating in ('strong', 'mixed', 'weak', 'unknown')),
  note text not null default '',
  assumption text not null default '',
  unique (segment_id, dimension)
);

create table app.stp_criteria (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.stp_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  kind text not null check (kind in ('must', 'plus', 'exclude')),
  body text not null default '',
  sort_order integer not null default 0
);

create table app.stp_refs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.stp_versions (id) on delete cascade,
  segment_id uuid references app.stp_segments (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  ref_type text not null,
  ref_id uuid,
  label text not null default '',
  excerpt text not null default '',
  slot text not null default 'general',
  created_at timestamptz not null default now()
);

create table app.stp_ai_history (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.stp_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  kind text not null,
  proposal jsonb not null default '{}'::jsonb,
  decision text not null default 'proposed',
  decided_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index stp_versions_tenant_idx on app.stp_versions (tenant_id, version_number desc);
create index stp_segments_version_idx on app.stp_segments (version_id, sort_order);

alter table app.stp_versions enable row level security;
alter table app.stp_segments enable row level security;
alter table app.stp_scores enable row level security;
alter table app.stp_criteria enable row level security;
alter table app.stp_refs enable row level security;
alter table app.stp_ai_history enable row level security;

create or replace function app._stp_for_edit(p_version_id uuid)
returns app.stp_versions
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.stp_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_row := null;
  select * into v_row from app.stp_versions where id = p_version_id;
  if v_row.id is null then raise exception 'STP-versie niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_row.status = 'approved'::app.stp_version_status then
    raise exception 'Goedgekeurde STP-versie is alleen-lezen. Maak een nieuwe conceptversie.';
  end if;
  return v_row;
end;
$$;

create or replace function app._stp_touch(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  update app.stp_versions
  set updated_at = now(),
      status = case
        when status = 'not_started'::app.stp_version_status then 'draft'::app.stp_version_status
        else status
      end
  where id = p_version_id;
end;
$$;

create or replace function app._stp_expect(p_version app.stp_versions, p_expected timestamptz)
returns void
language plpgsql
immutable
as $$
begin
  if p_expected is not null and p_version.updated_at <> p_expected then
    raise exception 'Deze stap is intussen gewijzigd. Herlaad en vergelijk opnieuw.';
  end if;
end;
$$;

create or replace function app._stp_replace_refs(p_version_id uuid, p_tenant_id uuid, p_segment_id uuid, p_refs jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_ref jsonb;
begin
  delete from app.stp_refs
  where version_id = p_version_id
    and segment_id is not distinct from p_segment_id;
  if jsonb_typeof(p_refs) <> 'array' then return; end if;
  for v_ref in select value from jsonb_array_elements(p_refs)
  loop
    insert into app.stp_refs (version_id, segment_id, tenant_id, ref_type, ref_id, label, excerpt, slot)
    values (
      p_version_id,
      p_segment_id,
      p_tenant_id,
      left(coalesce(v_ref->>'ref_type', 'manual'), 40),
      nullif(v_ref->>'ref_id', '')::uuid,
      left(coalesce(v_ref->>'label', ''), 300),
      left(coalesce(v_ref->>'excerpt', ''), 500),
      left(coalesce(nullif(v_ref->>'slot', ''), 'general'), 40)
    );
  end loop;
end;
$$;

create or replace function app.get_stp_workbench(p_tenant_id uuid, p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
  v_tenant app.tenants;
  v_next integer;
  v_pestel uuid;
  v_porter uuid;
  v_five uuid;
  v_swot uuid;
  v_vrio uuid;
  v_bcg uuid;
  v_vc uuid;
  v_chain app.vc_chains;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  select * into v_tenant from app.tenants where id = p_tenant_id and deleted_at is null;
  if v_tenant.id is null then raise exception 'Klant niet gevonden'; end if;

  v_version := null;
  if p_version_id is not null then
    select * into v_version from app.stp_versions where id = p_version_id and tenant_id = p_tenant_id;
    if v_version.id is null then raise exception 'STP-analyse niet gevonden'; end if;
  else
    select * into v_version from app.stp_versions
    where tenant_id = p_tenant_id and status <> 'approved'::app.stp_version_status
    order by version_number desc limit 1;
    if v_version.id is null then
      v_version := null;
      select * into v_version from app.stp_versions
      where tenant_id = p_tenant_id order by version_number desc limit 1;
    end if;
  end if;

  if v_version.id is null then
    select id into v_vrio from app.vrio_versions
    where tenant_id = p_tenant_id and status = 'approved'::app.vrio_version_status
    order by version_number desc limit 1;
    select id into v_swot from app.swot_versions
    where tenant_id = p_tenant_id and status = 'approved'::app.swot_version_status
    order by version_number desc limit 1;
    select id into v_five from app.five_c_versions
    where tenant_id = p_tenant_id and status = 'approved'::app.five_c_version_status
    order by version_number desc limit 1;
    select id into v_porter from app.porter_versions
    where tenant_id = p_tenant_id and status = 'approved'::app.porter_version_status
    order by version_number desc limit 1;
    select id into v_pestel from app.pestel_versions
    where tenant_id = p_tenant_id and status = 'approved'::app.pestel_version_status
    order by version_number desc limit 1;
    select id into v_bcg from app.bcg_versions
    where tenant_id = p_tenant_id and status = 'approved'::app.bcg_version_status
    order by version_number desc limit 1;
    select id into v_vc from app.vc_versions
    where tenant_id = p_tenant_id and status = 'approved'::app.vc_version_status
    order by version_number desc limit 1;
    v_chain := null;
    if v_vc is not null then
      select * into v_chain from app.vc_chains where version_id = v_vc order by created_at limit 1;
    end if;
    select coalesce(max(version_number), 0) + 1 into v_next from app.stp_versions where tenant_id = p_tenant_id;
    insert into app.stp_versions (
      tenant_id, version_number, status, created_by,
      offering, geography,
      pestel_version_id, porter_version_id, five_c_version_id, swot_version_id,
      vrio_version_id, bcg_version_id, vc_version_id
    ) values (
      p_tenant_id, v_next, 'not_started', auth.uid(),
      coalesce(v_chain.offering, ''),
      coalesce((select geography from app.bcg_versions where id = v_bcg), ''),
      v_pestel, v_porter, v_five, v_swot, v_vrio, v_bcg, v_vc
    ) returning * into v_version;
  end if;

  if v_version.status <> 'approved'::app.stp_version_status then
    select id into v_pestel from app.pestel_versions where tenant_id = p_tenant_id and status = 'approved'::app.pestel_version_status order by version_number desc limit 1;
    select id into v_porter from app.porter_versions where tenant_id = p_tenant_id and status = 'approved'::app.porter_version_status order by version_number desc limit 1;
    select id into v_five from app.five_c_versions where tenant_id = p_tenant_id and status = 'approved'::app.five_c_version_status order by version_number desc limit 1;
    select id into v_swot from app.swot_versions where tenant_id = p_tenant_id and status = 'approved'::app.swot_version_status order by version_number desc limit 1;
    select id into v_vrio from app.vrio_versions where tenant_id = p_tenant_id and status = 'approved'::app.vrio_version_status order by version_number desc limit 1;
    select id into v_bcg from app.bcg_versions where tenant_id = p_tenant_id and status = 'approved'::app.bcg_version_status order by version_number desc limit 1;
    select id into v_vc from app.vc_versions where tenant_id = p_tenant_id and status = 'approved'::app.vc_version_status order by version_number desc limit 1;
    if (v_version.segments_confirmed or v_version.target_confirmed or v_version.position_confirmed)
       and (
         v_version.pestel_version_id is distinct from v_pestel
         or v_version.porter_version_id is distinct from v_porter
         or v_version.five_c_version_id is distinct from v_five
         or v_version.swot_version_id is distinct from v_swot
         or v_version.vrio_version_id is distinct from v_vrio
         or v_version.bcg_version_id is distinct from v_bcg
         or v_version.vc_version_id is distinct from v_vc
       ) then
      update app.stp_versions
      set needs_review = true,
          review_note = 'Een gebruikte analyse heeft een nieuwere goedgekeurde versie. Kijk de keuze na voor je opnieuw goedkeurt.'
      where id = v_version.id and not needs_review;
      select * into v_version from app.stp_versions where id = v_version.id;
    end if;
  end if;

  return jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id, 'version_number', v_version.version_number, 'status', v_version.status,
      'current_step', v_version.current_step, 'offering', v_version.offering, 'geography', v_version.geography,
      'scope_note', v_version.scope_note, 'scope_confirmed', v_version.scope_confirmed,
      'segments_confirmed', v_version.segments_confirmed, 'target_confirmed', v_version.target_confirmed,
      'position_confirmed', v_version.position_confirmed, 'target_motivation', v_version.target_motivation,
      'preference_note', v_version.preference_note, 'preference_tradeoffs', v_version.preference_tradeoffs,
      'preference_risks', v_version.preference_risks, 'primary_segment_id', v_version.primary_segment_id,
      'audience', v_version.audience, 'problem', v_version.problem, 'promise', v_version.promise,
      'distinction', v_version.distinction, 'evidence_text', v_version.evidence_text,
      'position_sentence', v_version.position_sentence, 'claim_status', v_version.claim_status
    ) || jsonb_build_object(
      'icp_name', v_version.icp_name, 'icp_summary', v_version.icp_summary,
      'icp_sector', v_version.icp_sector, 'icp_stage', v_version.icp_stage, 'icp_size', v_version.icp_size,
      'icp_structure', v_version.icp_structure, 'icp_tech', v_version.icp_tech,
      'icp_problem', v_version.icp_problem, 'icp_need', v_version.icp_need, 'icp_outcome', v_version.icp_outcome,
      'icp_trigger', v_version.icp_trigger, 'icp_inaction', v_version.icp_inaction,
      'icp_budget', v_version.icp_budget, 'icp_capacity', v_version.icp_capacity,
      'icp_conditions', v_version.icp_conditions, 'icp_timing', v_version.icp_timing,
      'assumptions', v_version.assumptions, 'open_questions', v_version.open_questions,
      'accepted_uncertainty', v_version.accepted_uncertainty,
      'needs_review', v_version.needs_review, 'review_note', v_version.review_note,
      'ai_proposal', v_version.ai_proposal, 'ai_generated_at', v_version.ai_generated_at,
      'published_at', v_version.published_at, 'approved_at', v_version.approved_at, 'updated_at', v_version.updated_at,
      'pestel_version_id', v_version.pestel_version_id, 'porter_version_id', v_version.porter_version_id,
      'five_c_version_id', v_version.five_c_version_id, 'swot_version_id', v_version.swot_version_id,
      'vrio_version_id', v_version.vrio_version_id, 'bcg_version_id', v_version.bcg_version_id,
      'vc_version_id', v_version.vc_version_id
    ),
    'segments', coalesce((
      select jsonb_agg((
        jsonb_build_object(
          'id', s.id, 'name', s.name, 'description', s.description, 'need', s.need, 'traits', s.traits,
          'geography', s.geography, 'trigger_text', s.trigger_text, 'offering', s.offering,
          'include_criteria', s.include_criteria, 'exclude_criteria', s.exclude_criteria,
          'assumptions', s.assumptions, 'open_question', s.open_question, 'hypothesis', s.hypothesis,
          'disposition', s.disposition, 'exclusion_reason', s.exclusion_reason, 'overlap_note', s.overlap_note,
          'manual_lock', s.manual_lock, 'origin', s.origin, 'ai_state', s.ai_state, 'ai_payload', s.ai_payload,
          'archived_at', s.archived_at, 'sort_order', s.sort_order, 'updated_at', s.updated_at
        ) || jsonb_build_object(
          'scores', coalesce((
            select jsonb_agg(jsonb_build_object(
              'dimension', sc.dimension, 'rating', sc.rating, 'note', sc.note, 'assumption', sc.assumption
            ) order by sc.dimension)
            from app.stp_scores sc where sc.segment_id = s.id
          ), '[]'::jsonb),
          'refs', coalesce((
            select jsonb_agg(jsonb_build_object(
              'ref_type', r.ref_type, 'ref_id', r.ref_id, 'label', r.label, 'excerpt', r.excerpt, 'slot', r.slot
            ) order by r.created_at)
            from app.stp_refs r where r.segment_id = s.id
          ), '[]'::jsonb)
        )
      ) order by s.sort_order, s.created_at)
      from app.stp_segments s
      where s.version_id = v_version.id
    ), '[]'::jsonb),
    'criteria', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'body', c.body, 'sort_order', c.sort_order) order by c.sort_order, c.id)
      from app.stp_criteria c where c.version_id = v_version.id
    ), '[]'::jsonb),
    'inputs', jsonb_build_object(
      'tenant', jsonb_build_object('id', v_tenant.id, 'name', v_tenant.name, 'website', v_tenant.website, 'audit_goal', v_tenant.audit_goal),
      'five_c_items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', fi.id, 'c_key', fi.c_key, 'title', fi.title, 'finding', left(fi.finding, 1600), 'client_relevance', left(fi.client_relevance, 800)
        ) order by fi.c_key, fi.sort_order)
        from app.five_c_items fi
        where fi.version_id = v_version.five_c_version_id and fi.deleted_at is null
          and fi.review_status <> 'rejected'::app.five_c_review
          and fi.content_type <> 'input_needed'::app.five_c_content_type
      ), '[]'::jsonb),
      'swot_items', coalesce((
        select jsonb_agg(jsonb_build_object('id', si.id, 'quadrant', si.quadrant, 'statement', si.statement) order by si.quadrant, si.sort_order)
        from app.swot_items si where si.version_id = v_version.swot_version_id and si.deleted_at is null
      ), '[]'::jsonb),
      'vrio_resources', coalesce((
        select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'description', left(r.description, 800)) order by r.sort_order)
        from app.vrio_resources r
        where r.version_id = v_version.vrio_version_id and r.deleted_at is null and r.selected
      ), '[]'::jsonb),
      'pestel_insights', coalesce((
        select jsonb_agg(jsonb_build_object('id', ins.id, 'dimension', ins.dimension, 'title', ins.title, 'observation', left(ins.observation, 800)) order by ins.sort_order)
        from app.pestel_insights ins
        where ins.version_id = v_version.pestel_version_id and ins.deleted_at is null
          and ins.review_status <> 'rejected'::app.pestel_insight_review
      ), '[]'::jsonb),
      'porter_forces', coalesce((
        select jsonb_agg(jsonb_build_object('id', f.id, 'force_key', f.force_key, 'headline_factor', f.headline_factor, 'motivation', left(f.motivation, 800)) order by f.sort_order)
        from app.porter_forces f where f.version_id = v_version.porter_version_id
      ), '[]'::jsonb),
      'bcg_items', coalesce((
        select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'market', b.market_definition) order by b.sort_order)
        from app.bcg_items b
        where b.version_id = v_version.bcg_version_id and b.deleted_at is null and b.selected
      ), '[]'::jsonb),
      'vc_activities', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'customer_value', left(a.customer_value, 500), 'execution', a.execution) order by a.created_at)
        from app.vc_activities a
        where a.version_id = v_version.vc_version_id and a.not_applicable = false
      ), '[]'::jsonb),
      'meetings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'title', coalesce(nullif(trim(m.title), ''), to_char(m.created_at, 'YYYY-MM-DD')),
          'text', left(coalesce(nullif(trim(m.summary_text), ''), left(coalesce(m.full_text, ''), 2000)), 2000)
        ) order by m.created_at desc)
        from (select * from app.meeting_recordings where tenant_id = p_tenant_id and transcript_status = 'ready' order by created_at desc limit 6) m
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function app.save_stp_scope(p_version_id uuid, p_offering text, p_geography text, p_note text, p_confirm boolean)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
begin
  v_version := app._stp_for_edit(p_version_id);
  update app.stp_versions
  set offering = left(btrim(coalesce(p_offering, '')), 300),
      geography = left(btrim(coalesce(p_geography, '')), 200),
      scope_note = left(btrim(coalesce(p_note, '')), 2000),
      scope_confirmed = coalesce(p_confirm, false) and length(btrim(coalesce(p_offering, ''))) >= 2
  where id = p_version_id;
  perform app._stp_touch(p_version_id);
end;
$$;

create or replace function app.set_stp_step(p_version_id uuid, p_step text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  perform app._stp_for_edit(p_version_id);
  if p_step not in ('intake', 'segments', 'target', 'position', 'icp') then
    raise exception 'Onbekende stap';
  end if;
  update app.stp_versions set current_step = p_step where id = p_version_id;
  perform app._stp_touch(p_version_id);
end;
$$;

create or replace function app.upsert_stp_segment(p_version_id uuid, p_segment_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
  v_id uuid;
  v_name text;
begin
  v_version := app._stp_for_edit(p_version_id);
  v_name := left(btrim(coalesce(p_payload->>'name', '')), 200);
  if length(v_name) < 2 then raise exception 'Geef het segment een naam'; end if;
  if p_segment_id is null then
    insert into app.stp_segments (
      version_id, tenant_id, name, description, need, traits, geography, trigger_text, offering,
      include_criteria, exclude_criteria, assumptions, open_question, hypothesis, origin, manual_lock, sort_order
    ) values (
      p_version_id, v_version.tenant_id, v_name,
      left(coalesce(p_payload->>'description', ''), 2000),
      left(coalesce(p_payload->>'need', ''), 1000),
      left(coalesce(p_payload->>'traits', ''), 1000),
      left(coalesce(p_payload->>'geography', ''), 200),
      left(coalesce(p_payload->>'trigger_text', ''), 500),
      left(coalesce(p_payload->>'offering', ''), 300),
      left(coalesce(p_payload->>'include_criteria', ''), 1000),
      left(coalesce(p_payload->>'exclude_criteria', ''), 1000),
      left(coalesce(p_payload->>'assumptions', ''), 1000),
      left(coalesce(p_payload->>'open_question', ''), 1000),
      coalesce((p_payload->>'hypothesis')::boolean, false),
      'manual', true,
      coalesce((select max(sort_order) + 1 from app.stp_segments where version_id = p_version_id and archived_at is null), 0)
    ) returning id into v_id;
  else
    update app.stp_segments
    set name = v_name,
        description = left(coalesce(p_payload->>'description', ''), 2000),
        need = left(coalesce(p_payload->>'need', ''), 1000),
        traits = left(coalesce(p_payload->>'traits', ''), 1000),
        geography = left(coalesce(p_payload->>'geography', ''), 200),
        trigger_text = left(coalesce(p_payload->>'trigger_text', ''), 500),
        offering = left(coalesce(p_payload->>'offering', ''), 300),
        include_criteria = left(coalesce(p_payload->>'include_criteria', ''), 1000),
        exclude_criteria = left(coalesce(p_payload->>'exclude_criteria', ''), 1000),
        assumptions = left(coalesce(p_payload->>'assumptions', ''), 1000),
        open_question = left(coalesce(p_payload->>'open_question', ''), 1000),
        hypothesis = coalesce((p_payload->>'hypothesis')::boolean, false),
        manual_lock = true,
        ai_state = 'none',
        updated_at = now()
    where id = p_segment_id and version_id = p_version_id and archived_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Segment niet gevonden'; end if;
  end if;
  if jsonb_typeof(p_payload->'refs') = 'array' then
    perform app._stp_replace_refs(p_version_id, v_version.tenant_id, v_id, p_payload->'refs');
  end if;
  update app.stp_versions set segments_confirmed = false, target_confirmed = false, position_confirmed = false where id = p_version_id;
  perform app._stp_touch(p_version_id);
  return v_id;
end;
$$;

create or replace function app.archive_stp_segment(p_segment_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.stp_segments;
begin
  v_item := null;
  select * into v_item from app.stp_segments where id = p_segment_id and archived_at is null;
  if v_item.id is null then raise exception 'Segment niet gevonden'; end if;
  perform app._stp_for_edit(v_item.version_id);
  update app.stp_segments set archived_at = now(), disposition = 'unset', updated_at = now() where id = p_segment_id;
  update app.stp_versions
  set primary_segment_id = case when primary_segment_id = p_segment_id then null else primary_segment_id end,
      segments_confirmed = false, target_confirmed = false, position_confirmed = false
  where id = v_item.version_id;
  perform app._stp_touch(v_item.version_id);
end;
$$;

create or replace function app.merge_stp_segments(p_keep_id uuid, p_drop_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_keep app.stp_segments;
  v_drop app.stp_segments;
  v_conflict text := '';
begin
  select * into v_keep from app.stp_segments where id = p_keep_id and archived_at is null;
  select * into v_drop from app.stp_segments where id = p_drop_id and archived_at is null;
  if v_keep.id is null or v_drop.id is null or v_keep.version_id <> v_drop.version_id then
    raise exception 'Kies twee segmenten uit dezelfde analyse';
  end if;
  perform app._stp_for_edit(v_keep.version_id);
  if v_keep.need <> '' and v_drop.need <> '' and v_keep.need is distinct from v_drop.need then
    v_conflict := 'Behoefte verschilt: "' || left(v_keep.need, 180) || '" en "' || left(v_drop.need, 180) || '".';
  end if;
  update app.stp_segments
  set description = left(btrim(v_keep.description || case when v_drop.description <> '' and v_drop.description is distinct from v_keep.description then E'\n' || v_drop.description else '' end), 2000),
      traits = left(btrim(v_keep.traits || case when v_drop.traits <> '' and v_drop.traits is distinct from v_keep.traits then E'\n' || v_drop.traits else '' end), 1000),
      include_criteria = left(btrim(v_keep.include_criteria || case when v_drop.include_criteria <> '' then E'\n' || v_drop.include_criteria else '' end), 1000),
      exclude_criteria = left(btrim(v_keep.exclude_criteria || case when v_drop.exclude_criteria <> '' then E'\n' || v_drop.exclude_criteria else '' end), 1000),
      overlap_note = left(btrim(v_conflict), 1000),
      manual_lock = true,
      updated_at = now()
  where id = p_keep_id;
  update app.stp_refs set segment_id = p_keep_id where segment_id = p_drop_id;
  update app.stp_segments set archived_at = now(), merged_into = p_keep_id, disposition = 'unset', updated_at = now() where id = p_drop_id;
  update app.stp_versions
  set primary_segment_id = case when primary_segment_id = p_drop_id then p_keep_id else primary_segment_id end,
      segments_confirmed = false, target_confirmed = false, position_confirmed = false
  where id = v_keep.version_id;
  perform app._stp_touch(v_keep.version_id);
end;
$$;

create or replace function app.set_stp_disposition(p_segment_id uuid, p_disposition text, p_reason text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.stp_segments;
  v_version app.stp_versions;
begin
  if p_disposition not in ('unset', 'primary', 'later', 'not_priority', 'excluded') then
    raise exception 'Onbekende keuze';
  end if;
  if p_disposition = 'excluded' and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Geef een reden om dit segment uit te sluiten';
  end if;
  select * into v_item from app.stp_segments where id = p_segment_id and archived_at is null;
  if v_item.id is null then raise exception 'Segment niet gevonden'; end if;
  v_version := app._stp_for_edit(v_item.version_id);
  if p_disposition = 'primary' then
    update app.stp_segments
    set disposition = 'later', updated_at = now()
    where version_id = v_item.version_id and id <> p_segment_id and archived_at is null and disposition = 'primary';
  end if;
  update app.stp_segments
  set disposition = p_disposition,
      exclusion_reason = case when p_disposition = 'excluded' then left(btrim(p_reason), 500) else exclusion_reason end,
      updated_at = now()
  where id = p_segment_id;
  update app.stp_versions
  set primary_segment_id = case
        when p_disposition = 'primary' then p_segment_id
        when primary_segment_id = p_segment_id then null
        else primary_segment_id
      end,
      target_confirmed = false,
      position_confirmed = case when p_disposition = 'primary' and primary_segment_id is distinct from p_segment_id then false else position_confirmed end,
      review_note = case
        when position_confirmed and p_disposition = 'primary' and primary_segment_id is distinct from p_segment_id
          then 'De doelgroep is gewijzigd. Bevestig de positionering opnieuw.'
        else review_note
      end
  where id = v_item.version_id;
  perform app._stp_touch(v_item.version_id);
end;
$$;

create or replace function app.save_stp_scores(p_segment_id uuid, p_scores jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.stp_segments;
  v_row jsonb;
  v_dim text;
  v_rating text;
begin
  select * into v_item from app.stp_segments where id = p_segment_id and archived_at is null;
  if v_item.id is null then raise exception 'Segment niet gevonden'; end if;
  perform app._stp_for_edit(v_item.version_id);
  if jsonb_typeof(p_scores) <> 'array' then raise exception 'Geen beoordelingen'; end if;
  for v_row in select value from jsonb_array_elements(p_scores)
  loop
    v_dim := v_row->>'dimension';
    v_rating := coalesce(nullif(v_row->>'rating', ''), 'unknown');
    if v_dim not in ('need', 'offer', 'capability', 'reach', 'delivery', 'commercial') then continue; end if;
    if v_rating not in ('strong', 'mixed', 'weak', 'unknown') then v_rating := 'unknown'; end if;
    insert into app.stp_scores (segment_id, tenant_id, dimension, rating, note, assumption)
    values (p_segment_id, v_item.tenant_id, v_dim, v_rating, left(coalesce(v_row->>'note', ''), 500), left(coalesce(v_row->>'assumption', ''), 500))
    on conflict (segment_id, dimension) do update
    set rating = excluded.rating, note = excluded.note, assumption = excluded.assumption;
  end loop;
  perform app._stp_touch(v_item.version_id);
end;
$$;

create or replace function app.confirm_stp_segments(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_bad integer;
begin
  perform app._stp_for_edit(p_version_id);
  select count(*) into v_bad from app.stp_segments
  where version_id = p_version_id and archived_at is null
    and (length(btrim(name)) < 2 or (length(btrim(need)) < 8 and not hypothesis));
  if v_bad > 0 then
    raise exception 'Elk segment heeft een naam en een behoefte, of staat als hypothese gemarkeerd.';
  end if;
  if not exists (select 1 from app.stp_segments where version_id = p_version_id and archived_at is null) then
    raise exception 'Er is nog geen segment. Voeg er een toe of laat de AI een voorstel doen.';
  end if;
  update app.stp_versions set segments_confirmed = true, current_step = 'target' where id = p_version_id;
  perform app._stp_touch(p_version_id);
end;
$$;

create or replace function app.confirm_stp_target(p_version_id uuid, p_motivation text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
  v_primary integer;
begin
  v_version := app._stp_for_edit(p_version_id);
  if not v_version.segments_confirmed then raise exception 'Bevestig eerst de segmenten'; end if;
  if length(btrim(coalesce(p_motivation, ''))) < 8 then raise exception 'Schrijf kort waarom deze doelgroep eerst komt'; end if;
  select count(*) into v_primary from app.stp_segments
  where version_id = p_version_id and archived_at is null and disposition = 'primary';
  if v_primary <> 1 then raise exception 'Kies precies één primaire doelgroep'; end if;
  update app.stp_versions
  set target_motivation = left(btrim(p_motivation), 2000),
      target_confirmed = true,
      current_step = 'position',
      primary_segment_id = (select id from app.stp_segments where version_id = p_version_id and archived_at is null and disposition = 'primary' limit 1)
  where id = p_version_id;
  perform app._stp_touch(p_version_id);
end;
$$;

create or replace function app.save_stp_position(p_version_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
  v_claim text;
begin
  v_version := app._stp_for_edit(p_version_id);
  v_claim := coalesce(nullif(p_payload->>'claim_status', ''), 'hypothesis');
  if v_claim not in ('supported', 'hypothesis', 'missing', 'conflict') then v_claim := 'hypothesis'; end if;
  update app.stp_versions
  set audience = left(coalesce(p_payload->>'audience', ''), 500),
      problem = left(coalesce(p_payload->>'problem', ''), 1000),
      promise = left(coalesce(p_payload->>'promise', ''), 1000),
      distinction = left(coalesce(p_payload->>'distinction', ''), 1000),
      evidence_text = left(coalesce(p_payload->>'evidence_text', ''), 1500),
      position_sentence = left(coalesce(p_payload->>'position_sentence', ''), 400),
      claim_status = v_claim,
      position_confirmed = false
  where id = p_version_id;
  perform app._stp_touch(p_version_id);
end;
$$;

create or replace function app.confirm_stp_position(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
begin
  v_version := app._stp_for_edit(p_version_id);
  if not v_version.target_confirmed then raise exception 'Bevestig eerst de doelgroep'; end if;
  if length(btrim(v_version.audience)) < 8 or length(btrim(v_version.problem)) < 8 or length(btrim(v_version.promise)) < 8 then
    raise exception 'Vul voor wie, welk probleem en welke belofte in. Onderscheid mag een hypothese blijven.';
  end if;
  update app.stp_versions set position_confirmed = true, current_step = 'icp' where id = p_version_id;
  perform app._stp_touch(p_version_id);
end;
$$;

create or replace function app.save_stp_icp(p_version_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
  v_row jsonb;
  v_kind text;
  v_i integer := 0;
begin
  v_version := app._stp_for_edit(p_version_id);
  update app.stp_versions
  set icp_name = left(coalesce(p_payload->>'icp_name', ''), 200),
      icp_summary = left(coalesce(p_payload->>'icp_summary', ''), 1500),
      icp_sector = left(coalesce(p_payload->>'icp_sector', ''), 300),
      icp_stage = left(coalesce(p_payload->>'icp_stage', ''), 300),
      icp_size = left(coalesce(p_payload->>'icp_size', ''), 300),
      icp_structure = left(coalesce(p_payload->>'icp_structure', ''), 300),
      icp_tech = left(coalesce(p_payload->>'icp_tech', ''), 300),
      icp_problem = left(coalesce(p_payload->>'icp_problem', ''), 800),
      icp_need = left(coalesce(p_payload->>'icp_need', ''), 800),
      icp_outcome = left(coalesce(p_payload->>'icp_outcome', ''), 800),
      icp_trigger = left(coalesce(p_payload->>'icp_trigger', ''), 500),
      icp_inaction = left(coalesce(p_payload->>'icp_inaction', ''), 500),
      icp_budget = left(coalesce(p_payload->>'icp_budget', ''), 300),
      icp_capacity = left(coalesce(p_payload->>'icp_capacity', ''), 300),
      icp_conditions = left(coalesce(p_payload->>'icp_conditions', ''), 500),
      icp_timing = left(coalesce(p_payload->>'icp_timing', ''), 300),
      assumptions = left(coalesce(p_payload->>'assumptions', ''), 2000),
      open_questions = left(coalesce(p_payload->>'open_questions', ''), 2000),
      accepted_uncertainty = left(coalesce(p_payload->>'accepted_uncertainty', ''), 1000)
  where id = p_version_id;
  if jsonb_typeof(p_payload->'criteria') = 'array' then
    delete from app.stp_criteria where version_id = p_version_id;
    for v_row in select value from jsonb_array_elements(p_payload->'criteria')
    loop
      v_kind := coalesce(v_row->>'kind', 'must');
      if v_kind not in ('must', 'plus', 'exclude') then continue; end if;
      if length(btrim(coalesce(v_row->>'body', ''))) < 2 then continue; end if;
      insert into app.stp_criteria (version_id, tenant_id, kind, body, sort_order)
      values (p_version_id, v_version.tenant_id, v_kind, left(btrim(v_row->>'body'), 400), v_i);
      v_i := v_i + 1;
    end loop;
  end if;
  perform app._stp_touch(p_version_id);
end;
$$;

create or replace function app.save_stp_ai_result(p_version_id uuid, p_expected timestamptz, p_kind text, p_payload jsonb, p_apply_new boolean)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
  v_row jsonb;
  v_item app.stp_segments;
  v_id uuid;
  v_i integer := 0;
  v_touched boolean := false;
begin
  v_version := app._stp_for_edit(p_version_id);
  perform app._stp_expect(v_version, p_expected);
  if p_kind = 'segments' and jsonb_typeof(p_payload->'segments') = 'array' then
    for v_row in select value from jsonb_array_elements(p_payload->'segments')
    loop
      v_item := null;
      select * into v_item from app.stp_segments
      where id = nullif(v_row->>'segment_id', '')::uuid and version_id = p_version_id and archived_at is null;
      if v_item.id is not null and v_item.manual_lock then
        update app.stp_segments set ai_state = 'proposed', ai_payload = v_row, updated_at = now() where id = v_item.id;
        v_touched := true;
      elsif v_item.id is not null then
        update app.stp_segments
        set name = left(coalesce(nullif(v_row->>'name', ''), name), 200),
            description = left(coalesce(nullif(v_row->>'description', ''), description), 2000),
            need = left(coalesce(nullif(v_row->>'need', ''), need), 1000),
            traits = left(coalesce(nullif(v_row->>'traits', ''), traits), 1000),
            geography = left(coalesce(nullif(v_row->>'geography', ''), geography), 200),
            trigger_text = left(coalesce(nullif(v_row->>'trigger_text', ''), trigger_text), 500),
            offering = left(coalesce(nullif(v_row->>'offering', ''), offering), 300),
            include_criteria = left(coalesce(nullif(v_row->>'include_criteria', ''), include_criteria), 1000),
            exclude_criteria = left(coalesce(nullif(v_row->>'exclude_criteria', ''), exclude_criteria), 1000),
            assumptions = left(coalesce(nullif(v_row->>'assumptions', ''), assumptions), 1000),
            open_question = left(coalesce(nullif(v_row->>'open_question', ''), open_question), 1000),
            hypothesis = coalesce((v_row->>'hypothesis')::boolean, hypothesis),
            origin = 'ai', ai_state = 'accepted', ai_payload = '{}'::jsonb, updated_at = now()
        where id = v_item.id;
        if jsonb_typeof(v_row->'refs') = 'array' then
          perform app._stp_replace_refs(p_version_id, v_version.tenant_id, v_item.id, v_row->'refs');
        end if;
        v_touched := true;
      elsif coalesce(p_apply_new, false) and length(btrim(coalesce(v_row->>'name', ''))) >= 2 then
        insert into app.stp_segments (
          version_id, tenant_id, name, description, need, traits, geography, trigger_text, offering,
          include_criteria, exclude_criteria, assumptions, open_question, hypothesis, origin, manual_lock, sort_order
        ) values (
          p_version_id, v_version.tenant_id,
          left(btrim(v_row->>'name'), 200), left(coalesce(v_row->>'description', ''), 2000),
          left(coalesce(v_row->>'need', ''), 1000), left(coalesce(v_row->>'traits', ''), 1000),
          left(coalesce(v_row->>'geography', ''), 200), left(coalesce(v_row->>'trigger_text', ''), 500),
          left(coalesce(v_row->>'offering', ''), 300), left(coalesce(v_row->>'include_criteria', ''), 1000),
          left(coalesce(v_row->>'exclude_criteria', ''), 1000), left(coalesce(v_row->>'assumptions', ''), 1000),
          left(coalesce(v_row->>'open_question', ''), 1000), coalesce((v_row->>'hypothesis')::boolean, true),
          'ai', false, v_i
        ) returning id into v_id;
        v_i := v_i + 1;
        if jsonb_typeof(v_row->'refs') = 'array' then
          perform app._stp_replace_refs(p_version_id, v_version.tenant_id, v_id, v_row->'refs');
        end if;
        v_touched := true;
      end if;
    end loop;
    if v_touched then
      update app.stp_versions set segments_confirmed = false, current_step = 'segments' where id = p_version_id;
    end if;
  elsif p_kind = 'target' then
    update app.stp_versions
    set preference_note = left(coalesce(p_payload->>'preference_note', preference_note), 1500),
        preference_tradeoffs = left(coalesce(p_payload->>'preference_tradeoffs', preference_tradeoffs), 1500),
        preference_risks = left(coalesce(p_payload->>'preference_risks', preference_risks), 1500)
    where id = p_version_id;
    if jsonb_typeof(p_payload->'scores') = 'array' then
      for v_row in select value from jsonb_array_elements(p_payload->'scores')
      loop
        v_item := null;
        select * into v_item from app.stp_segments
        where version_id = p_version_id and archived_at is null and lower(name) = lower(btrim(coalesce(v_row->>'segment_name', '')))
        limit 1;
        if v_item.id is null then continue; end if;
        if coalesce(v_row->>'dimension', '') not in ('need', 'offer', 'capability', 'reach', 'delivery', 'commercial') then continue; end if;
        insert into app.stp_scores (segment_id, tenant_id, dimension, rating, note, assumption)
        values (
          v_item.id, v_version.tenant_id, v_row->>'dimension',
          case when coalesce(v_row->>'rating', '') in ('strong', 'mixed', 'weak', 'unknown') then v_row->>'rating' else 'unknown' end,
          left(coalesce(v_row->>'note', ''), 500), left(coalesce(v_row->>'assumption', ''), 500)
        )
        on conflict (segment_id, dimension) do update
        set rating = excluded.rating, note = excluded.note, assumption = excluded.assumption
        where btrim(app.stp_scores.note) = '' and btrim(app.stp_scores.assumption) = '';
      end loop;
    end if;
  elsif p_kind in ('position', 'icp') then
    update app.stp_versions set ai_proposal = p_payload where id = p_version_id;
  end if;
  update app.stp_versions set ai_generated_at = now() where id = p_version_id;
  insert into app.stp_ai_history (version_id, tenant_id, kind, proposal, decision, decided_by)
  values (p_version_id, v_version.tenant_id, left(coalesce(p_kind, 'unknown'), 40), coalesce(p_payload, '{}'::jsonb), 'proposed', auth.uid());
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_version.tenant_id, auth.uid(), 'stp.ai', 'stp_version', p_version_id::text, jsonb_build_object('kind', p_kind));
  perform app._stp_touch(p_version_id);
end;
$$;

create or replace function app.resolve_stp_proposal(p_segment_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.stp_segments;
  v_body jsonb;
begin
  select * into v_item from app.stp_segments where id = p_segment_id and archived_at is null;
  if v_item.id is null then raise exception 'Segment niet gevonden'; end if;
  perform app._stp_for_edit(v_item.version_id);
  if v_item.ai_state <> 'proposed' then raise exception 'Er staat geen voorstel open'; end if;
  v_body := v_item.ai_payload;
  if coalesce(p_accept, false) then
    update app.stp_segments
    set name = left(coalesce(nullif(v_body->>'name', ''), name), 200),
        description = left(coalesce(nullif(v_body->>'description', ''), description), 2000),
        need = left(coalesce(nullif(v_body->>'need', ''), need), 1000),
        traits = left(coalesce(nullif(v_body->>'traits', ''), traits), 1000),
        assumptions = left(coalesce(nullif(v_body->>'assumptions', ''), assumptions), 1000),
        open_question = left(coalesce(nullif(v_body->>'open_question', ''), open_question), 1000),
        hypothesis = coalesce((v_body->>'hypothesis')::boolean, hypothesis),
        ai_state = 'accepted', ai_payload = '{}'::jsonb, manual_lock = true, updated_at = now()
    where id = p_segment_id;
  else
    update app.stp_segments set ai_state = 'rejected', ai_payload = '{}'::jsonb, updated_at = now() where id = p_segment_id;
  end if;
  perform app._stp_touch(v_item.version_id);
end;
$$;

create or replace function app.apply_stp_proposal(p_version_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
  v_body jsonb;
  v_row jsonb;
  v_i integer := 0;
begin
  v_version := app._stp_for_edit(p_version_id);
  v_body := v_version.ai_proposal;
  if p_kind = 'position' then
    update app.stp_versions
    set audience = case when btrim(audience) = '' then left(coalesce(v_body->>'audience', ''), 500) else audience end,
        problem = case when btrim(problem) = '' then left(coalesce(v_body->>'problem', ''), 1000) else problem end,
        promise = case when btrim(promise) = '' then left(coalesce(v_body->>'promise', ''), 1000) else promise end,
        distinction = case when btrim(distinction) = '' then left(coalesce(v_body->>'distinction', ''), 1000) else distinction end,
        evidence_text = case when btrim(evidence_text) = '' then left(coalesce(v_body->>'evidence_text', ''), 1500) else evidence_text end,
        position_sentence = case when btrim(position_sentence) = '' then left(coalesce(v_body->>'position_sentence', ''), 400) else position_sentence end,
        claim_status = case
          when claim_status = 'hypothesis' and coalesce(v_body->>'claim_status', '') in ('supported', 'hypothesis', 'missing', 'conflict') then v_body->>'claim_status'
          else claim_status
        end,
        position_confirmed = false,
        ai_proposal = '{}'::jsonb
    where id = p_version_id;
  elsif p_kind = 'icp' then
    update app.stp_versions
    set icp_name = case when btrim(icp_name) = '' then left(coalesce(v_body->>'icp_name', ''), 200) else icp_name end,
        icp_summary = case when btrim(icp_summary) = '' then left(coalesce(v_body->>'icp_summary', ''), 1500) else icp_summary end,
        icp_sector = case when btrim(icp_sector) = '' then left(coalesce(v_body->>'icp_sector', ''), 300) else icp_sector end,
        icp_stage = case when btrim(icp_stage) = '' then left(coalesce(v_body->>'icp_stage', ''), 300) else icp_stage end,
        icp_size = case when btrim(icp_size) = '' then left(coalesce(v_body->>'icp_size', ''), 300) else icp_size end,
        icp_structure = case when btrim(icp_structure) = '' then left(coalesce(v_body->>'icp_structure', ''), 300) else icp_structure end,
        icp_tech = case when btrim(icp_tech) = '' then left(coalesce(v_body->>'icp_tech', ''), 300) else icp_tech end,
        icp_problem = case when btrim(icp_problem) = '' then left(coalesce(v_body->>'icp_problem', ''), 800) else icp_problem end,
        icp_need = case when btrim(icp_need) = '' then left(coalesce(v_body->>'icp_need', ''), 800) else icp_need end,
        icp_outcome = case when btrim(icp_outcome) = '' then left(coalesce(v_body->>'icp_outcome', ''), 800) else icp_outcome end,
        icp_trigger = case when btrim(icp_trigger) = '' then left(coalesce(v_body->>'icp_trigger', ''), 500) else icp_trigger end,
        icp_inaction = case when btrim(icp_inaction) = '' then left(coalesce(v_body->>'icp_inaction', ''), 500) else icp_inaction end,
        icp_budget = case when btrim(icp_budget) = '' then left(coalesce(v_body->>'icp_budget', ''), 300) else icp_budget end,
        icp_capacity = case when btrim(icp_capacity) = '' then left(coalesce(v_body->>'icp_capacity', ''), 300) else icp_capacity end,
        icp_conditions = case when btrim(icp_conditions) = '' then left(coalesce(v_body->>'icp_conditions', ''), 500) else icp_conditions end,
        icp_timing = case when btrim(icp_timing) = '' then left(coalesce(v_body->>'icp_timing', ''), 300) else icp_timing end,
        assumptions = case when btrim(assumptions) = '' then left(coalesce(v_body->>'assumptions', ''), 2000) else assumptions end,
        open_questions = case when btrim(open_questions) = '' then left(coalesce(v_body->>'open_questions', ''), 2000) else open_questions end,
        ai_proposal = '{}'::jsonb
    where id = p_version_id;
    if jsonb_typeof(v_body->'criteria') = 'array' and not exists (select 1 from app.stp_criteria where version_id = p_version_id) then
      delete from app.stp_criteria where version_id = p_version_id;
      for v_row in select value from jsonb_array_elements(v_body->'criteria')
      loop
        if coalesce(v_row->>'kind', '') not in ('must', 'plus', 'exclude') then continue; end if;
        if length(btrim(coalesce(v_row->>'body', ''))) < 2 then continue; end if;
        insert into app.stp_criteria (version_id, tenant_id, kind, body, sort_order)
        values (p_version_id, v_version.tenant_id, v_row->>'kind', left(btrim(v_row->>'body'), 400), v_i);
        v_i := v_i + 1;
      end loop;
    end if;
  else
    raise exception 'Dit voorstel hoort bij positionering of het ICP';
  end if;
  perform app._stp_touch(p_version_id);
end;
$$;

create or replace function app.approve_stp_version(p_version_id uuid, p_expected timestamptz)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
  v_primary app.stp_segments;
  v_must integer;
begin
  v_version := app._stp_for_edit(p_version_id);
  perform app._stp_expect(v_version, p_expected);
  if not v_version.segments_confirmed or not v_version.target_confirmed or not v_version.position_confirmed then
    raise exception 'Bevestig eerst segmenten, doelgroep en positionering';
  end if;
  v_primary := null;
  select * into v_primary from app.stp_segments
  where version_id = p_version_id and archived_at is null and disposition = 'primary';
  if v_primary.id is null or length(btrim(v_primary.need)) < 8 then
    raise exception 'De primaire doelgroep heeft nog geen concrete behoefte';
  end if;
  select count(*) into v_must from app.stp_criteria
  where version_id = p_version_id and kind = 'must' and length(btrim(body)) >= 3;
  if v_must < 1 then raise exception 'Het ICP heeft nog geen bruikbaar selectiecriterium'; end if;
  if length(btrim(v_version.offering)) < 2 then
    raise exception 'Koppel eerst het aanbod aan dit ICP';
  end if;
  if length(btrim(v_version.icp_name)) < 2 or length(btrim(v_version.icp_summary)) < 12 then
    raise exception 'Geef het ICP een naam en een korte beschrijving';
  end if;
  if v_version.needs_review and length(btrim(v_version.accepted_uncertainty)) < 10 then
    raise exception 'Een gebruikte analyse is gewijzigd. Kijk die na, of leg vast welke onzekerheid je accepteert.';
  end if;
  if v_version.claim_status = 'conflict' and length(btrim(v_version.accepted_uncertainty)) < 10 then
    raise exception 'Er is een tegenstrijdigheid in de positionering. Los die op of benoem de onzekerheid.';
  end if;
  update app.stp_versions
  set status = 'approved'::app.stp_version_status, approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = p_version_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_version.tenant_id, auth.uid(), 'stp.approve', 'stp_version', p_version_id::text, jsonb_build_object('version_number', v_version.version_number));
end;
$$;

create or replace function app.create_stp_revision(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_source app.stp_versions;
  v_new uuid;
  v_seg app.stp_segments;
  v_new_seg uuid;
  v_map jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_source := null;
  select * into v_source from app.stp_versions where id = p_version_id;
  if v_source.id is null then raise exception 'Versie niet gevonden'; end if;
  if not app.has_capability(v_source.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_source.status <> 'approved'::app.stp_version_status then
    raise exception 'Alleen een goedgekeurde versie kan herzien worden';
  end if;
  insert into app.stp_versions (
    tenant_id, version_number, status, current_step, offering, geography, scope_note, scope_confirmed,
    segments_confirmed, target_confirmed, position_confirmed, target_motivation,
    preference_note, preference_tradeoffs, preference_risks,
    audience, problem, promise, distinction, evidence_text, position_sentence, claim_status,
    icp_name, icp_summary, icp_sector, icp_stage, icp_size, icp_structure, icp_tech,
    icp_problem, icp_need, icp_outcome, icp_trigger, icp_inaction,
    icp_budget, icp_capacity, icp_conditions, icp_timing,
    assumptions, open_questions, accepted_uncertainty,
    pestel_version_id, porter_version_id, five_c_version_id, swot_version_id, vrio_version_id, bcg_version_id, vc_version_id,
    created_by
  ) values (
    v_source.tenant_id,
    (select coalesce(max(version_number), 0) + 1 from app.stp_versions where tenant_id = v_source.tenant_id),
    'draft', 'icp', v_source.offering, v_source.geography, v_source.scope_note, v_source.scope_confirmed,
    v_source.segments_confirmed, v_source.target_confirmed, v_source.position_confirmed, v_source.target_motivation,
    v_source.preference_note, v_source.preference_tradeoffs, v_source.preference_risks,
    v_source.audience, v_source.problem, v_source.promise, v_source.distinction, v_source.evidence_text, v_source.position_sentence, v_source.claim_status,
    v_source.icp_name, v_source.icp_summary, v_source.icp_sector, v_source.icp_stage, v_source.icp_size, v_source.icp_structure, v_source.icp_tech,
    v_source.icp_problem, v_source.icp_need, v_source.icp_outcome, v_source.icp_trigger, v_source.icp_inaction,
    v_source.icp_budget, v_source.icp_capacity, v_source.icp_conditions, v_source.icp_timing,
    v_source.assumptions, v_source.open_questions, v_source.accepted_uncertainty,
    v_source.pestel_version_id, v_source.porter_version_id, v_source.five_c_version_id, v_source.swot_version_id,
    v_source.vrio_version_id, v_source.bcg_version_id, v_source.vc_version_id,
    auth.uid()
  ) returning id into v_new;

  for v_seg in select * from app.stp_segments where version_id = p_version_id order by sort_order, created_at
  loop
    insert into app.stp_segments (
      version_id, tenant_id, name, description, need, traits, geography, trigger_text, offering,
      include_criteria, exclude_criteria, assumptions, open_question, hypothesis, disposition, exclusion_reason,
      overlap_note, manual_lock, origin, sort_order, archived_at, created_at
    ) values (
      v_new, v_seg.tenant_id, v_seg.name, v_seg.description, v_seg.need, v_seg.traits, v_seg.geography, v_seg.trigger_text, v_seg.offering,
      v_seg.include_criteria, v_seg.exclude_criteria, v_seg.assumptions, v_seg.open_question, v_seg.hypothesis, v_seg.disposition, v_seg.exclusion_reason,
      v_seg.overlap_note, v_seg.manual_lock, v_seg.origin, v_seg.sort_order, v_seg.archived_at, v_seg.created_at
    ) returning id into v_new_seg;
    v_map := v_map || jsonb_build_object(v_seg.id::text, v_new_seg::text);
    insert into app.stp_scores (segment_id, tenant_id, dimension, rating, note, assumption)
    select v_new_seg, tenant_id, dimension, rating, note, assumption from app.stp_scores where segment_id = v_seg.id;
    insert into app.stp_refs (version_id, segment_id, tenant_id, ref_type, ref_id, label, excerpt, slot)
    select v_new, v_new_seg, tenant_id, ref_type, ref_id, label, excerpt, slot from app.stp_refs where segment_id = v_seg.id;
  end loop;
  update app.stp_versions
  set primary_segment_id = nullif(v_map->>v_source.primary_segment_id::text, '')::uuid
  where id = v_new;
  insert into app.stp_criteria (version_id, tenant_id, kind, body, sort_order)
  select v_new, tenant_id, kind, body, sort_order from app.stp_criteria where version_id = p_version_id;
  return v_new;
end;
$$;

create or replace function app.publish_stp_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_version from app.stp_versions where id = p_version_id;
  if v_version.id is null then raise exception 'Versie niet gevonden'; end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_version.status <> 'approved'::app.stp_version_status then
    raise exception 'Publiceer alleen een goedgekeurd ICP';
  end if;
  update app.stp_versions set published_at = now(), published_by = auth.uid() where id = p_version_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_version.tenant_id, auth.uid(), 'stp.publish', 'stp_version', p_version_id::text, jsonb_build_object('version_number', v_version.version_number));
end;
$$;

create or replace function app.unpublish_stp_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_version from app.stp_versions where id = p_version_id;
  if v_version.id is null then raise exception 'Versie niet gevonden'; end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  update app.stp_versions set published_at = null, published_by = null where id = p_version_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_version.tenant_id, auth.uid(), 'stp.unpublish', 'stp_version', p_version_id::text, '{}'::jsonb);
end;
$$;

create or replace function app.get_stp_published(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
  v_primary_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not (
    app.has_capability(p_tenant_id, 'dashboard.read_published')
    or app.has_capability(p_tenant_id, 'audit.edit')
  ) then
    raise exception 'Forbidden';
  end if;
  v_version := null;
  select * into v_version from app.stp_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.stp_version_status and published_at is not null
  order by version_number desc limit 1;
  if v_version.id is null then
    return jsonb_build_object('published', false);
  end if;
  select name into v_primary_name from app.stp_segments where id = v_version.primary_segment_id;
  return jsonb_build_object(
    'published', true,
    'version_number', v_version.version_number,
    'published_at', v_version.published_at,
    'icp_name', v_version.icp_name,
    'icp_summary', v_version.icp_summary,
    'offering', v_version.offering,
    'geography', v_version.geography,
    'primary_name', coalesce(v_primary_name, ''),
    'position_sentence', v_version.position_sentence,
    'promise', v_version.promise,
    'distinction', v_version.distinction,
    'open_questions', v_version.open_questions,
    'accepted_uncertainty', v_version.accepted_uncertainty,
    'criteria', coalesce((
      select jsonb_agg(jsonb_build_object('kind', c.kind, 'body', c.body) order by c.sort_order)
      from app.stp_criteria c where c.version_id = v_version.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function app.get_stp_context(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  v_version := null;
  select * into v_version from app.stp_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.stp_version_status
  order by version_number desc limit 1;
  if v_version.id is null then return jsonb_build_object('approved', false); end if;
  return jsonb_build_object(
    'approved', true,
    'id', v_version.id,
    'version_number', v_version.version_number,
    'primary_segment_id', v_version.primary_segment_id,
    'offering', v_version.offering,
    'need', v_version.icp_need,
    'trigger', v_version.icp_trigger,
    'position_sentence', v_version.position_sentence,
    'open_questions', v_version.open_questions,
    'criteria', coalesce((
      select jsonb_agg(jsonb_build_object('kind', c.kind, 'body', c.body) order by c.sort_order)
      from app.stp_criteria c where c.version_id = v_version.id
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
  v_vc_started uuid;
  v_stp uuid;
  v_stp_started uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  select id into v_pestel from app.pestel_versions where tenant_id = p_tenant_id and status = 'approved'::app.pestel_version_status order by version_number desc limit 1;
  select id into v_porter from app.porter_versions where tenant_id = p_tenant_id and status = 'approved'::app.porter_version_status order by version_number desc limit 1;
  select id into v_five_c from app.five_c_versions where tenant_id = p_tenant_id and status = 'approved'::app.five_c_version_status order by version_number desc limit 1;
  select id into v_swot from app.swot_versions where tenant_id = p_tenant_id and status = 'approved'::app.swot_version_status order by version_number desc limit 1;
  select id into v_vrio from app.vrio_versions where tenant_id = p_tenant_id and status = 'approved'::app.vrio_version_status order by version_number desc limit 1;
  select id into v_bcg from app.bcg_versions where tenant_id = p_tenant_id and status = 'approved'::app.bcg_version_status order by version_number desc limit 1;
  select id into v_vc from app.vc_versions where tenant_id = p_tenant_id and status = 'approved'::app.vc_version_status order by version_number desc limit 1;
  select id into v_vc_started from app.vc_versions where tenant_id = p_tenant_id order by version_number desc limit 1;
  select id into v_stp from app.stp_versions where tenant_id = p_tenant_id and status = 'approved'::app.stp_version_status order by version_number desc limit 1;
  select id into v_stp_started from app.stp_versions where tenant_id = p_tenant_id order by version_number desc limit 1;
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
    'value_chain_version_id', v_vc,
    'value_chain_started', v_vc_started is not null,
    'stp_approved', v_stp is not null,
    'stp_version_id', v_stp,
    'stp_started', v_stp_started is not null
  );
end;
$$;

grant execute on function app.get_stp_workbench(uuid, uuid) to authenticated;
grant execute on function app.save_stp_scope(uuid, text, text, text, boolean) to authenticated;
grant execute on function app.set_stp_step(uuid, text) to authenticated;
grant execute on function app.upsert_stp_segment(uuid, uuid, jsonb) to authenticated;
grant execute on function app.archive_stp_segment(uuid) to authenticated;
grant execute on function app.merge_stp_segments(uuid, uuid) to authenticated;
grant execute on function app.set_stp_disposition(uuid, text, text) to authenticated;
grant execute on function app.save_stp_scores(uuid, jsonb) to authenticated;
grant execute on function app.confirm_stp_segments(uuid) to authenticated;
grant execute on function app.confirm_stp_target(uuid, text) to authenticated;
grant execute on function app.save_stp_position(uuid, jsonb) to authenticated;
grant execute on function app.confirm_stp_position(uuid) to authenticated;
grant execute on function app.save_stp_icp(uuid, jsonb) to authenticated;
grant execute on function app.save_stp_ai_result(uuid, timestamptz, text, jsonb, boolean) to authenticated;
grant execute on function app.resolve_stp_proposal(uuid, boolean) to authenticated;
grant execute on function app.apply_stp_proposal(uuid, text) to authenticated;
grant execute on function app.approve_stp_version(uuid, timestamptz) to authenticated;
grant execute on function app.create_stp_revision(uuid) to authenticated;
grant execute on function app.publish_stp_version(uuid) to authenticated;
grant execute on function app.unpublish_stp_version(uuid) to authenticated;
grant execute on function app.get_stp_published(uuid) to authenticated;
grant execute on function app.get_stp_context(uuid) to authenticated;
grant execute on function app.get_audit_framework_progress(uuid) to authenticated;

revoke execute on function app._stp_for_edit(uuid) from public, anon, authenticated;
revoke execute on function app._stp_touch(uuid) from public, anon, authenticated;
revoke execute on function app._stp_expect(app.stp_versions, timestamptz) from public, anon, authenticated;
revoke execute on function app._stp_replace_refs(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function app.log_stp_export(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.stp_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_version := null;
  select * into v_version from app.stp_versions where id = p_version_id;
  if v_version.id is null then raise exception 'Versie niet gevonden'; end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_version.tenant_id, auth.uid(), 'stp.export', 'stp_version', p_version_id::text, jsonb_build_object('version_number', v_version.version_number, 'status', v_version.status));
end;
$$;

grant execute on function app.log_stp_export(uuid) to authenticated;
