-- Search Console + GA4 metrics storage. Draai na 20260330135400.

alter table app.blog_concepts
  add column if not exists published_url text not null default '',
  add column if not exists published_post_id text not null default '',
  add column if not exists published_at timestamptz;

create table if not exists app.tenant_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  kind text not null check (kind in (
    'gsc_queries', 'gsc_pages', 'ga_channels', 'ga_landing_pages', 'ga_audience', 'url_inspection'
  )),
  data jsonb not null default '{}'::jsonb,
  period_start date not null,
  period_end date not null,
  fetched_at timestamptz not null default now(),
  unique (tenant_id, kind)
);

create index if not exists tenant_metric_snapshots_tenant_idx
  on app.tenant_metric_snapshots (tenant_id, fetched_at desc);

create table if not exists app.tenant_metric_daily (
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  date date not null,
  gsc_clicks integer not null default 0,
  gsc_impressions integer not null default 0,
  gsc_ctr double precision not null default 0,
  gsc_position double precision not null default 0,
  ga_sessions integer not null default 0,
  ga_users integer not null default 0,
  ga_key_events integer not null default 0,
  primary key (tenant_id, date)
);

create index if not exists tenant_metric_daily_tenant_date_idx
  on app.tenant_metric_daily (tenant_id, date desc);

create table if not exists app.tenant_performance_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  period_month date not null,
  markdown text not null default '',
  model text not null default '',
  created_at timestamptz not null default now(),
  unique (tenant_id, period_month)
);

alter table app.tenant_metric_snapshots enable row level security;
alter table app.tenant_metric_daily enable row level security;
alter table app.tenant_performance_reports enable row level security;

create or replace function app._blog_concept_json(p_row app.blog_concepts)
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
declare
  v_visuals jsonb;
  v_selected jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'storagePath', v.storage_path,
    'mimeType', v.mime_type,
    'width', v.width,
    'height', v.height,
    'prompt', v.prompt,
    'styleSummary', v.style_summary,
    'altText', v.alt_text,
    'brandVersionNumber', v.brand_version_number,
    'basedOnTitle', v.based_on_title,
    'createdAt', v.created_at
  ) order by v.created_at desc), '[]'::jsonb)
  into v_visuals
  from app.blog_visuals v
  where v.concept_id = p_row.id;

  v_selected := null;
  if p_row.selected_visual_id is not null then
    select jsonb_build_object(
      'id', v.id,
      'storagePath', v.storage_path,
      'mimeType', v.mime_type,
      'width', v.width,
      'height', v.height,
      'prompt', v.prompt,
      'styleSummary', v.style_summary,
      'altText', v.alt_text,
      'brandVersionNumber', v.brand_version_number,
      'basedOnTitle', v.based_on_title,
      'createdAt', v.created_at
    )
    into v_selected
    from app.blog_visuals v
    where v.id = p_row.selected_visual_id;
  end if;

  return jsonb_build_object(
    'id', p_row.id,
    'tenantId', p_row.tenant_id,
    'mode', p_row.mode,
    'language', p_row.language,
    'lengthKey', p_row.length_key,
    'sourceText', p_row.source_text,
    'title', p_row.title,
    'bodyHtml', p_row.body_html,
    'bodyPlain', p_row.body_plain,
    'wordCount', p_row.word_count,
    'brandId', p_row.brand_id,
    'brandVersionNumber', p_row.brand_version_number,
    'brandVoiceSnapshot', p_row.brand_voice_snapshot,
    'brandVisualSnapshot', p_row.brand_visual_snapshot,
    'selectedVisualId', p_row.selected_visual_id,
    'selectedVisual', v_selected,
    'visuals', v_visuals,
    'textJobStatus', p_row.text_job_status,
    'textJobError', p_row.text_job_error,
    'imageJobStatus', p_row.image_job_status,
    'imageJobError', p_row.image_job_error,
    'publishedUrl', nullif(p_row.published_url, ''),
    'publishedPostId', nullif(p_row.published_post_id, ''),
    'publishedAt', p_row.published_at,
    'createdAt', p_row.created_at,
    'updatedAt', p_row.updated_at
  );
end;
$$;

create or replace function app.list_blog_concepts(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'title', nullif(c.title, ''),
    'sourceText', left(c.source_text, 120),
    'updatedAt', c.updated_at,
    'wordCount', c.word_count,
    'brandVersionNumber', c.brand_version_number,
    'publishedUrl', nullif(c.published_url, ''),
    'publishedPostId', nullif(c.published_post_id, ''),
    'publishedAt', c.published_at
  ) order by c.updated_at desc), '[]'::jsonb)
  into v_rows
  from app.blog_concepts c
  where c.tenant_id = p_tenant_id;
  return v_rows;
end;
$$;

create or replace function app.mark_blog_concept_published(
  p_concept_id uuid,
  p_url text,
  p_post_id text
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.blog_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.blog_concepts where id = p_concept_id for update;
  if v_row.id is null then raise exception 'Concept niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  update app.blog_concepts set
    published_url = coalesce(p_url, ''),
    published_post_id = coalesce(p_post_id, ''),
    published_at = now(),
    updated_at = now(),
    updated_by = auth.uid()
  where id = p_concept_id
  returning * into v_row;

  return app._blog_concept_json(v_row);
end;
$$;

create or replace function app.get_tenant_metrics(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_snapshots jsonb;
  v_last_fetched timestamptz;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', s.kind,
    'data', s.data,
    'periodStart', s.period_start,
    'periodEnd', s.period_end,
    'fetchedAt', s.fetched_at
  ) order by s.kind), '[]'::jsonb),
  max(s.fetched_at)
  into v_snapshots, v_last_fetched
  from app.tenant_metric_snapshots s
  where s.tenant_id = p_tenant_id;

  return jsonb_build_object(
    'snapshots', coalesce(v_snapshots, '[]'::jsonb),
    'lastFetchedAt', v_last_fetched
  );
end;
$$;

create or replace function app.list_tenant_metric_daily(p_tenant_id uuid, p_from date default null)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_from date;
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  v_from := coalesce(p_from, (current_date - interval '90 days')::date);

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', d.date,
    'gscClicks', d.gsc_clicks,
    'gscImpressions', d.gsc_impressions,
    'gscCtr', d.gsc_ctr,
    'gscPosition', d.gsc_position,
    'gaSessions', d.ga_sessions,
    'gaUsers', d.ga_users,
    'gaKeyEvents', d.ga_key_events
  ) order by d.date asc), '[]'::jsonb)
  into v_rows
  from app.tenant_metric_daily d
  where d.tenant_id = p_tenant_id and d.date >= v_from;

  return v_rows;
end;
$$;

create or replace function app.list_metric_overview()
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'tenantId', t.id,
      'tenantName', t.name,
      'lastFetchedAt', (
        select max(s.fetched_at) from app.tenant_metric_snapshots s where s.tenant_id = t.id
      ),
      'gscLastError', coalesce((
        select i.last_error from app.tenant_integrations i
        where i.tenant_id = t.id and i.provider = 'search_console'
      ), ''),
      'gaLastError', coalesce((
        select i.last_error from app.tenant_integrations i
        where i.tenant_id = t.id and i.provider = 'google_analytics'
      ), ''),
      'gscConnected', exists (
        select 1 from app.tenant_integrations i
        where i.tenant_id = t.id and i.provider = 'search_console'
          and i.status = 'connected' and coalesce(i.refresh_token, '') <> ''
      ),
      'gaConnected', exists (
        select 1 from app.tenant_integrations i
        where i.tenant_id = t.id and i.provider = 'google_analytics'
          and i.status = 'connected' and coalesce(i.refresh_token, '') <> ''
      ),
      'daily', coalesce((
        select jsonb_agg(jsonb_build_object(
          'date', d.date,
          'gscClicks', d.gsc_clicks,
          'gaSessions', d.ga_sessions,
          'gaKeyEvents', d.ga_key_events
        ) order by d.date asc)
        from app.tenant_metric_daily d
        where d.tenant_id = t.id and d.date >= (current_date - interval '56 days')::date
      ), '[]'::jsonb),
      'snapshots', coalesce((
        select jsonb_agg(jsonb_build_object('kind', s.kind, 'data', s.data, 'fetchedAt', s.fetched_at))
        from app.tenant_metric_snapshots s where s.tenant_id = t.id
      ), '[]'::jsonb)
    )
    order by t.name
  ), '[]'::jsonb)
  into v_rows
  from app.tenants t
  where app.has_capability(t.id, 'audit.edit');

  return v_rows;
end;
$$;

create or replace function app.list_tenant_performance_reports(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'periodMonth', r.period_month,
      'markdown', r.markdown,
      'model', r.model,
      'createdAt', r.created_at
    ) order by r.period_month desc)
    from app.tenant_performance_reports r
    where r.tenant_id = p_tenant_id
  ), '[]'::jsonb);
end;
$$;

create or replace function app.get_tenant_performance_report(p_tenant_id uuid, p_period_month date)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.tenant_performance_reports;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select * into v_row
  from app.tenant_performance_reports
  where tenant_id = p_tenant_id and period_month = p_period_month;

  if v_row.id is null then return null; end if;

  return jsonb_build_object(
    'periodMonth', v_row.period_month,
    'markdown', v_row.markdown,
    'model', v_row.model,
    'createdAt', v_row.created_at
  );
end;
$$;

create or replace function app.upsert_tenant_performance_report(
  p_tenant_id uuid,
  p_period_month date,
  p_markdown text,
  p_model text
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.tenant_performance_reports;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  insert into app.tenant_performance_reports (tenant_id, period_month, markdown, model)
  values (p_tenant_id, p_period_month, coalesce(p_markdown, ''), coalesce(p_model, ''))
  on conflict (tenant_id, period_month) do update set
    markdown = excluded.markdown,
    model = excluded.model,
    created_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'periodMonth', v_row.period_month,
    'markdown', v_row.markdown,
    'model', v_row.model,
    'createdAt', v_row.created_at
  );
end;
$$;

revoke all on table app.tenant_metric_snapshots from public, anon, authenticated;
revoke all on table app.tenant_metric_daily from public, anon, authenticated;
revoke all on table app.tenant_performance_reports from public, anon, authenticated;

grant execute on function app.mark_blog_concept_published(uuid, text, text) to authenticated;
grant execute on function app.get_tenant_metrics(uuid) to authenticated;
grant execute on function app.list_tenant_metric_daily(uuid, date) to authenticated;
grant execute on function app.list_metric_overview() to authenticated;
grant execute on function app.list_tenant_performance_reports(uuid) to authenticated;
grant execute on function app.get_tenant_performance_report(uuid, date) to authenticated;
grant execute on function app.upsert_tenant_performance_report(uuid, date, text, text) to authenticated;
