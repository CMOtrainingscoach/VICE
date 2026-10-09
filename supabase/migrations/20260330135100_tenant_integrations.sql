-- Externe sitekoppelingen per klant (Blogger e.d.). Draai na 20260330135000.

create table if not exists app.tenant_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  provider text not null check (provider in ('blogger')),
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error')),
  account_email text not null default '',
  access_token text not null default '',
  refresh_token text not null default '',
  token_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  unique (tenant_id, provider)
);

create index tenant_integrations_tenant_idx on app.tenant_integrations (tenant_id);

alter table app.tenant_integrations enable row level security;

-- Geen directe client-select op tokens; enkel via security definer RPCs.

create or replace function app.get_tenant_integration_public(p_tenant_id uuid, p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.tenant_integrations;
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
      'lastError', ''
    );
  end if;

  return jsonb_build_object(
    'connected', v_row.status = 'connected' and coalesce(v_row.refresh_token, '') <> '',
    'status', v_row.status,
    'accountEmail', v_row.account_email,
    'blogId', v_row.metadata->>'blogId',
    'blogName', v_row.metadata->>'blogName',
    'blogUrl', v_row.metadata->>'blogUrl',
    'lastError', v_row.last_error,
    'updatedAt', v_row.updated_at
  );
end;
$$;

create or replace function app.upsert_tenant_integration_tokens(
  p_tenant_id uuid,
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
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  insert into app.tenant_integrations (
    tenant_id, provider, status, account_email, access_token, refresh_token,
    token_expires_at, metadata, last_error, created_by, updated_by
  ) values (
    p_tenant_id, p_provider, 'connected', coalesce(p_account_email, ''),
    coalesce(p_access_token, ''), coalesce(p_refresh_token, ''),
    p_token_expires_at, coalesce(p_metadata, '{}'::jsonb), '',
    auth.uid(), auth.uid()
  )
  on conflict (tenant_id, provider) do update set
    status = 'connected',
    account_email = excluded.account_email,
    access_token = excluded.access_token,
    refresh_token = case
      when excluded.refresh_token <> '' then excluded.refresh_token
      else app.tenant_integrations.refresh_token
    end,
    token_expires_at = excluded.token_expires_at,
    metadata = app.tenant_integrations.metadata || excluded.metadata,
    last_error = '',
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;

create or replace function app.update_tenant_integration_metadata(
  p_tenant_id uuid,
  p_provider text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.tenant_integrations;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  update app.tenant_integrations
  set metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      updated_at = now(),
      updated_by = auth.uid()
  where tenant_id = p_tenant_id and provider = p_provider
  returning * into v_row;

  if v_row.id is null then raise exception 'Koppeling niet gevonden'; end if;
  return app.get_tenant_integration_public(p_tenant_id, p_provider);
end;
$$;

create or replace function app.disconnect_tenant_integration(p_tenant_id uuid, p_provider text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  update app.tenant_integrations
  set status = 'disconnected',
      access_token = '',
      refresh_token = '',
      token_expires_at = null,
      last_error = '',
      updated_at = now(),
      updated_by = auth.uid()
  where tenant_id = p_tenant_id and provider = p_provider;
end;
$$;

-- Interne helper voor server (service role / security definer callers).
create or replace function app.get_tenant_integration_secrets(p_tenant_id uuid, p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.tenant_integrations;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select * into v_row
  from app.tenant_integrations
  where tenant_id = p_tenant_id and provider = p_provider and status = 'connected';

  if v_row.id is null then return null; end if;

  return jsonb_build_object(
    'accessToken', v_row.access_token,
    'refreshToken', v_row.refresh_token,
    'tokenExpiresAt', v_row.token_expires_at,
    'metadata', v_row.metadata,
    'accountEmail', v_row.account_email
  );
end;
$$;

revoke execute on function app.get_tenant_integration_public(uuid, text) from public, anon;
revoke execute on function app.upsert_tenant_integration_tokens(uuid, text, text, text, text, timestamptz, jsonb) from public, anon;
revoke execute on function app.update_tenant_integration_metadata(uuid, text, jsonb) from public, anon;
revoke execute on function app.disconnect_tenant_integration(uuid, text) from public, anon;
revoke execute on function app.get_tenant_integration_secrets(uuid, text) from public, anon;

grant execute on function app.get_tenant_integration_public(uuid, text) to authenticated;
grant execute on function app.upsert_tenant_integration_tokens(uuid, text, text, text, text, timestamptz, jsonb) to authenticated;
grant execute on function app.update_tenant_integration_metadata(uuid, text, jsonb) to authenticated;
grant execute on function app.disconnect_tenant_integration(uuid, text) to authenticated;
grant execute on function app.get_tenant_integration_secrets(uuid, text) to authenticated;
