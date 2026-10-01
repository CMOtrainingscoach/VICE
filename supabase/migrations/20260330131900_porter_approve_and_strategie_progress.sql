-- Porter goedkeuren (synthese) + strategie-voortgang voor hub

create or replace function app.approve_porter_version(
  p_version_id uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.porter_versions;
begin
  select * into v_row from app.porter_versions where id = p_version_id;
  if v_row.id is null then
    raise exception 'Versie niet gevonden';
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  if v_row.status = 'approved'::app.porter_version_status then
    return;
  end if;
  if p_expected_updated_at is not null
    and v_row.updated_at <> p_expected_updated_at then
    raise exception 'Versie is intussen gewijzigd; herlaad de pagina';
  end if;

  if length(trim(v_row.synthesis_text)) < 20 then
    raise exception 'Sla eerst de Porter-synthese op (minstens 20 tekens)';
  end if;

  if (
    select count(*) from app.porter_forces pf
    where pf.version_id = p_version_id
      and (
        pf.intensity <> 'unknown'::app.porter_intensity
        or length(trim(pf.motivation)) >= 20
        or length(trim(pf.headline_factor)) >= 5
      )
  ) < 5 then
    raise exception 'Vul eerst alle vijf krachten in (AI-analyse of handmatig)';
  end if;

  update app.porter_versions
  set
    status = 'approved'::app.porter_version_status,
    synthesis_reviewed = true,
    synthesis_stale = false,
    updated_at = now()
  where id = p_version_id;
end;
$$;

grant execute on function app.approve_porter_version(uuid, timestamptz) to authenticated;

create or replace function app.get_audit_framework_progress(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_pestel uuid;
  v_porter uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  select id into v_pestel
  from app.pestel_versions
  where tenant_id = p_tenant_id
    and status = 'approved'::app.pestel_version_status
  order by version_number desc
  limit 1;

  select id into v_porter
  from app.porter_versions
  where tenant_id = p_tenant_id
    and status = 'approved'::app.porter_version_status
  order by version_number desc
  limit 1;

  return jsonb_build_object(
    'pestel_approved', v_pestel is not null,
    'pestel_version_id', v_pestel,
    'porter_approved', v_porter is not null,
    'porter_version_id', v_porter
  );
end;
$$;

grant execute on function app.get_audit_framework_progress(uuid) to authenticated;
