create extension if not exists pgcrypto with schema extensions;

create or replace function app.create_invite(
  p_tenant_id uuid,
  p_email text,
  p_role app.membership_role default 'client'
)
returns table (invite_id uuid, raw_token text)
language plpgsql
security definer
set search_path = app, public, auth, extensions
as $$
declare
  v_token text;
  v_hash text;
  v_id uuid;
begin
  if not app.has_capability(p_tenant_id, 'member.invite') or not app.require_admin_mfa() then
    raise exception 'Forbidden';
  end if;

  if p_role = 'admin' and not app.is_platform_admin() then
    raise exception 'Only platform admin can invite admins';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  insert into app.invites (tenant_id, email, role, token_hash, expires_at, created_by)
  values (
    p_tenant_id,
    lower(trim(p_email)),
    p_role,
    v_hash,
    now() + interval '7 days',
    auth.uid()
  )
  returning id into v_id;

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (p_tenant_id, auth.uid(), 'member.invite', 'invite', v_id::text, jsonb_build_object('email', lower(trim(p_email))));

  invite_id := v_id;
  raw_token := v_token;
  return next;
end;
$$;

grant execute on function app.create_invite(uuid, text, app.membership_role) to authenticated;

create or replace function app.revoke_membership(p_tenant_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if not app.has_capability(p_tenant_id, 'member.revoke') or not app.require_admin_mfa() then
    raise exception 'Forbidden';
  end if;

  update app.tenant_memberships
  set revoked_at = now()
  where tenant_id = p_tenant_id and user_id = p_user_id;

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id)
  values (p_tenant_id, auth.uid(), 'member.revoke', 'user', p_user_id::text);
end;
$$;

grant execute on function app.revoke_membership(uuid, uuid) to authenticated;

-- Allow platform admins to read all tenants they belong to (already) — add list helper view
create or replace view app.my_tenants
with (security_invoker = true)
as
select t.*
from app.tenants t
inner join app.tenant_memberships tm on tm.tenant_id = t.id
where tm.user_id = auth.uid()
  and tm.revoked_at is null
  and t.deleted_at is null;

grant select on app.my_tenants to authenticated;
