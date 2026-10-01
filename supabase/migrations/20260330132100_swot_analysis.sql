-- Strategische audit · stap 4: SWOT (synthese van PESTEL, Porter, 5C en meetings)

create type app.swot_quadrant as enum ('strength', 'weakness', 'opportunity', 'threat');

create type app.swot_version_status as enum ('not_started', 'draft', 'approved');

create type app.swot_ref_type as enum (
  'tenant_profile',
  'meeting',
  'pestel_insight',
  'porter_scope',
  'porter_force',
  'porter_factor',
  'five_c_item',
  'five_c_synthesis',
  'manual'
);

create table app.swot_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  version_number integer not null,
  status app.swot_version_status not null default 'not_started',
  pestel_version_id uuid references app.pestel_versions (id) on delete set null,
  porter_version_id uuid references app.porter_versions (id) on delete set null,
  five_c_version_id uuid references app.five_c_versions (id) on delete set null,
  advisor_reviewed boolean not null default false,
  adjustment_note text not null default '',
  ai_generated_at timestamptz,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, version_number)
);

create index swot_versions_tenant_idx on app.swot_versions (tenant_id, version_number desc);

create table app.swot_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.swot_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  quadrant app.swot_quadrant not null,
  statement text not null default '',
  origin text not null default 'manual' check (origin in ('ai', 'manual')),
  sort_order integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index swot_items_version_idx on app.swot_items (version_id, quadrant)
where deleted_at is null;

create table app.swot_item_refs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references app.swot_items (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  ref_type app.swot_ref_type not null,
  ref_id uuid,
  label text not null default '',
  excerpt text not null default '',
  created_at timestamptz not null default now()
);

create index swot_item_refs_item_idx on app.swot_item_refs (item_id);

alter table app.swot_versions enable row level security;
alter table app.swot_items enable row level security;
alter table app.swot_item_refs enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function app._swot_version_for_edit(p_version_id uuid)
returns app.swot_versions
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.swot_versions;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_row from app.swot_versions where id = p_version_id;
  if v_row.id is null then
    raise exception 'Versie niet gevonden';
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  if v_row.status = 'approved'::app.swot_version_status then
    raise exception 'Goedgekeurde SWOT is alleen-lezen';
  end if;
  return v_row;
end;
$$;

create or replace function app._swot_ref_valid(
  p_version app.swot_versions,
  p_type app.swot_ref_type,
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
  end case;
  return false;
end;
$$;

create or replace function app._swot_replace_refs(
  p_item_id uuid,
  p_version app.swot_versions,
  p_refs jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_ref jsonb;
  v_type app.swot_ref_type;
  v_id uuid;
begin
  delete from app.swot_item_refs where item_id = p_item_id;
  if p_refs is null or jsonb_typeof(p_refs) <> 'array' then
    return;
  end if;
  for v_ref in select * from jsonb_array_elements(p_refs)
  loop
    v_type := (v_ref->>'ref_type')::app.swot_ref_type;
    v_id := nullif(v_ref->>'ref_id', '')::uuid;
    if not app._swot_ref_valid(p_version, v_type, v_id) then
      raise exception 'Ongeldige bronverwijzing (% %)', v_type, coalesce(v_id::text, '-');
    end if;
    insert into app.swot_item_refs (item_id, tenant_id, ref_type, ref_id, label, excerpt)
    values (
      p_item_id,
      p_version.tenant_id,
      v_type,
      v_id,
      left(coalesce(v_ref->>'label', ''), 500),
      left(coalesce(v_ref->>'excerpt', ''), 2000)
    );
  end loop;
end;
$$;

create or replace function app._swot_touch(p_version_id uuid)
returns void
language sql
security definer
set search_path = app, public, auth
as $$
  update app.swot_versions
  set
    updated_at = now(),
    status = case
      when status = 'not_started'::app.swot_version_status then 'draft'::app.swot_version_status
      else status
    end
  where id = p_version_id;
$$;

create or replace function app._swot_invalidate_review(p_version_id uuid)
returns void
language sql
security definer
set search_path = app, public, auth
as $$
  update app.swot_versions set advisor_reviewed = false where id = p_version_id;
$$;

-- ---------------------------------------------------------------------------
-- Workbench
-- ---------------------------------------------------------------------------

create or replace function app.get_swot_workbench(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.swot_versions;
  v_five_c_approved app.five_c_versions;
  v_pestel app.pestel_versions;
  v_porter app.porter_versions;
  v_five_c app.five_c_versions;
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

  select * into v_five_c_approved
  from app.five_c_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.five_c_version_status
  order by version_number desc limit 1;

  select * into v_version
  from app.swot_versions
  where tenant_id = p_tenant_id and status <> 'approved'::app.swot_version_status
  order by version_number desc limit 1;

  if v_version.id is null then
    select * into v_version
    from app.swot_versions
    where tenant_id = p_tenant_id
    order by version_number desc limit 1;
  end if;

  if v_version.id is null then
    insert into app.swot_versions (
      tenant_id, version_number, status,
      pestel_version_id, porter_version_id, five_c_version_id, created_by
    )
    values (
      p_tenant_id,
      1,
      'not_started',
      coalesce(
        v_five_c_approved.pestel_version_id,
        (select id from app.pestel_versions where tenant_id = p_tenant_id and status = 'approved'::app.pestel_version_status order by version_number desc limit 1)
      ),
      coalesce(
        v_five_c_approved.porter_version_id,
        (select id from app.porter_versions where tenant_id = p_tenant_id and status = 'approved'::app.porter_version_status order by version_number desc limit 1)
      ),
      v_five_c_approved.id,
      auth.uid()
    )
    returning * into v_version;
  end if;

  select * into v_pestel from app.pestel_versions where id = v_version.pestel_version_id;
  select * into v_porter from app.porter_versions where id = v_version.porter_version_id;
  select * into v_five_c from app.five_c_versions where id = v_version.five_c_version_id;

  return jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id,
      'version_number', v_version.version_number,
      'status', v_version.status,
      'pestel_version_id', v_version.pestel_version_id,
      'porter_version_id', v_version.porter_version_id,
      'five_c_version_id', v_version.five_c_version_id,
      'advisor_reviewed', v_version.advisor_reviewed,
      'adjustment_note', v_version.adjustment_note,
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
      'five_c', case when v_five_c.id is null then null else jsonb_build_object(
        'id', v_five_c.id, 'version_number', v_five_c.version_number, 'status', v_five_c.status
      ) end,
      'latest_five_c_approved', case when v_five_c_approved.id is null then null else jsonb_build_object(
        'id', v_five_c_approved.id, 'version_number', v_five_c_approved.version_number
      ) end
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'quadrant', i.quadrant,
        'statement', i.statement,
        'origin', i.origin,
        'sort_order', i.sort_order,
        'created_at', i.created_at,
        'refs', coalesce((
          select jsonb_agg(jsonb_build_object(
            'ref_type', r.ref_type,
            'ref_id', r.ref_id,
            'label', r.label,
            'excerpt', r.excerpt
          ) order by r.created_at)
          from app.swot_item_refs r where r.item_id = i.id
        ), '[]'::jsonb)
      ) order by i.quadrant, i.sort_order, i.created_at)
      from app.swot_items i
      where i.version_id = v_version.id and i.deleted_at is null
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
      'pestel_insights', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id,
          'dimension', i.dimension,
          'title', i.title,
          'observation', left(i.observation, 2000),
          'client_relevance', left(i.client_relevance, 1000)
        ) order by i.dimension, i.sort_order)
        from app.pestel_insights i
        where i.version_id = v_version.pestel_version_id
          and i.deleted_at is null
          and i.review_status <> 'rejected'::app.pestel_insight_review
      ), '[]'::jsonb),
      'porter_forces', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id,
          'force_key', f.force_key,
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
        'synthesis_text', left(v_porter.synthesis_text, 4000)
      ) end,
      'five_c_items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', fi.id,
          'c_key', fi.c_key,
          'title', fi.title,
          'finding', left(fi.finding, 2000),
          'client_relevance', left(fi.client_relevance, 1000)
        ) order by fi.c_key, fi.sort_order)
        from app.five_c_items fi
        where fi.version_id = v_version.five_c_version_id
          and fi.deleted_at is null
          and fi.review_status <> 'rejected'::app.five_c_review
          and fi.content_type <> 'input_needed'::app.five_c_content_type
      ), '[]'::jsonb),
      'five_c_synthesis', case when v_five_c.id is null then null else left(v_five_c.synthesis_text, 6000) end
    )
  );
end;
$$;

grant execute on function app.get_swot_workbench(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Quadrant opslaan (handmatig, incl. refs)
-- ---------------------------------------------------------------------------

create or replace function app.replace_swot_quadrant(
  p_version_id uuid,
  p_quadrant app.swot_quadrant,
  p_statements jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.swot_versions;
  v_row jsonb;
  v_item_id uuid;
  v_sort integer := 0;
begin
  v_version := app._swot_version_for_edit(p_version_id);

  update app.swot_items
  set deleted_at = now(), updated_at = now()
  where version_id = p_version_id
    and quadrant = p_quadrant
    and deleted_at is null;

  if p_statements is not null and jsonb_typeof(p_statements) = 'array' then
    for v_row in select * from jsonb_array_elements(p_statements)
    loop
      if length(trim(coalesce(v_row->>'statement', ''))) < 2 then
        continue;
      end if;
      insert into app.swot_items (
        version_id, tenant_id, quadrant, statement, origin, sort_order, created_by
      )
      values (
        p_version_id,
        v_version.tenant_id,
        p_quadrant,
        left(trim(v_row->>'statement'), 2000),
        coalesce(nullif(v_row->>'origin', ''), 'manual'),
        v_sort,
        auth.uid()
      )
      returning id into v_item_id;
      v_sort := v_sort + 1;
      perform app._swot_replace_refs(v_item_id, v_version, v_row->'refs');
    end loop;
  end if;

  perform app._swot_invalidate_review(p_version_id);
  perform app._swot_touch(p_version_id);
end;
$$;

grant execute on function app.replace_swot_quadrant(uuid, app.swot_quadrant, jsonb) to authenticated;

create or replace function app.save_swot_ai_result(
  p_version_id uuid,
  p_quadrants jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.swot_versions;
  v_key text;
  v_quadrant app.swot_quadrant;
  v_items jsonb;
  v_row jsonb;
  v_item_id uuid;
  v_sort integer;
begin
  v_version := app._swot_version_for_edit(p_version_id);

  for v_key in select jsonb_object_keys(p_quadrants)
  loop
    v_quadrant := v_key::app.swot_quadrant;
    update app.swot_items
    set deleted_at = now(), updated_at = now()
    where version_id = p_version_id
      and quadrant = v_quadrant
      and origin = 'ai'
      and deleted_at is null;

    v_items := p_quadrants -> v_key;
    v_sort := coalesce((
      select max(sort_order) + 1 from app.swot_items
      where version_id = p_version_id and quadrant = v_quadrant and deleted_at is null
    ), 0);

    if v_items is not null and jsonb_typeof(v_items) = 'array' then
      for v_row in select * from jsonb_array_elements(v_items)
      loop
        if length(trim(coalesce(v_row->>'statement', ''))) < 2 then
          continue;
        end if;
        insert into app.swot_items (
          version_id, tenant_id, quadrant, statement, origin, sort_order
        )
        values (
          p_version_id,
          v_version.tenant_id,
          v_quadrant,
          left(trim(v_row->>'statement'), 2000),
          'ai',
          v_sort
        )
        returning id into v_item_id;
        v_sort := v_sort + 1;
        perform app._swot_replace_refs(v_item_id, v_version, v_row->'refs');
      end loop;
    end if;
  end loop;

  update app.swot_versions
  set ai_generated_at = now(), adjustment_note = ''
  where id = p_version_id;
  perform app._swot_invalidate_review(p_version_id);
  perform app._swot_touch(p_version_id);
end;
$$;

grant execute on function app.save_swot_ai_result(uuid, jsonb) to authenticated;

create or replace function app.set_swot_adjustment_note(p_version_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  perform app._swot_version_for_edit(p_version_id);
  update app.swot_versions
  set adjustment_note = left(trim(coalesce(p_note, '')), 4000)
  where id = p_version_id;
  perform app._swot_touch(p_version_id);
end;
$$;

grant execute on function app.set_swot_adjustment_note(uuid, text) to authenticated;

create or replace function app.set_swot_advisor_reviewed(p_version_id uuid, p_reviewed boolean)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  perform app._swot_version_for_edit(p_version_id);
  update app.swot_versions
  set advisor_reviewed = coalesce(p_reviewed, false), updated_at = now()
  where id = p_version_id;
end;
$$;

grant execute on function app.set_swot_advisor_reviewed(uuid, boolean) to authenticated;

create or replace function app.approve_swot_version(
  p_version_id uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.swot_versions;
  v_five_c uuid;
  v_count integer;
begin
  v_version := app._swot_version_for_edit(p_version_id);

  if p_expected_updated_at is not null and v_version.updated_at <> p_expected_updated_at then
    raise exception 'Versie is intussen gewijzigd; herlaad de pagina';
  end if;

  select id into v_five_c from app.five_c_versions
  where tenant_id = v_version.tenant_id and status = 'approved'::app.five_c_version_status
  order by version_number desc limit 1;

  if v_five_c is null then
    raise exception '5C-analyse moet goedgekeurd zijn vóór SWOT-goedkeuring';
  end if;
  if v_version.five_c_version_id is distinct from v_five_c then
    raise exception 'Er is een nieuwere goedgekeurde 5C; herlaad en werk de SWOT bij';
  end if;

  select count(*) into v_count
  from app.swot_items
  where version_id = p_version_id and deleted_at is null;

  if exists (
    select 1 from unnest(enum_range(null::app.swot_quadrant)) q
    where not exists (
      select 1 from app.swot_items i
      where i.version_id = p_version_id and i.quadrant = q and i.deleted_at is null
    )
  ) then
    raise exception 'Vul minstens één punt in per kwadrant (S, W, O, T)';
  end if;

  if not v_version.advisor_reviewed then
    raise exception 'Beoordeel de SWOT eerst (goedkeuren in de werkruimte)';
  end if;

  update app.swot_versions
  set
    status = 'approved'::app.swot_version_status,
    approved_by = auth.uid(),
    approved_at = now(),
    updated_at = now()
  where id = p_version_id;
end;
$$;

grant execute on function app.approve_swot_version(uuid, timestamptz) to authenticated;

-- Voortgang hub
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

  return jsonb_build_object(
    'pestel_approved', v_pestel is not null,
    'pestel_version_id', v_pestel,
    'porter_approved', v_porter is not null,
    'porter_version_id', v_porter,
    'five_c_approved', v_five_c is not null,
    'five_c_version_id', v_five_c,
    'swot_approved', v_swot is not null,
    'swot_version_id', v_swot
  );
end;
$$;

grant execute on function app.get_audit_framework_progress(uuid) to authenticated;

revoke execute on function app._swot_version_for_edit(uuid) from public, anon, authenticated;
revoke execute on function app._swot_ref_valid(app.swot_versions, app.swot_ref_type, uuid)
  from public, anon, authenticated;
revoke execute on function app._swot_replace_refs(uuid, app.swot_versions, jsonb)
  from public, anon, authenticated;
revoke execute on function app._swot_touch(uuid) from public, anon, authenticated;
revoke execute on function app._swot_invalidate_review(uuid) from public, anon, authenticated;
