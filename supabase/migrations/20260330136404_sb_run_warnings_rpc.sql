-- Expose run warnings in get_sb_run for empty-result diagnostics

create or replace function app.get_sb_run(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_r app.sb_runs;
begin
  select * into v_r from app.sb_runs where id = p_run_id and deleted_at is null;
  if v_r.id is null then return null; end if;
  if not app.is_member(v_r.tenant_id) and not app.has_capability(v_r.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  return jsonb_build_object(
    'id', v_r.id, 'name', v_r.name, 'status', v_r.status::text, 'isTest', v_r.is_test,
    'prospectCount', v_r.prospect_count, 'insightCount', v_r.insight_count,
    'progress', v_r.progress, 'errorMessage', v_r.error_message,
    'warnings', v_r.warnings,
    'inputs', v_r.inputs, 'workflowVersionId', v_r.workflow_version_id,
    'createdAt', v_r.created_at, 'updatedAt', v_r.updated_at
  );
end;
$$;
