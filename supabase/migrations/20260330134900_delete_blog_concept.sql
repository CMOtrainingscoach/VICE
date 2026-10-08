-- Verwijderen van blogconcepten + storagepaden. Draai na 20260330134800.

create or replace function app.delete_blog_concept(p_concept_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.blog_concepts;
  v_paths jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from app.blog_concepts where id = p_concept_id;
  if v_row.id is null then raise exception 'Concept niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  select coalesce(jsonb_agg(to_jsonb(v.storage_path)), '[]'::jsonb)
  into v_paths
  from app.blog_visuals v
  where v.concept_id = p_concept_id;

  update app.blog_concepts
  set selected_visual_id = null
  where id = p_concept_id;

  delete from app.blog_concepts where id = p_concept_id;

  return jsonb_build_object(
    'id', p_concept_id,
    'tenantId', v_row.tenant_id,
    'storagePaths', coalesce(v_paths, '[]'::jsonb)
  );
end;
$$;

revoke execute on function app.delete_blog_concept(uuid) from public, anon;
grant execute on function app.delete_blog_concept(uuid) to authenticated;
