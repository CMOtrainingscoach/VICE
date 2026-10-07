-- Bewaar het contextbestand van stap 11, ook als de brand audit al goedgekeurd is.
-- Draai na 20260330134100. Dit wijzigt de status van de brand audit niet.

create or replace function app.save_strategy_context(p_tenant_id uuid, p_markdown text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.brand_versions;
  v_doc app.audit_context_documents;
  v_id uuid;
  v_saved timestamptz;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if not exists (select 1 from app.tenants where id = p_tenant_id and deleted_at is null) then
    raise exception 'Klant niet gevonden';
  end if;
  if length(btrim(coalesce(p_markdown, ''))) < 40 then
    raise exception 'Het bestand is te kort om op te slaan.';
  end if;

  v_version := null;
  select * into v_version from app.brand_versions
  where tenant_id = p_tenant_id
  order by version_number desc
  limit 1;

  v_doc := null;
  if v_version is not null then
    select * into v_doc from app.audit_context_documents where brand_version_id = v_version.id;
  end if;
  if v_doc is null then
    v_doc := null;
    select * into v_doc from app.audit_context_documents
    where tenant_id = p_tenant_id
    order by saved_at desc
    limit 1;
  end if;

  v_saved := now();
  if v_doc is not null then
    update app.audit_context_documents
    set markdown = p_markdown,
        status = 'draft',
        saved_at = v_saved,
        finalized_at = null,
        finalized_by = null
    where id = v_doc.id;
    return jsonb_build_object('id', v_doc.id, 'status', 'draft', 'saved_at', v_saved);
  end if;

  if v_version is null and exists (
    select 1 from information_schema.columns
    where table_schema = 'app'
      and table_name = 'audit_context_documents'
      and column_name = 'brand_version_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'Pas migratie 20260330134100 toe in de Supabase SQL-editor, na 20260330134000.';
  end if;

  insert into app.audit_context_documents (tenant_id, brand_version_id, markdown, status, saved_at)
  values (p_tenant_id, case when v_version is null then null else v_version.id end, p_markdown, 'draft', v_saved)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'status', 'draft', 'saved_at', v_saved);
end;
$$;

revoke execute on function app.save_strategy_context(uuid, text) from public, anon;
grant execute on function app.save_strategy_context(uuid, text) to authenticated;
