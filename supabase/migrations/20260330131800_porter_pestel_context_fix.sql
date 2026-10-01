-- Porter AI: koppel altijd goedgekeurde PESTEL-versie als porter.pestel_version_id leeg is

create or replace function app.get_porter_version_scope(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.porter_versions;
  v_pestel app.pestel_versions;
begin
  select * into v_row from app.porter_versions where id = p_version_id;
  if v_row.id is null then
    raise exception 'Versie niet gevonden';
  end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  select * into v_pestel
  from app.pestel_versions
  where tenant_id = v_row.tenant_id
    and status = 'approved'::app.pestel_version_status
  order by version_number desc
  limit 1;

  return jsonb_build_object(
    'id', v_row.id,
    'tenant_id', v_row.tenant_id,
    'pestel_version_id', coalesce(v_row.pestel_version_id, v_pestel.id),
    'market_sector', v_row.market_sector,
    'offering_description', v_row.offering_description,
    'geo_markets', v_row.geo_markets,
    'client_segment', v_row.client_segment,
    'time_horizon', v_row.time_horizon,
    'research_question', v_row.research_question,
    'known_competitors', v_row.known_competitors
  );
end;
$$;

grant execute on function app.get_porter_version_scope(uuid) to authenticated;
