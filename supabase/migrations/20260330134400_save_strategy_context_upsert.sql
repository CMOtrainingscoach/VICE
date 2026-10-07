-- Sla het contextbestand bij op het bestaande document.
-- v_row IS NOT NULL is onwaar zodra een kolom leeg is, bijvoorbeeld finalized_at.
-- Daardoor werd een nieuw bestand ingevoegd en botste dat op de unieke brandversie.
-- Draai na 20260330134300.

create or replace function app.save_strategy_context(p_tenant_id uuid, p_markdown text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version_id uuid;
  v_doc_id uuid;
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

  v_version_id := null;
  select id into v_version_id from app.brand_versions
  where tenant_id = p_tenant_id
  order by version_number desc
  limit 1;

  v_doc_id := null;
  if v_version_id is not null then
    select id into v_doc_id from app.audit_context_documents where brand_version_id = v_version_id;
  end if;
  if v_doc_id is null then
    select id into v_doc_id from app.audit_context_documents
    where tenant_id = p_tenant_id
    order by (brand_version_id is not null) desc, saved_at desc
    limit 1;
  end if;

  v_saved := now();
  if v_doc_id is not null then
    update app.audit_context_documents
    set markdown = p_markdown,
        status = 'draft',
        saved_at = v_saved,
        finalized_at = null,
        finalized_by = null
    where id = v_doc_id;
    return jsonb_build_object('id', v_doc_id, 'status', 'draft', 'saved_at', v_saved);
  end if;

  insert into app.audit_context_documents (tenant_id, brand_version_id, markdown, status, saved_at)
  values (p_tenant_id, v_version_id, p_markdown, 'draft', v_saved)
  on conflict (brand_version_id) do update
  set markdown = excluded.markdown,
      status = 'draft',
      saved_at = excluded.saved_at,
      finalized_at = null,
      finalized_by = null
  returning id into v_doc_id;

  return jsonb_build_object('id', v_doc_id, 'status', 'draft', 'saved_at', v_saved);
end;
$$;

revoke execute on function app.save_strategy_context(uuid, text) from public, anon;
grant execute on function app.save_strategy_context(uuid, text) to authenticated;
