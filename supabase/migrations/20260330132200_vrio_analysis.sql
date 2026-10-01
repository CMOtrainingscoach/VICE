-- Strategische audit · stap 5: VRIO (toetsing van bestaande middelen en competenties)
-- Antwoorden en classificatie staan gescheiden: de uitkomst volgt uit vaste regels,
-- niet uit vrije AI-tekst. 'Onbekend' is nooit gelijk aan 'Nee'.

create type app.vrio_version_status as enum (
  'not_started',
  'draft',
  'in_review',
  'approved',
  'needs_revision'
);

create type app.vrio_criterion as enum ('value', 'rarity', 'imitability', 'organization');

create type app.vrio_answer as enum ('yes', 'no', 'unknown', 'not_assessed');

create type app.vrio_evidence_level as enum ('provided', 'observed', 'hypothesis');

create type app.vrio_resource_kind as enum ('resource', 'competence');

create type app.vrio_review as enum ('pending', 'reviewed');

create type app.vrio_question_status as enum ('open', 'answered', 'queued_meeting', 'accepted_open');

create type app.vrio_ref_type as enum (
  'tenant_profile',
  'meeting',
  'pestel_insight',
  'pestel_input',
  'porter_scope',
  'porter_force',
  'porter_factor',
  'five_c_item',
  'five_c_synthesis',
  'swot_item',
  'manual'
);

create type app.vrio_ai_state as enum ('none', 'proposed', 'accepted', 'rejected');

create table app.vrio_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  version_number integer not null,
  status app.vrio_version_status not null default 'not_started',
  swot_version_id uuid references app.swot_versions (id) on delete set null,
  five_c_version_id uuid references app.five_c_versions (id) on delete set null,
  porter_version_id uuid references app.porter_versions (id) on delete set null,
  pestel_version_id uuid references app.pestel_versions (id) on delete set null,
  synthesis_text text not null default '',
  synthesis_reviewed boolean not null default false,
  priorities jsonb not null default '[]'::jsonb,
  ai_generated_at timestamptz,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, version_number)
);

create index vrio_versions_tenant_idx on app.vrio_versions (tenant_id, version_number desc);

create table app.vrio_resources (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.vrio_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  title text not null default '',
  description text not null default '',
  kind app.vrio_resource_kind not null default 'resource',
  origin text not null default 'manual' check (origin in ('swot', 'ai', 'manual')),
  swot_item_id uuid references app.swot_items (id) on delete set null,
  selected boolean not null default true,
  exclusion_reason text not null default '',
  evidence_level app.vrio_evidence_level not null default 'hypothesis',
  needs_clarification boolean not null default false,
  clarification_note text not null default '',
  partner_owned boolean not null default false,
  access_note text not null default '',
  market_context text not null default '',
  review_status app.vrio_review not null default 'pending',
  needs_revision boolean not null default false,
  revision_note text not null default '',
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index vrio_resources_version_idx on app.vrio_resources (version_id)
where deleted_at is null;

create table app.vrio_resource_refs (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references app.vrio_resources (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  ref_type app.vrio_ref_type not null,
  ref_id uuid,
  label text not null default '',
  excerpt text not null default '',
  created_at timestamptz not null default now()
);

create index vrio_resource_refs_resource_idx on app.vrio_resource_refs (resource_id);

create table app.vrio_assessments (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references app.vrio_resources (id) on delete cascade,
  version_id uuid not null references app.vrio_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  criterion app.vrio_criterion not null,
  answer app.vrio_answer not null default 'not_assessed',
  motivation text not null default '',
  evidence_level app.vrio_evidence_level not null default 'hypothesis',
  origin text not null default 'manual' check (origin in ('ai', 'manual')),
  advisor_note text not null default '',
  open_question text not null default '',
  question_status app.vrio_question_status not null default 'open',
  question_answer text not null default '',
  skipped_reason text not null default '',
  confirmed boolean not null default false,
  ai_state app.vrio_ai_state not null default 'none',
  ai_answer app.vrio_answer,
  ai_motivation text not null default '',
  ai_missing_evidence text not null default '',
  ai_generated_at timestamptz,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resource_id, criterion)
);

create index vrio_assessments_version_idx on app.vrio_assessments (version_id);

create table app.vrio_assessment_refs (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references app.vrio_assessments (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  ref_type app.vrio_ref_type not null,
  ref_id uuid,
  label text not null default '',
  excerpt text not null default '',
  created_at timestamptz not null default now()
);

create index vrio_assessment_refs_assessment_idx on app.vrio_assessment_refs (assessment_id);

create table app.vrio_ai_history (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.vrio_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  resource_id uuid references app.vrio_resources (id) on delete cascade,
  criterion app.vrio_criterion,
  proposed_answer app.vrio_answer,
  proposed_motivation text not null default '',
  decision text not null check (decision in ('accepted', 'rejected', 'superseded')),
  decided_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table app.vrio_versions enable row level security;
alter table app.vrio_resources enable row level security;
alter table app.vrio_resource_refs enable row level security;
alter table app.vrio_assessments enable row level security;
alter table app.vrio_assessment_refs enable row level security;
alter table app.vrio_ai_history enable row level security;

-- ---------------------------------------------------------------------------
-- Classificatie: vaste regels, los van de opgeslagen antwoorden
-- ---------------------------------------------------------------------------

create or replace function app.vrio_outcome(
  p_value app.vrio_answer,
  p_rarity app.vrio_answer,
  p_imitability app.vrio_answer,
  p_organization app.vrio_answer
)
returns text
language sql
immutable
as $$
  select case
    when p_value = 'no' then 'disadvantage'
    when p_value <> 'yes' then 'undetermined'
    when p_rarity = 'no' then 'parity'
    when p_rarity <> 'yes' then 'undetermined'
    when p_imitability = 'no' then 'temporary'
    when p_imitability <> 'yes' then 'undetermined'
    when p_organization = 'no' then 'unused_potential'
    when p_organization = 'yes' then 'sustained'
    else 'undetermined'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function app._vrio_version_for_edit(p_version_id uuid)
returns app.vrio_versions
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.vrio_versions;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_row from app.vrio_versions where id = p_version_id;
  if v_row.id is null then
    raise exception 'Versie niet gevonden';
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  if v_row.status = 'approved'::app.vrio_version_status then
    raise exception 'Goedgekeurde VRIO-versie is alleen-lezen; maak een nieuwe conceptversie';
  end if;
  return v_row;
end;
$$;

create or replace function app._vrio_ref_valid(
  p_version app.vrio_versions,
  p_type app.vrio_ref_type,
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
        where i.id = p_id
          and i.tenant_id = p_version.tenant_id
          and i.version_id = p_version.pestel_version_id
          and i.deleted_at is null
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
        where f.id = p_id
          and f.tenant_id = p_version.tenant_id
          and f.version_id = p_version.porter_version_id
      );
    when 'porter_factor' then
      return exists (
        select 1 from app.porter_factors pf
        where pf.id = p_id
          and pf.tenant_id = p_version.tenant_id
          and pf.version_id = p_version.porter_version_id
          and pf.deleted_at is null
      );
    when 'five_c_item' then
      return exists (
        select 1 from app.five_c_items fi
        where fi.id = p_id
          and fi.tenant_id = p_version.tenant_id
          and fi.version_id = p_version.five_c_version_id
          and fi.deleted_at is null
      );
    when 'swot_item' then
      return exists (
        select 1 from app.swot_items si
        where si.id = p_id
          and si.tenant_id = p_version.tenant_id
          and si.version_id = p_version.swot_version_id
          and si.deleted_at is null
      );
  end case;
  return false;
end;
$$;

create or replace function app._vrio_replace_resource_refs(
  p_resource_id uuid,
  p_version app.vrio_versions,
  p_refs jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_ref jsonb;
  v_type app.vrio_ref_type;
  v_id uuid;
begin
  delete from app.vrio_resource_refs where resource_id = p_resource_id;
  if p_refs is null or jsonb_typeof(p_refs) <> 'array' then
    return;
  end if;
  for v_ref in select * from jsonb_array_elements(p_refs)
  loop
    v_type := (v_ref->>'ref_type')::app.vrio_ref_type;
    v_id := nullif(v_ref->>'ref_id', '')::uuid;
    if not app._vrio_ref_valid(p_version, v_type, v_id) then
      raise exception 'Ongeldige bronverwijzing (% %)', v_type, coalesce(v_id::text, '-');
    end if;
    insert into app.vrio_resource_refs (resource_id, tenant_id, ref_type, ref_id, label, excerpt)
    values (
      p_resource_id,
      p_version.tenant_id,
      v_type,
      v_id,
      left(coalesce(v_ref->>'label', ''), 500),
      left(coalesce(v_ref->>'excerpt', ''), 2000)
    );
  end loop;
end;
$$;

create or replace function app._vrio_replace_assessment_refs(
  p_assessment_id uuid,
  p_version app.vrio_versions,
  p_refs jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_ref jsonb;
  v_type app.vrio_ref_type;
  v_id uuid;
begin
  delete from app.vrio_assessment_refs where assessment_id = p_assessment_id;
  if p_refs is null or jsonb_typeof(p_refs) <> 'array' then
    return;
  end if;
  for v_ref in select * from jsonb_array_elements(p_refs)
  loop
    v_type := (v_ref->>'ref_type')::app.vrio_ref_type;
    v_id := nullif(v_ref->>'ref_id', '')::uuid;
    if not app._vrio_ref_valid(p_version, v_type, v_id) then
      raise exception 'Ongeldige bronverwijzing (% %)', v_type, coalesce(v_id::text, '-');
    end if;
    insert into app.vrio_assessment_refs (assessment_id, tenant_id, ref_type, ref_id, label, excerpt)
    values (
      p_assessment_id,
      p_version.tenant_id,
      v_type,
      v_id,
      left(coalesce(v_ref->>'label', ''), 500),
      left(coalesce(v_ref->>'excerpt', ''), 2000)
    );
  end loop;
end;
$$;

create or replace function app._vrio_touch(p_version_id uuid)
returns void
language sql
security definer
set search_path = app, public, auth
as $$
  update app.vrio_versions
  set
    updated_at = now(),
    status = case
      when status = 'not_started'::app.vrio_version_status then 'draft'::app.vrio_version_status
      else status
    end
  where id = p_version_id;
$$;

create or replace function app._vrio_seed_assessments(p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_res app.vrio_resources;
  v_crit app.vrio_criterion;
begin
  select * into v_res from app.vrio_resources where id = p_resource_id;
  if v_res.id is null then
    return;
  end if;
  foreach v_crit in array enum_range(null::app.vrio_criterion)
  loop
    insert into app.vrio_assessments (resource_id, version_id, tenant_id, criterion)
    values (p_resource_id, v_res.version_id, v_res.tenant_id, v_crit)
    on conflict (resource_id, criterion) do nothing;
  end loop;
end;
$$;

create or replace function app._vrio_reopen_resource(p_resource_id uuid)
returns void
language sql
security definer
set search_path = app, public, auth
as $$
  update app.vrio_resources
  set review_status = 'pending'::app.vrio_review, reviewed_by = null, reviewed_at = null, updated_at = now()
  where id = p_resource_id;
  update app.vrio_versions v
  set synthesis_reviewed = false
  from app.vrio_resources r
  where r.id = p_resource_id and v.id = r.version_id;
$$;

-- ---------------------------------------------------------------------------
-- Workbench
-- ---------------------------------------------------------------------------

create or replace function app.get_vrio_workbench(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.vrio_versions;
  v_swot_approved app.swot_versions;
  v_swot app.swot_versions;
  v_five_c app.five_c_versions;
  v_porter app.porter_versions;
  v_pestel app.pestel_versions;
  v_tenant app.tenants;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  select * into v_tenant from app.tenants where id = p_tenant_id and deleted_at is null;
  if v_tenant.id is null then
    raise exception 'Klant niet gevonden';
  end if;

  select * into v_swot_approved
  from app.swot_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.swot_version_status
  order by version_number desc limit 1;

  select * into v_version
  from app.vrio_versions
  where tenant_id = p_tenant_id and status <> 'approved'::app.vrio_version_status
  order by version_number desc limit 1;

  if v_version.id is null then
    select * into v_version
    from app.vrio_versions
    where tenant_id = p_tenant_id
    order by version_number desc limit 1;
  end if;

  if v_version.id is null then
    insert into app.vrio_versions (
      tenant_id, version_number, status,
      swot_version_id, five_c_version_id, porter_version_id, pestel_version_id, created_by
    )
    values (
      p_tenant_id,
      1,
      'not_started',
      v_swot_approved.id,
      coalesce(
        v_swot_approved.five_c_version_id,
        (select id from app.five_c_versions where tenant_id = p_tenant_id and status = 'approved'::app.five_c_version_status order by version_number desc limit 1)
      ),
      coalesce(
        v_swot_approved.porter_version_id,
        (select id from app.porter_versions where tenant_id = p_tenant_id and status = 'approved'::app.porter_version_status order by version_number desc limit 1)
      ),
      coalesce(
        v_swot_approved.pestel_version_id,
        (select id from app.pestel_versions where tenant_id = p_tenant_id and status = 'approved'::app.pestel_version_status order by version_number desc limit 1)
      ),
      auth.uid()
    )
    returning * into v_version;
  end if;

  select * into v_swot from app.swot_versions where id = v_version.swot_version_id;
  select * into v_five_c from app.five_c_versions where id = v_version.five_c_version_id;
  select * into v_porter from app.porter_versions where id = v_version.porter_version_id;
  select * into v_pestel from app.pestel_versions where id = v_version.pestel_version_id;

  return jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id,
      'version_number', v_version.version_number,
      'status', v_version.status,
      'swot_version_id', v_version.swot_version_id,
      'five_c_version_id', v_version.five_c_version_id,
      'porter_version_id', v_version.porter_version_id,
      'pestel_version_id', v_version.pestel_version_id,
      'synthesis_text', v_version.synthesis_text,
      'synthesis_reviewed', v_version.synthesis_reviewed,
      'priorities', v_version.priorities,
      'ai_generated_at', v_version.ai_generated_at,
      'approved_by', v_version.approved_by,
      'approved_at', v_version.approved_at,
      'updated_at', v_version.updated_at
    ),
    'upstream', jsonb_build_object(
      'swot', case when v_swot.id is null then null else jsonb_build_object(
        'id', v_swot.id, 'version_number', v_swot.version_number, 'status', v_swot.status
      ) end,
      'five_c', case when v_five_c.id is null then null else jsonb_build_object(
        'id', v_five_c.id, 'version_number', v_five_c.version_number, 'status', v_five_c.status
      ) end,
      'porter', case when v_porter.id is null then null else jsonb_build_object(
        'id', v_porter.id, 'version_number', v_porter.version_number, 'status', v_porter.status
      ) end,
      'pestel', case when v_pestel.id is null then null else jsonb_build_object(
        'id', v_pestel.id, 'version_number', v_pestel.version_number, 'status', v_pestel.status
      ) end,
      'latest_swot_approved', case when v_swot_approved.id is null then null else jsonb_build_object(
        'id', v_swot_approved.id, 'version_number', v_swot_approved.version_number
      ) end
    ),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'description', r.description,
        'kind', r.kind,
        'origin', r.origin,
        'swot_item_id', r.swot_item_id,
        'selected', r.selected,
        'exclusion_reason', r.exclusion_reason,
        'evidence_level', r.evidence_level,
        'needs_clarification', r.needs_clarification,
        'clarification_note', r.clarification_note,
        'partner_owned', r.partner_owned,
        'access_note', r.access_note,
        'market_context', r.market_context,
        'review_status', r.review_status,
        'needs_revision', r.needs_revision,
        'revision_note', r.revision_note,
        'reviewed_at', r.reviewed_at,
        'sort_order', r.sort_order,
        'created_at', r.created_at,
        'refs', coalesce((
          select jsonb_agg(jsonb_build_object(
            'ref_type', rr.ref_type, 'ref_id', rr.ref_id, 'label', rr.label, 'excerpt', rr.excerpt
          ) order by rr.created_at)
          from app.vrio_resource_refs rr where rr.resource_id = r.id
        ), '[]'::jsonb),
        'assessments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', a.id,
            'criterion', a.criterion,
            'answer', a.answer,
            'motivation', a.motivation,
            'evidence_level', a.evidence_level,
            'origin', a.origin,
            'advisor_note', a.advisor_note,
            'open_question', a.open_question,
            'question_status', a.question_status,
            'question_answer', a.question_answer,
            'skipped_reason', a.skipped_reason,
            'confirmed', a.confirmed,
            'ai_state', a.ai_state,
            'ai_answer', a.ai_answer,
            'ai_motivation', a.ai_motivation,
            'ai_missing_evidence', a.ai_missing_evidence,
            'reviewed_at', a.reviewed_at,
            'updated_at', a.updated_at,
            'refs', coalesce((
              select jsonb_agg(jsonb_build_object(
                'ref_type', ar.ref_type, 'ref_id', ar.ref_id, 'label', ar.label, 'excerpt', ar.excerpt
              ) order by ar.created_at)
              from app.vrio_assessment_refs ar where ar.assessment_id = a.id
            ), '[]'::jsonb)
          ) order by array_position(enum_range(null::app.vrio_criterion), a.criterion))
          from app.vrio_assessments a where a.resource_id = r.id
        ), '[]'::jsonb),
        'outcome', app.vrio_outcome(
          coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'value'), 'not_assessed'),
          coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'rarity'), 'not_assessed'),
          coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'imitability'), 'not_assessed'),
          coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'organization'), 'not_assessed')
        )
      ) order by r.sort_order, r.created_at)
      from app.vrio_resources r
      where r.version_id = v_version.id and r.deleted_at is null
    ), '[]'::jsonb),
    'inputs', jsonb_build_object(
      'tenant', jsonb_build_object(
        'id', v_tenant.id, 'name', v_tenant.name, 'website', v_tenant.website, 'audit_goal', v_tenant.audit_goal
      ),
      'swot_items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', si.id,
          'quadrant', si.quadrant,
          'statement', si.statement,
          'origin', si.origin,
          'refs', coalesce((
            select jsonb_agg(jsonb_build_object(
              'ref_type', sr.ref_type, 'ref_id', sr.ref_id, 'label', sr.label, 'excerpt', sr.excerpt
            ) order by sr.created_at)
            from app.swot_item_refs sr where sr.item_id = si.id
          ), '[]'::jsonb)
        ) order by si.quadrant, si.sort_order)
        from app.swot_items si
        where si.version_id = v_version.swot_version_id and si.deleted_at is null
      ), '[]'::jsonb),
      'five_c_items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', fi.id,
          'c_key', fi.c_key,
          'title', fi.title,
          'finding', left(fi.finding, 2000),
          'client_relevance', left(fi.client_relevance, 1000),
          'evidence_level', fi.evidence_level
        ) order by fi.c_key, fi.sort_order)
        from app.five_c_items fi
        where fi.version_id = v_version.five_c_version_id
          and fi.deleted_at is null
          and fi.review_status <> 'rejected'::app.five_c_review
          and fi.content_type <> 'input_needed'::app.five_c_content_type
      ), '[]'::jsonb),
      'five_c_synthesis', case when v_five_c.id is null then null else left(v_five_c.synthesis_text, 6000) end,
      'porter_forces', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id,
          'force_key', f.force_key,
          'intensity', f.intensity,
          'headline_factor', f.headline_factor,
          'motivation', left(f.motivation, 2000),
          'client_relevance', left(f.client_relevance, 1000)
        ) order by f.sort_order)
        from app.porter_forces f
        where f.version_id = v_version.porter_version_id
      ), '[]'::jsonb),
      'porter_scope', case when v_porter.id is null then null else jsonb_build_object(
        'id', v_porter.id,
        'market_sector', v_porter.market_sector,
        'known_competitors', v_porter.known_competitors,
        'synthesis_text', left(v_porter.synthesis_text, 4000)
      ) end,
      'pestel_insights', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id,
          'dimension', i.dimension,
          'title', i.title,
          'observation', left(i.observation, 1500),
          'client_relevance', left(i.client_relevance, 1000)
        ) order by i.dimension, i.sort_order)
        from app.pestel_insights i
        where i.version_id = v_version.pestel_version_id
          and i.deleted_at is null
          and i.review_status <> 'rejected'::app.pestel_insight_review
      ), '[]'::jsonb),
      'meetings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'title', coalesce(nullif(trim(m.title), ''), to_char(m.created_at, 'YYYY-MM-DD HH24:MI')),
          'created_at', m.created_at,
          'text', left(
            coalesce(nullif(trim(m.summary_text), ''), left(coalesce(m.full_text, ''), 4000)),
            4000
          )
        ) order by m.created_at desc)
        from (
          select * from app.meeting_recordings
          where tenant_id = p_tenant_id and transcript_status = 'ready'
          order by created_at desc limit 12
        ) m
      ), '[]'::jsonb),
      'documents', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', inp.id,
          'kind', inp.kind,
          'label', inp.label,
          'excerpt', left(coalesce(inp.excerpt, ''), 3000)
        ) order by inp.sort_order, inp.created_at)
        from app.pestel_version_research_inputs inp
        where inp.version_id = v_version.pestel_version_id
          and inp.kind in ('document', 'note')
      ), '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function app.get_vrio_workbench(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Middelen beheren
-- ---------------------------------------------------------------------------

create or replace function app.upsert_vrio_resource(
  p_version_id uuid,
  p_resource_id uuid,
  p_title text,
  p_description text,
  p_kind app.vrio_resource_kind,
  p_evidence_level app.vrio_evidence_level,
  p_origin text,
  p_swot_item_id uuid,
  p_partner_owned boolean,
  p_access_note text,
  p_market_context text,
  p_refs jsonb
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.vrio_versions;
  v_id uuid;
  v_title text;
  v_needs_clarification boolean;
begin
  v_version := app._vrio_version_for_edit(p_version_id);

  v_title := left(trim(coalesce(p_title, '')), 300);
  if length(v_title) < 2 then
    raise exception 'Geef het middel of de competentie een naam';
  end if;

  -- Vage formuleringen zoals "goede service" vragen eerst verduidelijking.
  v_needs_clarification :=
    length(trim(coalesce(p_description, ''))) < 15
    and v_title ~* '^(goede|sterke|uitstekende|betere|hoge)\s+\w+$';

  if p_resource_id is not null then
    update app.vrio_resources
    set
      title = v_title,
      description = left(trim(coalesce(p_description, '')), 4000),
      kind = p_kind,
      evidence_level = p_evidence_level,
      partner_owned = coalesce(p_partner_owned, false),
      access_note = left(trim(coalesce(p_access_note, '')), 2000),
      market_context = left(trim(coalesce(p_market_context, '')), 500),
      needs_clarification = v_needs_clarification,
      updated_at = now()
    where id = p_resource_id and version_id = p_version_id and deleted_at is null
    returning id into v_id;

    if v_id is null then
      raise exception 'Middel niet gevonden';
    end if;
  else
    insert into app.vrio_resources (
      version_id, tenant_id, title, description, kind, origin, swot_item_id,
      evidence_level, partner_owned, access_note, market_context,
      needs_clarification, sort_order, created_by
    )
    values (
      p_version_id,
      v_version.tenant_id,
      v_title,
      left(trim(coalesce(p_description, '')), 4000),
      p_kind,
      coalesce(nullif(p_origin, ''), 'manual'),
      p_swot_item_id,
      p_evidence_level,
      coalesce(p_partner_owned, false),
      left(trim(coalesce(p_access_note, '')), 2000),
      left(trim(coalesce(p_market_context, '')), 500),
      v_needs_clarification,
      coalesce((select max(sort_order) + 1 from app.vrio_resources where version_id = p_version_id and deleted_at is null), 0),
      auth.uid()
    )
    returning id into v_id;
  end if;

  perform app._vrio_replace_resource_refs(v_id, v_version, p_refs);
  perform app._vrio_seed_assessments(v_id);
  perform app._vrio_reopen_resource(v_id);
  perform app._vrio_touch(p_version_id);
  return v_id;
end;
$$;

grant execute on function app.upsert_vrio_resource(
  uuid, uuid, text, text, app.vrio_resource_kind, app.vrio_evidence_level, text, uuid,
  boolean, text, text, jsonb
) to authenticated;

create or replace function app.set_vrio_resource_selection(
  p_resource_id uuid,
  p_selected boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_res app.vrio_resources;
begin
  select * into v_res from app.vrio_resources where id = p_resource_id and deleted_at is null;
  if v_res.id is null then
    raise exception 'Middel niet gevonden';
  end if;
  perform app._vrio_version_for_edit(v_res.version_id);

  if not coalesce(p_selected, false) and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Geef kort aan waarom dit middel niet getoetst wordt';
  end if;

  update app.vrio_resources
  set
    selected = coalesce(p_selected, false),
    exclusion_reason = case when coalesce(p_selected, false) then '' else left(trim(p_reason), 1000) end,
    updated_at = now()
  where id = p_resource_id;

  perform app._vrio_touch(v_res.version_id);
end;
$$;

grant execute on function app.set_vrio_resource_selection(uuid, boolean, text) to authenticated;

create or replace function app.delete_vrio_resource(p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_res app.vrio_resources;
begin
  select * into v_res from app.vrio_resources where id = p_resource_id and deleted_at is null;
  if v_res.id is null then
    raise exception 'Middel niet gevonden';
  end if;
  perform app._vrio_version_for_edit(v_res.version_id);

  update app.vrio_resources set deleted_at = now(), updated_at = now() where id = p_resource_id;
  perform app._vrio_touch(v_res.version_id);
end;
$$;

grant execute on function app.delete_vrio_resource(uuid) to authenticated;

create or replace function app.merge_vrio_resources(
  p_target_id uuid,
  p_source_ids jsonb,
  p_title text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_target app.vrio_resources;
  v_version app.vrio_versions;
  v_source_id uuid;
  v_source app.vrio_resources;
begin
  select * into v_target from app.vrio_resources where id = p_target_id and deleted_at is null;
  if v_target.id is null then
    raise exception 'Doelmiddel niet gevonden';
  end if;
  v_version := app._vrio_version_for_edit(v_target.version_id);

  for v_source_id in select (jsonb_array_elements_text(p_source_ids))::uuid
  loop
    if v_source_id = p_target_id then
      continue;
    end if;
    select * into v_source from app.vrio_resources
    where id = v_source_id and version_id = v_target.version_id and deleted_at is null;
    if v_source.id is null then
      continue;
    end if;

    -- Bronverwijzingen blijven behouden bij het samengevoegde middel.
    insert into app.vrio_resource_refs (resource_id, tenant_id, ref_type, ref_id, label, excerpt)
    select p_target_id, tenant_id, ref_type, ref_id, label, excerpt
    from app.vrio_resource_refs where resource_id = v_source_id;

    update app.vrio_resources
    set
      description = left(
        trim(both E'\n' from description || E'\n' || coalesce(v_source.description, '')),
        4000
      ),
      updated_at = now()
    where id = p_target_id;

    update app.vrio_resources set deleted_at = now(), updated_at = now() where id = v_source_id;
  end loop;

  if length(trim(coalesce(p_title, ''))) >= 2 then
    update app.vrio_resources set title = left(trim(p_title), 300) where id = p_target_id;
  end if;

  perform app._vrio_reopen_resource(p_target_id);
  perform app._vrio_touch(v_version.id);
end;
$$;

grant execute on function app.merge_vrio_resources(uuid, jsonb, text) to authenticated;

create or replace function app.split_vrio_resource(
  p_resource_id uuid,
  p_parts jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_res app.vrio_resources;
  v_version app.vrio_versions;
  v_part jsonb;
  v_new_id uuid;
  v_count integer := 0;
begin
  select * into v_res from app.vrio_resources where id = p_resource_id and deleted_at is null;
  if v_res.id is null then
    raise exception 'Middel niet gevonden';
  end if;
  v_version := app._vrio_version_for_edit(v_res.version_id);

  if p_parts is null or jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) < 2 then
    raise exception 'Geef minstens twee afzonderlijke middelen op';
  end if;

  for v_part in select * from jsonb_array_elements(p_parts)
  loop
    if length(trim(coalesce(v_part->>'title', ''))) < 2 then
      continue;
    end if;
    insert into app.vrio_resources (
      version_id, tenant_id, title, description, kind, origin, swot_item_id,
      evidence_level, market_context, sort_order, created_by
    )
    values (
      v_res.version_id,
      v_res.tenant_id,
      left(trim(v_part->>'title'), 300),
      left(trim(coalesce(v_part->>'description', '')), 4000),
      coalesce(nullif(v_part->>'kind', ''), v_res.kind::text)::app.vrio_resource_kind,
      v_res.origin,
      v_res.swot_item_id,
      v_res.evidence_level,
      v_res.market_context,
      coalesce((select max(sort_order) + 1 from app.vrio_resources where version_id = v_res.version_id and deleted_at is null), 0),
      auth.uid()
    )
    returning id into v_new_id;

    insert into app.vrio_resource_refs (resource_id, tenant_id, ref_type, ref_id, label, excerpt)
    select v_new_id, tenant_id, ref_type, ref_id, label, excerpt
    from app.vrio_resource_refs where resource_id = p_resource_id;

    perform app._vrio_seed_assessments(v_new_id);
    v_count := v_count + 1;
  end loop;

  if v_count < 2 then
    raise exception 'Geef minstens twee afzonderlijke middelen op';
  end if;

  update app.vrio_resources set deleted_at = now(), updated_at = now() where id = p_resource_id;
  perform app._vrio_touch(v_version.id);
end;
$$;

grant execute on function app.split_vrio_resource(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Criteria beoordelen
-- ---------------------------------------------------------------------------

create or replace function app.save_vrio_assessment(
  p_assessment_id uuid,
  p_answer app.vrio_answer,
  p_motivation text,
  p_evidence_level app.vrio_evidence_level,
  p_advisor_note text,
  p_open_question text,
  p_skipped_reason text,
  p_refs jsonb,
  p_confirm boolean
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_assessment app.vrio_assessments;
  v_version app.vrio_versions;
begin
  select * into v_assessment from app.vrio_assessments where id = p_assessment_id;
  if v_assessment.id is null then
    raise exception 'Beoordeling niet gevonden';
  end if;
  v_version := app._vrio_version_for_edit(v_assessment.version_id);

  if p_confirm and p_answer in ('yes'::app.vrio_answer, 'no'::app.vrio_answer)
    and length(trim(coalesce(p_motivation, ''))) < 10 then
    raise exception 'Motiveer dit antwoord (minstens 10 tekens)';
  end if;

  update app.vrio_assessments
  set
    answer = p_answer,
    motivation = left(trim(coalesce(p_motivation, '')), 4000),
    evidence_level = case
      when p_answer = 'unknown'::app.vrio_answer then 'hypothesis'::app.vrio_evidence_level
      else p_evidence_level
    end,
    origin = 'manual',
    advisor_note = left(trim(coalesce(p_advisor_note, '')), 2000),
    open_question = left(trim(coalesce(p_open_question, '')), 1000),
    skipped_reason = left(trim(coalesce(p_skipped_reason, '')), 1000),
    confirmed = coalesce(p_confirm, false),
    ai_state = case
      when ai_state = 'proposed'::app.vrio_ai_state then
        case when p_answer is distinct from ai_answer then 'rejected'::app.vrio_ai_state
        else 'accepted'::app.vrio_ai_state end
      else ai_state
    end,
    reviewed_by = case when p_confirm then auth.uid() else null end,
    reviewed_at = case when p_confirm then now() else null end,
    updated_at = now()
  where id = p_assessment_id;

  perform app._vrio_replace_assessment_refs(p_assessment_id, v_version, p_refs);
  perform app._vrio_reopen_resource(v_assessment.resource_id);
  perform app._vrio_touch(v_assessment.version_id);
end;
$$;

grant execute on function app.save_vrio_assessment(
  uuid, app.vrio_answer, text, app.vrio_evidence_level, text, text, text, jsonb, boolean
) to authenticated;

create or replace function app.update_vrio_question(
  p_assessment_id uuid,
  p_status app.vrio_question_status,
  p_answer text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_assessment app.vrio_assessments;
begin
  select * into v_assessment from app.vrio_assessments where id = p_assessment_id;
  if v_assessment.id is null then
    raise exception 'Vraag niet gevonden';
  end if;
  perform app._vrio_version_for_edit(v_assessment.version_id);

  if p_status in ('answered'::app.vrio_question_status, 'accepted_open'::app.vrio_question_status)
    and length(trim(coalesce(p_answer, ''))) < 3 then
    raise exception 'Vul een antwoord of toelichting in';
  end if;

  update app.vrio_assessments
  set
    question_status = p_status,
    question_answer = left(trim(coalesce(p_answer, '')), 4000),
    updated_at = now()
  where id = p_assessment_id;

  perform app._vrio_touch(v_assessment.version_id);
end;
$$;

grant execute on function app.update_vrio_question(uuid, app.vrio_question_status, text) to authenticated;

create or replace function app.set_vrio_resource_review(
  p_resource_id uuid,
  p_reviewed boolean,
  p_revision_note text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_res app.vrio_resources;
  v_open integer;
begin
  select * into v_res from app.vrio_resources where id = p_resource_id and deleted_at is null;
  if v_res.id is null then
    raise exception 'Middel niet gevonden';
  end if;
  perform app._vrio_version_for_edit(v_res.version_id);

  if coalesce(p_reviewed, false) then
    select count(*) into v_open
    from app.vrio_assessments a
    where a.resource_id = p_resource_id
      and not a.confirmed
      and a.answer <> 'not_assessed'::app.vrio_answer;

    if v_open > 0 then
      raise exception 'Bevestig eerst elke ingevulde beoordeling (% open)', v_open;
    end if;

    if not exists (
      select 1 from app.vrio_assessments a
      where a.resource_id = p_resource_id
        and a.criterion = 'value'::app.vrio_criterion
        and a.answer <> 'not_assessed'::app.vrio_answer
    ) then
      raise exception 'Beoordeel minstens het criterium Waardevol';
    end if;
  end if;

  update app.vrio_resources
  set
    review_status = case when coalesce(p_reviewed, false) then 'reviewed'::app.vrio_review else 'pending'::app.vrio_review end,
    needs_revision = case when coalesce(p_reviewed, false) then false else needs_revision end,
    revision_note = left(trim(coalesce(p_revision_note, '')), 1000),
    reviewed_by = case when coalesce(p_reviewed, false) then auth.uid() else null end,
    reviewed_at = case when coalesce(p_reviewed, false) then now() else null end,
    updated_at = now()
  where id = p_resource_id;

  if not coalesce(p_reviewed, false) then
    update app.vrio_versions set synthesis_reviewed = false where id = v_res.version_id;
  end if;
  perform app._vrio_touch(v_res.version_id);
end;
$$;

grant execute on function app.set_vrio_resource_review(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- AI-voorbereiding (voorstellen; menselijke bevestiging blijft vereist)
-- ---------------------------------------------------------------------------

create or replace function app.save_vrio_ai_result(
  p_version_id uuid,
  p_resources jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.vrio_versions;
  v_entry jsonb;
  v_resource_id uuid;
  v_res app.vrio_resources;
  v_crit_row jsonb;
  v_criterion app.vrio_criterion;
  v_assessment app.vrio_assessments;
  v_answer app.vrio_answer;
begin
  v_version := app._vrio_version_for_edit(p_version_id);

  if p_resources is null or jsonb_typeof(p_resources) <> 'array' then
    raise exception 'Geen AI-resultaat ontvangen';
  end if;

  for v_entry in select * from jsonb_array_elements(p_resources)
  loop
    v_resource_id := nullif(v_entry->>'resource_id', '')::uuid;
    select * into v_res from app.vrio_resources
    where id = v_resource_id and version_id = p_version_id and deleted_at is null;
    if v_res.id is null then
      continue;
    end if;

    for v_crit_row in select * from jsonb_array_elements(coalesce(v_entry->'criteria', '[]'::jsonb))
    loop
      v_criterion := (v_crit_row->>'criterion')::app.vrio_criterion;
      v_answer := coalesce(nullif(v_crit_row->>'answer', ''), 'unknown')::app.vrio_answer;
      if v_answer = 'not_assessed'::app.vrio_answer then
        v_answer := 'unknown'::app.vrio_answer;
      end if;

      select * into v_assessment from app.vrio_assessments
      where resource_id = v_resource_id and criterion = v_criterion;
      if v_assessment.id is null then
        continue;
      end if;

      -- Handmatig bevestigde antwoorden blijven staan; het voorstel wordt getoond als verschil.
      if v_assessment.confirmed then
        update app.vrio_assessments
        set
          ai_answer = v_answer,
          ai_motivation = left(coalesce(v_crit_row->>'motivation', ''), 4000),
          ai_missing_evidence = left(coalesce(v_crit_row->>'missing_evidence', ''), 1000),
          ai_state = case
            when v_answer is distinct from v_assessment.answer then 'proposed'::app.vrio_ai_state
            else 'accepted'::app.vrio_ai_state
          end,
          ai_generated_at = now(),
          updated_at = now()
        where id = v_assessment.id;
      else
        update app.vrio_assessments
        set
          answer = v_answer,
          motivation = left(coalesce(v_crit_row->>'motivation', ''), 4000),
          evidence_level = case
            when v_answer = 'unknown'::app.vrio_answer then 'hypothesis'::app.vrio_evidence_level
            else coalesce(nullif(v_crit_row->>'evidence_level', ''), 'hypothesis')::app.vrio_evidence_level
          end,
          origin = 'ai',
          open_question = left(coalesce(v_crit_row->>'open_question', ''), 1000),
          ai_answer = v_answer,
          ai_motivation = left(coalesce(v_crit_row->>'motivation', ''), 4000),
          ai_missing_evidence = left(coalesce(v_crit_row->>'missing_evidence', ''), 1000),
          ai_state = 'proposed'::app.vrio_ai_state,
          ai_generated_at = now(),
          confirmed = false,
          updated_at = now()
        where id = v_assessment.id;

        perform app._vrio_replace_assessment_refs(v_assessment.id, v_version, v_crit_row->'refs');
      end if;

      insert into app.vrio_ai_history (
        version_id, tenant_id, resource_id, criterion, proposed_answer, proposed_motivation, decision
      )
      values (
        p_version_id, v_version.tenant_id, v_resource_id, v_criterion, v_answer,
        left(coalesce(v_crit_row->>'motivation', ''), 2000), 'superseded'
      );
    end loop;

    perform app._vrio_reopen_resource(v_resource_id);
  end loop;

  update app.vrio_versions set ai_generated_at = now() where id = p_version_id;
  perform app._vrio_touch(p_version_id);
end;
$$;

grant execute on function app.save_vrio_ai_result(uuid, jsonb) to authenticated;

create or replace function app.resolve_vrio_ai_proposal(
  p_assessment_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_assessment app.vrio_assessments;
begin
  select * into v_assessment from app.vrio_assessments where id = p_assessment_id;
  if v_assessment.id is null then
    raise exception 'Voorstel niet gevonden';
  end if;
  perform app._vrio_version_for_edit(v_assessment.version_id);

  if coalesce(p_accept, false) then
    update app.vrio_assessments
    set
      answer = coalesce(ai_answer, answer),
      motivation = case when length(trim(ai_motivation)) > 0 then ai_motivation else motivation end,
      ai_state = 'accepted'::app.vrio_ai_state,
      confirmed = false,
      updated_at = now()
    where id = p_assessment_id;
  else
    update app.vrio_assessments
    set ai_state = 'rejected'::app.vrio_ai_state, updated_at = now()
    where id = p_assessment_id;
  end if;

  insert into app.vrio_ai_history (
    version_id, tenant_id, resource_id, criterion, proposed_answer, proposed_motivation, decision, decided_by
  )
  values (
    v_assessment.version_id, v_assessment.tenant_id, v_assessment.resource_id, v_assessment.criterion,
    v_assessment.ai_answer, left(v_assessment.ai_motivation, 2000),
    case when coalesce(p_accept, false) then 'accepted' else 'rejected' end,
    auth.uid()
  );

  perform app._vrio_reopen_resource(v_assessment.resource_id);
  perform app._vrio_touch(v_assessment.version_id);
end;
$$;

grant execute on function app.resolve_vrio_ai_proposal(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Synthese, goedkeuring en versiebeheer
-- ---------------------------------------------------------------------------

create or replace function app.update_vrio_synthesis(
  p_version_id uuid,
  p_synthesis_text text,
  p_priorities jsonb,
  p_reviewed boolean
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  perform app._vrio_version_for_edit(p_version_id);

  if coalesce(p_reviewed, false) and length(trim(coalesce(p_synthesis_text, ''))) < 20 then
    raise exception 'Synthese is te kort (minstens 20 tekens)';
  end if;

  update app.vrio_versions
  set
    synthesis_text = left(trim(coalesce(p_synthesis_text, '')), 12000),
    priorities = case when p_priorities is null then priorities else p_priorities end,
    synthesis_reviewed = coalesce(p_reviewed, false)
  where id = p_version_id;
  perform app._vrio_touch(p_version_id);
end;
$$;

grant execute on function app.update_vrio_synthesis(uuid, text, jsonb, boolean) to authenticated;

create or replace function app.adopt_vrio_upstream(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.vrio_versions;
  v_swot app.swot_versions;
begin
  v_version := app._vrio_version_for_edit(p_version_id);

  select * into v_swot from app.swot_versions
  where tenant_id = v_version.tenant_id and status = 'approved'::app.swot_version_status
  order by version_number desc limit 1;

  if v_swot.id is null then
    raise exception 'Geen goedgekeurde SWOT gevonden';
  end if;

  update app.vrio_versions
  set
    swot_version_id = v_swot.id,
    five_c_version_id = coalesce(v_swot.five_c_version_id, five_c_version_id),
    porter_version_id = coalesce(v_swot.porter_version_id, porter_version_id),
    pestel_version_id = coalesce(v_swot.pestel_version_id, pestel_version_id),
    synthesis_reviewed = false,
    status = 'needs_revision'::app.vrio_version_status
  where id = p_version_id;

  -- Alleen beoordelingen met verwijzingen naar gewijzigde upstream-bronnen worden verdacht.
  update app.vrio_resources r
  set
    needs_revision = true,
    review_status = 'pending'::app.vrio_review,
    reviewed_by = null,
    reviewed_at = null,
    revision_note = 'Bron uit SWOT/5C/Porter is gewijzigd; controleer deze beoordeling',
    updated_at = now()
  where r.version_id = p_version_id
    and r.deleted_at is null
    and (
      r.swot_item_id is not null
      or exists (
        select 1 from app.vrio_resource_refs rr
        where rr.resource_id = r.id
          and rr.ref_type in ('swot_item', 'five_c_item', 'five_c_synthesis', 'porter_force', 'porter_factor', 'porter_scope')
      )
      or exists (
        select 1
        from app.vrio_assessments a
        join app.vrio_assessment_refs ar on ar.assessment_id = a.id
        where a.resource_id = r.id
          and ar.ref_type in ('swot_item', 'five_c_item', 'five_c_synthesis', 'porter_force', 'porter_factor', 'porter_scope')
      )
    );

  perform app._vrio_touch(p_version_id);
end;
$$;

grant execute on function app.adopt_vrio_upstream(uuid) to authenticated;

create or replace function app.create_vrio_revision(p_tenant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_source app.vrio_versions;
  v_new uuid;
  v_res record;
  v_new_res uuid;
  v_assessment record;
  v_new_assessment uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  if exists (
    select 1 from app.vrio_versions
    where tenant_id = p_tenant_id and status <> 'approved'::app.vrio_version_status
  ) then
    raise exception 'Er bestaat al een open conceptversie';
  end if;

  select * into v_source from app.vrio_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.vrio_version_status
  order by version_number desc limit 1;

  if v_source.id is null then
    raise exception 'Geen goedgekeurde versie om te herwerken';
  end if;

  insert into app.vrio_versions (
    tenant_id, version_number, status, swot_version_id, five_c_version_id,
    porter_version_id, pestel_version_id, synthesis_text, priorities, created_by
  )
  values (
    p_tenant_id,
    (select max(version_number) + 1 from app.vrio_versions where tenant_id = p_tenant_id),
    'draft',
    v_source.swot_version_id,
    v_source.five_c_version_id,
    v_source.porter_version_id,
    v_source.pestel_version_id,
    v_source.synthesis_text,
    v_source.priorities,
    auth.uid()
  )
  returning id into v_new;

  for v_res in select * from app.vrio_resources where version_id = v_source.id and deleted_at is null
  loop
    insert into app.vrio_resources (
      version_id, tenant_id, title, description, kind, origin, swot_item_id, selected,
      exclusion_reason, evidence_level, needs_clarification, clarification_note,
      partner_owned, access_note, market_context, sort_order, created_by, created_at
    )
    values (
      v_new, p_tenant_id, v_res.title, v_res.description, v_res.kind, v_res.origin, v_res.swot_item_id,
      v_res.selected, v_res.exclusion_reason, v_res.evidence_level, v_res.needs_clarification,
      v_res.clarification_note, v_res.partner_owned, v_res.access_note, v_res.market_context,
      v_res.sort_order, v_res.created_by, v_res.created_at
    )
    returning id into v_new_res;

    insert into app.vrio_resource_refs (resource_id, tenant_id, ref_type, ref_id, label, excerpt)
    select v_new_res, tenant_id, ref_type, ref_id, label, excerpt
    from app.vrio_resource_refs where resource_id = v_res.id;

    for v_assessment in select * from app.vrio_assessments where resource_id = v_res.id
    loop
      insert into app.vrio_assessments (
        resource_id, version_id, tenant_id, criterion, answer, motivation, evidence_level,
        origin, advisor_note, open_question, question_status, question_answer, skipped_reason,
        confirmed, ai_answer, ai_motivation, ai_missing_evidence
      )
      values (
        v_new_res, v_new, p_tenant_id, v_assessment.criterion, v_assessment.answer,
        v_assessment.motivation, v_assessment.evidence_level, v_assessment.origin,
        v_assessment.advisor_note, v_assessment.open_question, v_assessment.question_status,
        v_assessment.question_answer, v_assessment.skipped_reason,
        false, v_assessment.ai_answer, v_assessment.ai_motivation, v_assessment.ai_missing_evidence
      )
      returning id into v_new_assessment;

      insert into app.vrio_assessment_refs (assessment_id, tenant_id, ref_type, ref_id, label, excerpt)
      select v_new_assessment, tenant_id, ref_type, ref_id, label, excerpt
      from app.vrio_assessment_refs where assessment_id = v_assessment.id;
    end loop;
  end loop;

  return v_new;
end;
$$;

grant execute on function app.create_vrio_revision(uuid) to authenticated;

create or replace function app.approve_vrio_version(
  p_version_id uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.vrio_versions;
  v_swot uuid;
  v_selected integer;
  v_unreviewed integer;
begin
  v_version := app._vrio_version_for_edit(p_version_id);

  if p_expected_updated_at is not null and v_version.updated_at <> p_expected_updated_at then
    raise exception 'Versie is intussen gewijzigd; herlaad de pagina';
  end if;

  select id into v_swot from app.swot_versions
  where tenant_id = v_version.tenant_id and status = 'approved'::app.swot_version_status
  order by version_number desc limit 1;

  if v_swot is null then
    raise exception 'SWOT moet goedgekeurd zijn vóór VRIO-goedkeuring';
  end if;
  if v_version.swot_version_id is distinct from v_swot then
    raise exception 'Er is een nieuwere goedgekeurde SWOT; neem die eerst over en herbeoordeel';
  end if;

  select count(*) into v_selected
  from app.vrio_resources
  where version_id = p_version_id and deleted_at is null and selected;

  if v_selected = 0 then
    raise exception 'Selecteer minstens één middel om te toetsen';
  end if;

  select count(*) into v_unreviewed
  from app.vrio_resources
  where version_id = p_version_id
    and deleted_at is null
    and selected
    and (review_status <> 'reviewed'::app.vrio_review or needs_revision);

  if v_unreviewed > 0 then
    raise exception 'Nog % middel(en) te beoordelen', v_unreviewed;
  end if;

  if not v_version.synthesis_reviewed or length(trim(v_version.synthesis_text)) < 20 then
    raise exception 'Beoordeel eerst de overkoepelende synthese';
  end if;

  update app.vrio_versions
  set
    status = 'approved'::app.vrio_version_status,
    approved_by = auth.uid(),
    approved_at = now(),
    updated_at = now()
  where id = p_version_id;
end;
$$;

grant execute on function app.approve_vrio_version(uuid, timestamptz) to authenticated;

-- Voortgang hub (incl. VRIO)
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
    'vrio_version_id', v_vrio
  );
end;
$$;

grant execute on function app.get_audit_framework_progress(uuid) to authenticated;

revoke execute on function app._vrio_version_for_edit(uuid) from public, anon, authenticated;
revoke execute on function app._vrio_ref_valid(app.vrio_versions, app.vrio_ref_type, uuid)
  from public, anon, authenticated;
revoke execute on function app._vrio_replace_resource_refs(uuid, app.vrio_versions, jsonb)
  from public, anon, authenticated;
revoke execute on function app._vrio_replace_assessment_refs(uuid, app.vrio_versions, jsonb)
  from public, anon, authenticated;
revoke execute on function app._vrio_touch(uuid) from public, anon, authenticated;
revoke execute on function app._vrio_seed_assessments(uuid) from public, anon, authenticated;
revoke execute on function app._vrio_reopen_resource(uuid) from public, anon, authenticated;
