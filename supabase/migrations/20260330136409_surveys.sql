-- Enquêtes: tenant surveys, branching flow definition, public responses.

create table if not exists app.surveys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  title text not null default 'Nieuwe enquête',
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  public_slug text unique,
  definition jsonb not null default '{"version":1,"nodes":[],"edges":[],"settings":{}}'::jsonb,
  response_count int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create index if not exists surveys_tenant_updated_idx on app.surveys (tenant_id, updated_at desc);
create unique index if not exists surveys_public_slug_idx on app.surveys (public_slug) where public_slug is not null;

create table if not exists app.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references app.surveys (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  definition_version int not null default 1,
  status text not null default 'completed' check (status in ('partial', 'completed')),
  answers jsonb not null default '{}'::jsonb,
  contact jsonb,
  user_agent text,
  referrer text,
  submitted_at timestamptz not null default now()
);

create index if not exists survey_responses_survey_submitted_idx
  on app.survey_responses (survey_id, submitted_at desc);

alter table app.surveys enable row level security;
alter table app.survey_responses enable row level security;

create or replace function app._survey_slug()
returns text
language sql
volatile
set search_path = app, public
as $$
  select substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 16);
$$;

create or replace function app._survey_json(p_row app.surveys, p_include_definition boolean default true)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'tenantId', p_row.tenant_id,
    'title', p_row.title,
    'status', p_row.status,
    'publicSlug', p_row.public_slug,
    'responseCount', p_row.response_count,
    'publishedAt', p_row.published_at,
    'updatedAt', p_row.updated_at,
    'createdAt', p_row.created_at
  ) || case
    when p_include_definition then jsonb_build_object('definition', p_row.definition)
    else '{}'::jsonb
  end;
$$;

create or replace function app.list_surveys(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  return coalesce((
    select jsonb_agg(
      app._survey_json(s, false)
      order by s.updated_at desc
    )
    from app.surveys s
    where s.tenant_id = p_tenant_id
  ), '[]'::jsonb);
end;
$$;

create or replace function app.create_survey(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.surveys;
  v_welcome uuid := gen_random_uuid();
  v_thank uuid := gen_random_uuid();
  v_def jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  v_def := jsonb_build_object(
    'version', 1,
    'nodes', jsonb_build_array(
      jsonb_build_object(
        'id', v_welcome::text,
        'type', 'welcome',
        'position', jsonb_build_object('x', 80, 'y', 120),
        'data', jsonb_build_object(
          'screenTitle', 'Welkom',
          'screenDescription', 'Bedankt voor je tijd. Klik op Start om te beginnen.',
          'buttonLabel', 'Start'
        )
      ),
      jsonb_build_object(
        'id', v_thank::text,
        'type', 'thank_you',
        'position', jsonb_build_object('x', 80, 'y', 320),
        'data', jsonb_build_object(
          'screenTitle', 'Bedankt!',
          'screenDescription', 'Je antwoorden zijn ontvangen.'
        )
      )
    ),
    'edges', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'source', v_welcome::text,
        'target', v_thank::text
      )
    ),
    'settings', jsonb_build_object(
      'askContact', false,
      'contactRequired', false,
      'privacyText', ''
    )
  );

  insert into app.surveys (tenant_id, definition, created_by, updated_by)
  values (p_tenant_id, v_def, auth.uid(), auth.uid())
  returning * into v_row;

  return app._survey_json(v_row, true);
end;
$$;

create or replace function app.get_survey(p_survey_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.surveys;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from app.surveys where id = p_survey_id;
  if v_row.id is null then raise exception 'Enquête niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  return app._survey_json(v_row, true);
end;
$$;

create or replace function app.save_survey(
  p_survey_id uuid,
  p_expected timestamptz,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.surveys;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from app.surveys where id = p_survey_id for update;
  if v_row.id is null then raise exception 'Enquête niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_row.updated_at is distinct from p_expected then
    raise exception 'Enquête is intussen gewijzigd. Herlaad de pagina.';
  end if;

  update app.surveys set
    title = case when p_patch ? 'title' then left(coalesce(p_patch->>'title', title), 200) else title end,
    definition = case when p_patch ? 'definition' then coalesce(p_patch->'definition', definition) else definition end,
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_row.id
  returning * into v_row;

  return app._survey_json(v_row, true);
end;
$$;

create or replace function app.publish_survey(
  p_survey_id uuid,
  p_brand_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.surveys;
  v_def jsonb;
  v_welcome int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from app.surveys where id = p_survey_id for update;
  if v_row.id is null then raise exception 'Enquête niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  v_def := v_row.definition;
  select count(*) into v_welcome
  from jsonb_array_elements(coalesce(v_def->'nodes', '[]'::jsonb)) n
  where n->>'type' = 'welcome';

  if v_welcome <> 1 then
    raise exception 'Publiceren vereist precies één Welkom-scherm.';
  end if;

  if v_row.public_slug is null then
    v_row.public_slug := app._survey_slug();
  end if;

  v_def := jsonb_set(
    v_def,
    '{settings,brandSnapshot}',
    coalesce(p_brand_snapshot, '{}'::jsonb),
    true
  );
  v_def := jsonb_set(v_def, '{version}', to_jsonb(coalesce((v_def->>'version')::int, 1) + 1), true);

  update app.surveys set
    status = 'published',
    public_slug = v_row.public_slug,
    definition = v_def,
    published_at = coalesce(published_at, now()),
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_row.id
  returning * into v_row;

  return app._survey_json(v_row, true);
end;
$$;

create or replace function app.close_survey(p_survey_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.surveys;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from app.surveys where id = p_survey_id for update;
  if v_row.id is null then raise exception 'Enquête niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  update app.surveys set status = 'closed', updated_at = now(), updated_by = auth.uid()
  where id = v_row.id
  returning * into v_row;

  return app._survey_json(v_row, true);
end;
$$;

create or replace function app.delete_survey(p_survey_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.surveys;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from app.surveys where id = p_survey_id for update;
  if v_row.id is null then raise exception 'Enquête niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  delete from app.surveys where id = v_row.id;
  return jsonb_build_object('tenantId', v_row.tenant_id, 'id', v_row.id);
end;
$$;

create or replace function app.get_published_survey_by_slug(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.surveys;
begin
  if p_slug is null or length(trim(p_slug)) < 8 then
    return null;
  end if;

  select * into v_row
  from app.surveys
  where public_slug = p_slug and status = 'published';

  if v_row.id is null then return null; end if;

  return jsonb_build_object(
    'id', v_row.id,
    'title', v_row.title,
    'definition', v_row.definition,
    'definitionVersion', coalesce((v_row.definition->>'version')::int, 1)
  );
end;
$$;

create or replace function app.submit_survey_response(
  p_slug text,
  p_answers jsonb,
  p_contact jsonb default null,
  p_user_agent text default null,
  p_referrer text default null
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.surveys;
  v_version int;
begin
  if p_slug is null or length(trim(p_slug)) < 8 then
    raise exception 'Ongeldige enquête.';
  end if;

  select * into v_row
  from app.surveys
  where public_slug = p_slug and status = 'published'
  for update;

  if v_row.id is null then raise exception 'Enquête niet gevonden of niet open.'; end if;

  v_version := coalesce((v_row.definition->>'version')::int, 1);

  insert into app.survey_responses (
    survey_id,
    tenant_id,
    definition_version,
    status,
    answers,
    contact,
    user_agent,
    referrer
  ) values (
    v_row.id,
    v_row.tenant_id,
    v_version,
    'completed',
    coalesce(p_answers, '{}'::jsonb),
    p_contact,
    left(coalesce(p_user_agent, ''), 500),
    left(coalesce(p_referrer, ''), 500)
  );

  update app.surveys set response_count = response_count + 1 where id = v_row.id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function app.list_survey_responses(p_survey_id uuid, p_limit int default 200)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.surveys;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from app.surveys where id = p_survey_id;
  if v_row.id is null then raise exception 'Enquête niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'submittedAt', r.submitted_at,
      'answers', r.answers,
      'contact', r.contact,
      'definitionVersion', r.definition_version
    ) order by r.submitted_at desc)
    from (
      select * from app.survey_responses
      where survey_id = p_survey_id
      order by submitted_at desc
      limit greatest(1, least(coalesce(p_limit, 200), 500))
    ) r
  ), '[]'::jsonb);
end;
$$;

revoke execute on function app._survey_slug() from public, anon, authenticated;
revoke execute on function app._survey_json(app.surveys, boolean) from public, anon, authenticated;

revoke execute on function app.list_surveys(uuid) from public, anon;
revoke execute on function app.create_survey(uuid) from public, anon;
revoke execute on function app.get_survey(uuid) from public, anon;
revoke execute on function app.save_survey(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function app.publish_survey(uuid, jsonb) from public, anon;
revoke execute on function app.close_survey(uuid) from public, anon;
revoke execute on function app.delete_survey(uuid) from public, anon;
revoke execute on function app.list_survey_responses(uuid, int) from public, anon;

grant execute on function app.list_surveys(uuid) to authenticated;
grant execute on function app.create_survey(uuid) to authenticated;
grant execute on function app.get_survey(uuid) to authenticated;
grant execute on function app.save_survey(uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.publish_survey(uuid, jsonb) to authenticated;
grant execute on function app.close_survey(uuid) to authenticated;
grant execute on function app.delete_survey(uuid) to authenticated;
grant execute on function app.list_survey_responses(uuid, int) to authenticated;

grant execute on function app.get_published_survey_by_slug(text) to anon, authenticated;
grant execute on function app.submit_survey_response(text, jsonb, jsonb, text, text) to anon, authenticated;
