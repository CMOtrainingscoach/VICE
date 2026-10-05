-- Intrekken maakt de goedgekeurde persona-versie weer een bewerkbaar concept.
-- Draai na 20260330133000. Eerdere migraties niet opnieuw draaien.

create or replace function app.unpublish_persona_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.persona_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_version := null;
  select * into v_version from app.persona_versions where id = p_version_id;
  if v_version is null then raise exception 'Versie niet gevonden'; end if;
  if not app.has_capability(v_version.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_version.status <> 'approved' and v_version.published_at is null then
    return;
  end if;
  update app.persona_versions
  set published_at = null,
      published_by = null,
      status = 'draft',
      approved_at = null,
      approved_by = null,
      updated_at = now()
  where id = p_version_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_version.tenant_id, auth.uid(), 'persona.unpublish', 'persona_version', p_version_id::text, jsonb_build_object('reopened', true));
end;
$$;
