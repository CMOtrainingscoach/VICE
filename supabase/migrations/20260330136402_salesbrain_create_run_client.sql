-- Client-safe create_sb_run: require published workflow for members.

create or replace function app.create_sb_run(p_tenant_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare
  v_w app.sb_workflows;
  v_ver app.sb_workflow_versions;
  v_run app.sb_runs;
  v_graph jsonb;
  v_is_test boolean := coalesce((p_payload->>'isTest')::boolean, false);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.is_member(p_tenant_id) and not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  select * into v_w from app.sb_workflows where id = (p_payload->>'workflowId')::uuid and tenant_id = p_tenant_id;
  if v_w.id is null then
    if app.has_capability(p_tenant_id, 'audit.edit') then
      perform app.ensure_default_sb_workflow(p_tenant_id);
      select * into v_w from app.sb_workflows where tenant_id = p_tenant_id order by created_at limit 1;
    else
      raise exception 'Workflow niet gevonden of niet gepubliceerd';
    end if;
  end if;

  if v_w.published_version_id is null and not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Workflow nog niet gepubliceerd';
  end if;

  if v_w.published_version_id is not null then
    select * into v_ver from app.sb_workflow_versions where id = v_w.published_version_id;
    v_graph := v_ver.graph;
  else
    v_graph := v_w.draft_graph;
  end if;

  insert into app.sb_runs (
    tenant_id, workflow_id, workflow_version_id, name, is_test, inputs, graph,
    location_label, center_lat, center_lng, radius_km, created_by
  ) values (
    p_tenant_id, v_w.id, v_ver.id,
    coalesce(p_payload->>'name', v_w.name),
    v_is_test,
    coalesce(p_payload->'inputs', '{}'::jsonb),
    v_graph,
    coalesce(p_payload->>'locationLabel', ''),
    coalesce((p_payload->>'lat')::double precision, 0),
    coalesce((p_payload->>'lng')::double precision, 0),
    coalesce((p_payload->>'radiusKm')::numeric, 25),
    auth.uid()
  ) returning * into v_run;

  return jsonb_build_object('id', v_run.id, 'status', v_run.status::text);
end;
$$;
