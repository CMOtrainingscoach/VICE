-- Verwijderen van een blogvisual. Draai na 20260330134900.

create or replace function app.delete_blog_visual(p_visual_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_visual app.blog_visuals;
  v_row app.blog_concepts;
  v_was_selected boolean := false;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_visual from app.blog_visuals where id = p_visual_id;
  if v_visual.id is null then raise exception 'Visual niet gevonden'; end if;
  if not app.has_capability(v_visual.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select * into v_row from app.blog_concepts where id = v_visual.concept_id;
  if v_row.id is null then raise exception 'Concept niet gevonden'; end if;

  v_was_selected := v_row.selected_visual_id = v_visual.id;

  if v_was_selected then
    update app.blog_concepts
    set selected_visual_id = null,
        updated_at = now(),
        updated_by = auth.uid()
    where id = v_row.id;
  end if;

  delete from app.blog_visuals where id = v_visual.id;

  if v_was_selected then
    update app.blog_concepts c
    set selected_visual_id = (
      select v.id from app.blog_visuals v
      where v.concept_id = c.id
      order by v.created_at desc
      limit 1
    ),
    image_job_status = case
      when exists (select 1 from app.blog_visuals v where v.concept_id = c.id) then 'ready'
      else 'idle'
    end,
    image_job_error = '',
    updated_at = now(),
    updated_by = auth.uid()
    where c.id = v_row.id;
  end if;

  select * into v_row from app.blog_concepts where id = v_row.id;

  return jsonb_build_object(
    'concept', app._blog_concept_json(v_row),
    'storagePath', v_visual.storage_path,
    'visualId', v_visual.id
  );
end;
$$;

revoke execute on function app.delete_blog_visual(uuid) from public, anon;
grant execute on function app.delete_blog_visual(uuid) to authenticated;
