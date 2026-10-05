-- Brand audit, stap 10. Draai na 20260330133200. Eerdere migraties niet opnieuw.

create table app.brand_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  version_number integer not null,
  status text not null default 'not_started' check (status in ('not_started', 'draft', 'approved')),
  current_step text not null default 'sources' check (current_step in ('sources', 'website', 'image', 'conclusion')),
  model text not null default 'keller' check (model in ('keller', 'aaker')),
  stp_version_id uuid references app.stp_versions (id) on delete set null,
  persona_version_id uuid references app.persona_versions (id) on delete set null,
  website_url text not null default '',
  period_label text not null default '',
  research_availability text not null default 'unknown' check (research_availability in ('uploaded', 'linked', 'unavailable', 'unknown')),
  scope_note text not null default '',
  verdict text not null default '',
  strongest text not null default '',
  weakest text not null default '',
  unassessed text not null default '',
  gap_summary text not null default '',
  positioning_intended text not null default '',
  perception_observed text not null default '',
  accepted_uncertainty text not null default '',
  open_questions text not null default '',
  sources_confirmed boolean not null default false,
  website_confirmed boolean not null default false,
  image_confirmed boolean not null default false,
  needs_review boolean not null default false,
  review_note text not null default '',
  published_at timestamptz,
  published_by uuid references auth.users (id),
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, version_number)
);

create table app.brand_sources (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.brand_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  kind text not null check (kind in ('upload', 'note', 'public')),
  material_type text not null default 'other',
  label text not null default '',
  storage_path text not null default '',
  mime text not null default '',
  content_hash text not null default '',
  period_label text not null default '',
  currency text not null default 'unknown' check (currency in ('current', 'historical', 'unknown')),
  channel text not null default '',
  audience text not null default '',
  note text not null default '',
  status text not null default 'stored' check (status in ('stored', 'ready', 'partial', 'failed')),
  error_message text not null default '',
  excerpt text not null default '',
  source_url text not null default '',
  archived_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index brand_sources_one_hash
  on app.brand_sources (version_id, content_hash)
  where archived_at is null and content_hash <> '';

create table app.brand_pages (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.brand_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  url text not null default '',
  role text not null default 'other' check (role in ('home', 'about', 'offer', 'proof', 'contact', 'other')),
  included boolean not null default true,
  fetched_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed', 'excluded')),
  error_message text not null default '',
  excerpt text not null default '',
  created_at timestamptz not null default now()
);

create table app.brand_findings (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.brand_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  page_id uuid references app.brand_pages (id) on delete set null,
  source_id uuid references app.brand_sources (id) on delete set null,
  lens text not null check (lens in ('visual', 'text', 'journey')),
  observation text not null default '',
  meaning text not null default '',
  proposal text not null default '',
  hypothesis boolean not null default true,
  persona_label text not null default '',
  phase_label text not null default '',
  archived_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table app.brand_dimensions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.brand_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  model text not null check (model in ('keller', 'aaker')),
  dimension_key text not null,
  intended text not null default '',
  observed text not null default '',
  gap_note text not null default '',
  evidence_status text not null default 'unknown' check (evidence_status in ('sufficient', 'limited', 'conflicting', 'unknown')),
  judgement text not null default '' check (judgement in ('', 'strength', 'mixed', 'attention', 'not_assessable')),
  limits_note text not null default '',
  open_question text not null default '',
  hypothesis boolean not null default true,
  manual_lock boolean not null default false,
  sort_order integer not null default 0,
  archived_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index brand_dimensions_one_live
  on app.brand_dimensions (version_id, model, dimension_key)
  where archived_at is null;

create table app.brand_priorities (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.brand_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  title text not null default '',
  problem text not null default '',
  action text not null default '',
  outcome text not null default '',
  validation_question text not null default '',
  kind text not null default 'research' check (kind in ('communication', 'experience', 'research')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  reason text not null default '',
  persona_label text not null default '',
  phase_label text not null default '',
  archived_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table app.brand_versions enable row level security;
alter table app.brand_sources enable row level security;
alter table app.brand_pages enable row level security;
alter table app.brand_findings enable row level security;
alter table app.brand_dimensions enable row level security;
alter table app.brand_priorities enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-materials',
  'brand-materials',
  false,
  8388608,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function app._brand_for_edit(p_version_id uuid)
returns app.brand_versions
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_row := null;
  select * into v_row from app.brand_versions where id = p_version_id;
  if v_row is null then raise exception 'Brand audit niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_row.status = 'approved' then
    raise exception 'Goedgekeurde versie is alleen-lezen. Hervat bewerken of maak een nieuwe conceptversie.';
  end if;
  return v_row;
end;
$$;

create or replace function app._brand_touch(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  update app.brand_versions
  set updated_at = now(),
      status = case when status = 'not_started' then 'draft' else status end
  where id = p_version_id;
end;
$$;

create or replace function app._brand_seed_dimensions(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
begin
  v_row := null;
  select * into v_row from app.brand_versions where id = p_version_id;
  if v_row is null then return; end if;
  if v_row.model = 'keller' then
    insert into app.brand_dimensions (version_id, tenant_id, model, dimension_key, sort_order)
    select v_row.id, v_row.tenant_id, 'keller', k.key, k.ord
    from (values
      ('salience', 1), ('performance', 2), ('imagery', 3),
      ('judgements', 4), ('feelings', 5), ('resonance', 6)
    ) as k(key, ord)
    where not exists (
      select 1 from app.brand_dimensions d
      where d.version_id = v_row.id and d.model = 'keller' and d.dimension_key = k.key and d.archived_at is null
    );
  else
    insert into app.brand_dimensions (version_id, tenant_id, model, dimension_key, sort_order)
    select v_row.id, v_row.tenant_id, 'aaker', k.key, k.ord
    from (values
      ('awareness', 1), ('quality', 2), ('associations', 3), ('loyalty', 4), ('assets', 5)
    ) as k(key, ord)
    where not exists (
      select 1 from app.brand_dimensions d
      where d.version_id = v_row.id and d.model = 'aaker' and d.dimension_key = k.key and d.archived_at is null
    );
  end if;
end;
$$;

create or replace function app.get_brand_workbench(p_tenant_id uuid, p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.brand_versions;
  v_tenant app.tenants;
  v_stp app.stp_versions;
  v_persona app.persona_versions;
  v_latest_stp uuid;
  v_latest_persona uuid;
  v_next integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  v_tenant := null;
  select * into v_tenant from app.tenants where id = p_tenant_id and deleted_at is null;
  if v_tenant is null then raise exception 'Klant niet gevonden'; end if;
  v_stp := null;
  v_latest_stp := null;
  select * into v_stp from app.stp_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.stp_version_status
  order by version_number desc limit 1;
  if v_stp is not null then v_latest_stp := v_stp.id; end if;
  if v_stp is null then
    select * into v_stp from app.stp_versions where tenant_id = p_tenant_id order by version_number desc limit 1;
  end if;
  v_persona := null;
  v_latest_persona := null;
  select * into v_persona from app.persona_versions
  where tenant_id = p_tenant_id and status = 'approved'
  order by version_number desc limit 1;
  if v_persona is not null then v_latest_persona := v_persona.id; end if;
  if v_persona is null then
    select * into v_persona from app.persona_versions where tenant_id = p_tenant_id order by version_number desc limit 1;
  end if;
  v_version := null;
  if p_version_id is not null then
    select * into v_version from app.brand_versions where id = p_version_id and tenant_id = p_tenant_id;
    if v_version is null then raise exception 'Brand audit niet gevonden'; end if;
  else
    select * into v_version from app.brand_versions
    where tenant_id = p_tenant_id and status <> 'approved'
    order by version_number desc limit 1;
    if v_version is null then
      select * into v_version from app.brand_versions where tenant_id = p_tenant_id order by version_number desc limit 1;
    end if;
  end if;
  if v_version is null then
    select coalesce(max(version_number), 0) + 1 into v_next from app.brand_versions where tenant_id = p_tenant_id;
    insert into app.brand_versions (
      tenant_id, version_number, status, stp_version_id, persona_version_id, website_url, created_by
    ) values (
      p_tenant_id, v_next, 'not_started',
      case when v_stp is null then null else v_stp.id end,
      case when v_persona is null then null else v_persona.id end,
      left(coalesce(v_tenant.website, ''), 300),
      auth.uid()
    ) returning * into v_version;
  elsif v_version.status <> 'approved'
    and (v_version.image_confirmed or v_version.sources_confirmed)
    and (
      (v_latest_stp is not null and v_version.stp_version_id is distinct from v_latest_stp)
      or (v_latest_persona is not null and v_version.persona_version_id is distinct from v_latest_persona)
    ) then
    update app.brand_versions
    set needs_review = true,
        review_note = 'STP of persona''s hebben een nieuwere goedgekeurde versie. Kijk de afhankelijke beoordeling na.'
    where id = v_version.id and not needs_review;
    select * into v_version from app.brand_versions where id = v_version.id;
  end if;
  perform app._brand_seed_dimensions(v_version.id);
  if v_version.website_url <> '' and not exists (
    select 1 from app.brand_pages p where p.version_id = v_version.id and p.role = 'home'
  ) then
    insert into app.brand_pages (version_id, tenant_id, url, role, status)
    values (v_version.id, p_tenant_id, v_version.website_url, 'home', 'pending');
  end if;
  v_stp := null;
  v_persona := null;
  if v_version.stp_version_id is not null then
    select * into v_stp from app.stp_versions where id = v_version.stp_version_id;
  end if;
  if v_version.persona_version_id is not null then
    select * into v_persona from app.persona_versions where id = v_version.persona_version_id;
  end if;
  return jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id, 'version_number', v_version.version_number, 'status', v_version.status,
      'current_step', v_version.current_step, 'model', v_version.model,
      'stp_version_id', v_version.stp_version_id, 'persona_version_id', v_version.persona_version_id,
      'website_url', v_version.website_url, 'period_label', v_version.period_label,
      'research_availability', v_version.research_availability, 'scope_note', v_version.scope_note,
      'verdict', v_version.verdict, 'strongest', v_version.strongest, 'weakest', v_version.weakest,
      'unassessed', v_version.unassessed, 'gap_summary', v_version.gap_summary,
      'positioning_intended', v_version.positioning_intended, 'perception_observed', v_version.perception_observed,
      'accepted_uncertainty', v_version.accepted_uncertainty, 'open_questions', v_version.open_questions,
      'sources_confirmed', v_version.sources_confirmed, 'website_confirmed', v_version.website_confirmed,
      'image_confirmed', v_version.image_confirmed, 'needs_review', v_version.needs_review,
      'review_note', v_version.review_note, 'published_at', v_version.published_at,
      'approved_at', v_version.approved_at, 'updated_at', v_version.updated_at
    ),
    'links', jsonb_build_object(
      'stp', case when v_stp is null then jsonb_build_object('present', false) else jsonb_build_object(
        'present', true, 'approved', v_stp.status = 'approved'::app.stp_version_status,
        'version_number', v_stp.version_number, 'name', v_stp.icp_name, 'sentence', v_stp.position_sentence,
        'offering', v_stp.offering, 'geography', v_stp.geography, 'sector', v_stp.icp_sector
      ) end,
      'personas', case when v_persona is null then jsonb_build_object('present', false, 'people', '[]'::jsonb) else jsonb_build_object(
        'present', true, 'confirmed', v_persona.personas_confirmed and v_persona.journeys_confirmed,
        'version_number', v_persona.version_number,
        'people', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', p.id, 'role_title', p.role_title, 'audience_rank', p.audience_rank, 'hypothesis', p.hypothesis
          ) order by case when p.audience_rank = 'primary' then 0 else 1 end, p.sort_order)
          from app.persona_people p
          where p.version_id = v_persona.id and p.archived_at is null and p.active
        ), '[]'::jsonb)
      ) end,
      'journeys', jsonb_build_object(
        'confirmed', v_persona is not null and v_persona.journeys_confirmed,
        'count', case when v_persona is null then 0 else (
          select count(*) from app.persona_journeys j where j.version_id = v_persona.id and j.archived_at is null
        ) end
      )
    ),
    'tenant', jsonb_build_object('id', v_tenant.id, 'name', v_tenant.name, 'website', coalesce(v_tenant.website, '')),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'material_type', s.material_type, 'label', s.label,
        'storage_path', s.storage_path, 'mime', s.mime, 'period_label', s.period_label,
        'currency', s.currency, 'channel', s.channel, 'audience', s.audience, 'note', s.note,
        'status', s.status, 'error_message', s.error_message, 'excerpt', s.excerpt, 'source_url', s.source_url
      ) order by s.created_at desc)
      from app.brand_sources s where s.version_id = v_version.id and s.archived_at is null
    ), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'url', p.url, 'role', p.role, 'included', p.included, 'fetched_at', p.fetched_at,
        'status', p.status, 'error_message', p.error_message, 'excerpt', p.excerpt
      ) order by p.created_at)
      from app.brand_pages p where p.version_id = v_version.id
    ), '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'page_id', f.page_id, 'source_id', f.source_id, 'lens', f.lens,
        'observation', f.observation, 'meaning', f.meaning, 'proposal', f.proposal,
        'hypothesis', f.hypothesis, 'persona_label', f.persona_label, 'phase_label', f.phase_label
      ) order by f.sort_order, f.created_at)
      from app.brand_findings f where f.version_id = v_version.id and f.archived_at is null
    ), '[]'::jsonb),
    'dimensions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'model', d.model, 'dimension_key', d.dimension_key, 'intended', d.intended,
        'observed', d.observed, 'gap_note', d.gap_note, 'evidence_status', d.evidence_status,
        'judgement', d.judgement, 'limits_note', d.limits_note, 'open_question', d.open_question,
        'hypothesis', d.hypothesis, 'manual_lock', d.manual_lock
      ) order by d.sort_order)
      from app.brand_dimensions d
      where d.version_id = v_version.id and d.model = v_version.model and d.archived_at is null
    ), '[]'::jsonb),
    'priorities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'problem', r.problem, 'action', r.action, 'outcome', r.outcome,
        'validation_question', r.validation_question, 'kind', r.kind, 'priority', r.priority,
        'reason', r.reason, 'persona_label', r.persona_label, 'phase_label', r.phase_label
      ) order by r.sort_order, r.created_at)
      from app.brand_priorities r where r.version_id = v_version.id and r.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function app.set_brand_step(p_version_id uuid, p_step text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  perform app._brand_for_edit(p_version_id);
  if p_step not in ('sources', 'website', 'image', 'conclusion') then raise exception 'Onbekende stap'; end if;
  update app.brand_versions
  set current_step = p_step,
      sources_confirmed = case when p_step <> 'sources' then true else sources_confirmed end,
      website_confirmed = case when p_step in ('image', 'conclusion') then true else website_confirmed end
  where id = p_version_id;
  perform app._brand_touch(p_version_id);
end;
$$;

create or replace function app.save_brand_setup(p_version_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_model text;
  v_url text;
begin
  v_row := app._brand_for_edit(p_version_id);
  v_model := case when p_payload->>'model' = 'aaker' then 'aaker' else 'keller' end;
  v_url := left(coalesce(p_payload->>'website_url', v_row.website_url), 300);
  if v_model is distinct from v_row.model then
    update app.brand_dimensions set archived_at = now()
    where version_id = p_version_id and model = v_row.model and archived_at is null;
    update app.brand_versions
    set model = v_model,
        image_confirmed = false,
        verdict = '', strongest = '', weakest = '', unassessed = '', gap_summary = ''
    where id = p_version_id;
  end if;
  update app.brand_versions
  set website_url = v_url,
      period_label = left(coalesce(p_payload->>'period_label', period_label), 120),
      research_availability = case
        when p_payload->>'research_availability' in ('uploaded', 'linked', 'unavailable', 'unknown')
        then p_payload->>'research_availability' else research_availability end,
      scope_note = left(coalesce(p_payload->>'scope_note', scope_note), 800),
      positioning_intended = case
        when length(btrim(positioning_intended)) = 0 then left(coalesce(p_payload->>'positioning_intended', ''), 800)
        else positioning_intended end
  where id = p_version_id;
  if v_url <> '' and not exists (
    select 1 from app.brand_pages p where p.version_id = p_version_id and p.url = v_url
  ) then
    insert into app.brand_pages (version_id, tenant_id, url, role, status)
    values (p_version_id, v_row.tenant_id, v_url, 'home', 'pending');
  end if;
  perform app._brand_seed_dimensions(p_version_id);
  perform app._brand_touch(p_version_id);
end;
$$;

create or replace function app.register_brand_source(p_version_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_id uuid;
  v_hash text;
  v_path text;
begin
  v_row := app._brand_for_edit(p_version_id);
  v_hash := left(coalesce(p_payload->>'content_hash', ''), 80);
  v_path := coalesce(p_payload->>'storage_path', '');
  if v_hash <> '' and exists (
    select 1 from app.brand_sources
    where version_id = p_version_id and content_hash = v_hash and archived_at is null
  ) then
    raise exception 'Dit bestand staat al in deze versie.';
  end if;
  if v_path <> '' and v_path !~ ('^' || v_row.tenant_id::text || '/' || v_row.id::text || '/[0-9a-f-]{36}\.(pdf|docx|jpg|jpeg|png|webp)$') then
    raise exception 'Ongeldig bestandspad';
  end if;
  insert into app.brand_sources (
    version_id, tenant_id, kind, material_type, label, storage_path, mime, content_hash,
    period_label, currency, channel, audience, note, status, error_message, excerpt, source_url, created_by
  ) values (
    p_version_id, v_row.tenant_id,
    case when p_payload->>'kind' in ('upload', 'note', 'public') then p_payload->>'kind' else 'upload' end,
    left(coalesce(p_payload->>'material_type', 'other'), 40),
    left(coalesce(p_payload->>'label', ''), 200),
    left(v_path, 400),
    left(coalesce(p_payload->>'mime', ''), 120),
    v_hash,
    left(coalesce(p_payload->>'period_label', ''), 120),
    case when p_payload->>'currency' in ('current', 'historical', 'unknown') then p_payload->>'currency' else 'unknown' end,
    left(coalesce(p_payload->>'channel', ''), 120),
    left(coalesce(p_payload->>'audience', ''), 160),
    left(coalesce(p_payload->>'note', ''), 800),
    case when p_payload->>'status' in ('stored', 'ready', 'partial', 'failed') then p_payload->>'status' else 'stored' end,
    left(coalesce(p_payload->>'error_message', ''), 300),
    left(coalesce(p_payload->>'excerpt', ''), 4000),
    left(coalesce(p_payload->>'source_url', ''), 400),
    auth.uid()
  ) returning id into v_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_row.tenant_id, auth.uid(), 'brand.upload', 'brand_version', p_version_id::text, jsonb_build_object('source_id', v_id, 'kind', coalesce(p_payload->>'kind', 'upload')));
  perform app._brand_touch(p_version_id);
  return v_id;
end;
$$;

create or replace function app.update_brand_source(p_source_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_source app.brand_sources;
begin
  v_source := null;
  select * into v_source from app.brand_sources where id = p_source_id and archived_at is null;
  if v_source is null then raise exception 'Bron niet gevonden'; end if;
  perform app._brand_for_edit(v_source.version_id);
  update app.brand_sources
  set material_type = left(coalesce(p_payload->>'material_type', material_type), 40),
      label = left(coalesce(p_payload->>'label', label), 200),
      period_label = left(coalesce(p_payload->>'period_label', period_label), 120),
      currency = case when p_payload->>'currency' in ('current', 'historical', 'unknown') then p_payload->>'currency' else currency end,
      channel = left(coalesce(p_payload->>'channel', channel), 120),
      audience = left(coalesce(p_payload->>'audience', audience), 160),
      note = left(coalesce(p_payload->>'note', note), 800),
      excerpt = case when p_payload ? 'excerpt' then left(coalesce(p_payload->>'excerpt', ''), 4000) else excerpt end
  where id = p_source_id;
  perform app._brand_touch(v_source.version_id);
end;
$$;

create or replace function app.archive_brand_source(p_source_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_source app.brand_sources;
begin
  v_source := null;
  select * into v_source from app.brand_sources where id = p_source_id and archived_at is null;
  if v_source is null then return; end if;
  perform app._brand_for_edit(v_source.version_id);
  update app.brand_sources set archived_at = now() where id = p_source_id;
  perform app._brand_touch(v_source.version_id);
end;
$$;

create or replace function app.save_brand_page(p_version_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_id uuid;
begin
  v_row := app._brand_for_edit(p_version_id);
  v_id := nullif(p_payload->>'id', '')::uuid;
  if v_id is null then
    insert into app.brand_pages (version_id, tenant_id, url, role, included, status, error_message, excerpt, fetched_at)
    values (
      p_version_id, v_row.tenant_id,
      left(coalesce(p_payload->>'url', ''), 400),
      case when p_payload->>'role' in ('home', 'about', 'offer', 'proof', 'contact', 'other') then p_payload->>'role' else 'other' end,
      coalesce((p_payload->>'included')::boolean, true),
      case when p_payload->>'status' in ('pending', 'ready', 'failed', 'excluded') then p_payload->>'status' else 'pending' end,
      left(coalesce(p_payload->>'error_message', ''), 300),
      left(coalesce(p_payload->>'excerpt', ''), 4000),
      case when p_payload->>'status' = 'ready' then now() else null end
    ) returning id into v_id;
  else
    update app.brand_pages
    set url = left(coalesce(p_payload->>'url', url), 400),
        role = case when p_payload->>'role' in ('home', 'about', 'offer', 'proof', 'contact', 'other') then p_payload->>'role' else role end,
        included = coalesce((p_payload->>'included')::boolean, included),
        status = case when p_payload->>'status' in ('pending', 'ready', 'failed', 'excluded') then p_payload->>'status' else status end,
        error_message = left(coalesce(p_payload->>'error_message', error_message), 300),
        excerpt = left(coalesce(p_payload->>'excerpt', excerpt), 4000),
        fetched_at = case when p_payload->>'status' = 'ready' then now() else fetched_at end
    where id = v_id and version_id = p_version_id;
  end if;
  perform app._brand_touch(p_version_id);
  return v_id;
end;
$$;

create or replace function app.upsert_brand_finding(p_version_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_id uuid;
begin
  v_row := app._brand_for_edit(p_version_id);
  v_id := nullif(p_payload->>'id', '')::uuid;
  if v_id is null then
    insert into app.brand_findings (
      version_id, tenant_id, page_id, source_id, lens, observation, meaning, proposal,
      hypothesis, persona_label, phase_label
    ) values (
      p_version_id, v_row.tenant_id,
      nullif(p_payload->>'page_id', '')::uuid,
      nullif(p_payload->>'source_id', '')::uuid,
      case when p_payload->>'lens' in ('visual', 'text', 'journey') then p_payload->>'lens' else 'text' end,
      left(coalesce(p_payload->>'observation', ''), 1200),
      left(coalesce(p_payload->>'meaning', ''), 1200),
      left(coalesce(p_payload->>'proposal', ''), 800),
      coalesce((p_payload->>'hypothesis')::boolean, true),
      left(coalesce(p_payload->>'persona_label', ''), 160),
      left(coalesce(p_payload->>'phase_label', ''), 160)
    ) returning id into v_id;
  else
    update app.brand_findings
    set observation = left(coalesce(p_payload->>'observation', observation), 1200),
        meaning = left(coalesce(p_payload->>'meaning', meaning), 1200),
        proposal = left(coalesce(p_payload->>'proposal', proposal), 800),
        hypothesis = coalesce((p_payload->>'hypothesis')::boolean, hypothesis),
        persona_label = left(coalesce(p_payload->>'persona_label', persona_label), 160),
        phase_label = left(coalesce(p_payload->>'phase_label', phase_label), 160)
    where id = v_id and version_id = p_version_id;
  end if;
  perform app._brand_touch(p_version_id);
  return v_id;
end;
$$;

create or replace function app.archive_brand_finding(p_finding_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_findings;
begin
  v_row := null;
  select * into v_row from app.brand_findings where id = p_finding_id and archived_at is null;
  if v_row is null then return; end if;
  perform app._brand_for_edit(v_row.version_id);
  update app.brand_findings set archived_at = now() where id = p_finding_id;
  perform app._brand_touch(v_row.version_id);
end;
$$;

create or replace function app.upsert_brand_dimension(p_dimension_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_dimensions;
begin
  v_row := null;
  select * into v_row from app.brand_dimensions where id = p_dimension_id and archived_at is null;
  if v_row is null then raise exception 'Onderdeel niet gevonden'; end if;
  perform app._brand_for_edit(v_row.version_id);
  update app.brand_dimensions
  set intended = left(coalesce(p_payload->>'intended', intended), 800),
      observed = left(coalesce(p_payload->>'observed', observed), 800),
      gap_note = left(coalesce(p_payload->>'gap_note', gap_note), 800),
      evidence_status = case
        when p_payload->>'evidence_status' in ('sufficient', 'limited', 'conflicting', 'unknown')
        then p_payload->>'evidence_status' else evidence_status end,
      judgement = case
        when p_payload->>'judgement' in ('strength', 'mixed', 'attention', 'not_assessable', '')
        then p_payload->>'judgement' else judgement end,
      limits_note = left(coalesce(p_payload->>'limits_note', limits_note), 500),
      open_question = left(coalesce(p_payload->>'open_question', open_question), 500),
      hypothesis = coalesce((p_payload->>'hypothesis')::boolean, hypothesis),
      manual_lock = true,
      updated_at = now()
  where id = p_dimension_id;
  update app.brand_versions set image_confirmed = false where id = v_row.version_id;
  perform app._brand_touch(v_row.version_id);
end;
$$;

create or replace function app.upsert_brand_priority(p_version_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_id uuid;
begin
  v_row := app._brand_for_edit(p_version_id);
  v_id := nullif(p_payload->>'id', '')::uuid;
  if v_id is null then
    insert into app.brand_priorities (
      version_id, tenant_id, title, problem, action, outcome, validation_question,
      kind, priority, reason, persona_label, phase_label
    ) values (
      p_version_id, v_row.tenant_id,
      left(coalesce(p_payload->>'title', ''), 160),
      left(coalesce(p_payload->>'problem', ''), 800),
      left(coalesce(p_payload->>'action', ''), 800),
      left(coalesce(p_payload->>'outcome', ''), 400),
      left(coalesce(p_payload->>'validation_question', ''), 400),
      case when p_payload->>'kind' in ('communication', 'experience', 'research') then p_payload->>'kind' else 'research' end,
      case when p_payload->>'priority' in ('low', 'medium', 'high') then p_payload->>'priority' else 'medium' end,
      left(coalesce(p_payload->>'reason', ''), 400),
      left(coalesce(p_payload->>'persona_label', ''), 160),
      left(coalesce(p_payload->>'phase_label', ''), 160)
    ) returning id into v_id;
  else
    update app.brand_priorities
    set title = left(coalesce(p_payload->>'title', title), 160),
        problem = left(coalesce(p_payload->>'problem', problem), 800),
        action = left(coalesce(p_payload->>'action', action), 800),
        outcome = left(coalesce(p_payload->>'outcome', outcome), 400),
        validation_question = left(coalesce(p_payload->>'validation_question', validation_question), 400),
        kind = case when p_payload->>'kind' in ('communication', 'experience', 'research') then p_payload->>'kind' else kind end,
        priority = case when p_payload->>'priority' in ('low', 'medium', 'high') then p_payload->>'priority' else priority end,
        reason = left(coalesce(p_payload->>'reason', reason), 400),
        persona_label = left(coalesce(p_payload->>'persona_label', persona_label), 160),
        phase_label = left(coalesce(p_payload->>'phase_label', phase_label), 160)
    where id = v_id and version_id = p_version_id;
  end if;
  perform app._brand_touch(p_version_id);
  return v_id;
end;
$$;

create or replace function app.archive_brand_priority(p_priority_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_priorities;
begin
  v_row := null;
  select * into v_row from app.brand_priorities where id = p_priority_id and archived_at is null;
  if v_row is null then return; end if;
  perform app._brand_for_edit(v_row.version_id);
  update app.brand_priorities set archived_at = now() where id = p_priority_id;
  perform app._brand_touch(v_row.version_id);
end;
$$;

create or replace function app.save_brand_conclusion(p_version_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  perform app._brand_for_edit(p_version_id);
  update app.brand_versions
  set verdict = left(coalesce(p_payload->>'verdict', verdict), 800),
      strongest = left(coalesce(p_payload->>'strongest', strongest), 800),
      weakest = left(coalesce(p_payload->>'weakest', weakest), 800),
      unassessed = left(coalesce(p_payload->>'unassessed', unassessed), 800),
      gap_summary = left(coalesce(p_payload->>'gap_summary', gap_summary), 800),
      positioning_intended = left(coalesce(p_payload->>'positioning_intended', positioning_intended), 800),
      perception_observed = left(coalesce(p_payload->>'perception_observed', perception_observed), 800),
      accepted_uncertainty = left(coalesce(p_payload->>'accepted_uncertainty', accepted_uncertainty), 1000),
      open_questions = left(coalesce(p_payload->>'open_questions', open_questions), 2000)
  where id = p_version_id;
  perform app._brand_touch(p_version_id);
end;
$$;

create or replace function app.apply_brand_ai(p_version_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_item jsonb;
begin
  v_row := app._brand_for_edit(p_version_id);
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'dimensions', '[]'::jsonb))
  loop
    update app.brand_dimensions
    set intended = case when length(btrim(intended)) = 0 then left(coalesce(v_item->>'intended', ''), 800) else intended end,
        observed = case when length(btrim(observed)) = 0 then left(coalesce(v_item->>'observed', ''), 800) else observed end,
        gap_note = case when length(btrim(gap_note)) = 0 then left(coalesce(v_item->>'gap_note', ''), 800) else gap_note end,
        evidence_status = case
          when evidence_status = 'unknown' and v_item->>'evidence_status' in ('sufficient', 'limited', 'conflicting', 'unknown')
          then v_item->>'evidence_status' else evidence_status end,
        judgement = case
          when judgement = '' and v_item->>'judgement' in ('strength', 'mixed', 'attention', 'not_assessable')
          then v_item->>'judgement' else judgement end,
        limits_note = case when length(btrim(limits_note)) = 0 then left(coalesce(v_item->>'limits_note', ''), 500) else limits_note end,
        hypothesis = true
    where version_id = p_version_id
      and model = v_row.model
      and dimension_key = v_item->>'dimension_key'
      and archived_at is null
      and not manual_lock;
  end loop;
  update app.brand_versions
  set verdict = case when length(btrim(verdict)) = 0 then left(coalesce(p_payload->>'verdict', ''), 800) else verdict end,
      strongest = case when length(btrim(strongest)) = 0 then left(coalesce(p_payload->>'strongest', ''), 800) else strongest end,
      weakest = case when length(btrim(weakest)) = 0 then left(coalesce(p_payload->>'weakest', ''), 800) else weakest end,
      unassessed = case when length(btrim(unassessed)) = 0 then left(coalesce(p_payload->>'unassessed', ''), 800) else unassessed end,
      gap_summary = case when length(btrim(gap_summary)) = 0 then left(coalesce(p_payload->>'gap_summary', ''), 800) else gap_summary end,
      positioning_intended = case when length(btrim(positioning_intended)) = 0 then left(coalesce(p_payload->>'positioning_intended', ''), 800) else positioning_intended end,
      perception_observed = case when length(btrim(perception_observed)) = 0 then left(coalesce(p_payload->>'perception_observed', ''), 800) else perception_observed end
  where id = p_version_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_row.tenant_id, auth.uid(), 'brand.ai', 'brand_version', p_version_id::text, jsonb_build_object('model', v_row.model));
  perform app._brand_touch(p_version_id);
end;
$$;

create or replace function app.confirm_brand_image(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_open integer;
begin
  v_row := app._brand_for_edit(p_version_id);
  select count(*) into v_open from app.brand_dimensions
  where version_id = p_version_id and model = v_row.model and archived_at is null and judgement = '';
  if v_open > 0 then
    raise exception 'Beoordeel elk onderdeel. Onbekend mag, leeg niet.';
  end if;
  update app.brand_versions set image_confirmed = true, current_step = 'conclusion' where id = p_version_id;
  perform app._brand_touch(p_version_id);
end;
$$;

create or replace function app.approve_brand_version(p_version_id uuid, p_expected timestamptz)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_open integer;
  v_unknown integer;
begin
  v_row := app._brand_for_edit(p_version_id);
  if p_expected is not null and v_row.updated_at <> p_expected then
    raise exception 'De versie is intussen gewijzigd. Keur opnieuw goed.';
  end if;
  if not v_row.image_confirmed then raise exception 'Bevestig eerst het merkbeeld.'; end if;
  select count(*) into v_open from app.brand_dimensions
  where version_id = p_version_id and model = v_row.model and archived_at is null and judgement = '';
  if v_open > 0 then raise exception 'Beoordeel elk onderdeel. Onbekend mag, leeg niet.'; end if;
  select count(*) into v_unknown from app.brand_dimensions
  where version_id = p_version_id and model = v_row.model and archived_at is null
    and (evidence_status = 'unknown' or judgement = 'not_assessable');
  if v_unknown > 0 and length(btrim(v_row.accepted_uncertainty)) < 10 then
    raise exception 'Benoem welke onzekerheid je accepteert. Onbekend is geen slechte prestatie.';
  end if;
  if length(btrim(v_row.verdict)) < 8 and length(btrim(v_row.unassessed)) < 8 then
    raise exception 'Schrijf een conclusie, of benoem expliciet wat nog niet te beoordelen is.';
  end if;
  update app.brand_versions
  set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = p_version_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_row.tenant_id, auth.uid(), 'brand.approve', 'brand_version', p_version_id::text, jsonb_build_object('version_number', v_row.version_number, 'model', v_row.model));
end;
$$;

create or replace function app.publish_brand_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_row := null;
  select * into v_row from app.brand_versions where id = p_version_id;
  if v_row is null then raise exception 'Brand audit niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_row.status <> 'approved' then raise exception 'Keur de audit eerst goed.'; end if;
  update app.brand_versions set published_at = now(), published_by = auth.uid() where id = p_version_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_row.tenant_id, auth.uid(), 'brand.publish', 'brand_version', p_version_id::text, jsonb_build_object('version_number', v_row.version_number));
end;
$$;

create or replace function app.unpublish_brand_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_row := null;
  select * into v_row from app.brand_versions where id = p_version_id;
  if v_row is null then raise exception 'Brand audit niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_row.status <> 'approved' and v_row.published_at is null then return; end if;
  update app.brand_versions
  set published_at = null, published_by = null, status = 'draft', approved_at = null, approved_by = null, updated_at = now()
  where id = p_version_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_row.tenant_id, auth.uid(), 'brand.unpublish', 'brand_version', p_version_id::text, jsonb_build_object('reopened', true));
end;
$$;

create or replace function app.get_brand_published(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not (app.has_capability(p_tenant_id, 'dashboard.read_published') or app.has_capability(p_tenant_id, 'audit.edit')) then
    raise exception 'Forbidden';
  end if;
  v_row := null;
  select * into v_row from app.brand_versions
  where tenant_id = p_tenant_id and status = 'approved' and published_at is not null
  order by version_number desc limit 1;
  if v_row is null then return jsonb_build_object('published', false); end if;
  return jsonb_build_object(
    'published', true,
    'version_number', v_row.version_number,
    'model', v_row.model,
    'verdict', v_row.verdict,
    'strongest', v_row.strongest,
    'weakest', v_row.weakest,
    'unassessed', v_row.unassessed,
    'gap_summary', v_row.gap_summary,
    'positioning_intended', v_row.positioning_intended,
    'perception_observed', v_row.perception_observed,
    'accepted_uncertainty', v_row.accepted_uncertainty,
    'priorities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', r.title, 'problem', r.problem, 'action', r.action, 'kind', r.kind, 'priority', r.priority
      ) order by r.sort_order)
      from app.brand_priorities r where r.version_id = v_row.id and r.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function app.log_brand_export(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_row := null;
  select * into v_row from app.brand_versions where id = p_version_id;
  if v_row is null then raise exception 'Brand audit niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_row.tenant_id, auth.uid(), 'brand.export', 'brand_version', p_version_id::text, jsonb_build_object('version_number', v_row.version_number, 'status', v_row.status));
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
  v_persona uuid;
  v_persona_started uuid;
  v_brand uuid;
  v_brand_started uuid;
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
  select id into v_persona from app.persona_versions where tenant_id = p_tenant_id and status = 'approved' order by version_number desc limit 1;
  select id into v_persona_started from app.persona_versions where tenant_id = p_tenant_id order by version_number desc limit 1;
  select id into v_brand from app.brand_versions where tenant_id = p_tenant_id and status = 'approved' order by version_number desc limit 1;
  select id into v_brand_started from app.brand_versions where tenant_id = p_tenant_id order by version_number desc limit 1;
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
    'stp_started', v_stp_started is not null,
    'persona_approved', v_persona is not null,
    'persona_version_id', v_persona,
    'persona_started', v_persona_started is not null,
    'brand_approved', v_brand is not null,
    'brand_version_id', v_brand,
    'brand_started', v_brand_started is not null
  );
end;
$$;

revoke execute on function app._brand_for_edit(uuid) from public, anon, authenticated;
revoke execute on function app._brand_touch(uuid) from public, anon, authenticated;
revoke execute on function app._brand_seed_dimensions(uuid) from public, anon, authenticated;
grant execute on function app.get_brand_workbench(uuid, uuid) to authenticated;
grant execute on function app.set_brand_step(uuid, text) to authenticated;
grant execute on function app.save_brand_setup(uuid, jsonb) to authenticated;
grant execute on function app.register_brand_source(uuid, jsonb) to authenticated;
grant execute on function app.update_brand_source(uuid, jsonb) to authenticated;
grant execute on function app.archive_brand_source(uuid) to authenticated;
grant execute on function app.save_brand_page(uuid, jsonb) to authenticated;
grant execute on function app.upsert_brand_finding(uuid, jsonb) to authenticated;
grant execute on function app.archive_brand_finding(uuid) to authenticated;
grant execute on function app.upsert_brand_dimension(uuid, jsonb) to authenticated;
grant execute on function app.upsert_brand_priority(uuid, jsonb) to authenticated;
grant execute on function app.archive_brand_priority(uuid) to authenticated;
grant execute on function app.save_brand_conclusion(uuid, jsonb) to authenticated;
grant execute on function app.apply_brand_ai(uuid, jsonb) to authenticated;
grant execute on function app.confirm_brand_image(uuid) to authenticated;
grant execute on function app.approve_brand_version(uuid, timestamptz) to authenticated;
grant execute on function app.publish_brand_version(uuid) to authenticated;
grant execute on function app.unpublish_brand_version(uuid) to authenticated;
grant execute on function app.get_brand_published(uuid) to authenticated;
grant execute on function app.log_brand_export(uuid) to authenticated;
grant execute on function app.get_audit_framework_progress(uuid) to authenticated;
