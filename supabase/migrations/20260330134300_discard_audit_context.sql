-- Verwijder een concept-auditbestand dat niet als merkbron nodig is.
-- Draai na 20260330134200.

create or replace function app.discard_audit_context_document(p_tenant_id uuid, p_document_id uuid)
returns void
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
  select * into v_doc from app.audit_context_documents where id = p_document_id;
  if v_doc is null then return; end if;
  if v_doc.tenant_id <> p_tenant_id then raise exception 'Dit document hoort bij een andere klant.'; end if;
  delete from app.audit_context_documents where id = p_document_id;
end;
$$;

revoke execute on function app.discard_audit_context_document(uuid, uuid) from public, anon;
grant execute on function app.discard_audit_context_document(uuid, uuid) to authenticated;
