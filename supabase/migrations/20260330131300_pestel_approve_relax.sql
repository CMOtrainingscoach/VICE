-- PESTEL goedkeuren: volstaat opgeslagen synthese (minder strikt dan 311)

create or replace function app.approve_pestel_version(
  p_version_id uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.pestel_versions;
begin
  select * into v_row from app.pestel_versions where id = p_version_id;
  if v_row.id is null then
    raise exception 'Versie niet gevonden';
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;
  if v_row.status = 'approved' then
    return;
  end if;
  if p_expected_updated_at is not null
    and v_row.updated_at <> p_expected_updated_at then
    raise exception 'Versie is intussen gewijzigd; herlaad de pagina';
  end if;

  if length(trim(v_row.synthesis_text)) < 20 then
    raise exception 'Sla eerst de strategische synthese op (minstens 20 tekens)';
  end if;

  update app.pestel_versions
  set
    status = 'approved'::app.pestel_version_status,
    synthesis_reviewed = true,
    synthesis_stale = false,
    updated_at = now()
  where id = p_version_id;
end;
$$;

grant execute on function app.approve_pestel_version(uuid, timestamptz) to authenticated;
