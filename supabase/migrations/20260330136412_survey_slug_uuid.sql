-- Publish failed: gen_random_bytes requires pgcrypto. Use gen_random_uuid() for public slugs.

create extension if not exists pgcrypto with schema extensions;

create or replace function app._survey_slug()
returns text
language sql
volatile
set search_path = app, public, extensions
as $$
  select substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 16);
$$;
