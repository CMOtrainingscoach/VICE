-- Lijstfilter voor actieve vs gearchiveerde advertenties.

drop function if exists app.list_ad_concepts(uuid, uuid);

create or replace function app.list_ad_concepts(
  p_tenant_id uuid,
  p_folder_id uuid default null,
  p_visibility text default 'active'
)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if p_visibility not in ('active', 'archived', 'all') then
    raise exception 'Onbekende zichtbaarheid';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'internalName', c.internal_name,
      'platform', c.platform,
      'format', c.format,
      'status', c.status,
      'folderId', c.folder_id,
      'tags', to_jsonb(c.tags),
      'legalReviewRequired', c.legal_review_required,
      'legalReviewCleared', c.legal_review_cleared,
      'updatedAt', c.updated_at
    ) order by c.updated_at desc), '[]'::jsonb)
    from app.ad_concepts c
    where c.tenant_id = p_tenant_id
      and (p_folder_id is null or c.folder_id = p_folder_id)
      and (
        p_visibility = 'all'
        or (p_visibility = 'active' and c.status <> 'archived')
        or (p_visibility = 'archived' and c.status = 'archived')
      )
  );
end;
$$;

revoke execute on function app.list_ad_concepts(uuid, uuid, text) from public, anon;
grant execute on function app.list_ad_concepts(uuid, uuid, text) to authenticated;
