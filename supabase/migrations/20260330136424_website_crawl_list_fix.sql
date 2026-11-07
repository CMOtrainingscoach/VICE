-- Fix list_website_crawl_pages (scalar subquery had two SELECT columns). Draai na 20260330136423.

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

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
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
        )
        order by p.page_type, p.url_path
      ),
      '[]'::jsonb
    )
    from app.tenant_website_pages p
    where p.tenant_id = list_website_crawl_pages.p_tenant_id
      and (p_include_archived or not p.archived)
      and (v_search = '' or lower(p.url) like '%' || v_search || '%' or lower(p.title) like '%' || v_search || '%')
      and (btrim(coalesce(p_page_type, '')) = '' or p.page_type = p_page_type)
      and (btrim(coalesce(p_language, '')) = '' or p.language = p_language)
      and (btrim(coalesce(p_crawl_state, '')) = '' or p.crawl_state = p_crawl_state)
  );
end;
$$;

grant execute on function app.list_website_crawl_pages(uuid, text, text, text, text, boolean) to authenticated;
