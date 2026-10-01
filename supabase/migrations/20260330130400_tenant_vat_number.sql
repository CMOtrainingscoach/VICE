-- BTW-nummer op klant (tenants) voor latere financiële koppelingen

alter table app.tenants
  add column if not exists vat_number text;

comment on column app.tenants.vat_number is 'Belgisch BTW-nummer, genormaliseerd (bv. BE0123456789)';

drop function if exists app.create_tenant(text, text, text, text, text, text);

create or replace function app.create_tenant(
  p_name text,
  p_website text default null,
  p_vat_number text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_audit_goal text default '',
  p_language text default 'nl'
)
returns app.tenants
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant app.tenants;
  v_vat text;
begin
  if not app.is_platform_admin() or not app.require_admin_mfa() then
    raise exception 'Forbidden';
  end if;

  v_vat := nullif(
    upper(regexp_replace(trim(coalesce(p_vat_number, '')), '[\s.\-]', '', 'g')),
    ''
  );

  insert into app.tenants (
    name,
    website,
    vat_number,
    contact_name,
    contact_email,
    audit_goal,
    language
  )
  values (
    trim(p_name),
    p_website,
    v_vat,
    p_contact_name,
    p_contact_email,
    coalesce(p_audit_goal, ''),
    coalesce(p_language, 'nl')
  )
  returning * into v_tenant;

  insert into app.tenant_memberships (tenant_id, user_id, role)
  values (v_tenant.id, auth.uid(), 'admin');

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id)
  values (v_tenant.id, auth.uid(), 'tenant.create', 'tenant', v_tenant.id::text);

  return v_tenant;
end;
$$;

grant execute on function app.create_tenant(text, text, text, text, text, text, text) to authenticated;

drop function if exists app.update_tenant(uuid, text, text, text, text, text, text);

create or replace function app.update_tenant(
  p_tenant_id uuid,
  p_name text,
  p_website text,
  p_vat_number text,
  p_contact_name text,
  p_contact_email text,
  p_audit_goal text,
  p_language text
)
returns app.tenants
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant app.tenants;
  v_vat text;
begin
  if not app.has_capability(p_tenant_id, 'tenant.update') or not app.require_admin_mfa() then
    raise exception 'Forbidden';
  end if;

  v_vat := nullif(
    upper(regexp_replace(trim(coalesce(p_vat_number, '')), '[\s.\-]', '', 'g')),
    ''
  );

  update app.tenants
  set
    name = trim(p_name),
    website = p_website,
    vat_number = v_vat,
    contact_name = p_contact_name,
    contact_email = p_contact_email,
    audit_goal = coalesce(p_audit_goal, ''),
    language = coalesce(p_language, 'nl'),
    updated_at = now()
  where id = p_tenant_id and deleted_at is null
  returning * into v_tenant;

  if v_tenant.id is null then
    raise exception 'Tenant not found';
  end if;

  return v_tenant;
end;
$$;

grant execute on function app.update_tenant(uuid, text, text, text, text, text, text, text) to authenticated;
