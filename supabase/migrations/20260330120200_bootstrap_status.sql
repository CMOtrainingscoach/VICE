create or replace function app.get_auth_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
declare
  v_admin_count int;
  v_is_admin boolean;
begin
  select count(*) into v_admin_count from app.platform_admins;
  select exists (
    select 1 from app.platform_admins where user_id = auth.uid()
  ) into v_is_admin;

  return jsonb_build_object(
    'admin_count', v_admin_count,
    'is_platform_admin', v_is_admin
  );
end;
$$;

grant execute on function app.get_auth_status() to authenticated;
