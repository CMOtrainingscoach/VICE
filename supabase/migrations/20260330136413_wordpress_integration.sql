-- WordPress sitekoppeling (Application Password + REST API). Draai na 20260330135400.

alter table app.tenant_integrations
  drop constraint if exists tenant_integrations_provider_check;

alter table app.tenant_integrations
  add constraint tenant_integrations_provider_check
  check (provider in ('blogger', 'search_console', 'google_analytics', 'wordpress'));

create or replace function app.get_tenant_integration_public(p_tenant_id uuid, p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.tenant_integrations;
  v_connected boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select * into v_row
  from app.tenant_integrations
  where tenant_id = p_tenant_id and provider = p_provider;

  if v_row.id is null then
    return jsonb_build_object(
      'connected', false,
      'status', 'disconnected',
      'accountEmail', '',
      'blogId', null,
      'blogName', null,
      'blogUrl', null,
      'siteUrl', null,
      'siteName', null,
      'propertyId', null,
      'propertyName', null,
      'accountId', null,
      'lastError', ''
    );
  end if;

  if p_provider = 'wordpress' then
    v_connected := v_row.status = 'connected'
      and coalesce(v_row.access_token, '') <> ''
      and coalesce(v_row.metadata->>'siteUrl', '') <> '';
  else
    v_connected := v_row.status = 'connected' and coalesce(v_row.refresh_token, '') <> '';
  end if;

  return jsonb_build_object(
    'connected', v_connected,
    'status', v_row.status,
    'accountEmail', v_row.account_email,
    'blogId', v_row.metadata->>'blogId',
    'blogName', v_row.metadata->>'blogName',
    'blogUrl', v_row.metadata->>'blogUrl',
    'siteUrl', v_row.metadata->>'siteUrl',
    'siteName', v_row.metadata->>'siteName',
    'propertyId', v_row.metadata->>'propertyId',
    'propertyName', v_row.metadata->>'propertyName',
    'accountId', v_row.metadata->>'accountId',
    'lastError', v_row.last_error,
    'updatedAt', v_row.updated_at
  );
end;
$$;
