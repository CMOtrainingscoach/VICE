-- Contextbestand van de strategische audit. Draai na 20260330133600. Eerdere migraties niet opnieuw.

alter table app.brand_versions drop constraint brand_versions_current_step_check;
alter table app.brand_versions add constraint brand_versions_current_step_check
  check (current_step in ('sources', 'website', 'image', 'conclusion', 'overview'));

create table app.audit_context_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  brand_version_id uuid not null unique references app.brand_versions (id) on delete cascade,
  markdown text not null,
  status text not null default 'draft' check (status in ('draft', 'final')),
  saved_at timestamptz not null default now(),
  finalized_at timestamptz,
  finalized_by uuid references auth.users (id)
);

alter table app.audit_context_documents enable row level security;

create or replace function app.set_brand_step(p_version_id uuid, p_step text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  perform app._brand_for_edit(p_version_id);
  if p_step not in ('sources', 'website', 'image', 'conclusion', 'overview') then
    raise exception 'Onbekende stap';
  end if;
  update app.brand_versions
  set current_step = p_step,
      sources_confirmed = case when p_step <> 'sources' then true else sources_confirmed end,
      website_confirmed = case when p_step in ('image', 'conclusion', 'overview') then true else website_confirmed end
  where id = p_version_id;
  perform app._brand_touch(p_version_id);
end;
$$;

create or replace function app.audit_framework_presence(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_name text;
  v_website text;
  v_goal text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  v_name := null;
  v_website := null;
  v_goal := null;
  select name, coalesce(website, ''), coalesce(audit_goal, '')
    into v_name, v_website, v_goal
  from app.tenants
  where id = p_tenant_id and deleted_at is null;
  if v_name is null then raise exception 'Klant niet gevonden'; end if;
  return jsonb_build_object(
    'name', v_name,
    'website', v_website,
    'audit_goal', v_goal,
    'pestel', exists (select 1 from app.pestel_versions where tenant_id = p_tenant_id),
    'porter', exists (select 1 from app.porter_versions where tenant_id = p_tenant_id),
    'five_c', exists (select 1 from app.five_c_versions where tenant_id = p_tenant_id),
    'swot', exists (select 1 from app.swot_versions where tenant_id = p_tenant_id),
    'vrio', exists (select 1 from app.vrio_versions where tenant_id = p_tenant_id),
    'bcg', exists (select 1 from app.bcg_versions where tenant_id = p_tenant_id),
    'value_chain', exists (select 1 from app.vc_versions where tenant_id = p_tenant_id),
    'stp', exists (select 1 from app.stp_versions where tenant_id = p_tenant_id),
    'persona', exists (select 1 from app.persona_versions where tenant_id = p_tenant_id)
  );
end;
$$;

create or replace function app.save_audit_context(p_version_id uuid, p_markdown text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_saved timestamptz;
begin
  v_row := app._brand_for_edit(p_version_id);
  if length(btrim(coalesce(p_markdown, ''))) < 40 then
    raise exception 'Het contextbestand is leeg.';
  end if;
  v_saved := now();
  insert into app.audit_context_documents (tenant_id, brand_version_id, markdown, status, saved_at, finalized_at, finalized_by)
  values (v_row.tenant_id, p_version_id, p_markdown, 'draft', v_saved, null, null)
  on conflict (brand_version_id) do update
  set markdown = excluded.markdown,
      status = 'draft',
      saved_at = excluded.saved_at,
      finalized_at = null,
      finalized_by = null;
  return jsonb_build_object('status', 'draft', 'saved_at', v_saved, 'finalized_at', null);
end;
$$;

create or replace function app.finalize_audit_context(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_versions;
  v_at timestamptz;
begin
  v_row := app._brand_for_edit(p_version_id);
  if not exists (select 1 from app.audit_context_documents where brand_version_id = p_version_id) then
    raise exception 'Bewaar eerst het overzicht.';
  end if;
  v_at := now();
  update app.audit_context_documents
  set status = 'final', finalized_at = v_at, finalized_by = auth.uid()
  where brand_version_id = p_version_id;
  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_row.tenant_id, auth.uid(), 'audit.context.finalize', 'brand_version', p_version_id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'final', 'finalized_at', v_at);
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
  if v_doc is null then return null; end if;
  return jsonb_build_object(
    'markdown', v_doc.markdown,
    'status', v_doc.status,
    'saved_at', v_doc.saved_at,
    'finalized_at', v_doc.finalized_at,
    'brand_version_id', v_doc.brand_version_id
  );
end;
$$;

revoke execute on function app.audit_framework_presence(uuid) from public, anon;
revoke execute on function app.save_audit_context(uuid, text) from public, anon;
revoke execute on function app.finalize_audit_context(uuid) from public, anon;
revoke execute on function app.get_audit_context(uuid) from public, anon;
grant execute on function app.audit_framework_presence(uuid) to authenticated;
grant execute on function app.save_audit_context(uuid, text) to authenticated;
grant execute on function app.finalize_audit_context(uuid) to authenticated;
grant execute on function app.get_audit_context(uuid) to authenticated;
