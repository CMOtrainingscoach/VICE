-- Afbeeldingen op enquête-schermen (kaarten). Publiek leesbaar zodra gepubliceerd.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'survey-assets',
  'survey-assets',
  true,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function app.survey_asset_tenant_from_path(p_path text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select nullif(split_part(p_path, '/', 1), '')::uuid;
$$;

create policy survey_assets_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'survey-assets'
    and app.has_capability(
      app.survey_asset_tenant_from_path(name),
      'audit.edit'
    )
  );

create policy survey_assets_storage_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'survey-assets'
    and app.has_capability(
      app.survey_asset_tenant_from_path(name),
      'audit.edit'
    )
  );

create policy survey_assets_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'survey-assets'
    and app.has_capability(
      app.survey_asset_tenant_from_path(name),
      'audit.edit'
    )
  );
