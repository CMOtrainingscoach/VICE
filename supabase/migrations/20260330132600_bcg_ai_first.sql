-- De BCG-matrix wordt door AI ingevuld. Een latere AI-ronde overschrijft geen handmatige bewerking.
-- Verwijderd aanbod komt niet terug bij een volgende voorbereiding.

create or replace function app.adopt_bcg_offerings(p_version_id uuid)
returns integer
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
  v_count integer := 0;
  v_item app.five_c_items;
begin
  v_version := app._bcg_version_for_edit(p_version_id);
  if v_version.five_c_version_id is null then
    raise exception 'Er is nog geen goedgekeurde 5C om aanbod uit over te nemen';
  end if;
  for v_item in
    select * from app.five_c_items fi
    where fi.version_id = v_version.five_c_version_id
      and fi.deleted_at is null
      and fi.c_key = 'company'::app.five_c_key
      and fi.review_status <> 'rejected'::app.five_c_review
      and length(btrim(fi.title)) >= 2
      and not exists (
        select 1 from app.bcg_items i
        where i.version_id = p_version_id and i.five_c_item_id = fi.id
      )
  loop
    insert into app.bcg_items (
      version_id, tenant_id, title, description, kind, origin, five_c_item_id,
      market_definition, geography, segment, period_label, period_kind, measure_basis,
      currency, unit_label, selected, manual_lock, sort_order, created_by
    ) values (
      p_version_id, v_version.tenant_id, left(btrim(v_item.title), 300), left(v_item.finding, 4000),
      'service', 'five_c', v_item.id,
      v_version.market_label, v_version.geography, v_version.segment, v_version.period_label,
      v_version.period_kind, v_version.measure_basis, v_version.currency, v_version.unit_label,
      true, false,
      coalesce((select max(sort_order) + 1 from app.bcg_items where version_id = p_version_id and deleted_at is null), 0),
      auth.uid()
    );
    v_count := v_count + 1;
  end loop;
  if v_count > 0 then perform app._bcg_touch(p_version_id); end if;
  return v_count;
end;
$$;

create or replace function app.save_bcg_ai_result(p_version_id uuid, p_payload jsonb, p_model text)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
  v_row jsonb;
  v_item app.bcg_items;
  v_body jsonb;
  v_apply boolean;
  v_locked boolean;
begin
  v_version := app._bcg_version_for_edit(p_version_id);
  if jsonb_typeof(p_payload->'items') = 'array' then
    for v_row in select value from jsonb_array_elements(p_payload->'items')
    loop
      v_item := null;
      select * into v_item from app.bcg_items
      where id = nullif(v_row->>'item_id', '')::uuid and version_id = p_version_id and deleted_at is null;
      if v_item.id is null then continue; end if;
      v_body := coalesce(v_row->'payload', '{}'::jsonb);
      v_apply := coalesce((v_row->>'apply')::boolean, false);
      v_locked := v_item.manual_lock or v_item.figures_confirmed;
      if v_apply and not v_locked then
        update app.bcg_items
        set market_definition = case when btrim(coalesce(v_body->>'market_definition', '')) <> '' then left(v_body->>'market_definition', 500) else market_definition end,
            geography = case when btrim(coalesce(v_body->>'geography', '')) <> '' then left(v_body->>'geography', 200) else geography end,
            segment = case when btrim(coalesce(v_body->>'segment', '')) <> '' then left(v_body->>'segment', 200) else segment end,
            period_label = case when btrim(coalesce(v_body->>'period_label', '')) <> '' then left(v_body->>'period_label', 120) else period_label end,
            measure_basis = case when coalesce(v_body->>'measure_basis', '') in ('value', 'volume') then v_body->>'measure_basis' else measure_basis end,
            growth_method = case when coalesce(v_body->>'growth_method', '') in ('direct', 'from_size') then v_body->>'growth_method' else growth_method end,
            growth_percent = coalesce(app._bcg_num(v_body->>'growth_percent'), growth_percent),
            size_previous = coalesce(app._bcg_num(v_body->>'size_previous'), size_previous),
            size_current = coalesce(app._bcg_num(v_body->>'size_current'), size_current),
            share_method = case when coalesce(v_body->>'share_method', '') in ('from_shares', 'from_amounts') then v_body->>'share_method' else share_method end,
            own_share = coalesce(app._bcg_num(v_body->>'own_share'), own_share),
            leader_share = coalesce(app._bcg_num(v_body->>'leader_share'), leader_share),
            own_amount = coalesce(app._bcg_num(v_body->>'own_amount'), own_amount),
            leader_amount = coalesce(app._bcg_num(v_body->>'leader_amount'), leader_amount),
            leader_name = case when btrim(coalesce(v_body->>'leader_name', '')) <> '' then left(v_body->>'leader_name', 200) else leader_name end,
            open_question = case when btrim(coalesce(v_body->>'open_question', '')) <> '' then left(v_body->>'open_question', 1000) else open_question end,
            figures_conflict = left(btrim(coalesce(v_body->>'conflict', '')), 1000),
            growth_evidence = case when coalesce(v_body->>'growth_evidence', '') in ('measured', 'provided', 'forecast', 'estimate') then v_body->>'growth_evidence' else growth_evidence end,
            share_evidence = case when coalesce(v_body->>'share_evidence', '') in ('measured', 'provided', 'forecast', 'estimate') then v_body->>'share_evidence' else share_evidence end,
            ai_state = 'accepted'::app.bcg_ai_state,
            ai_payload = '{}'::jsonb,
            selected = true,
            ai_generated_at = now(),
            updated_at = now()
        where id = v_item.id;
        if jsonb_typeof(v_body->'refs') = 'array' and not exists (select 1 from app.bcg_item_refs r where r.item_id = v_item.id) then
          perform app._bcg_replace_refs(v_item.id, v_version, v_body->'refs');
        end if;
        perform app._bcg_store_results(v_item.id);
        perform app._bcg_reopen_item(v_item.id);
        insert into app.bcg_ai_history (version_id, tenant_id, item_id, proposal, decision, decided_by)
        values (p_version_id, v_version.tenant_id, v_item.id, v_body, 'accepted', auth.uid());
      else
        update app.bcg_items
        set ai_state = 'proposed'::app.bcg_ai_state, ai_payload = v_body, ai_generated_at = now(), updated_at = now()
        where id = v_item.id;
        insert into app.bcg_ai_history (version_id, tenant_id, item_id, proposal, decision, decided_by)
        values (p_version_id, v_version.tenant_id, v_item.id, v_body, 'proposed', auth.uid());
      end if;
    end loop;
  end if;
  update app.bcg_versions
  set ai_questions = coalesce(p_payload->'questions', '[]'::jsonb),
      ai_generated_at = now(),
      synthesis_reviewed = false
  where id = p_version_id;
  perform app._bcg_touch(p_version_id);
end;
$$;

create or replace function app.add_bcg_item(p_version_id uuid, p_title text, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
  v_id uuid;
  v_title text;
  v_kind text;
begin
  v_version := app._bcg_version_for_edit(p_version_id);
  v_title := left(btrim(coalesce(p_title, '')), 300);
  if length(v_title) < 2 then
    raise exception 'Geef het aanbod een naam';
  end if;
  v_kind := coalesce(nullif(p_kind, ''), 'service');
  if v_kind not in ('product', 'service', 'group', 'unit') then
    raise exception 'Onbekend type aanbod';
  end if;
  insert into app.bcg_items (
    version_id, tenant_id, title, kind, origin, selected, manual_lock,
    market_definition, geography, segment, period_label, period_kind, measure_basis,
    currency, unit_label, sort_order, created_by
  ) values (
    p_version_id, v_version.tenant_id, v_title, v_kind::app.bcg_item_kind, 'manual', true, false,
    v_version.market_label, v_version.geography, v_version.segment, v_version.period_label,
    v_version.period_kind, v_version.measure_basis, v_version.currency, v_version.unit_label,
    coalesce((select max(sort_order) + 1 from app.bcg_items where version_id = p_version_id and deleted_at is null), 0),
    auth.uid()
  ) returning id into v_id;
  perform app._bcg_touch(p_version_id);
  return v_id;
end;
$$;

create or replace function app.delete_bcg_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_item app.bcg_items;
begin
  v_item := null;
  select * into v_item from app.bcg_items where id = p_item_id and deleted_at is null;
  if v_item.id is null then
    raise exception 'Portfolio-item niet gevonden';
  end if;
  perform app._bcg_version_for_edit(v_item.version_id);
  update app.bcg_items
  set deleted_at = now(), selected = false, updated_at = now()
  where id = p_item_id;
  update app.bcg_versions set synthesis_reviewed = false where id = v_item.version_id;
  perform app._bcg_touch(v_item.version_id);
end;
$$;

grant execute on function app.adopt_bcg_offerings(uuid) to authenticated;
grant execute on function app.save_bcg_ai_result(uuid, jsonb, text) to authenticated;
grant execute on function app.add_bcg_item(uuid, text, text) to authenticated;
grant execute on function app.delete_bcg_item(uuid) to authenticated;
