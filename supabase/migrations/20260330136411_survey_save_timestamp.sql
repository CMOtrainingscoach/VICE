-- Relax optimistic-lock compare (second precision) and clearer errors for save_survey.

create or replace function app.save_survey(
  p_survey_id uuid,
  p_expected timestamptz,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.surveys;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  if p_expected is null then
    raise exception 'Versie-stempel ontbreekt. Herlaad de pagina en probeer opnieuw.';
  end if;

  select * into v_row from app.surveys where id = p_survey_id for update;
  if v_row.id is null then raise exception 'Enquête niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  if date_trunc('second', v_row.updated_at) is distinct from date_trunc('second', p_expected) then
    raise exception 'Enquête is intussen gewijzigd. Herlaad de pagina.';
  end if;

  update app.surveys set
    title = case when p_patch ? 'title' then left(coalesce(p_patch->>'title', title), 200) else title end,
    definition = case when p_patch ? 'definition' then coalesce(p_patch->'definition', definition) else definition end,
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_row.id
  returning * into v_row;

  return app._survey_json(v_row, true);
end;
$$;
