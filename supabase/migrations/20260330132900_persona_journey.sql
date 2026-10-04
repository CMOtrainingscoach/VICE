-- Stap 9: buyer persona's en klantreis, gekoppeld aan een STP-versie.
-- Het portret is een fictieve illustratie, geen persoonskenmerk.
-- Onbekend blijft leeg. AI keurt niets goed en publiceert niets.

create table app.persona_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  version_number integer not null,
  status text not null default 'not_started' check (status in ('not_started', 'draft', 'approved')),
  current_step text not null default 'basis' check (current_step in ('basis', 'personas', 'journey', 'finish')),
  stp_version_id uuid references app.stp_versions (id) on delete set null,
  personas_confirmed boolean not null default false,
  journeys_confirmed boolean not null default false,
  accepted_uncertainty text not null default '',
  open_questions text not null default '',
  needs_review boolean not null default false,
  review_note text not null default '',
  ai_proposal jsonb not null default '{}'::jsonb,
  ai_generated_at timestamptz,
  published_at timestamptz,
  published_by uuid references auth.users (id),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, version_number)
);

create table app.persona_people (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.persona_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  role_title text not null default '',
  display_name text not null default '',
  summary text not null default '',
  decision_roles jsonb not null default '[]'::jsonb,
  relevance text not null default '',
  goals text not null default '',
  outcomes text not null default '',
  responsibilities text not null default '',
  success_criteria text not null default '',
  pains text not null default '',
  barriers text not null default '',
  risks text not null default '',
  consequences text not null default '',
  triggers text not null default '',
  decision_criteria text not null default '',
  objections text not null default '',
  info_needed text not null default '',
  other_roles text not null default '',
  touchpoints text not null default '',
  questions text not null default '',
  arguments text not null default '',
  proof_needed text not null default '',
  channels text not null default '',
  assumptions text not null default '',
  open_question text not null default '',
  conflict_note text not null default '',
  hypothesis boolean not null default true,
  evidence_level text not null default 'hypothesis' check (evidence_level in ('supported', 'client', 'strategist', 'hypothesis', 'unknown')),
  active boolean not null default true,
  manual_lock boolean not null default false,
  origin text not null default 'manual' check (origin in ('ai', 'manual')),
  ai_state text not null default 'none' check (ai_state in ('none', 'proposed', 'accepted', 'rejected')),
  ai_payload jsonb not null default '{}'::jsonb,
  overlap_note text not null default '',
  illustration_prompt text not null default '',
  selected_portrait_id uuid,
  archived_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.persona_portraits (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references app.persona_people (id) on delete cascade,
  version_id uuid not null references app.persona_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  storage_path text not null default '',
  status text not null default 'queued' check (status in ('queued', 'running', 'ready', 'failed')),
  visual_prompt text not null default '',
  provider text not null default 'openai',
  model text not null default '',
  error_message text not null default '',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table app.persona_people
  add constraint persona_people_selected_portrait_fk
  foreign key (selected_portrait_id) references app.persona_portraits (id) on delete set null;

create unique index persona_portraits_one_active
  on app.persona_portraits (persona_id)
  where status in ('queued', 'running');

create table app.persona_refs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.persona_versions (id) on delete cascade,
  persona_id uuid references app.persona_people (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  ref_type text not null,
  ref_id uuid,
  label text not null default '',
  excerpt text not null default '',
  created_at timestamptz not null default now()
);

create table app.persona_journeys (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.persona_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  kind text not null check (kind in ('current', 'desired')),
  title text not null default '',
  primary_persona_id uuid references app.persona_people (id) on delete set null,
  based_on_id uuid references app.persona_journeys (id) on delete set null,
  route_note text not null default '',
  hypothesis boolean not null default true,
  ai_proposal jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index persona_journeys_one_kind
  on app.persona_journeys (version_id, kind)
  where archived_at is null;

create table app.persona_phases (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references app.persona_journeys (id) on delete cascade,
  version_id uuid not null references app.persona_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  name text not null default '',
  goal text not null default '',
  actions text not null default '',
  questions text not null default '',
  info_need text not null default '',
  decision_criteria text not null default '',
  barriers text not null default '',
  next_step text not null default '',
  touchpoints text not null default '',
  channels text not null default '',
  involved_persona_ids uuid[] not null default '{}',
  company_side text not null default '',
  content_needed text not null default '',
  assumption text not null default '',
  open_question text not null default '',
  emotion text not null default '',
  improvement text not null default '',
  proposed_action text not null default '',
  contribution text not null default '',
  owner_name text not null default '',
  priority text not null default 'unknown' check (priority in ('low', 'medium', 'high', 'unknown')),
  hypothesis boolean not null default true,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.persona_ai_history (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.persona_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  kind text not null,
  proposal jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index persona_versions_tenant_idx on app.persona_versions (tenant_id, version_number desc);
create index persona_people_version_idx on app.persona_people (version_id, sort_order);
create index persona_phases_journey_idx on app.persona_phases (journey_id, sort_order);

alter table app.persona_versions enable row level security;
alter table app.persona_people enable row level security;
alter table app.persona_portraits enable row level security;
alter table app.persona_refs enable row level security;
alter table app.persona_journeys enable row level security;
alter table app.persona_phases enable row level security;
alter table app.persona_ai_history enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('persona-portraits', 'persona-portraits', false, 4194304, array['image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function app._persona_for_edit(p_version_id uuid)
returns app.persona_versions
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.persona_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_row := null;
  select * into v_row from app.persona_versions where id = p_version_id;
  if v_row.id is null then raise exception 'Persona-versie niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_row.status = 'approved' then
    raise exception 'Goedgekeurde versie is alleen-lezen. Maak een nieuwe conceptversie.';
  end if;
  return v_row;
end;
$$;

create or replace function app._persona_touch(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  update app.persona_versions
  set updated_at = now(),
      status = case when status = 'not_started' then 'draft' else status end
  where id = p_version_id;
end;
$$;

create or replace function app._persona_roles(p_roles jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when jsonb_typeof(coalesce(p_roles, '[]'::jsonb)) <> 'array' then '[]'::jsonb
    else coalesce((
      select jsonb_agg(to_jsonb(role))
      from (
        select distinct role
        from jsonb_array_elements_text(p_roles) as role
        where role in ('initiator', 'user', 'influencer', 'decider', 'budget', 'approver', 'gatekeeper')
      ) roles
    ), '[]'::jsonb)
  end;
$$;

create or replace function app.get_persona_workbench(p_tenant_id uuid, p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
  v_tenant app.tenants;
  v_stp app.stp_versions;
  v_latest uuid;
  v_five uuid;
  v_next integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  v_tenant := null;
  select * into v_tenant from app.tenants where id = p_tenant_id and deleted_at is null;
  if v_tenant is null then raise exception 'Klant niet gevonden'; end if;

  v_version := null;
  if p_version_id is not null then
    select * into v_version from app.persona_versions where id = p_version_id and tenant_id = p_tenant_id;
    if v_version is null then raise exception 'Persona-analyse niet gevonden'; end if;
  else
    select * into v_version from app.persona_versions
    where tenant_id = p_tenant_id and status <> 'approved'
    order by version_number desc limit 1;
    if v_version is null then
      select * into v_version from app.persona_versions
      where tenant_id = p_tenant_id order by version_number desc limit 1;
    end if;
  end if;

  v_stp := null;
  v_latest := null;
  select * into v_stp from app.stp_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.stp_version_status
  order by version_number desc limit 1;
  if v_stp is null then
    select * into v_stp from app.stp_versions
    where tenant_id = p_tenant_id order by version_number desc limit 1;
  else
    v_latest := v_stp.id;
  end if;

  if v_version is null then
    select coalesce(max(version_number), 0) + 1 into v_next from app.persona_versions where tenant_id = p_tenant_id;
    insert into app.persona_versions (tenant_id, version_number, status, stp_version_id, created_by)
    values (p_tenant_id, v_next, 'not_started', case when v_stp is null then null else v_stp.id end, auth.uid())
    returning * into v_version;
  elsif v_version.status <> 'approved'
    and (v_version.personas_confirmed or v_version.journeys_confirmed)
    and v_version.stp_version_id is distinct from v_latest
    and v_latest is not null then
    update app.persona_versions
    set needs_review = true,
        review_note = 'Het ICP heeft een nieuwere goedgekeurde versie. Kijk persona''s en klantreis na.'
    where id = v_version.id and not needs_review;
    select * into v_version from app.persona_versions where id = v_version.id;
  end if;

  v_stp := null;
  v_five := null;
  if v_version.stp_version_id is not null then
    select * into v_stp from app.stp_versions where id = v_version.stp_version_id;
    if v_stp is not null then v_five := v_stp.five_c_version_id; end if;
  end if;

  return jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id, 'version_number', v_version.version_number, 'status', v_version.status,
      'current_step', v_version.current_step, 'stp_version_id', v_version.stp_version_id,
      'personas_confirmed', v_version.personas_confirmed, 'journeys_confirmed', v_version.journeys_confirmed,
      'accepted_uncertainty', v_version.accepted_uncertainty, 'open_questions', v_version.open_questions,
      'needs_review', v_version.needs_review, 'review_note', v_version.review_note,
      'published_at', v_version.published_at, 'approved_at', v_version.approved_at, 'updated_at', v_version.updated_at
    ),
    'icp', case when v_stp is null then jsonb_build_object('present', false) else jsonb_build_object(
      'present', true,
      'approved', v_stp.status = 'approved'::app.stp_version_status,
      'id', v_stp.id,
      'version_number', v_stp.version_number,
      'name', v_stp.icp_name,
      'summary', v_stp.icp_summary,
      'offering', v_stp.offering,
      'geography', v_stp.geography,
      'need', v_stp.icp_need,
      'sector', v_stp.icp_sector,
      'stage', v_stp.icp_stage,
      'sentence', v_stp.position_sentence,
      'promise', v_stp.promise
    ) end,
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'role_title', p.role_title, 'display_name', p.display_name, 'summary', p.summary,
        'decision_roles', p.decision_roles, 'relevance', p.relevance,
        'goals', p.goals, 'outcomes', p.outcomes, 'responsibilities', p.responsibilities, 'success_criteria', p.success_criteria,
        'pains', p.pains, 'barriers', p.barriers, 'risks', p.risks, 'consequences', p.consequences,
        'triggers', p.triggers, 'decision_criteria', p.decision_criteria, 'objections', p.objections,
        'info_needed', p.info_needed, 'other_roles', p.other_roles, 'touchpoints', p.touchpoints,
        'questions', p.questions, 'arguments', p.arguments, 'proof_needed', p.proof_needed, 'channels', p.channels,
        'assumptions', p.assumptions, 'open_question', p.open_question, 'conflict_note', p.conflict_note,
        'hypothesis', p.hypothesis, 'evidence_level', p.evidence_level, 'active', p.active,
        'manual_lock', p.manual_lock, 'origin', p.origin, 'ai_state', p.ai_state, 'ai_payload', p.ai_payload,
        'overlap_note', p.overlap_note, 'illustration_prompt', p.illustration_prompt,
        'selected_portrait_id', p.selected_portrait_id, 'archived_at', p.archived_at, 'sort_order', p.sort_order,
        'portraits', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', r.id, 'status', r.status, 'storage_path', r.storage_path, 'error_message', r.error_message, 'created_at', r.created_at
          ) order by r.created_at desc)
          from app.persona_portraits r where r.persona_id = p.id
        ), '[]'::jsonb),
        'refs', coalesce((
          select jsonb_agg(jsonb_build_object('ref_type', f.ref_type, 'ref_id', f.ref_id, 'label', f.label, 'excerpt', f.excerpt))
          from app.persona_refs f where f.persona_id = p.id
        ), '[]'::jsonb)
      ) order by p.sort_order, p.created_at)
      from app.persona_people p where p.version_id = v_version.id
    ), '[]'::jsonb),
    'journeys', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id, 'kind', j.kind, 'title', j.title, 'primary_persona_id', j.primary_persona_id,
        'based_on_id', j.based_on_id, 'route_note', j.route_note, 'hypothesis', j.hypothesis,
        'ai_proposal', j.ai_proposal, 'archived_at', j.archived_at,
        'phases', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ph.id, 'name', ph.name, 'goal', ph.goal, 'actions', ph.actions, 'questions', ph.questions,
            'info_need', ph.info_need, 'decision_criteria', ph.decision_criteria, 'barriers', ph.barriers, 'next_step', ph.next_step,
            'touchpoints', ph.touchpoints, 'channels', ph.channels, 'involved_persona_ids', ph.involved_persona_ids,
            'company_side', ph.company_side, 'content_needed', ph.content_needed,
            'assumption', ph.assumption, 'open_question', ph.open_question, 'emotion', ph.emotion,
            'improvement', ph.improvement, 'proposed_action', ph.proposed_action, 'contribution', ph.contribution,
            'owner_name', ph.owner_name, 'priority', ph.priority, 'hypothesis', ph.hypothesis,
            'sort_order', ph.sort_order, 'archived_at', ph.archived_at
          ) order by ph.sort_order, ph.created_at)
          from app.persona_phases ph where ph.journey_id = j.id
        ), '[]'::jsonb)
      ) order by j.kind, j.created_at)
      from app.persona_journeys j where j.version_id = v_version.id
    ), '[]'::jsonb),
    'inputs', jsonb_build_object(
      'tenant', jsonb_build_object('id', v_tenant.id, 'name', v_tenant.name),
      'five_c_items', coalesce((
        select jsonb_agg(jsonb_build_object('id', fi.id, 'c_key', fi.c_key, 'title', fi.title, 'finding', left(fi.finding, 800)))
        from app.five_c_items fi
        where v_five is not null
          and fi.version_id = v_five and fi.deleted_at is null
          and fi.review_status <> 'rejected'::app.five_c_review
          and fi.content_type <> 'input_needed'::app.five_c_content_type
          and fi.c_key in ('customers', 'company')
      ), '[]'::jsonb),
      'meetings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'title', coalesce(nullif(trim(m.title), ''), to_char(m.created_at, 'YYYY-MM-DD')),
          'text', left(coalesce(nullif(trim(m.summary_text), ''), left(coalesce(m.full_text, ''), 1200)), 1200)
        ) order by m.created_at desc)
        from (select * from app.meeting_recordings where tenant_id = p_tenant_id and transcript_status = 'ready' order by created_at desc limit 6) m
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function app.set_persona_step(p_version_id uuid, p_step text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  perform app._persona_for_edit(p_version_id);
  if p_step not in ('basis', 'personas', 'journey', 'finish') then
    raise exception 'Onbekende stap';
  end if;
  update app.persona_versions set current_step = p_step where id = p_version_id;
  perform app._persona_touch(p_version_id);
end;
$$;

create or replace function app.upsert_persona(p_version_id uuid, p_persona_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
  v_id uuid;
  v_title text;
  v_level text;
begin
  v_version := app._persona_for_edit(p_version_id);
  v_title := left(btrim(coalesce(p_payload->>'role_title', '')), 200);
  if length(v_title) < 2 then raise exception 'Geef de functierol een naam'; end if;
  v_level := coalesce(nullif(p_payload->>'evidence_level', ''), 'hypothesis');
  if v_level not in ('supported', 'client', 'strategist', 'hypothesis', 'unknown') then v_level := 'hypothesis'; end if;
  if p_persona_id is null then
    insert into app.persona_people (
      version_id, tenant_id, role_title, display_name, summary, decision_roles, relevance,
      goals, outcomes, responsibilities, success_criteria, pains, barriers, risks, consequences,
      triggers, decision_criteria, objections, info_needed, other_roles, touchpoints,
      questions, arguments, proof_needed, channels, assumptions, open_question, conflict_note,
      hypothesis, evidence_level, active, origin, manual_lock, sort_order
    ) values (
      p_version_id, v_version.tenant_id, v_title,
      left(coalesce(p_payload->>'display_name', ''), 80),
      left(coalesce(p_payload->>'summary', ''), 800),
      app._persona_roles(p_payload->'decision_roles'),
      left(coalesce(p_payload->>'relevance', ''), 800),
      left(coalesce(p_payload->>'goals', ''), 800),
      left(coalesce(p_payload->>'outcomes', ''), 800),
      left(coalesce(p_payload->>'responsibilities', ''), 800),
      left(coalesce(p_payload->>'success_criteria', ''), 800),
      left(coalesce(p_payload->>'pains', ''), 800),
      left(coalesce(p_payload->>'barriers', ''), 800),
      left(coalesce(p_payload->>'risks', ''), 800),
      left(coalesce(p_payload->>'consequences', ''), 800),
      left(coalesce(p_payload->>'triggers', ''), 800),
      left(coalesce(p_payload->>'decision_criteria', ''), 800),
      left(coalesce(p_payload->>'objections', ''), 800),
      left(coalesce(p_payload->>'info_needed', ''), 800),
      left(coalesce(p_payload->>'other_roles', ''), 500),
      left(coalesce(p_payload->>'touchpoints', ''), 500),
      left(coalesce(p_payload->>'questions', ''), 800),
      left(coalesce(p_payload->>'arguments', ''), 800),
      left(coalesce(p_payload->>'proof_needed', ''), 800),
      left(coalesce(p_payload->>'channels', ''), 400),
      left(coalesce(p_payload->>'assumptions', ''), 800),
      left(coalesce(p_payload->>'open_question', ''), 800),
      left(coalesce(p_payload->>'conflict_note', ''), 500),
      coalesce((p_payload->>'hypothesis')::boolean, true),
      v_level,
      coalesce((p_payload->>'active')::boolean, true),
      'manual', true,
      coalesce((select max(sort_order) + 1 from app.persona_people where version_id = p_version_id and archived_at is null), 0)
    ) returning id into v_id;
  else
    update app.persona_people set
      role_title = v_title,
      display_name = left(coalesce(p_payload->>'display_name', ''), 80),
      summary = left(coalesce(p_payload->>'summary', ''), 800),
      decision_roles = app._persona_roles(p_payload->'decision_roles'),
      relevance = left(coalesce(p_payload->>'relevance', ''), 800),
      goals = left(coalesce(p_payload->>'goals', ''), 800),
      outcomes = left(coalesce(p_payload->>'outcomes', ''), 800),
      responsibilities = left(coalesce(p_payload->>'responsibilities', ''), 800),
      success_criteria = left(coalesce(p_payload->>'success_criteria', ''), 800),
      pains = left(coalesce(p_payload->>'pains', ''), 800),
      barriers = left(coalesce(p_payload->>'barriers', ''), 800),
      risks = left(coalesce(p_payload->>'risks', ''), 800),
      consequences = left(coalesce(p_payload->>'consequences', ''), 800),
      triggers = left(coalesce(p_payload->>'triggers', ''), 800),
      decision_criteria = left(coalesce(p_payload->>'decision_criteria', ''), 800),
      objections = left(coalesce(p_payload->>'objections', ''), 800),
      info_needed = left(coalesce(p_payload->>'info_needed', ''), 800),
      other_roles = left(coalesce(p_payload->>'other_roles', ''), 500),
      touchpoints = left(coalesce(p_payload->>'touchpoints', ''), 500),
      questions = left(coalesce(p_payload->>'questions', ''), 800),
      arguments = left(coalesce(p_payload->>'arguments', ''), 800),
      proof_needed = left(coalesce(p_payload->>'proof_needed', ''), 800),
      channels = left(coalesce(p_payload->>'channels', ''), 400),
      assumptions = left(coalesce(p_payload->>'assumptions', ''), 800),
      open_question = left(coalesce(p_payload->>'open_question', ''), 800),
      conflict_note = left(coalesce(p_payload->>'conflict_note', ''), 500),
      hypothesis = coalesce((p_payload->>'hypothesis')::boolean, true),
      evidence_level = v_level,
      active = coalesce((p_payload->>'active')::boolean, active),
      manual_lock = true,
      ai_state = 'none',
      updated_at = now()
    where id = p_persona_id and version_id = p_version_id and archived_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Persona niet gevonden'; end if;
  end if;
  update app.persona_versions
  set personas_confirmed = false, journeys_confirmed = false
  where id = p_version_id;
  perform app._persona_touch(p_version_id);
  return v_id;
end;
$$;

create or replace function app.archive_persona(p_persona_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.persona_people;
  v_used integer;
begin
  v_item := null;
  select * into v_item from app.persona_people where id = p_persona_id and archived_at is null;
  if v_item.id is null then raise exception 'Persona niet gevonden'; end if;
  perform app._persona_for_edit(v_item.version_id);
  select count(*) into v_used from app.persona_journeys
  where version_id = v_item.version_id and archived_at is null and primary_persona_id = p_persona_id;
  update app.persona_people set archived_at = now(), active = false, updated_at = now() where id = p_persona_id;
  update app.persona_journeys set primary_persona_id = null where primary_persona_id = p_persona_id;
  update app.persona_phases
  set involved_persona_ids = array_remove(involved_persona_ids, p_persona_id)
  where version_id = v_item.version_id;
  update app.persona_versions
  set personas_confirmed = false,
      journeys_confirmed = false,
      review_note = case when v_used > 0 then 'Een persona is gearchiveerd. Koppel de klantreis opnieuw.' else review_note end
  where id = v_item.version_id;
  perform app._persona_touch(v_item.version_id);
end;
$$;

create or replace function app.resolve_persona_proposal(p_persona_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.persona_people;
  v_body jsonb;
begin
  v_item := null;
  select * into v_item from app.persona_people where id = p_persona_id and archived_at is null;
  if v_item.id is null then raise exception 'Persona niet gevonden'; end if;
  perform app._persona_for_edit(v_item.version_id);
  if v_item.ai_state <> 'proposed' then raise exception 'Er staat geen voorstel open'; end if;
  v_body := v_item.ai_payload;
  if coalesce(p_accept, false) then
    update app.persona_people set
      role_title = case when btrim(role_title) = '' then left(coalesce(v_body->>'role_title', ''), 200) else role_title end,
      summary = case when btrim(summary) = '' then left(coalesce(v_body->>'summary', ''), 800) else summary end,
      relevance = case when btrim(relevance) = '' then left(coalesce(v_body->>'relevance', ''), 800) else relevance end,
      goals = case when btrim(goals) = '' then left(coalesce(v_body->>'goals', ''), 800) else goals end,
      pains = case when btrim(pains) = '' then left(coalesce(v_body->>'pains', ''), 800) else pains end,
      triggers = case when btrim(triggers) = '' then left(coalesce(v_body->>'triggers', ''), 800) else triggers end,
      objections = case when btrim(objections) = '' then left(coalesce(v_body->>'objections', ''), 800) else objections end,
      questions = case when btrim(questions) = '' then left(coalesce(v_body->>'questions', ''), 800) else questions end,
      assumptions = case when btrim(assumptions) = '' then left(coalesce(v_body->>'assumptions', ''), 800) else assumptions end,
      decision_roles = case when decision_roles = '[]'::jsonb then app._persona_roles(v_body->'decision_roles') else decision_roles end,
      hypothesis = coalesce((v_body->>'hypothesis')::boolean, hypothesis),
      active = true,
      ai_state = 'accepted',
      ai_payload = '{}'::jsonb,
      manual_lock = true,
      updated_at = now()
    where id = p_persona_id;
  else
    update app.persona_people
    set ai_state = 'rejected', active = false, archived_at = now(), ai_payload = '{}'::jsonb, updated_at = now()
    where id = p_persona_id;
  end if;
  update app.persona_versions set personas_confirmed = false where id = v_item.version_id;
  perform app._persona_touch(v_item.version_id);
end;
$$;

create or replace function app.confirm_personas(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_bad integer;
begin
  perform app._persona_for_edit(p_version_id);
  if not exists (
    select 1 from app.persona_people
    where version_id = p_version_id and archived_at is null and active and ai_state <> 'proposed'
  ) then
    raise exception 'Er is nog geen actieve persona.';
  end if;
  select count(*) into v_bad from app.persona_people
  where version_id = p_version_id and archived_at is null and active and ai_state <> 'proposed'
    and (
      length(btrim(role_title)) < 2
      or (length(btrim(goals)) < 8 and length(btrim(pains)) < 8)
      or (length(btrim(relevance)) < 8 and not hypothesis)
    );
  if v_bad > 0 then
    raise exception 'Elke actieve persona heeft een functierol, een doel of behoefte, en een relatie met het ICP of een hypothese.';
  end if;
  update app.persona_versions set personas_confirmed = true, current_step = 'journey' where id = p_version_id;
  perform app._persona_touch(p_version_id);
end;
$$;

create or replace function app.save_persona_ai_result(p_version_id uuid, p_expected timestamptz, p_payload jsonb, p_apply_new boolean)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
  v_row jsonb;
  v_item app.persona_people;
  v_i integer := 0;
begin
  v_version := app._persona_for_edit(p_version_id);
  if p_expected is not null and v_version.updated_at <> p_expected then
    raise exception 'Deze stap is intussen gewijzigd. Herlaad en vergelijk opnieuw.';
  end if;
  if jsonb_typeof(p_payload->'personas') <> 'array' then
    raise exception 'Het voorstel heeft geen persona''s. Bestaande tekst blijft staan.';
  end if;
  for v_row in select value from jsonb_array_elements(p_payload->'personas')
  loop
    v_item := null;
    select * into v_item from app.persona_people
    where version_id = p_version_id and archived_at is null
      and lower(role_title) = lower(btrim(coalesce(v_row->>'role_title', '')))
    limit 1;
    if v_item.id is not null then
      update app.persona_people
      set ai_state = 'proposed', ai_payload = v_row, updated_at = now()
      where id = v_item.id;
    elsif coalesce(p_apply_new, false) and length(btrim(coalesce(v_row->>'role_title', ''))) >= 2 then
      insert into app.persona_people (
        version_id, tenant_id, role_title, summary, decision_roles, relevance, goals, pains,
        triggers, objections, questions, assumptions, open_question, hypothesis,
        origin, active, ai_state, ai_payload, manual_lock, sort_order
      ) values (
        p_version_id, v_version.tenant_id,
        left(btrim(v_row->>'role_title'), 200),
        left(coalesce(v_row->>'summary', ''), 800),
        app._persona_roles(v_row->'decision_roles'),
        left(coalesce(v_row->>'relevance', ''), 800),
        left(coalesce(v_row->>'goals', ''), 800),
        left(coalesce(v_row->>'pains', ''), 800),
        left(coalesce(v_row->>'triggers', ''), 800),
        left(coalesce(v_row->>'objections', ''), 800),
        left(coalesce(v_row->>'questions', ''), 800),
        left(coalesce(v_row->>'assumptions', ''), 800),
        left(coalesce(v_row->>'open_question', ''), 800),
        coalesce((v_row->>'hypothesis')::boolean, true),
        'ai', false, 'proposed', v_row, false, v_i
      );
      v_i := v_i + 1;
    end if;
  end loop;
  update app.persona_versions set personas_confirmed = false, ai_generated_at = now(), current_step = 'personas' where id = p_version_id;
  insert into app.persona_ai_history (version_id, tenant_id, kind, proposal, created_by)
  values (p_version_id, v_version.tenant_id, 'personas', coalesce(p_payload, '{}'::jsonb), auth.uid());
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_version.tenant_id, auth.uid(), 'persona.ai', 'persona_version', p_version_id::text, jsonb_build_object('kind', 'personas'));
  perform app._persona_touch(p_version_id);
end;
$$;

create or replace function app.ensure_persona_journey(p_version_id uuid, p_kind text, p_primary uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
  v_id uuid;
begin
  v_version := app._persona_for_edit(p_version_id);
  if p_kind not in ('current', 'desired') then raise exception 'Onbekend reistype'; end if;
  select id into v_id from app.persona_journeys
  where version_id = p_version_id and kind = p_kind and archived_at is null;
  if v_id is null then
    insert into app.persona_journeys (version_id, tenant_id, kind, title, primary_persona_id, hypothesis)
    values (
      p_version_id, v_version.tenant_id, p_kind,
      case when p_kind = 'desired' then 'Gewenste reis' else 'Huidige reis' end,
      p_primary, true
    ) returning id into v_id;
  elsif p_primary is not null then
    update app.persona_journeys set primary_persona_id = p_primary, updated_at = now() where id = v_id;
  end if;
  perform app._persona_touch(p_version_id);
  return v_id;
end;
$$;

create or replace function app.upsert_persona_phase(p_journey_id uuid, p_phase_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_journey app.persona_journeys;
  v_id uuid;
  v_priority text;
  v_name text;
  v_involved uuid[];
begin
  v_journey := null;
  select * into v_journey from app.persona_journeys where id = p_journey_id and archived_at is null;
  if v_journey is null then raise exception 'Klantreis niet gevonden'; end if;
  perform app._persona_for_edit(v_journey.version_id);
  v_name := left(btrim(coalesce(p_payload->>'name', '')), 120);
  if length(v_name) < 2 then raise exception 'Geef de fase een naam'; end if;
  v_priority := coalesce(nullif(p_payload->>'priority', ''), 'unknown');
  if v_priority not in ('low', 'medium', 'high', 'unknown') then v_priority := 'unknown'; end if;
  select coalesce(array_agg(p.id), '{}'::uuid[]) into v_involved
  from app.persona_people p
  where p.version_id = v_journey.version_id
    and p.archived_at is null
    and p.id::text in (
      select value from jsonb_array_elements_text(coalesce(p_payload->'involved_persona_ids', '[]'::jsonb))
    );
  if v_involved is null then v_involved := '{}'::uuid[]; end if;
  if p_phase_id is null then
    insert into app.persona_phases (
      journey_id, version_id, tenant_id, name, goal, actions, questions, info_need, decision_criteria, barriers, next_step,
      touchpoints, channels, involved_persona_ids, company_side, content_needed, assumption, open_question, emotion,
      improvement, proposed_action, contribution, owner_name, priority, hypothesis, sort_order
    ) values (
      p_journey_id, v_journey.version_id, v_journey.tenant_id, v_name,
      left(coalesce(p_payload->>'goal', ''), 500),
      left(coalesce(p_payload->>'actions', ''), 800),
      left(coalesce(p_payload->>'questions', ''), 800),
      left(coalesce(p_payload->>'info_need', ''), 500),
      left(coalesce(p_payload->>'decision_criteria', ''), 500),
      left(coalesce(p_payload->>'barriers', ''), 500),
      left(coalesce(p_payload->>'next_step', ''), 400),
      left(coalesce(p_payload->>'touchpoints', ''), 400),
      left(coalesce(p_payload->>'channels', ''), 300),
      v_involved,
      left(coalesce(p_payload->>'company_side', ''), 300),
      left(coalesce(p_payload->>'content_needed', ''), 400),
      left(coalesce(p_payload->>'assumption', ''), 500),
      left(coalesce(p_payload->>'open_question', ''), 500),
      left(coalesce(p_payload->>'emotion', ''), 300),
      left(coalesce(p_payload->>'improvement', ''), 500),
      left(coalesce(p_payload->>'proposed_action', ''), 500),
      left(coalesce(p_payload->>'contribution', ''), 400),
      left(coalesce(p_payload->>'owner_name', ''), 120),
      v_priority,
      coalesce((p_payload->>'hypothesis')::boolean, true),
      coalesce((select max(sort_order) + 1 from app.persona_phases where journey_id = p_journey_id and archived_at is null), 0)
    ) returning id into v_id;
  else
    update app.persona_phases set
      name = v_name,
      goal = left(coalesce(p_payload->>'goal', ''), 500),
      actions = left(coalesce(p_payload->>'actions', ''), 800),
      questions = left(coalesce(p_payload->>'questions', ''), 800),
      info_need = left(coalesce(p_payload->>'info_need', ''), 500),
      decision_criteria = left(coalesce(p_payload->>'decision_criteria', ''), 500),
      barriers = left(coalesce(p_payload->>'barriers', ''), 500),
      next_step = left(coalesce(p_payload->>'next_step', ''), 400),
      touchpoints = left(coalesce(p_payload->>'touchpoints', ''), 400),
      channels = left(coalesce(p_payload->>'channels', ''), 300),
      involved_persona_ids = v_involved,
      company_side = left(coalesce(p_payload->>'company_side', ''), 300),
      content_needed = left(coalesce(p_payload->>'content_needed', ''), 400),
      assumption = left(coalesce(p_payload->>'assumption', ''), 500),
      open_question = left(coalesce(p_payload->>'open_question', ''), 500),
      emotion = left(coalesce(p_payload->>'emotion', ''), 300),
      improvement = left(coalesce(p_payload->>'improvement', ''), 500),
      proposed_action = left(coalesce(p_payload->>'proposed_action', ''), 500),
      contribution = left(coalesce(p_payload->>'contribution', ''), 400),
      owner_name = left(coalesce(p_payload->>'owner_name', ''), 120),
      priority = v_priority,
      hypothesis = coalesce((p_payload->>'hypothesis')::boolean, true),
      updated_at = now()
    where id = p_phase_id and journey_id = p_journey_id and archived_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Fase niet gevonden'; end if;
  end if;
  update app.persona_versions set journeys_confirmed = false where id = v_journey.version_id;
  perform app._persona_touch(v_journey.version_id);
  return v_id;
end;
$$;

create or replace function app.move_persona_phase(p_phase_id uuid, p_direction integer)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_phase app.persona_phases;
  v_other app.persona_phases;
begin
  v_phase := null;
  select * into v_phase from app.persona_phases where id = p_phase_id and archived_at is null;
  if v_phase.id is null then raise exception 'Fase niet gevonden'; end if;
  perform app._persona_for_edit(v_phase.version_id);
  v_other := null;
  if p_direction < 0 then
    select * into v_other from app.persona_phases
    where journey_id = v_phase.journey_id and archived_at is null and sort_order < v_phase.sort_order
    order by sort_order desc limit 1;
  else
    select * into v_other from app.persona_phases
    where journey_id = v_phase.journey_id and archived_at is null and sort_order > v_phase.sort_order
    order by sort_order limit 1;
  end if;
  if v_other.id is null then return; end if;
  update app.persona_phases set sort_order = v_other.sort_order where id = v_phase.id;
  update app.persona_phases set sort_order = v_phase.sort_order where id = v_other.id;
  perform app._persona_touch(v_phase.version_id);
end;
$$;

create or replace function app.archive_persona_phase(p_phase_id uuid, p_restore boolean)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_phase app.persona_phases;
begin
  v_phase := null;
  select * into v_phase from app.persona_phases where id = p_phase_id;
  if v_phase.id is null then raise exception 'Fase niet gevonden'; end if;
  perform app._persona_for_edit(v_phase.version_id);
  update app.persona_phases
  set archived_at = case when coalesce(p_restore, false) then null else now() end, updated_at = now()
  where id = p_phase_id;
  update app.persona_versions set journeys_confirmed = false where id = v_phase.version_id;
  perform app._persona_touch(v_phase.version_id);
end;
$$;

create or replace function app.derive_desired_journey(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
  v_current app.persona_journeys;
  v_new uuid;
  v_phase app.persona_phases;
begin
  v_version := app._persona_for_edit(p_version_id);
  if exists (select 1 from app.persona_journeys where version_id = p_version_id and kind = 'desired' and archived_at is null) then
    raise exception 'Er is al een gewenste reis. Bewerk die verder.';
  end if;
  v_current := null;
  select * into v_current from app.persona_journeys
  where version_id = p_version_id and kind = 'current' and archived_at is null;
  if v_current.id is null then
    raise exception 'Er is nog geen huidige reis. Start de gewenste reis leeg, of bouw eerst de huidige.';
  end if;
  insert into app.persona_journeys (version_id, tenant_id, kind, title, primary_persona_id, based_on_id, hypothesis, route_note)
  values (p_version_id, v_version.tenant_id, 'desired', 'Gewenste reis', v_current.primary_persona_id, v_current.id, true, 'Voorstel op basis van de huidige reis. Nog niet gerealiseerd.')
  returning id into v_new;
  for v_phase in
    select * from app.persona_phases where journey_id = v_current.id and archived_at is null order by sort_order
  loop
    insert into app.persona_phases (
      journey_id, version_id, tenant_id, name, goal, actions, questions, info_need, decision_criteria, barriers, next_step,
      touchpoints, channels, involved_persona_ids, company_side, content_needed, assumption, open_question, emotion,
      hypothesis, sort_order
    ) values (
      v_new, p_version_id, v_version.tenant_id, v_phase.name, v_phase.goal, v_phase.actions, v_phase.questions,
      v_phase.info_need, v_phase.decision_criteria, v_phase.barriers, v_phase.next_step,
      v_phase.touchpoints, v_phase.channels, v_phase.involved_persona_ids, v_phase.company_side, v_phase.content_needed,
      v_phase.assumption, v_phase.open_question, v_phase.emotion, true, v_phase.sort_order
    );
  end loop;
  update app.persona_versions set journeys_confirmed = false where id = p_version_id;
  perform app._persona_touch(p_version_id);
  return v_new;
end;
$$;

create or replace function app.save_journey_proposal(p_journey_id uuid, p_expected timestamptz, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_journey app.persona_journeys;
  v_version app.persona_versions;
begin
  v_journey := null;
  select * into v_journey from app.persona_journeys where id = p_journey_id and archived_at is null;
  if v_journey.id is null then raise exception 'Klantreis niet gevonden'; end if;
  v_version := app._persona_for_edit(v_journey.version_id);
  if p_expected is not null and v_version.updated_at <> p_expected then
    raise exception 'De klantreis is intussen gewijzigd. Het voorstel is niet geplaatst.';
  end if;
  update app.persona_journeys set ai_proposal = coalesce(p_payload, '{}'::jsonb), updated_at = now() where id = p_journey_id;
  insert into app.persona_ai_history (version_id, tenant_id, kind, proposal, created_by)
  values (v_journey.version_id, v_journey.tenant_id, 'journey', coalesce(p_payload, '{}'::jsonb), auth.uid());
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_journey.tenant_id, auth.uid(), 'persona.ai', 'persona_journey', p_journey_id::text, jsonb_build_object('kind', 'journey'));
  perform app._persona_touch(v_journey.version_id);
end;
$$;

create or replace function app.apply_journey_proposal(p_journey_id uuid, p_replace boolean)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_journey app.persona_journeys;
  v_row jsonb;
  v_i integer := 0;
begin
  v_journey := null;
  select * into v_journey from app.persona_journeys where id = p_journey_id and archived_at is null;
  if v_journey.id is null then raise exception 'Klantreis niet gevonden'; end if;
  perform app._persona_for_edit(v_journey.version_id);
  if jsonb_typeof(v_journey.ai_proposal->'phases') <> 'array' then
    raise exception 'Er staat geen reisvoorstel klaar.';
  end if;
  if exists (select 1 from app.persona_phases where journey_id = p_journey_id and archived_at is null) and not coalesce(p_replace, false) then
    raise exception 'Er staan al fasen. Kies vervangen, of houd de huidige reis.';
  end if;
  if coalesce(p_replace, false) then
    update app.persona_phases set archived_at = now() where journey_id = p_journey_id and archived_at is null;
  end if;
  for v_row in select value from jsonb_array_elements(v_journey.ai_proposal->'phases')
  loop
    if length(btrim(coalesce(v_row->>'name', ''))) < 2 then continue; end if;
    insert into app.persona_phases (
      journey_id, version_id, tenant_id, name, goal, questions, barriers, actions, hypothesis, assumption, sort_order
    ) values (
      p_journey_id, v_journey.version_id, v_journey.tenant_id,
      left(btrim(v_row->>'name'), 120),
      left(coalesce(v_row->>'goal', ''), 500),
      left(coalesce(v_row->>'questions', ''), 800),
      left(coalesce(v_row->>'barriers', ''), 500),
      left(coalesce(v_row->>'actions', ''), 800),
      coalesce((v_row->>'hypothesis')::boolean, true),
      left(coalesce(v_row->>'assumption', ''), 500),
      v_i
    );
    v_i := v_i + 1;
  end loop;
  update app.persona_journeys set ai_proposal = '{}'::jsonb where id = p_journey_id;
  update app.persona_versions set journeys_confirmed = false where id = v_journey.version_id;
  perform app._persona_touch(v_journey.version_id);
end;
$$;

create or replace function app.confirm_journeys(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  perform app._persona_for_edit(p_version_id);
  if not exists (
    select 1 from app.persona_journeys j
    join app.persona_phases ph on ph.journey_id = j.id and ph.archived_at is null
    where j.version_id = p_version_id and j.archived_at is null and j.primary_persona_id is not null and length(btrim(ph.goal)) >= 8
  ) then
    raise exception 'Koppel een persona en geef minstens één fase een klantdoel.';
  end if;
  update app.persona_versions set journeys_confirmed = true, current_step = 'finish' where id = p_version_id;
  perform app._persona_touch(p_version_id);
end;
$$;

create or replace function app.start_persona_portrait(p_persona_id uuid, p_prompt text, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.persona_people;
  v_existing uuid;
  v_count integer;
  v_id uuid;
  v_cap integer;
begin
  v_item := null;
  select * into v_item from app.persona_people where id = p_persona_id and archived_at is null;
  if v_item.id is null then raise exception 'Persona niet gevonden'; end if;
  perform app._persona_for_edit(v_item.version_id);
  select id into v_existing from app.persona_portraits
  where persona_id = p_persona_id and status in ('queued', 'running') limit 1;
  if v_existing is not null then return jsonb_build_object('id', v_existing, 'fresh', false); end if;
  v_cap := coalesce(p_limit, 12);
  if v_cap < 1 then v_cap := 12; end if;
  select count(*) into v_count from app.persona_portraits
  where tenant_id = v_item.tenant_id and created_at > now() - interval '1 day';
  if v_count >= v_cap then
    raise exception 'De portretlimiet voor vandaag is bereikt. Kies een bestaande variant of probeer morgen opnieuw.';
  end if;
  update app.persona_people set illustration_prompt = left(coalesce(p_prompt, illustration_prompt), 300) where id = p_persona_id;
  insert into app.persona_portraits (persona_id, version_id, tenant_id, visual_prompt, status, created_by)
  values (p_persona_id, v_item.version_id, v_item.tenant_id, left(coalesce(p_prompt, ''), 300), 'queued', auth.uid())
  returning id into v_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_item.tenant_id, auth.uid(), 'persona.portrait', 'persona', p_persona_id::text, jsonb_build_object('portrait_id', v_id));
  return jsonb_build_object('id', v_id, 'fresh', true);
end;
$$;

create or replace function app.fail_persona_portrait(p_portrait_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.persona_portraits;
begin
  v_row := null;
  select * into v_row from app.persona_portraits where id = p_portrait_id;
  if v_row.id is null then return; end if;
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  update app.persona_portraits
  set status = 'failed', error_message = left(coalesce(p_error, 'Mislukt'), 300)
  where id = p_portrait_id and status in ('queued', 'running');
end;
$$;

create or replace function app.complete_persona_portrait(p_portrait_id uuid, p_path text, p_model text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.persona_portraits;
  v_item app.persona_people;
begin
  v_row := null;
  select * into v_row from app.persona_portraits where id = p_portrait_id;
  if v_row.id is null then raise exception 'Portret niet gevonden'; end if;
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_row.status not in ('queued', 'running') then
    raise exception 'Dit portret is al afgehandeld.';
  end if;
  v_item := null;
  select * into v_item from app.persona_people where id = v_row.persona_id and archived_at is null;
  if v_item.id is null then
    update app.persona_portraits set status = 'failed', error_message = 'Persona is gearchiveerd' where id = p_portrait_id;
    return;
  end if;
  update app.persona_portraits
  set status = 'ready', storage_path = left(coalesce(p_path, ''), 400), model = left(coalesce(p_model, ''), 80), error_message = ''
  where id = p_portrait_id;
  if v_item.selected_portrait_id is null then
    update app.persona_people set selected_portrait_id = p_portrait_id where id = v_item.id;
  end if;
end;
$$;

create or replace function app.select_persona_portrait(p_portrait_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.persona_portraits;
begin
  v_row := null;
  select * into v_row from app.persona_portraits where id = p_portrait_id and status = 'ready';
  if v_row.id is null then raise exception 'Dit portret is nog niet klaar'; end if;
  perform app._persona_for_edit(v_row.version_id);
  update app.persona_people set selected_portrait_id = p_portrait_id, updated_at = now() where id = v_row.persona_id;
end;
$$;

create or replace function app.approve_persona_version(p_version_id uuid, p_expected timestamptz)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
  v_stp app.stp_versions;
  v_open integer;
begin
  v_version := app._persona_for_edit(p_version_id);
  if p_expected is not null and v_version.updated_at <> p_expected then
    raise exception 'De versie is intussen gewijzigd. Keur opnieuw goed.';
  end if;
  if not v_version.personas_confirmed or not v_version.journeys_confirmed then
    raise exception 'Bevestig eerst de persona''s en de klantreis';
  end if;
  v_stp := null;
  select * into v_stp from app.stp_versions where id = v_version.stp_version_id;
  if v_stp.id is null or v_stp.status <> 'approved'::app.stp_version_status then
    raise exception 'Koppel een goedgekeurd ICP via STP voor je dit goedkeurt.';
  end if;
  if v_version.needs_review and length(btrim(v_version.accepted_uncertainty)) < 10 then
    raise exception 'Het ICP is gewijzigd. Kijk de gevolgen na, of benoem welke onzekerheid je accepteert.';
  end if;
  select count(*) into v_open from app.persona_people
  where version_id = p_version_id and archived_at is null and active and length(btrim(conflict_note)) > 0
    and length(btrim(v_version.accepted_uncertainty)) < 10;
  if v_open > 0 then
    raise exception 'Er blijft een tegenstrijdigheid open. Los die op of benoem de onzekerheid.';
  end if;
  update app.persona_versions
  set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = p_version_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_version.tenant_id, auth.uid(), 'persona.approve', 'persona_version', p_version_id::text, jsonb_build_object('version_number', v_version.version_number));
end;
$$;

create or replace function app.create_persona_revision(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_source app.persona_versions;
  v_new uuid;
  v_next integer;
  v_person app.persona_people;
  v_map jsonb := '{}'::jsonb;
  v_jmap jsonb := '{}'::jsonb;
  v_new_person uuid;
  v_journey app.persona_journeys;
  v_new_journey uuid;
  v_phase app.persona_phases;
  v_involved uuid[];
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_source := null;
  select * into v_source from app.persona_versions where id = p_version_id;
  if v_source.id is null then raise exception 'Versie niet gevonden'; end if;
  if not app.has_capability(v_source.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_source.status <> 'approved' then raise exception 'Een herziening start vanaf een goedgekeurde versie'; end if;
  select coalesce(max(version_number), 0) + 1 into v_next from app.persona_versions where tenant_id = v_source.tenant_id;
  insert into app.persona_versions (
    tenant_id, version_number, status, current_step, stp_version_id, personas_confirmed, journeys_confirmed,
    accepted_uncertainty, open_questions, created_by
  ) values (
    v_source.tenant_id, v_next, 'draft', 'finish', v_source.stp_version_id, true, true,
    v_source.accepted_uncertainty, v_source.open_questions, auth.uid()
  ) returning id into v_new;
  for v_person in select * from app.persona_people where version_id = p_version_id and archived_at is null
  loop
    insert into app.persona_people (
      version_id, tenant_id, role_title, display_name, summary, decision_roles, relevance, goals, outcomes,
      responsibilities, success_criteria, pains, barriers, risks, consequences, triggers, decision_criteria,
      objections, info_needed, other_roles, touchpoints, questions, arguments, proof_needed, channels,
      assumptions, open_question, conflict_note, hypothesis, evidence_level, active, manual_lock, origin,
      illustration_prompt, sort_order
    ) values (
      v_new, v_source.tenant_id, v_person.role_title, v_person.display_name, v_person.summary, v_person.decision_roles,
      v_person.relevance, v_person.goals, v_person.outcomes, v_person.responsibilities, v_person.success_criteria,
      v_person.pains, v_person.barriers, v_person.risks, v_person.consequences, v_person.triggers, v_person.decision_criteria,
      v_person.objections, v_person.info_needed, v_person.other_roles, v_person.touchpoints, v_person.questions,
      v_person.arguments, v_person.proof_needed, v_person.channels, v_person.assumptions, v_person.open_question,
      v_person.conflict_note, v_person.hypothesis, v_person.evidence_level, v_person.active, true, v_person.origin,
      v_person.illustration_prompt, v_person.sort_order
    ) returning id into v_new_person;
    v_map := v_map || jsonb_build_object(v_person.id::text, v_new_person);
    insert into app.persona_portraits (persona_id, version_id, tenant_id, storage_path, status, visual_prompt, provider, model, created_by)
    select v_new_person, v_new, tenant_id, storage_path, status, visual_prompt, provider, model, auth.uid()
    from app.persona_portraits
    where id = v_person.selected_portrait_id and status = 'ready';
    update app.persona_people
    set selected_portrait_id = (select id from app.persona_portraits where persona_id = v_new_person and status = 'ready' order by created_at desc limit 1)
    where id = v_new_person;
  end loop;
  for v_journey in
    select * from app.persona_journeys
    where version_id = p_version_id and archived_at is null
    order by case when kind = 'current' then 0 else 1 end, created_at
  loop
    insert into app.persona_journeys (version_id, tenant_id, kind, title, primary_persona_id, based_on_id, route_note, hypothesis)
    values (
      v_new, v_source.tenant_id, v_journey.kind, v_journey.title,
      nullif(v_map->>v_journey.primary_persona_id::text, '')::uuid,
      nullif(v_jmap->>v_journey.based_on_id::text, '')::uuid,
      v_journey.route_note, v_journey.hypothesis
    ) returning id into v_new_journey;
    v_jmap := v_jmap || jsonb_build_object(v_journey.id::text, v_new_journey);
    for v_phase in select * from app.persona_phases where journey_id = v_journey.id and archived_at is null order by sort_order
    loop
      v_involved := '{}'::uuid[];
      select coalesce(array_agg((v_map->>old_id)::uuid), '{}'::uuid[])
      into v_involved
      from unnest(v_phase.involved_persona_ids) as old_id
      where v_map ? old_id::text;
      if v_involved is null then v_involved := '{}'::uuid[]; end if;
      insert into app.persona_phases (
        journey_id, version_id, tenant_id, name, goal, actions, questions, info_need, decision_criteria, barriers, next_step,
        touchpoints, channels, involved_persona_ids, company_side, content_needed, assumption, open_question, emotion,
        improvement, proposed_action, contribution, owner_name, priority, hypothesis, sort_order
      ) values (
        v_new_journey, v_new, v_source.tenant_id, v_phase.name, v_phase.goal, v_phase.actions, v_phase.questions,
        v_phase.info_need, v_phase.decision_criteria, v_phase.barriers, v_phase.next_step, v_phase.touchpoints, v_phase.channels,
        v_involved, v_phase.company_side, v_phase.content_needed, v_phase.assumption, v_phase.open_question, v_phase.emotion,
        v_phase.improvement, v_phase.proposed_action, v_phase.contribution, v_phase.owner_name, v_phase.priority,
        v_phase.hypothesis, v_phase.sort_order
      );
    end loop;
  end loop;
  return v_new;
end;
$$;

create or replace function app.publish_persona_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
  v_missing integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_version := null;
  select * into v_version from app.persona_versions where id = p_version_id;
  if v_version.id is null then raise exception 'Versie niet gevonden'; end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_version.status <> 'approved' then raise exception 'Publiceer alleen een goedgekeurde versie'; end if;
  select count(*) into v_missing from app.persona_people p
  where p.version_id = p_version_id and p.archived_at is null and p.active
    and not exists (
      select 1 from app.persona_portraits r
      where r.id = p.selected_portrait_id and r.status = 'ready' and r.storage_path <> ''
    );
  if v_missing > 0 then
    raise exception 'Elke actieve persona heeft een gekozen portret nodig voor publicatie. Concepten blijven bruikbaar.';
  end if;
  update app.persona_versions set published_at = now(), published_by = auth.uid() where id = p_version_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_version.tenant_id, auth.uid(), 'persona.publish', 'persona_version', p_version_id::text, jsonb_build_object('version_number', v_version.version_number));
end;
$$;

create or replace function app.unpublish_persona_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_version := null;
  select * into v_version from app.persona_versions where id = p_version_id;
  if v_version.id is null then raise exception 'Versie niet gevonden'; end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  update app.persona_versions set published_at = null, published_by = null where id = p_version_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_version.tenant_id, auth.uid(), 'persona.unpublish', 'persona_version', p_version_id::text, '{}'::jsonb);
end;
$$;

create or replace function app.get_persona_published(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not (app.has_capability(p_tenant_id, 'dashboard.read_published') or app.has_capability(p_tenant_id, 'audit.edit')) then
    raise exception 'Forbidden';
  end if;
  v_version := null;
  select * into v_version from app.persona_versions
  where tenant_id = p_tenant_id and status = 'approved' and published_at is not null
  order by version_number desc limit 1;
  if v_version.id is null then return jsonb_build_object('published', false); end if;
  return jsonb_build_object(
    'published', true,
    'version_number', v_version.version_number,
    'published_at', v_version.published_at,
    'open_questions', v_version.open_questions,
    'accepted_uncertainty', v_version.accepted_uncertainty,
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role_title', p.role_title,
        'summary', p.summary,
        'storage_path', coalesce((select r.storage_path from app.persona_portraits r where r.id = p.selected_portrait_id and r.status = 'ready'), '')
      ) order by p.sort_order)
      from app.persona_people p
      where p.version_id = v_version.id and p.archived_at is null and p.active
    ), '[]'::jsonb),
    'journeys', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', j.kind,
        'title', j.title,
        'phases', coalesce((
          select jsonb_agg(jsonb_build_object('name', ph.name, 'goal', ph.goal, 'barriers', ph.barriers, 'improvement', ph.improvement) order by ph.sort_order)
          from app.persona_phases ph where ph.journey_id = j.id and ph.archived_at is null
        ), '[]'::jsonb)
      ))
      from app.persona_journeys j where j.version_id = v_version.id and j.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function app.log_persona_export(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_version := null;
  select * into v_version from app.persona_versions where id = p_version_id;
  if v_version.id is null then raise exception 'Versie niet gevonden'; end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_version.tenant_id, auth.uid(), 'persona.export', 'persona_version', p_version_id::text, jsonb_build_object('version_number', v_version.version_number, 'status', v_version.status));
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
    'persona_started', v_persona_started is not null
  );
end;
$$;

create or replace function app.save_persona_notes(p_version_id uuid, p_uncertainty text, p_questions text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  perform app._persona_for_edit(p_version_id);
  update app.persona_versions
  set accepted_uncertainty = left(coalesce(p_uncertainty, ''), 1000),
      open_questions = left(coalesce(p_questions, ''), 2000)
  where id = p_version_id;
  perform app._persona_touch(p_version_id);
end;
$$;

grant execute on function app.get_persona_workbench(uuid, uuid) to authenticated;
grant execute on function app.set_persona_step(uuid, text) to authenticated;
grant execute on function app.upsert_persona(uuid, uuid, jsonb) to authenticated;
grant execute on function app.archive_persona(uuid) to authenticated;
grant execute on function app.resolve_persona_proposal(uuid, boolean) to authenticated;
grant execute on function app.confirm_personas(uuid) to authenticated;
grant execute on function app.save_persona_ai_result(uuid, timestamptz, jsonb, boolean) to authenticated;
grant execute on function app.ensure_persona_journey(uuid, text, uuid) to authenticated;
grant execute on function app.upsert_persona_phase(uuid, uuid, jsonb) to authenticated;
grant execute on function app.move_persona_phase(uuid, integer) to authenticated;
grant execute on function app.archive_persona_phase(uuid, boolean) to authenticated;
grant execute on function app.derive_desired_journey(uuid) to authenticated;
grant execute on function app.save_journey_proposal(uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.apply_journey_proposal(uuid, boolean) to authenticated;
grant execute on function app.confirm_journeys(uuid) to authenticated;
grant execute on function app.start_persona_portrait(uuid, text, integer) to authenticated;
grant execute on function app.fail_persona_portrait(uuid, text) to authenticated;
grant execute on function app.complete_persona_portrait(uuid, text, text) to authenticated;
grant execute on function app.select_persona_portrait(uuid) to authenticated;
grant execute on function app.approve_persona_version(uuid, timestamptz) to authenticated;
grant execute on function app.create_persona_revision(uuid) to authenticated;
grant execute on function app.publish_persona_version(uuid) to authenticated;
grant execute on function app.unpublish_persona_version(uuid) to authenticated;
grant execute on function app.get_persona_published(uuid) to authenticated;
grant execute on function app.log_persona_export(uuid) to authenticated;
grant execute on function app.save_persona_notes(uuid, text, text) to authenticated;
grant execute on function app.get_audit_framework_progress(uuid) to authenticated;

revoke execute on function app._persona_for_edit(uuid) from public, anon, authenticated;
revoke execute on function app._persona_touch(uuid) from public, anon, authenticated;
revoke execute on function app._persona_roles(jsonb) from public, anon, authenticated;
