-- Platform-brede koppelingen (Google Ads Keyword Planner). Draai na 20260330135700.

create table if not exists app.platform_integrations (
  provider text primary key check (provider in ('google_ads')),
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error')),
  account_email text not null default '',
  access_token text not null default '',
  refresh_token text not null default '',
  token_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table app.platform_integrations enable row level security;

create or replace function app.get_platform_integration_public(p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.platform_integrations;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.is_platform_admin() then raise exception 'Forbidden'; end if;

  select * into v_row from app.platform_integrations where provider = p_provider;

  if v_row.provider is null then
    return jsonb_build_object(
      'connected', false,
      'status', 'disconnected',
      'accountEmail', '',
      'customerId', '',
      'loginCustomerId', '',
      'lastError', ''
    );
  end if;

  return jsonb_build_object(
    'connected', v_row.status = 'connected' and coalesce(v_row.refresh_token, '') <> '',
    'status', v_row.status,
    'accountEmail', v_row.account_email,
    'customerId', coalesce(v_row.metadata->>'customerId', ''),
    'loginCustomerId', coalesce(v_row.metadata->>'loginCustomerId', ''),
    'lastError', v_row.last_error,
    'updatedAt', v_row.updated_at
  );
end;
$$;

create or replace function app.upsert_platform_integration_tokens(
  p_provider text,
  p_account_email text,
  p_access_token text,
  p_refresh_token text,
  p_token_expires_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.is_platform_admin() or not app.require_admin_mfa() then raise exception 'Forbidden'; end if;

  insert into app.platform_integrations (
    provider, status, account_email, access_token, refresh_token,
    token_expires_at, metadata, last_error, updated_by
  ) values (
    p_provider, 'connected', coalesce(p_account_email, ''),
    coalesce(p_access_token, ''), coalesce(p_refresh_token, ''),
    p_token_expires_at, coalesce(p_metadata, '{}'::jsonb), '',
    auth.uid()
  )
  on conflict (provider) do update set
    status = 'connected',
    account_email = excluded.account_email,
    access_token = excluded.access_token,
    refresh_token = case
      when excluded.refresh_token <> '' then excluded.refresh_token
      else app.platform_integrations.refresh_token
    end,
    token_expires_at = excluded.token_expires_at,
    metadata = app.platform_integrations.metadata || excluded.metadata,
    last_error = '',
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;

create or replace function app.update_platform_integration_metadata(
  p_provider text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.platform_integrations;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.is_platform_admin() or not app.require_admin_mfa() then raise exception 'Forbidden'; end if;

  update app.platform_integrations
  set metadata = metadata || coalesce(p_metadata, '{}'::jsonb),
      updated_at = now(),
      updated_by = auth.uid()
  where provider = p_provider
  returning * into v_row;

  if v_row.provider is null then
    insert into app.platform_integrations (provider, metadata, updated_by)
    values (p_provider, coalesce(p_metadata, '{}'::jsonb), auth.uid())
    returning * into v_row;
  end if;

  return app.get_platform_integration_public(p_provider);
end;
$$;

create or replace function app.disconnect_platform_integration(p_provider text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.is_platform_admin() or not app.require_admin_mfa() then raise exception 'Forbidden'; end if;

  update app.platform_integrations
  set status = 'disconnected',
      access_token = '',
      refresh_token = '',
      token_expires_at = null,
      last_error = '',
      updated_at = now(),
      updated_by = auth.uid()
  where provider = p_provider;
end;
$$;

revoke all on function app.get_platform_integration_public(text) from public, anon;
revoke all on function app.upsert_platform_integration_tokens(text, text, text, text, timestamptz, jsonb) from public, anon;
revoke all on function app.update_platform_integration_metadata(text, jsonb) from public, anon;
revoke all on function app.disconnect_platform_integration(text) from public, anon;

grant execute on function app.get_platform_integration_public(text) to authenticated;
grant execute on function app.upsert_platform_integration_tokens(text, text, text, text, timestamptz, jsonb) to authenticated;
grant execute on function app.update_platform_integration_metadata(text, jsonb) to authenticated;
grant execute on function app.disconnect_platform_integration(text) to authenticated;

grant select, update on app.platform_integrations to service_role;
