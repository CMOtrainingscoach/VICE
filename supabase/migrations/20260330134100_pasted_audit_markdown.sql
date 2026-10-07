-- Geplakte markdown voor de merkhandleiding, los van de brand audit.
-- Draai na 20260330134000.

alter table app.audit_context_documents alter column brand_version_id drop not null;

create or replace function app.store_pasted_audit_markdown(p_tenant_id uuid, p_markdown text)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if not exists (select 1 from app.tenants where id = p_tenant_id and deleted_at is null) then
    raise exception 'Klant niet gevonden';
  end if;
  if length(btrim(coalesce(p_markdown, ''))) < 40 then
    raise exception 'Plak de markdown van de audit.';
  end if;
  insert into app.audit_context_documents (tenant_id, brand_version_id, markdown, status)
  values (p_tenant_id, null, p_markdown, 'draft')
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function app.store_pasted_audit_markdown(uuid, text) from public, anon;
grant execute on function app.store_pasted_audit_markdown(uuid, text) to authenticated;
