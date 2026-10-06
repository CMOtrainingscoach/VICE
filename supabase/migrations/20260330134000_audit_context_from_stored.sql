-- Bewaar het audit-markdown ook als de brand audit al goedgekeurd is.
-- Draai na 20260330133900. Dit wijzigt de brand audit zelf niet.

create or replace function app.store_audit_context_if_missing(p_version_id uuid, p_markdown text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_doc app.audit_context_documents;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_row := null;
  select * into v_row from app.brand_versions where id = p_version_id;
  if v_row is null then raise exception 'Brand audit niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if length(btrim(coalesce(p_markdown, ''))) < 40 then
    raise exception 'Het contextbestand is leeg.';
  end if;
  v_doc := null;
  select * into v_doc from app.audit_context_documents where brand_version_id = p_version_id;
  if v_doc is not null then
    return jsonb_build_object('id', v_doc.id, 'status', v_doc.status, 'saved_at', v_doc.saved_at);
  end if;
  v_status := case when v_row.status = 'approved' then 'final' else 'draft' end;
  insert into app.audit_context_documents (tenant_id, brand_version_id, markdown, status, saved_at, finalized_at, finalized_by)
  values (
    v_row.tenant_id,
    p_version_id,
    p_markdown,
    v_status,
    now(),
    case when v_status = 'final' then now() else null end,
    case when v_status = 'final' then auth.uid() else null end
  )
  returning * into v_doc;
  return jsonb_build_object('id', v_doc.id, 'status', v_doc.status, 'saved_at', v_doc.saved_at);
end;
$$;

revoke execute on function app.store_audit_context_if_missing(uuid, text) from public, anon;
grant execute on function app.store_audit_context_if_missing(uuid, text) to authenticated;
