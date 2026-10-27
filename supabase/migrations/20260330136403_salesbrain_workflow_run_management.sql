-- Multiple workflows + archive runs/workflows

create or replace function app.create_sb_workflow(
  p_tenant_id uuid,
  p_name text,
  p_purpose text,
  p_draft_graph jsonb,
  p_form_schema jsonb
) returns uuid language plpgsql security definer set search_path = app, public, auth as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  insert into app.sb_workflows (tenant_id, name, purpose, draft_graph, draft_form_schema, created_by)
  values (
    p_tenant_id,
    coalesce(nullif(trim(p_name), ''), 'Nieuwe workflow'),
    coalesce(nullif(trim(p_purpose), ''), ''),
    coalesce(p_draft_graph, '{}'::jsonb),
    coalesce(p_form_schema, '{}'::jsonb),
    auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function app.get_sb_workflow(p_workflow_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_w app.sb_workflows;
begin
  select * into v_w from app.sb_workflows where id = p_workflow_id;
  if v_w.id is null then return null; end if;
  if not app.is_member(v_w.tenant_id) and not app.has_capability(v_w.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  if not app.has_capability(v_w.tenant_id, 'audit.edit') and (v_w.status <> 'published' or v_w.published_version_id is null) then
    raise exception 'Forbidden';
  end if;
  return jsonb_build_object(
    'id', v_w.id,
    'tenantId', v_w.tenant_id,
    'name', v_w.name,
    'purpose', v_w.purpose,
    'status', v_w.status::text,
    'publishedVersionId', v_w.published_version_id,
    'draftGraph', v_w.draft_graph,
    'draftFormSchema', v_w.draft_form_schema,
    'updatedAt', v_w.updated_at
  );
end;
$$;

create or replace function app.update_sb_workflow_meta(
  p_workflow_id uuid, p_name text, p_purpose text
) returns void language plpgsql security definer set search_path = app, public, auth as $$
declare v_w app.sb_workflows;
begin
  select * into v_w from app.sb_workflows where id = p_workflow_id;
  if v_w.id is null then raise exception 'Not found'; end if;
  if not app.has_capability(v_w.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  update app.sb_workflows
  set name = coalesce(nullif(trim(p_name), ''), name),
      purpose = coalesce(p_purpose, purpose),
      updated_at = now()
  where id = p_workflow_id;
end;
$$;

create or replace function app.archive_sb_workflow(p_workflow_id uuid)
returns void language plpgsql security definer set search_path = app, public, auth as $$
declare v_w app.sb_workflows;
begin
  select * into v_w from app.sb_workflows where id = p_workflow_id;
  if v_w.id is null then raise exception 'Not found'; end if;
  if not app.has_capability(v_w.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  update app.sb_workflows
  set status = 'archived', updated_at = now()
  where id = p_workflow_id;
end;
$$;

create or replace function app.restore_sb_workflow(p_workflow_id uuid)
returns void language plpgsql security definer set search_path = app, public, auth as $$
declare v_w app.sb_workflows;
begin
  select * into v_w from app.sb_workflows where id = p_workflow_id;
  if v_w.id is null then raise exception 'Not found'; end if;
  if not app.has_capability(v_w.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  update app.sb_workflows
  set status = case when published_version_id is not null then 'published'::app.sb_workflow_status else 'draft'::app.sb_workflow_status end,
      updated_at = now()
  where id = p_workflow_id and status = 'archived';
end;
$$;

drop function if exists app.list_sb_workflows(uuid);
drop function if exists app.list_sb_runs(uuid);

create or replace function app.list_sb_workflows(p_tenant_id uuid, p_include_archived boolean default false)
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
      from app.sb_workflows w
      where w.tenant_id = p_tenant_id
        and (p_include_archived or w.status <> 'archived')
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

create or replace function app.soft_delete_sb_run(p_run_id uuid)
returns void language plpgsql security definer set search_path = app, public, auth as $$
declare v_r app.sb_runs;
begin
  select * into v_r from app.sb_runs where id = p_run_id and deleted_at is null;
  if v_r.id is null then return; end if;
  if not app.is_member(v_r.tenant_id) and not app.has_capability(v_r.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  update app.sb_runs
  set deleted_at = now(),
      status = case when status in ('queued', 'running') then 'cancelled'::app.sb_run_status else status end,
      updated_at = now()
  where id = p_run_id;
end;
$$;

create or replace function app.update_sb_run_name(p_run_id uuid, p_name text)
returns void language plpgsql security definer set search_path = app, public, auth as $$
declare v_r app.sb_runs;
begin
  select * into v_r from app.sb_runs where id = p_run_id and deleted_at is null;
  if v_r.id is null then raise exception 'Not found'; end if;
  if not app.is_member(v_r.tenant_id) and not app.has_capability(v_r.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  update app.sb_runs set name = coalesce(nullif(trim(p_name), ''), name), updated_at = now() where id = p_run_id;
end;
$$;

create or replace function app.list_sb_runs(p_tenant_id uuid, p_include_deleted boolean default false)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
begin
  if not app.is_member(p_tenant_id) and not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'status', r.status::text, 'isTest', r.is_test,
      'prospectCount', r.prospect_count, 'insightCount', r.insight_count,
      'createdAt', r.created_at, 'updatedAt', r.updated_at,
      'workflowName', w.name,
      'deletedAt', r.deleted_at
    ) order by r.created_at desc)
    from app.sb_runs r
    left join app.sb_workflows w on w.id = r.workflow_id
    where r.tenant_id = p_tenant_id
      and (p_include_deleted or r.deleted_at is null)
  ), '[]'::jsonb);
end;
$$;

grant execute on function app.create_sb_workflow(uuid, text, text, jsonb, jsonb) to authenticated;
grant execute on function app.get_sb_workflow(uuid) to authenticated;
grant execute on function app.update_sb_workflow_meta(uuid, text, text) to authenticated;
grant execute on function app.archive_sb_workflow(uuid) to authenticated;
grant execute on function app.restore_sb_workflow(uuid) to authenticated;
grant execute on function app.soft_delete_sb_run(uuid) to authenticated;
grant execute on function app.update_sb_run_name(uuid, text) to authenticated;

grant execute on function app.list_sb_workflows(uuid, boolean) to authenticated;
grant execute on function app.list_sb_runs(uuid, boolean) to authenticated;
