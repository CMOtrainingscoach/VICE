-- Eén strategisch markdownbestand per klant, handmatig geüpload.
-- Geen frameworks. Draai na 20260330134500.

alter table app.audit_context_documents
  add column if not exists source_file_name text;

-- Houd per klant het nieuwste bestand. Oudere rijen verdwijnen.
delete from app.audit_context_documents d
where d.id not in (
  select distinct on (tenant_id) id
  from app.audit_context_documents
  order by tenant_id, (status = 'final') desc, saved_at desc
);

create unique index if not exists audit_context_documents_one_per_tenant
  on app.audit_context_documents (tenant_id);

create or replace function app.get_strategy_document(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_doc app.audit_context_documents;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  v_doc := null;
  select d.* into v_doc
  from app.audit_context_documents d
  where d.tenant_id = p_tenant_id
  limit 1;
  if v_doc.id is null then return null; end if;
  return jsonb_build_object(
    'id', v_doc.id,
    'markdown', v_doc.markdown,
    'status', v_doc.status,
    'saved_at', v_doc.saved_at,
    'source_file_name', v_doc.source_file_name
  );
end;
$$;

create or replace function app.save_strategy_document(p_tenant_id uuid, p_markdown text, p_file_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_doc_id uuid;
  v_saved timestamptz;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if not exists (select 1 from app.tenants where id = p_tenant_id and deleted_at is null) then
    raise exception 'Klant niet gevonden';
  end if;
  if length(btrim(coalesce(p_markdown, ''))) < 40 then
    raise exception 'Het bestand is te kort om op te slaan.';
  end if;
  if length(coalesce(p_markdown, '')) > 500000 then
    raise exception 'Dit bestand is te groot. Gebruik maximaal 500.000 tekens.';
  end if;

  v_name := nullif(btrim(coalesce(p_file_name, '')), '');
  if v_name is not null then
    v_name := left(v_name, 200);
  end if;

  v_doc_id := null;
  select id into v_doc_id from app.audit_context_documents where tenant_id = p_tenant_id;
  v_saved := now();

  if v_doc_id is not null then
    update app.audit_context_documents
    set markdown = p_markdown,
        status = 'draft',
        saved_at = v_saved,
        finalized_at = null,
        finalized_by = null,
        source_file_name = coalesce(v_name, source_file_name)
    where id = v_doc_id;
  else
    insert into app.audit_context_documents (tenant_id, brand_version_id, markdown, status, saved_at, source_file_name)
    values (p_tenant_id, null, p_markdown, 'draft', v_saved, v_name)
    returning id into v_doc_id;
  end if;

  return jsonb_build_object(
    'id', v_doc_id,
    'status', 'draft',
    'saved_at', v_saved,
    'source_file_name', coalesce(v_name, (select source_file_name from app.audit_context_documents where id = v_doc_id))
  );
end;
$$;

-- Houd de oude lees-RPC bruikbaar voor latere features.
create or replace function app.get_audit_context(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  return app.get_strategy_document(p_tenant_id);
end;
$$;

revoke execute on function app.get_strategy_document(uuid) from public, anon;
revoke execute on function app.save_strategy_document(uuid, text, text) from public, anon;
revoke execute on function app.get_audit_context(uuid) from public, anon;
grant execute on function app.get_strategy_document(uuid) to authenticated;
grant execute on function app.save_strategy_document(uuid, text, text) to authenticated;
grant execute on function app.get_audit_context(uuid) to authenticated;
