-- Strategische audit · stap 3: 5C-analyse (synthese van klantdossier, PESTEL en Porter)
-- Alle schrijfacties via security definer RPC's; tabellen zonder directe toegang.

create type app.five_c_key as enum (
  'company',
  'customers',
  'competitors',
  'collaborators',
  'context'
);

create type app.five_c_version_status as enum ('not_started', 'draft', 'approved');

create type app.five_c_content_type as enum ('adopted', 'derived', 'input_needed');

create type app.five_c_evidence_level as enum ('provided', 'observed', 'hypothesis');

create type app.five_c_review as enum ('pending', 'reviewed', 'rejected');

create type app.five_c_gap_status as enum ('open', 'answered', 'queued_meeting', 'accepted_open');

create type app.five_c_ref_type as enum (
  'tenant_profile',
  'meeting',
  'pestel_insight',
  'pestel_input',
  'porter_scope',
  'porter_force',
  'porter_factor',
  'manual'
);

create table app.five_c_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  version_number integer not null,
  status app.five_c_version_status not null default 'not_started',
  pestel_version_id uuid references app.pestel_versions (id) on delete set null,
  porter_version_id uuid references app.porter_versions (id) on delete set null,
  excluded_inputs jsonb not null default '[]'::jsonb,
  synthesis_text text not null default '',
  synthesis_reviewed boolean not null default false,
  coherence_points jsonb not null default '[]'::jsonb,
  ai_generated_at timestamptz,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, version_number)
);

create index five_c_versions_tenant_idx on app.five_c_versions (tenant_id, version_number desc);

create table app.five_c_sections (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.five_c_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  c_key app.five_c_key not null,
  summary text not null default '',
  review_status app.five_c_review not null default 'pending',
  gaps_accepted boolean not null default false,
  gaps_note text not null default '',
  needs_revision boolean not null default false,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (version_id, c_key)
);

create table app.five_c_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.five_c_versions (id) on delete cascade,
  section_id uuid not null references app.five_c_sections (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  c_key app.five_c_key not null,
  title text not null default '',
  finding text not null default '',
  client_relevance text not null default '',
  content_type app.five_c_content_type not null default 'adopted',
  evidence_level app.five_c_evidence_level not null default 'hypothesis',
  qualifier text not null default '',
  advisor_note text not null default '',
  open_question text not null default '',
  gap_reason text not null default '',
  gap_status app.five_c_gap_status not null default 'open',
  gap_answer text not null default '',
  origin text not null default 'manual' check (origin in ('ai', 'manual')),
  unsupported boolean not null default false,
  unsupported_reason text not null default '',
  review_status app.five_c_review not null default 'pending',
  reject_reason text not null default '',
  sort_order integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index five_c_items_section_idx on app.five_c_items (section_id) where deleted_at is null;

create table app.five_c_item_refs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references app.five_c_items (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  ref_type app.five_c_ref_type not null,
  ref_id uuid,
  ref_version_id uuid,
  label text not null default '',
  excerpt text not null default '',
  created_at timestamptz not null default now()
);

create index five_c_item_refs_item_idx on app.five_c_item_refs (item_id);

create table app.five_c_contradictions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.five_c_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  title text not null default '',
  description text not null default '',
  source_a jsonb not null,
  source_b jsonb not null,
  affected_keys jsonb not null default '[]'::jsonb,
  resolution text not null default 'open'
    check (resolution in ('open', 'clarified', 'a_outdated', 'b_outdated')),
  resolution_note text not null default '',
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table app.five_c_upstream_requests (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.five_c_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  target text not null check (target in ('pestel', 'porter')),
  c_key app.five_c_key,
  note text not null,
  status text not null default 'open' check (status in ('open', 'done')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table app.five_c_versions enable row level security;
alter table app.five_c_sections enable row level security;
alter table app.five_c_items enable row level security;
alter table app.five_c_item_refs enable row level security;
alter table app.five_c_contradictions enable row level security;
alter table app.five_c_upstream_requests enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function app._five_c_seed_sections(p_version_id uuid, p_tenant_id uuid)
returns void
language plpgsql
as $$
declare
  v_key app.five_c_key;
begin
  foreach v_key in array enum_range(null::app.five_c_key)
  loop
    insert into app.five_c_sections (version_id, tenant_id, c_key)
    values (p_version_id, p_tenant_id, v_key)
    on conflict (version_id, c_key) do nothing;
  end loop;
end;
$$;

create or replace function app._five_c_version_for_edit(p_version_id uuid)
returns app.five_c_versions
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.five_c_versions;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_row from app.five_c_versions where id = p_version_id;
  if v_row.id is null then
    raise exception 'Versie niet gevonden';
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  if v_row.status = 'approved'::app.five_c_version_status then
    raise exception 'Goedgekeurde 5C-versie is alleen-lezen; maak een nieuwe conceptversie';
  end if;
  return v_row;
end;
$$;

create or replace function app._five_c_ref_valid(
  p_version app.five_c_versions,
  p_type app.five_c_ref_type,
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
    when 'manual' then
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
  end case;
  return false;
end;
$$;

create or replace function app._five_c_replace_refs(
  p_item_id uuid,
  p_version app.five_c_versions,
  p_refs jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_ref jsonb;
  v_type app.five_c_ref_type;
  v_id uuid;
begin
  delete from app.five_c_item_refs where item_id = p_item_id;

  if p_refs is null or jsonb_typeof(p_refs) <> 'array' then
    return;
  end if;

  for v_ref in select * from jsonb_array_elements(p_refs)
  loop
    v_type := (v_ref->>'ref_type')::app.five_c_ref_type;
    v_id := nullif(v_ref->>'ref_id', '')::uuid;
    if not app._five_c_ref_valid(p_version, v_type, v_id) then
      raise exception 'Ongeldige bronverwijzing (% %)', v_type, coalesce(v_id::text, '-');
    end if;

    insert into app.five_c_item_refs (
      item_id, tenant_id, ref_type, ref_id, ref_version_id, label, excerpt
    )
    values (
      p_item_id,
      p_version.tenant_id,
      v_type,
      v_id,
      case
        when v_type in ('pestel_insight', 'pestel_input') then p_version.pestel_version_id
        when v_type in ('porter_scope', 'porter_force', 'porter_factor') then p_version.porter_version_id
        else null
      end,
      left(coalesce(v_ref->>'label', ''), 500),
      left(coalesce(v_ref->>'excerpt', ''), 2000)
    );
  end loop;
end;
$$;

create or replace function app._five_c_touch(p_version_id uuid)
returns void
language sql
security definer
set search_path = app, public, auth
as $$
  update app.five_c_versions
  set
    updated_at = now(),
    status = case
      when status = 'not_started'::app.five_c_version_status then 'draft'::app.five_c_version_status
      else status
    end
  where id = p_version_id;
$$;

create or replace function app._five_c_reopen_section(p_version_id uuid, p_c_key app.five_c_key)
returns void
language sql
security definer
set search_path = app, public, auth
as $$
  update app.five_c_sections
  set review_status = 'pending'::app.five_c_review, reviewed_by = null, reviewed_at = null, updated_at = now()
  where version_id = p_version_id and c_key = p_c_key;
  update app.five_c_versions set synthesis_reviewed = false where id = p_version_id;
$$;

-- ---------------------------------------------------------------------------
-- Workbench
-- ---------------------------------------------------------------------------

create or replace function app.get_five_c_workbench(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.five_c_versions;
  v_pestel_approved app.pestel_versions;
  v_porter_approved app.porter_versions;
  v_pestel app.pestel_versions;
  v_porter app.porter_versions;
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

  select * into v_pestel_approved
  from app.pestel_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.pestel_version_status
  order by version_number desc limit 1;

  select * into v_porter_approved
  from app.porter_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.porter_version_status
  order by version_number desc limit 1;

  select * into v_version
  from app.five_c_versions
  where tenant_id = p_tenant_id and status <> 'approved'::app.five_c_version_status
  order by version_number desc limit 1;

  if v_version.id is null then
    select * into v_version
    from app.five_c_versions
    where tenant_id = p_tenant_id
    order by version_number desc limit 1;
  end if;

  if v_version.id is null then
    insert into app.five_c_versions (
      tenant_id, version_number, status, pestel_version_id, porter_version_id, created_by
    )
    values (
      p_tenant_id,
      1,
      'not_started',
      coalesce(
        v_pestel_approved.id,
        (select id from app.pestel_versions where tenant_id = p_tenant_id order by version_number desc limit 1)
      ),
      coalesce(
        v_porter_approved.id,
        (select id from app.porter_versions where tenant_id = p_tenant_id order by version_number desc limit 1)
      ),
      auth.uid()
    )
    returning * into v_version;
  end if;

  perform app._five_c_seed_sections(v_version.id, p_tenant_id);

  select * into v_pestel from app.pestel_versions where id = v_version.pestel_version_id;
  select * into v_porter from app.porter_versions where id = v_version.porter_version_id;

  return jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id,
      'version_number', v_version.version_number,
      'status', v_version.status,
      'pestel_version_id', v_version.pestel_version_id,
      'porter_version_id', v_version.porter_version_id,
      'excluded_inputs', v_version.excluded_inputs,
      'synthesis_text', v_version.synthesis_text,
      'synthesis_reviewed', v_version.synthesis_reviewed,
      'coherence_points', v_version.coherence_points,
      'ai_generated_at', v_version.ai_generated_at,
      'approved_by', v_version.approved_by,
      'approved_at', v_version.approved_at,
      'updated_at', v_version.updated_at
    ),
    'upstream', jsonb_build_object(
      'pestel', case when v_pestel.id is null then null else jsonb_build_object(
        'id', v_pestel.id, 'version_number', v_pestel.version_number, 'status', v_pestel.status
      ) end,
      'porter', case when v_porter.id is null then null else jsonb_build_object(
        'id', v_porter.id, 'version_number', v_porter.version_number, 'status', v_porter.status
      ) end,
      'latest_pestel_approved', case when v_pestel_approved.id is null then null else jsonb_build_object(
        'id', v_pestel_approved.id, 'version_number', v_pestel_approved.version_number
      ) end,
      'latest_porter_approved', case when v_porter_approved.id is null then null else jsonb_build_object(
        'id', v_porter_approved.id, 'version_number', v_porter_approved.version_number
      ) end
    ),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'c_key', s.c_key,
        'summary', s.summary,
        'review_status', s.review_status,
        'gaps_accepted', s.gaps_accepted,
        'gaps_note', s.gaps_note,
        'needs_revision', s.needs_revision,
        'reviewed_at', s.reviewed_at
      ) order by array_position(enum_range(null::app.five_c_key), s.c_key))
      from app.five_c_sections s where s.version_id = v_version.id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'c_key', i.c_key,
        'title', i.title,
        'finding', i.finding,
        'client_relevance', i.client_relevance,
        'content_type', i.content_type,
        'evidence_level', i.evidence_level,
        'qualifier', i.qualifier,
        'advisor_note', i.advisor_note,
        'open_question', i.open_question,
        'gap_reason', i.gap_reason,
        'gap_status', i.gap_status,
        'gap_answer', i.gap_answer,
        'origin', i.origin,
        'unsupported', i.unsupported,
        'unsupported_reason', i.unsupported_reason,
        'review_status', i.review_status,
        'reject_reason', i.reject_reason,
        'sort_order', i.sort_order,
        'created_at', i.created_at,
        'refs', coalesce((
          select jsonb_agg(jsonb_build_object(
            'ref_type', r.ref_type,
            'ref_id', r.ref_id,
            'ref_version_id', r.ref_version_id,
            'label', r.label,
            'excerpt', r.excerpt
          ) order by r.created_at)
          from app.five_c_item_refs r where r.item_id = i.id
        ), '[]'::jsonb)
      ) order by i.c_key, i.sort_order, i.created_at)
      from app.five_c_items i
      where i.version_id = v_version.id and i.deleted_at is null
    ), '[]'::jsonb),
    'contradictions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'title', c.title,
        'description', c.description,
        'source_a', c.source_a,
        'source_b', c.source_b,
        'affected_keys', c.affected_keys,
        'resolution', c.resolution,
        'resolution_note', c.resolution_note,
        'resolved_at', c.resolved_at
      ) order by c.created_at)
      from app.five_c_contradictions c where c.version_id = v_version.id
    ), '[]'::jsonb),
    'upstream_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'target', u.target, 'c_key', u.c_key, 'note', u.note,
        'status', u.status, 'created_at', u.created_at
      ) order by u.created_at desc)
      from app.five_c_upstream_requests u where u.version_id = v_version.id
    ), '[]'::jsonb),
    'inputs', jsonb_build_object(
      'tenant', jsonb_build_object(
        'id', v_tenant.id,
        'name', v_tenant.name,
        'website', v_tenant.website,
        'audit_goal', v_tenant.audit_goal
      ),
      'meetings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'title', coalesce(nullif(trim(m.title), ''), to_char(m.created_at, 'YYYY-MM-DD HH24:MI')),
          'review_status', m.review_status,
          'created_at', m.created_at,
          'text', left(
            coalesce(nullif(trim(m.summary_text), ''), left(coalesce(m.full_text, ''), 4000)),
            4000
          ),
          'notes', left(coalesce(m.notes, ''), 2000)
        ) order by m.created_at desc)
        from (
          select * from app.meeting_recordings
          where tenant_id = p_tenant_id and transcript_status = 'ready'
          order by created_at desc limit 12
        ) m
      ), '[]'::jsonb),
      'pestel_inputs', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', inp.id,
          'kind', inp.kind,
          'label', inp.label,
          'url', inp.url,
          'excerpt', left(coalesce(inp.excerpt, ''), 3000),
          'created_at', inp.created_at
        ) order by inp.sort_order, inp.created_at)
        from app.pestel_version_research_inputs inp
        where inp.version_id = v_version.pestel_version_id
          and inp.kind in ('document', 'note')
      ), '[]'::jsonb),
      'pestel_insights', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id,
          'dimension', i.dimension,
          'title', i.title,
          'observation', left(i.observation, 2000),
          'client_relevance', left(i.client_relevance, 1000),
          'evidence_level', i.evidence_level,
          'insight_time_horizon', i.insight_time_horizon,
          'review_status', i.review_status
        ) order by i.dimension, i.sort_order)
        from app.pestel_insights i
        where i.version_id = v_version.pestel_version_id
          and i.deleted_at is null
          and i.review_status <> 'rejected'::app.pestel_insight_review
      ), '[]'::jsonb),
      'pestel_scope', case when v_pestel.id is null then null else jsonb_build_object(
        'geo_markets', v_pestel.geo_markets,
        'time_horizon', v_pestel.time_horizon,
        'synthesis_text', left(v_pestel.synthesis_text, 4000)
      ) end,
      'porter_scope', case when v_porter.id is null then null else jsonb_build_object(
        'id', v_porter.id,
        'market_sector', v_porter.market_sector,
        'offering_description', v_porter.offering_description,
        'client_segment', v_porter.client_segment,
        'geo_markets', v_porter.geo_markets,
        'time_horizon', v_porter.time_horizon,
        'known_competitors', v_porter.known_competitors,
        'synthesis_text', left(v_porter.synthesis_text, 4000)
      ) end,
      'porter_forces', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id,
          'force_key', f.force_key,
          'intensity', f.intensity,
          'headline_factor', f.headline_factor,
          'motivation', left(f.motivation, 2000),
          'client_relevance', left(f.client_relevance, 1000),
          'review_status', f.review_status
        ) order by f.sort_order)
        from app.porter_forces f
        where f.version_id = v_version.porter_version_id
      ), '[]'::jsonb),
      'porter_factors', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', pf.id,
          'force_key', f.force_key,
          'title', pf.title,
          'observation', left(pf.observation, 1500),
          'effect', pf.effect,
          'evidence_level', pf.evidence_level
        ) order by f.sort_order, pf.sort_order)
        from app.porter_factors pf
        join app.porter_forces f on f.id = pf.force_id
        where pf.version_id = v_version.porter_version_id
          and pf.deleted_at is null
      ), '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function app.get_five_c_workbench(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Items (handmatig + bewerken)
-- ---------------------------------------------------------------------------

create or replace function app.upsert_five_c_item(
  p_version_id uuid,
  p_item_id uuid,
  p_c_key app.five_c_key,
  p_title text,
  p_finding text,
  p_client_relevance text,
  p_content_type app.five_c_content_type,
  p_evidence_level app.five_c_evidence_level,
  p_qualifier text,
  p_advisor_note text,
  p_open_question text,
  p_gap_reason text,
  p_refs jsonb,
  p_mark_reviewed boolean
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.five_c_versions;
  v_section app.five_c_sections;
  v_id uuid;
begin
  v_version := app._five_c_version_for_edit(p_version_id);

  select * into v_section
  from app.five_c_sections
  where version_id = p_version_id and c_key = p_c_key;
  if v_section.id is null then
    raise exception 'Onderdeel niet gevonden';
  end if;

  if p_item_id is not null then
    update app.five_c_items
    set
      title = left(trim(coalesce(p_title, '')), 300),
      finding = left(trim(coalesce(p_finding, '')), 6000),
      client_relevance = left(trim(coalesce(p_client_relevance, '')), 3000),
      content_type = p_content_type,
      evidence_level = p_evidence_level,
      qualifier = left(trim(coalesce(p_qualifier, '')), 100),
      advisor_note = left(trim(coalesce(p_advisor_note, '')), 4000),
      open_question = left(trim(coalesce(p_open_question, '')), 1000),
      gap_reason = left(trim(coalesce(p_gap_reason, '')), 1000),
      review_status = case
        when p_mark_reviewed then 'reviewed'::app.five_c_review
        else 'pending'::app.five_c_review
      end,
      updated_at = now()
    where id = p_item_id and version_id = p_version_id and deleted_at is null
    returning id into v_id;

    if v_id is null then
      raise exception 'Inzicht niet gevonden';
    end if;
  else
    insert into app.five_c_items (
      version_id, section_id, tenant_id, c_key, title, finding, client_relevance,
      content_type, evidence_level, qualifier, advisor_note, open_question, gap_reason,
      origin, review_status, sort_order, created_by
    )
    values (
      p_version_id,
      v_section.id,
      v_version.tenant_id,
      p_c_key,
      left(trim(coalesce(p_title, '')), 300),
      left(trim(coalesce(p_finding, '')), 6000),
      left(trim(coalesce(p_client_relevance, '')), 3000),
      p_content_type,
      p_evidence_level,
      left(trim(coalesce(p_qualifier, '')), 100),
      left(trim(coalesce(p_advisor_note, '')), 4000),
      left(trim(coalesce(p_open_question, '')), 1000),
      left(trim(coalesce(p_gap_reason, '')), 1000),
      'manual',
      case when p_mark_reviewed then 'reviewed'::app.five_c_review else 'pending'::app.five_c_review end,
      coalesce((select max(sort_order) + 1 from app.five_c_items where section_id = v_section.id), 0),
      auth.uid()
    )
    returning id into v_id;
  end if;

  perform app._five_c_replace_refs(v_id, v_version, p_refs);
  perform app._five_c_reopen_section(p_version_id, p_c_key);
  perform app._five_c_touch(p_version_id);
  return v_id;
end;
$$;

grant execute on function app.upsert_five_c_item(
  uuid, uuid, app.five_c_key, text, text, text, app.five_c_content_type,
  app.five_c_evidence_level, text, text, text, text, jsonb, boolean
) to authenticated;

create or replace function app.set_five_c_item_review(
  p_item_id uuid,
  p_status app.five_c_review,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.five_c_items;
begin
  select * into v_item from app.five_c_items where id = p_item_id and deleted_at is null;
  if v_item.id is null then
    raise exception 'Inzicht niet gevonden';
  end if;
  perform app._five_c_version_for_edit(v_item.version_id);

  update app.five_c_items
  set
    review_status = p_status,
    reject_reason = case when p_status = 'rejected'::app.five_c_review
      then left(trim(coalesce(p_reason, '')), 1000) else '' end,
    updated_at = now()
  where id = p_item_id;

  perform app._five_c_reopen_section(v_item.version_id, v_item.c_key);
  perform app._five_c_touch(v_item.version_id);
end;
$$;

grant execute on function app.set_five_c_item_review(uuid, app.five_c_review, text) to authenticated;

create or replace function app.update_five_c_gap(
  p_item_id uuid,
  p_gap_status app.five_c_gap_status,
  p_gap_answer text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.five_c_items;
begin
  select * into v_item from app.five_c_items where id = p_item_id and deleted_at is null;
  if v_item.id is null then
    raise exception 'Hiaat niet gevonden';
  end if;
  perform app._five_c_version_for_edit(v_item.version_id);

  if p_gap_status = 'answered'::app.five_c_gap_status
    and length(trim(coalesce(p_gap_answer, ''))) < 3 then
    raise exception 'Vul een antwoord in';
  end if;
  if p_gap_status = 'accepted_open'::app.five_c_gap_status
    and length(trim(coalesce(p_gap_answer, ''))) < 3 then
    raise exception 'Licht toe waarom dit hiaat bewust open blijft';
  end if;

  update app.five_c_items
  set
    gap_status = p_gap_status,
    gap_answer = left(trim(coalesce(p_gap_answer, '')), 4000),
    updated_at = now()
  where id = p_item_id;

  if p_gap_status = 'answered'::app.five_c_gap_status then
    update app.five_c_sections
    set needs_revision = true, updated_at = now()
    where version_id = v_item.version_id and c_key = v_item.c_key;
  end if;

  perform app._five_c_reopen_section(v_item.version_id, v_item.c_key);
  perform app._five_c_touch(v_item.version_id);
end;
$$;

grant execute on function app.update_five_c_gap(uuid, app.five_c_gap_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Onderdelen, synthese, inputs, tegenstrijdigheden, upstream-vragen
-- ---------------------------------------------------------------------------

create or replace function app.set_five_c_section_review(
  p_section_id uuid,
  p_reviewed boolean,
  p_gaps_accepted boolean,
  p_gaps_note text,
  p_summary text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_section app.five_c_sections;
  v_open_gaps integer;
  v_open_contradictions integer;
begin
  select * into v_section from app.five_c_sections where id = p_section_id;
  if v_section.id is null then
    raise exception 'Onderdeel niet gevonden';
  end if;
  perform app._five_c_version_for_edit(v_section.version_id);

  if p_reviewed then
    select count(*) into v_open_gaps
    from app.five_c_items i
    where i.section_id = p_section_id
      and i.deleted_at is null
      and i.review_status <> 'rejected'::app.five_c_review
      and i.content_type = 'input_needed'::app.five_c_content_type
      and i.gap_status in ('open'::app.five_c_gap_status, 'queued_meeting'::app.five_c_gap_status);

    if v_open_gaps > 0 and not coalesce(p_gaps_accepted, false) then
      raise exception 'Er staan nog % open hiaten: beantwoord ze of aanvaard ze expliciet', v_open_gaps;
    end if;
    if v_open_gaps > 0 and length(trim(coalesce(p_gaps_note, ''))) < 3 then
      raise exception 'Licht toe waarom je de open hiaten aanvaardt';
    end if;

    select count(*) into v_open_contradictions
    from app.five_c_contradictions c
    where c.version_id = v_section.version_id
      and c.resolution = 'open'
      and c.affected_keys ? v_section.c_key::text;

    if v_open_contradictions > 0 then
      raise exception 'Los eerst % tegenstrijdigheid/-heden in dit onderdeel op', v_open_contradictions;
    end if;

    if exists (
      select 1 from app.five_c_items i
      where i.section_id = p_section_id
        and i.deleted_at is null
        and i.review_status = 'pending'::app.five_c_review
    ) then
      raise exception 'Beoordeel of verwerp eerst alle inzichten in dit onderdeel';
    end if;
  end if;

  update app.five_c_sections
  set
    summary = case when p_summary is null then summary else left(trim(p_summary), 2000) end,
    review_status = case when p_reviewed then 'reviewed'::app.five_c_review else 'pending'::app.five_c_review end,
    gaps_accepted = coalesce(p_gaps_accepted, false),
    gaps_note = left(trim(coalesce(p_gaps_note, '')), 2000),
    needs_revision = case when p_reviewed then false else needs_revision end,
    reviewed_by = case when p_reviewed then auth.uid() else null end,
    reviewed_at = case when p_reviewed then now() else null end,
    updated_at = now()
  where id = p_section_id;

  if not p_reviewed then
    update app.five_c_versions set synthesis_reviewed = false where id = v_section.version_id;
  end if;
  perform app._five_c_touch(v_section.version_id);
end;
$$;

grant execute on function app.set_five_c_section_review(uuid, boolean, boolean, text, text) to authenticated;

create or replace function app.update_five_c_synthesis(
  p_version_id uuid,
  p_synthesis_text text,
  p_reviewed boolean
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  perform app._five_c_version_for_edit(p_version_id);

  if p_reviewed and length(trim(coalesce(p_synthesis_text, ''))) < 20 then
    raise exception 'Strategische samenhang is te kort (minstens 20 tekens)';
  end if;

  update app.five_c_versions
  set
    synthesis_text = left(trim(coalesce(p_synthesis_text, '')), 12000),
    synthesis_reviewed = coalesce(p_reviewed, false)
  where id = p_version_id;
  perform app._five_c_touch(p_version_id);
end;
$$;

grant execute on function app.update_five_c_synthesis(uuid, text, boolean) to authenticated;

create or replace function app.set_five_c_excluded_inputs(p_version_id uuid, p_keys jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  perform app._five_c_version_for_edit(p_version_id);
  if p_keys is null or jsonb_typeof(p_keys) <> 'array' then
    raise exception 'Ongeldige lijst';
  end if;
  update app.five_c_versions
  set excluded_inputs = p_keys
  where id = p_version_id;
  perform app._five_c_touch(p_version_id);
end;
$$;

grant execute on function app.set_five_c_excluded_inputs(uuid, jsonb) to authenticated;

create or replace function app.resolve_five_c_contradiction(
  p_contradiction_id uuid,
  p_resolution text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.five_c_contradictions;
  v_key text;
begin
  select * into v_row from app.five_c_contradictions where id = p_contradiction_id;
  if v_row.id is null then
    raise exception 'Tegenstrijdigheid niet gevonden';
  end if;
  perform app._five_c_version_for_edit(v_row.version_id);

  if p_resolution not in ('clarified', 'a_outdated', 'b_outdated', 'open') then
    raise exception 'Ongeldige beslissing';
  end if;
  if p_resolution <> 'open' and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Licht je beslissing kort toe';
  end if;

  update app.five_c_contradictions
  set
    resolution = p_resolution,
    resolution_note = left(trim(coalesce(p_note, '')), 2000),
    resolved_by = case when p_resolution = 'open' then null else auth.uid() end,
    resolved_at = case when p_resolution = 'open' then null else now() end
  where id = p_contradiction_id;

  for v_key in select jsonb_array_elements_text(v_row.affected_keys)
  loop
    update app.five_c_sections
    set needs_revision = true
    where version_id = v_row.version_id and c_key::text = v_key;
    perform app._five_c_reopen_section(v_row.version_id, v_key::app.five_c_key);
  end loop;
  perform app._five_c_touch(v_row.version_id);
end;
$$;

grant execute on function app.resolve_five_c_contradiction(uuid, text, text) to authenticated;

create or replace function app.add_five_c_upstream_request(
  p_version_id uuid,
  p_target text,
  p_c_key app.five_c_key,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.five_c_versions;
  v_id uuid;
begin
  v_version := app._five_c_version_for_edit(p_version_id);
  if length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Beschrijf de vraag of het wijzigingsvoorstel';
  end if;
  insert into app.five_c_upstream_requests (version_id, tenant_id, target, c_key, note, created_by)
  values (p_version_id, v_version.tenant_id, p_target, p_c_key, left(trim(p_note), 2000), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function app.add_five_c_upstream_request(uuid, text, app.five_c_key, text) to authenticated;

-- ---------------------------------------------------------------------------
-- AI-resultaat opslaan (server valideert opnieuw alle bronverwijzingen)
-- ---------------------------------------------------------------------------

create or replace function app.save_five_c_ai_result(
  p_version_id uuid,
  p_c_keys jsonb,
  p_sections jsonb,
  p_contradictions jsonb,
  p_coherence jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.five_c_versions;
  v_section app.five_c_sections;
  v_key text;
  v_sec jsonb;
  v_item jsonb;
  v_item_id uuid;
  v_sort integer;
  v_contra jsonb;
  v_point jsonb;
  v_ref jsonb;
  v_full_run boolean;
begin
  v_version := app._five_c_version_for_edit(p_version_id);

  if p_c_keys is null or jsonb_typeof(p_c_keys) <> 'array' or jsonb_array_length(p_c_keys) = 0 then
    raise exception 'Geen onderdelen opgegeven';
  end if;
  v_full_run := jsonb_array_length(p_c_keys) = 5;

  for v_key in select jsonb_array_elements_text(p_c_keys)
  loop
    select * into v_section
    from app.five_c_sections
    where version_id = p_version_id and c_key::text = v_key;
    if v_section.id is null then
      raise exception 'Onderdeel % niet gevonden', v_key;
    end if;

    update app.five_c_items
    set deleted_at = now(), updated_at = now()
    where section_id = v_section.id
      and origin = 'ai'
      and review_status = 'pending'::app.five_c_review
      and deleted_at is null;

    v_sec := p_sections -> v_key;
    v_sort := coalesce((
      select max(sort_order) + 1 from app.five_c_items
      where section_id = v_section.id and deleted_at is null
    ), 0);

    update app.five_c_sections
    set
      summary = left(coalesce(v_sec->>'summary', ''), 2000),
      review_status = 'pending'::app.five_c_review,
      needs_revision = false,
      reviewed_by = null,
      reviewed_at = null,
      updated_at = now()
    where id = v_section.id;

    if v_sec is not null and jsonb_typeof(v_sec->'items') = 'array' then
      for v_item in select * from jsonb_array_elements(v_sec->'items')
      loop
        insert into app.five_c_items (
          version_id, section_id, tenant_id, c_key, title, finding, client_relevance,
          content_type, evidence_level, qualifier, open_question, gap_reason,
          origin, unsupported, unsupported_reason, review_status, sort_order
        )
        values (
          p_version_id,
          v_section.id,
          v_version.tenant_id,
          v_key::app.five_c_key,
          left(coalesce(v_item->>'title', ''), 300),
          left(coalesce(v_item->>'finding', ''), 6000),
          left(coalesce(v_item->>'client_relevance', ''), 3000),
          (v_item->>'content_type')::app.five_c_content_type,
          coalesce((v_item->>'evidence_level')::app.five_c_evidence_level, 'hypothesis'::app.five_c_evidence_level),
          left(coalesce(v_item->>'qualifier', ''), 100),
          left(coalesce(v_item->>'open_question', ''), 1000),
          left(coalesce(v_item->>'gap_reason', ''), 1000),
          'ai',
          coalesce((v_item->>'unsupported')::boolean, false),
          left(coalesce(v_item->>'unsupported_reason', ''), 500),
          'pending'::app.five_c_review,
          v_sort
        )
        returning id into v_item_id;

        v_sort := v_sort + 1;
        perform app._five_c_replace_refs(v_item_id, v_version, v_item->'refs');
      end loop;
    end if;
  end loop;

  if v_full_run then
    delete from app.five_c_contradictions
    where version_id = p_version_id and resolution = 'open';
  end if;

  if p_contradictions is not null and jsonb_typeof(p_contradictions) = 'array' then
    for v_contra in select * from jsonb_array_elements(p_contradictions)
    loop
      foreach v_ref in array array[v_contra->'source_a', v_contra->'source_b']
      loop
        if not app._five_c_ref_valid(
          v_version,
          (v_ref->>'ref_type')::app.five_c_ref_type,
          nullif(v_ref->>'ref_id', '')::uuid
        ) then
          raise exception 'Ongeldige bron in tegenstrijdigheid';
        end if;
      end loop;

      insert into app.five_c_contradictions (
        version_id, tenant_id, title, description, source_a, source_b, affected_keys
      )
      values (
        p_version_id,
        v_version.tenant_id,
        left(coalesce(v_contra->>'title', ''), 300),
        left(coalesce(v_contra->>'description', ''), 2000),
        v_contra->'source_a',
        v_contra->'source_b',
        coalesce(v_contra->'affected_keys', '[]'::jsonb)
      );
    end loop;
  end if;

  if p_coherence is not null and jsonb_typeof(p_coherence) = 'array' then
    for v_point in select * from jsonb_array_elements(p_coherence)
    loop
      for v_ref in select * from jsonb_array_elements(coalesce(v_point->'refs', '[]'::jsonb))
      loop
        if not app._five_c_ref_valid(
          v_version,
          (v_ref->>'ref_type')::app.five_c_ref_type,
          nullif(v_ref->>'ref_id', '')::uuid
        ) then
          raise exception 'Ongeldige bron in strategische samenhang';
        end if;
      end loop;
    end loop;

    update app.five_c_versions
    set
      coherence_points = p_coherence,
      synthesis_text = case
        when length(trim(synthesis_text)) = 0 then coalesce((
          select string_agg(p->>'statement', E'\n\n')
          from jsonb_array_elements(p_coherence) p
        ), '')
        else synthesis_text
      end
    where id = p_version_id;
  end if;

  update app.five_c_versions
  set
    synthesis_reviewed = false,
    ai_generated_at = now()
  where id = p_version_id;
  perform app._five_c_touch(p_version_id);
end;
$$;

grant execute on function app.save_five_c_ai_result(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Upstream overnemen, nieuwe conceptversie, goedkeuren
-- ---------------------------------------------------------------------------

create or replace function app.adopt_five_c_upstream(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.five_c_versions;
  v_pestel uuid;
  v_porter uuid;
begin
  v_version := app._five_c_version_for_edit(p_version_id);

  select id into v_pestel from app.pestel_versions
  where tenant_id = v_version.tenant_id and status = 'approved'::app.pestel_version_status
  order by version_number desc limit 1;

  select id into v_porter from app.porter_versions
  where tenant_id = v_version.tenant_id and status = 'approved'::app.porter_version_status
  order by version_number desc limit 1;

  update app.five_c_versions
  set
    pestel_version_id = coalesce(v_pestel, pestel_version_id),
    porter_version_id = coalesce(v_porter, porter_version_id),
    synthesis_reviewed = false
  where id = p_version_id;

  update app.five_c_sections
  set
    needs_revision = true,
    review_status = 'pending'::app.five_c_review,
    reviewed_by = null,
    reviewed_at = null,
    updated_at = now()
  where version_id = p_version_id
    and (
      (c_key = 'context'::app.five_c_key and v_pestel is distinct from v_version.pestel_version_id)
      or (
        c_key in ('competitors', 'customers', 'collaborators', 'company')
        and v_porter is distinct from v_version.porter_version_id
      )
    );

  perform app._five_c_touch(p_version_id);
end;
$$;

grant execute on function app.adopt_five_c_upstream(uuid) to authenticated;

create or replace function app.create_five_c_revision(p_tenant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_source app.five_c_versions;
  v_new uuid;
  v_section record;
  v_new_section uuid;
  v_item record;
  v_new_item uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  if exists (
    select 1 from app.five_c_versions
    where tenant_id = p_tenant_id and status <> 'approved'::app.five_c_version_status
  ) then
    raise exception 'Er bestaat al een open conceptversie';
  end if;

  select * into v_source from app.five_c_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.five_c_version_status
  order by version_number desc limit 1;

  if v_source.id is null then
    raise exception 'Geen goedgekeurde versie om te herwerken';
  end if;

  insert into app.five_c_versions (
    tenant_id, version_number, status, pestel_version_id, porter_version_id,
    excluded_inputs, synthesis_text, synthesis_reviewed, coherence_points, created_by
  )
  values (
    p_tenant_id,
    (select max(version_number) + 1 from app.five_c_versions where tenant_id = p_tenant_id),
    'draft',
    v_source.pestel_version_id,
    v_source.porter_version_id,
    v_source.excluded_inputs,
    v_source.synthesis_text,
    false,
    v_source.coherence_points,
    auth.uid()
  )
  returning id into v_new;

  for v_section in select * from app.five_c_sections where version_id = v_source.id
  loop
    insert into app.five_c_sections (version_id, tenant_id, c_key, summary, gaps_note)
    values (v_new, p_tenant_id, v_section.c_key, v_section.summary, v_section.gaps_note)
    returning id into v_new_section;

    for v_item in
      select * from app.five_c_items
      where section_id = v_section.id
        and deleted_at is null
        and review_status <> 'rejected'::app.five_c_review
    loop
      insert into app.five_c_items (
        version_id, section_id, tenant_id, c_key, title, finding, client_relevance,
        content_type, evidence_level, qualifier, advisor_note, open_question, gap_reason,
        gap_status, gap_answer, origin, unsupported, unsupported_reason, review_status,
        sort_order, created_by, created_at
      )
      values (
        v_new, v_new_section, p_tenant_id, v_item.c_key, v_item.title, v_item.finding,
        v_item.client_relevance, v_item.content_type, v_item.evidence_level, v_item.qualifier,
        v_item.advisor_note, v_item.open_question, v_item.gap_reason, v_item.gap_status,
        v_item.gap_answer, v_item.origin, v_item.unsupported, v_item.unsupported_reason,
        'pending', v_item.sort_order, v_item.created_by, v_item.created_at
      )
      returning id into v_new_item;

      insert into app.five_c_item_refs (
        item_id, tenant_id, ref_type, ref_id, ref_version_id, label, excerpt
      )
      select v_new_item, tenant_id, ref_type, ref_id, ref_version_id, label, excerpt
      from app.five_c_item_refs where item_id = v_item.id;
    end loop;
  end loop;

  insert into app.five_c_contradictions (
    version_id, tenant_id, title, description, source_a, source_b, affected_keys,
    resolution, resolution_note, resolved_by, resolved_at
  )
  select v_new, tenant_id, title, description, source_a, source_b, affected_keys,
    resolution, resolution_note, resolved_by, resolved_at
  from app.five_c_contradictions where version_id = v_source.id;

  return v_new;
end;
$$;

grant execute on function app.create_five_c_revision(uuid) to authenticated;

create or replace function app.approve_five_c_version(
  p_version_id uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.five_c_versions;
  v_pestel uuid;
  v_porter uuid;
  v_unreviewed integer;
begin
  v_version := app._five_c_version_for_edit(p_version_id);

  if p_expected_updated_at is not null and v_version.updated_at <> p_expected_updated_at then
    raise exception 'Versie is intussen gewijzigd; herlaad de pagina';
  end if;

  select id into v_pestel from app.pestel_versions
  where tenant_id = v_version.tenant_id and status = 'approved'::app.pestel_version_status
  order by version_number desc limit 1;

  select id into v_porter from app.porter_versions
  where tenant_id = v_version.tenant_id and status = 'approved'::app.porter_version_status
  order by version_number desc limit 1;

  if v_pestel is null or v_porter is null then
    raise exception 'PESTEL en Porter moeten goedgekeurd zijn vóór definitieve 5C-goedkeuring';
  end if;
  if v_version.pestel_version_id is distinct from v_pestel
    or v_version.porter_version_id is distinct from v_porter then
    raise exception 'Er zijn nieuwere goedgekeurde PESTEL/Porter-versies; neem ze eerst over en herbeoordeel';
  end if;

  select count(*) into v_unreviewed
  from app.five_c_sections
  where version_id = p_version_id
    and (review_status <> 'reviewed'::app.five_c_review or needs_revision);

  if v_unreviewed > 0 then
    raise exception 'Nog % onderdelen te beoordelen', v_unreviewed;
  end if;

  if exists (
    select 1 from app.five_c_contradictions
    where version_id = p_version_id and resolution = 'open'
  ) then
    raise exception 'Los eerst alle tegenstrijdigheden op';
  end if;

  if not v_version.synthesis_reviewed or length(trim(v_version.synthesis_text)) < 20 then
    raise exception 'Beoordeel eerst de strategische samenhang';
  end if;

  update app.five_c_versions
  set
    status = 'approved'::app.five_c_version_status,
    approved_by = auth.uid(),
    approved_at = now(),
    updated_at = now()
  where id = p_version_id;
end;
$$;

grant execute on function app.approve_five_c_version(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Voortgang strategie-hub (incl. 5C)
-- ---------------------------------------------------------------------------

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

  return jsonb_build_object(
    'pestel_approved', v_pestel is not null,
    'pestel_version_id', v_pestel,
    'porter_approved', v_porter is not null,
    'porter_version_id', v_porter,
    'five_c_approved', v_five_c is not null,
    'five_c_version_id', v_five_c
  );
end;
$$;

grant execute on function app.get_audit_framework_progress(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Porter: na goedkeuring geen lege opvolgversie meer tonen bij terugkeren
-- ---------------------------------------------------------------------------

create or replace function app._porter_version_has_content(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, auth
as $$
  select exists (
    select 1 from app.porter_forces f
    where f.version_id = p_version_id
      and (
        f.intensity <> 'unknown'::app.porter_intensity
        or length(trim(f.motivation)) > 0
        or length(trim(f.headline_factor)) > 0
      )
  )
  or exists (
    select 1 from app.porter_versions v
    where v.id = p_version_id and length(trim(v.synthesis_text)) > 0
  )
  or exists (
    select 1 from app.porter_research_jobs j
    where j.version_id = p_version_id and j.status in ('queued', 'running')
  );
$$;

create or replace function app.get_porter_workbench(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.porter_versions;
  v_approved app.porter_versions;
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

  select * into v_approved
  from app.porter_versions
  where tenant_id = p_tenant_id
    and status = 'approved'::app.porter_version_status
  order by version_number desc
  limit 1;

  select * into v_version
  from app.porter_versions
  where tenant_id = p_tenant_id
    and status <> 'approved'::app.porter_version_status
  order by version_number desc
  limit 1;

  if v_version.id is not null
    and v_approved.id is not null
    and v_approved.version_number < v_version.version_number
    and not app._porter_version_has_content(v_version.id) then
    v_version := v_approved;
  end if;

  if v_version.id is null and v_approved.id is not null then
    v_version := v_approved;
  end if;

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

revoke execute on function app._five_c_seed_sections(uuid, uuid) from public, anon, authenticated;
revoke execute on function app._five_c_version_for_edit(uuid) from public, anon, authenticated;
revoke execute on function app._five_c_ref_valid(app.five_c_versions, app.five_c_ref_type, uuid)
  from public, anon, authenticated;
revoke execute on function app._five_c_replace_refs(uuid, app.five_c_versions, jsonb)
  from public, anon, authenticated;
revoke execute on function app._five_c_touch(uuid) from public, anon, authenticated;
revoke execute on function app._five_c_reopen_section(uuid, app.five_c_key)
  from public, anon, authenticated;
revoke execute on function app._porter_version_has_content(uuid) from public, anon, authenticated;
