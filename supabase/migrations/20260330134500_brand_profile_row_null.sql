-- Een merkprofiel zonder publicatie heeft published_version_id leeg.
-- v_profile IS NOT NULL is dan onwaar, ook al bestaat de rij.
-- Brand ziet daardoor geen versie en geen opgeslagen contextbestand.
-- Draai na 20260330134400.

create or replace function app.get_brand_profile(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_profile_id uuid;
  v_published_id uuid;
  v_version app.brand_profile_versions;
  v_version_id uuid;
  v_name text;
  v_edit boolean;
  v_newer jsonb;
  v_docs jsonb;
  v_base jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_edit := app.has_capability(p_tenant_id, 'audit.edit');
  if not v_edit and not app.has_capability(p_tenant_id, 'dashboard.read_published') then
    raise exception 'Forbidden';
  end if;
  v_name := null;
  select name into v_name from app.tenants where id = p_tenant_id and deleted_at is null;
  if v_name is null then raise exception 'Klant niet gevonden'; end if;

  v_profile_id := null;
  v_published_id := null;
  select id, published_version_id into v_profile_id, v_published_id
  from app.brand_profiles
  where tenant_id = p_tenant_id;

  if not v_edit then
    v_version := null;
    v_version_id := null;
    if v_published_id is not null then
      select id into v_version_id from app.brand_profile_versions where id = v_published_id;
    end if;
    if v_version_id is null then
      return jsonb_build_object('access', 'published', 'empty', true, 'tenantName', v_name);
    end if;
    select * into v_version from app.brand_profile_versions where id = v_version_id;
    return jsonb_build_object('access', 'published', 'empty', false, 'tenantName', v_name, 'publishedVersionId', v_version.id, 'version', app._brand_profile_version_json(v_version))
      || app._brand_profile_children(v_version.id, false);
  end if;

  v_version := null;
  v_version_id := null;
  if v_profile_id is not null then
    select id into v_version_id
    from app.brand_profile_versions
    where profile_id = v_profile_id
    order by version_number desc
    limit 1;
  end if;
  if v_version_id is not null then
    select * into v_version from app.brand_profile_versions where id = v_version_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'status', d.status, 'savedAt', d.saved_at, 'brandVersionId', d.brand_version_id
  ) order by d.saved_at desc), '[]'::jsonb)
  into v_docs
  from app.audit_context_documents d
  where d.tenant_id = p_tenant_id;

  v_newer := null;
  if v_version_id is not null and v_version.source_document_id is not null then
    select jsonb_build_object('id', d.id, 'status', d.status, 'savedAt', d.saved_at)
    into v_newer
    from app.audit_context_documents d
    where d.tenant_id = p_tenant_id
      and (
        (d.id = v_version.source_document_id and md5(d.markdown) is distinct from v_version.source_hash)
        or (d.id is distinct from v_version.source_document_id and v_version.source_saved_at is not null and d.saved_at > v_version.source_saved_at)
      )
    order by d.saved_at desc
    limit 1;
  end if;

  v_base := jsonb_build_object(
    'access', 'edit',
    'tenantName', v_name,
    'publishedVersionId', v_published_id,
    'documents', coalesce(v_docs, '[]'::jsonb),
    'newerSource', v_newer,
    'version', case when v_version_id is null then 'null'::jsonb else app._brand_profile_version_json(v_version) end
  );
  if v_version_id is null then
    return v_base || jsonb_build_object(
      'styles', '[]'::jsonb, 'fonts', '[]'::jsonb, 'colors', '[]'::jsonb, 'assets', '[]'::jsonb,
      'reviews', '[]'::jsonb, 'prompts', '[]'::jsonb, 'provenance', '[]'::jsonb
    );
  end if;
  return v_base || app._brand_profile_children(v_version.id, true);
end;
$$;

create or replace function app.get_brand_profile_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_doc app.audit_context_documents;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_doc := null;
  select * into v_doc from app.audit_context_documents where id = p_document_id;
  if v_doc.id is null then raise exception 'Auditdocument niet gevonden'; end if;
  if not app.has_capability(v_doc.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  return jsonb_build_object(
    'id', v_doc.id,
    'tenantId', v_doc.tenant_id,
    'status', v_doc.status,
    'savedAt', v_doc.saved_at,
    'markdown', v_doc.markdown,
    'hash', md5(v_doc.markdown)
  );
end;
$$;

create or replace function app.get_audit_context(p_tenant_id uuid)
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
  order by (d.status = 'final') desc, d.saved_at desc
  limit 1;
  if v_doc.id is null then return null; end if;
  return jsonb_build_object(
    'id', v_doc.id,
    'markdown', v_doc.markdown,
    'status', v_doc.status,
    'saved_at', v_doc.saved_at,
    'finalized_at', v_doc.finalized_at,
    'brand_version_id', v_doc.brand_version_id
  );
end;
$$;

revoke execute on function app.get_brand_profile(uuid) from public, anon;
revoke execute on function app.get_brand_profile_document(uuid) from public, anon;
revoke execute on function app.get_audit_context(uuid) from public, anon;
grant execute on function app.get_brand_profile(uuid) to authenticated;
grant execute on function app.get_brand_profile_document(uuid) to authenticated;
grant execute on function app.get_audit_context(uuid) to authenticated;
