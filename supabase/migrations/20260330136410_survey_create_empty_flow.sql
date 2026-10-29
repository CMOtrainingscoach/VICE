-- New surveys: empty canvas; users add cards and draw connections manually.

create or replace function app.create_survey(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.surveys;
  v_def jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  v_def := jsonb_build_object(
    'version', 1,
    'nodes', '[]'::jsonb,
    'edges', '[]'::jsonb,
    'settings', jsonb_build_object(
      'askContact', false,
      'contactRequired', false,
      'privacyText', ''
    )
  );

  insert into app.surveys (tenant_id, definition, created_by, updated_by)
  values (p_tenant_id, v_def, auth.uid(), auth.uid())
  returning * into v_row;

  return app._survey_json(v_row, true);
end;
$$;
