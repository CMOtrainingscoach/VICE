-- PESTEL AI: klant + meetings laden via RPC (zelfde rechten als workbench, geen my_tenants/RLS-gaten)

create or replace function app.get_pestel_research_tenant_profile(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant app.tenants;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  select * into v_tenant
  from app.tenants
  where id = p_tenant_id and deleted_at is null;

  if v_tenant.id is null then
    raise exception 'Klant niet gevonden';
  end if;

  return jsonb_build_object(
    'name', v_tenant.name,
    'website', v_tenant.website,
    'audit_goal', v_tenant.audit_goal,
    'vat_number', v_tenant.vat_number
  );
end;
$$;

grant execute on function app.get_pestel_research_tenant_profile(uuid) to authenticated;

create or replace function app.list_pestel_research_meetings(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then
    raise exception 'Forbidden';
  end if;

  return coalesce(
    (
      select jsonb_agg(row order by (row->>'created_at') desc)
      from (
        select jsonb_build_object(
          'id', r.id,
          'title', r.title,
          'review_status', r.review_status,
          'summary_text', r.summary_text,
          'full_text', r.full_text,
          'notes', r.notes,
          'created_at', r.created_at
        ) as row
        from app.meeting_recordings r
        where r.tenant_id = p_tenant_id
          and r.transcript_status = 'ready'
        order by r.created_at desc
        limit 12
      ) sub
    ),
    '[]'::jsonb
  );
end;
$$;

grant execute on function app.list_pestel_research_meetings(uuid) to authenticated;
