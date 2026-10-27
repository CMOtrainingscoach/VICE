-- Salesbrain feedback + insights list + draft save + node attempts worker

create or replace function app.list_sb_run_insights(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from app.sb_runs where id = p_run_id and deleted_at is null;
  if v_tenant is null then return '[]'::jsonb; end if;
  if not app.is_member(v_tenant) and not app.has_capability(v_tenant, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'title', i.title, 'summary', i.summary,
      'provenance', i.provenance, 'sources', i.sources, 'createdAt', i.created_at
    ) order by i.created_at)
    from app.sb_market_insights i
    where i.run_id = p_run_id
  ), '[]'::jsonb);
end;
$$;

create or replace function app.insert_sb_feedback(
  p_tenant_id uuid,
  p_run_id uuid,
  p_prospect_id uuid,
  p_kind text,
  p_reason text
) returns uuid language plpgsql security definer set search_path = app, public, auth as $$
declare v_id uuid; v_ver uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.is_member(p_tenant_id) and not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  select workflow_version_id into v_ver from app.sb_runs where id = p_run_id and tenant_id = p_tenant_id;
  insert into app.sb_feedback (tenant_id, run_id, prospect_id, workflow_version_id, kind, reason, created_by)
  values (p_tenant_id, p_run_id, nullif(p_prospect_id, '00000000-0000-0000-0000-000000000000'::uuid), p_kind, coalesce(p_reason, ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function app.save_sb_workflow_draft(
  p_workflow_id uuid, p_graph jsonb, p_form_schema jsonb
) returns void language plpgsql security definer set search_path = app, public, auth as $$
declare v_w app.sb_workflows;
begin
  select * into v_w from app.sb_workflows where id = p_workflow_id;
  if v_w.id is null then raise exception 'Not found'; end if;
  if not app.has_capability(v_w.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  update app.sb_workflows
  set draft_graph = p_graph, draft_form_schema = coalesce(p_form_schema, draft_form_schema), updated_at = now()
  where id = p_workflow_id;
end;
$$;

create or replace function app.sb_worker_record_node_attempt(
  p_run_id uuid, p_node_id text, p_node_type text, p_status text,
  p_output_ref jsonb, p_error_message text
) returns void language plpgsql security definer set search_path = app, public, auth as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from app.sb_runs where id = p_run_id;
  if v_tenant is null then return; end if;
  insert into app.sb_node_attempts (
    run_id, tenant_id, node_id, node_type, status, output_ref, error_message, started_at, finished_at
  ) values (
    p_run_id, v_tenant, p_node_id, p_node_type, p_status, p_output_ref, p_error_message, now(), now()
  );
end;
$$;

grant execute on function app.list_sb_run_insights(uuid) to authenticated;
grant execute on function app.insert_sb_feedback(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function app.save_sb_workflow_draft(uuid, jsonb, jsonb) to authenticated;
grant execute on function app.sb_worker_record_node_attempt(uuid, text, text, text, jsonb, text) to service_role;

-- Clients see only published workflows; admins see all.
create or replace function app.list_sb_workflows(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.is_member(p_tenant_id) and not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  if app.has_capability(p_tenant_id, 'audit.edit') then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'name', w.name, 'purpose', w.purpose, 'status', w.status::text,
        'updatedAt', w.updated_at, 'publishedVersionId', w.published_version_id
      ) order by w.updated_at desc)
      from app.sb_workflows w where w.tenant_id = p_tenant_id
    ), '[]'::jsonb);
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'name', w.name, 'purpose', w.purpose, 'status', w.status::text,
      'updatedAt', w.updated_at, 'publishedVersionId', w.published_version_id
    ) order by w.updated_at desc)
    from app.sb_workflows w
    where w.tenant_id = p_tenant_id
      and w.status = 'published'
      and w.published_version_id is not null
  ), '[]'::jsonb);
end;
$$;
