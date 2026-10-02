-- Een onvolledige BCG blokkeert de audit niet. Zodra de waardeketen bestaat, is dat de volgende stap.

create or replace function app.get_audit_framework_progress(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_pestel uuid;
  v_porter uuid;
  v_five_c uuid;
  v_swot uuid;
  v_vrio uuid;
  v_bcg uuid;
  v_vc uuid;
  v_vc_started uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select id into v_pestel from app.pestel_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.pestel_version_status
  order by version_number desc limit 1;
  select id into v_porter from app.porter_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.porter_version_status
  order by version_number desc limit 1;
  select id into v_five_c from app.five_c_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.five_c_version_status
  order by version_number desc limit 1;
  select id into v_swot from app.swot_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.swot_version_status
  order by version_number desc limit 1;
  select id into v_vrio from app.vrio_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.vrio_version_status
  order by version_number desc limit 1;
  select id into v_bcg from app.bcg_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.bcg_version_status
  order by version_number desc limit 1;
  select id into v_vc from app.vc_versions
  where tenant_id = p_tenant_id and status = 'approved'::app.vc_version_status
  order by version_number desc limit 1;
  select id into v_vc_started from app.vc_versions
  where tenant_id = p_tenant_id
  order by version_number desc limit 1;

  return jsonb_build_object(
    'pestel_approved', v_pestel is not null,
    'pestel_version_id', v_pestel,
    'porter_approved', v_porter is not null,
    'porter_version_id', v_porter,
    'five_c_approved', v_five_c is not null,
    'five_c_version_id', v_five_c,
    'swot_approved', v_swot is not null,
    'swot_version_id', v_swot,
    'vrio_approved', v_vrio is not null,
    'vrio_version_id', v_vrio,
    'bcg_approved', v_bcg is not null,
    'bcg_version_id', v_bcg,
    'value_chain_approved', v_vc is not null,
    'value_chain_version_id', v_vc,
    'value_chain_started', v_vc_started is not null
  );
end;
$$;

grant execute on function app.get_audit_framework_progress(uuid) to authenticated;
