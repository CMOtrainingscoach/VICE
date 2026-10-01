-- PESTEL goedkeuren (stap 1 afsluiten → Porter)

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
  v_dim app.pestel_dimension;
  v_missing integer;
  v_pending integer;
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
    raise exception 'Strategische synthese ontbreekt of is te kort';
  end if;

  select count(*) into v_pending
  from app.pestel_insights
  where version_id = p_version_id
    and deleted_at is null
    and review_status = 'pending';

  if v_pending > 0 then
    raise exception 'Nog % openstaande inzichten te beoordelen', v_pending;
  end if;

  v_missing := 0;
  foreach v_dim in array enum_range(null::app.pestel_dimension)
  loop
    if not exists (
      select 1 from app.pestel_insights i
      where i.version_id = p_version_id
        and i.dimension = v_dim
        and i.deleted_at is null
        and i.review_status = 'reviewed'
    ) then
      v_missing := v_missing + 1;
    end if;
  end loop;

  if v_missing > 0 then
    raise exception 'Elk PESTEL-perspectief vereist minstens één beoordeeld inzicht';
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
