-- Website crawl + pagina-geheugen per klant. Draai na 20260330136422.

create table if not exists app.tenant_website_crawl_settings (
  tenant_id uuid primary key references app.tenants (id) on delete cascade,
  sitemap_url text not null default '',
  crawl_frequency text not null default 'weekly'
    check (crawl_frequency in ('manual', 'weekly', 'monthly')),
  last_fetched_at timestamptz,
  source_host text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table if not exists app.tenant_website_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  url text not null,
  url_path text not null default '',
  page_type text not null default 'page',
  language text not null default '',
  crawl_state text not null default 'pending'
    check (crawl_state in ('pending', 'crawled', 'failed', 'skipped')),
  in_memory boolean not null default false,
  archived boolean not null default false,
  title text not null default '',
  http_status integer,
  last_crawled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, url)
);

create index tenant_website_pages_tenant_idx
  on app.tenant_website_pages (tenant_id, page_type, url_path);

alter table app.tenant_website_crawl_settings enable row level security;
alter table app.tenant_website_pages enable row level security;

create or replace function app.get_website_crawl_state(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_settings app.tenant_website_crawl_settings;
  v_total integer;
  v_memory integer;
  v_crawled integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select * into v_settings from app.tenant_website_crawl_settings where tenant_id = p_tenant_id;

  select count(*)::integer,
         count(*) filter (where in_memory)::integer,
         count(*) filter (where crawl_state = 'crawled')::integer
  into v_total, v_memory, v_crawled
  from app.tenant_website_pages
  where tenant_id = p_tenant_id and not archived;

  return jsonb_build_object(
    'sitemapUrl', coalesce(v_settings.sitemap_url, ''),
    'crawlFrequency', coalesce(v_settings.crawl_frequency, 'weekly'),
    'lastFetchedAt', v_settings.last_fetched_at,
    'sourceHost', coalesce(v_settings.source_host, ''),
    'pageCount', coalesce(v_total, 0),
    'memoryCount', coalesce(v_memory, 0),
    'crawledCount', coalesce(v_crawled, 0)
  );
end;
$$;

create or replace function app.list_website_crawl_pages(
  p_tenant_id uuid,
  p_search text default '',
  p_page_type text default '',
  p_language text default '',
  p_crawl_state text default '',
  p_include_archived boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_search text := lower(btrim(coalesce(p_search, '')));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'url', p.url,
      'urlPath', p.url_path,
      'pageType', p.page_type,
      'language', p.language,
      'crawlState', p.crawl_state,
      'inMemory', p.in_memory,
      'archived', p.archived,
      'title', p.title,
      'httpStatus', p.http_status,
      'lastCrawledAt', p.last_crawled_at
    ) order by p.page_type, p.url_path),
    '[]'::jsonb
    from app.tenant_website_pages p
    where p.tenant_id = p_tenant_id
      and (p_include_archived or not p.archived)
      and (v_search = '' or lower(p.url) like '%' || v_search || '%' or lower(p.title) like '%' || v_search || '%')
      and (btrim(coalesce(p_page_type, '')) = '' or p.page_type = p_page_type)
      and (btrim(coalesce(p_language, '')) = '' or p.language = p_language)
      and (btrim(coalesce(p_crawl_state, '')) = '' or p.crawl_state = p_crawl_state)
  ), '[]'::jsonb);
end;
$$;

create or replace function app.save_website_crawl_settings(
  p_tenant_id uuid,
  p_sitemap_url text,
  p_crawl_frequency text
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_freq text := coalesce(nullif(btrim(p_crawl_frequency), ''), 'weekly');
  v_url text := left(btrim(coalesce(p_sitemap_url, '')), 2000);
  v_host text := '';
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if length(v_url) < 8 then raise exception 'Geef een geldige sitemap-URL.'; end if;
  if v_freq not in ('manual', 'weekly', 'monthly') then raise exception 'Ongeldige crawl-frequentie'; end if;

  begin
    v_host := lower(split_part(split_part(v_url, '://', 2), '/', 1));
  exception when others then
    v_host := '';
  end;

  insert into app.tenant_website_crawl_settings (
    tenant_id, sitemap_url, crawl_frequency, source_host, updated_at, updated_by
  ) values (p_tenant_id, v_url, v_freq, coalesce(v_host, ''), now(), auth.uid())
  on conflict (tenant_id) do update set
    sitemap_url = excluded.sitemap_url,
    crawl_frequency = excluded.crawl_frequency,
    source_host = excluded.source_host,
    updated_at = now(),
    updated_by = auth.uid();

  return app.get_website_crawl_state(p_tenant_id);
end;
$$;

create or replace function app.merge_website_crawl_pages(p_tenant_id uuid, p_pages jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item jsonb;
  v_url text;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if p_pages is null or jsonb_typeof(p_pages) <> 'array' then raise exception 'Paginas moeten een array zijn'; end if;

  for v_item in select * from jsonb_array_elements(p_pages)
  loop
    v_url := btrim(coalesce(v_item->>'url', ''));
    if length(v_url) < 4 then continue; end if;

    insert into app.tenant_website_pages (
      tenant_id, url, url_path, page_type, language, crawl_state, in_memory,
      title, http_status, last_crawled_at
    ) values (
      p_tenant_id,
      v_url,
      coalesce(v_item->>'urlPath', ''),
      coalesce(nullif(v_item->>'pageType', ''), 'page'),
      coalesce(v_item->>'language', ''),
      coalesce(nullif(v_item->>'crawlState', ''), 'pending'),
      coalesce((v_item->>'inMemory')::boolean, false),
      coalesce(v_item->>'title', ''),
      nullif(v_item->>'httpStatus', '')::integer,
      case when v_item ? 'lastCrawledAt' then (v_item->>'lastCrawledAt')::timestamptz else null end
    )
    on conflict (tenant_id, url) do update set
      url_path = excluded.url_path,
      page_type = excluded.page_type,
      language = excluded.language,
      crawl_state = excluded.crawl_state,
      title = case when length(excluded.title) > 0 then excluded.title else app.tenant_website_pages.title end,
      http_status = coalesce(excluded.http_status, app.tenant_website_pages.http_status),
      last_crawled_at = coalesce(excluded.last_crawled_at, app.tenant_website_pages.last_crawled_at),
      in_memory = app.tenant_website_pages.in_memory;
  end loop;

  update app.tenant_website_crawl_settings
  set last_fetched_at = v_now,
      updated_at = v_now,
      updated_by = auth.uid()
  where tenant_id = p_tenant_id;

  return app.get_website_crawl_state(p_tenant_id);
end;
$$;

create or replace function app.set_website_page_in_memory(
  p_tenant_id uuid,
  p_page_id uuid,
  p_in_memory boolean
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  update app.tenant_website_pages
  set in_memory = coalesce(p_in_memory, false)
  where id = p_page_id and tenant_id = p_tenant_id;

  if not found then raise exception 'Pagina niet gevonden'; end if;

  return app.get_website_crawl_state(p_tenant_id);
end;
$$;

revoke all on table app.tenant_website_crawl_settings from public, anon, authenticated;
revoke all on table app.tenant_website_pages from public, anon, authenticated;

grant select, insert, update, delete on app.tenant_website_crawl_settings to service_role;
grant select, insert, update, delete on app.tenant_website_pages to service_role;

grant execute on function app.get_website_crawl_state(uuid) to authenticated;
grant execute on function app.list_website_crawl_pages(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function app.save_website_crawl_settings(uuid, text, text) to authenticated;
grant execute on function app.merge_website_crawl_pages(uuid, jsonb) to authenticated;
grant execute on function app.set_website_page_in_memory(uuid, uuid, boolean) to authenticated;
