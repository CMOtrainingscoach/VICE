-- Herstel: jsonb_build_object voor portfolio-items bleef onder de limiet van 100 argumenten.

create or replace function app.get_bcg_workbench(p_tenant_id uuid, p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_version app.bcg_versions;
  v_vrio app.vrio_versions;
  v_swot app.swot_versions;
  v_five app.five_c_versions;
  v_porter app.porter_versions;
  v_pestel app.pestel_versions;
  v_tenant app.tenants;
  v_next integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  select * into v_tenant from app.tenants where id = p_tenant_id and deleted_at is null;
  if v_tenant.id is null then raise exception 'Klant niet gevonden'; end if;

  v_version := null;
  if p_version_id is not null then
    select * into v_version from app.bcg_versions where id = p_version_id and tenant_id = p_tenant_id;
    if v_version.id is null then raise exception 'Analyse niet gevonden'; end if;
  else
    select * into v_version from app.bcg_versions
    where tenant_id = p_tenant_id and status <> 'approved'::app.bcg_version_status
    order by version_number desc limit 1;
    if v_version.id is null then
      v_version := null;
      select * into v_version from app.bcg_versions
      where tenant_id = p_tenant_id order by version_number desc limit 1;
    end if;
  end if;

  if v_version.id is null then
    v_vrio := null;
    select * into v_vrio from app.vrio_versions
    where tenant_id = p_tenant_id and status = 'approved'::app.vrio_version_status
    order by version_number desc limit 1;
    select coalesce(max(version_number), 0) + 1 into v_next from app.bcg_versions where tenant_id = p_tenant_id;
    insert into app.bcg_versions (
      tenant_id, version_number, status, created_by,
      vrio_version_id, swot_version_id, five_c_version_id, porter_version_id, pestel_version_id
    ) values (
      p_tenant_id, v_next, 'not_started', auth.uid(), v_vrio.id,
      coalesce(v_vrio.swot_version_id, (select id from app.swot_versions where tenant_id = p_tenant_id and status = 'approved'::app.swot_version_status order by version_number desc limit 1)),
      coalesce(v_vrio.five_c_version_id, (select id from app.five_c_versions where tenant_id = p_tenant_id and status = 'approved'::app.five_c_version_status order by version_number desc limit 1)),
      coalesce(v_vrio.porter_version_id, (select id from app.porter_versions where tenant_id = p_tenant_id and status = 'approved'::app.porter_version_status order by version_number desc limit 1)),
      coalesce(v_vrio.pestel_version_id, (select id from app.pestel_versions where tenant_id = p_tenant_id and status = 'approved'::app.pestel_version_status order by version_number desc limit 1))
    ) returning * into v_version;
  end if;

  v_vrio := null; v_swot := null; v_five := null; v_porter := null; v_pestel := null;
  select * into v_vrio from app.vrio_versions where id = v_version.vrio_version_id;
  select * into v_swot from app.swot_versions where id = v_version.swot_version_id;
  select * into v_five from app.five_c_versions where id = v_version.five_c_version_id;
  select * into v_porter from app.porter_versions where id = v_version.porter_version_id;
  select * into v_pestel from app.pestel_versions where id = v_version.pestel_version_id;

  return jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id,
      'version_number', v_version.version_number,
      'status', v_version.status,
      'scope_label', v_version.scope_label,
      'market_label', v_version.market_label,
      'geography', v_version.geography,
      'segment', v_version.segment,
      'period_label', v_version.period_label,
      'period_kind', v_version.period_kind,
      'measure_basis', v_version.measure_basis,
      'currency', v_version.currency,
      'unit_label', v_version.unit_label,
      'growth_threshold', app._bcg_txt(v_version.growth_threshold),
      'growth_threshold_note', v_version.growth_threshold_note,
      'growth_threshold_source', v_version.growth_threshold_source,
      'share_threshold', app._bcg_txt(v_version.share_threshold),
      'thresholds_confirmed', v_version.thresholds_confirmed,
      'qualitative', v_version.qualitative,
      'qualitative_reason', v_version.qualitative_reason,
      'synthesis_text', v_version.synthesis_text,
      'synthesis_reviewed', v_version.synthesis_reviewed,
      'publish_figures', v_version.publish_figures,
      'published_at', v_version.published_at,
      'ai_questions', v_version.ai_questions,
      'ai_generated_at', v_version.ai_generated_at,
      'vrio_version_id', v_version.vrio_version_id,
      'swot_version_id', v_version.swot_version_id,
      'five_c_version_id', v_version.five_c_version_id,
      'porter_version_id', v_version.porter_version_id,
      'pestel_version_id', v_version.pestel_version_id,
      'approved_at', v_version.approved_at,
      'updated_at', v_version.updated_at
    ),
    'upstream', jsonb_build_object(
      'vrio', case when v_vrio.id is null then null else jsonb_build_object('id', v_vrio.id, 'version_number', v_vrio.version_number, 'status', v_vrio.status) end,
      'swot', case when v_swot.id is null then null else jsonb_build_object('id', v_swot.id, 'version_number', v_swot.version_number, 'status', v_swot.status) end,
      'five_c', case when v_five.id is null then null else jsonb_build_object('id', v_five.id, 'version_number', v_five.version_number, 'status', v_five.status) end,
      'porter', case when v_porter.id is null then null else jsonb_build_object('id', v_porter.id, 'version_number', v_porter.version_number, 'status', v_porter.status) end,
      'pestel', case when v_pestel.id is null then null else jsonb_build_object('id', v_pestel.id, 'version_number', v_pestel.version_number, 'status', v_pestel.status) end
    ),
    'scopes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'version_number', s.version_number, 'status', s.status, 'scope_label', s.scope_label
      ) order by s.version_number desc)
      from app.bcg_versions s where s.tenant_id = p_tenant_id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg((
        jsonb_build_object(
          'id', i.id, 'title', i.title, 'description', i.description, 'kind', i.kind, 'origin', i.origin,
          'five_c_item_id', i.five_c_item_id, 'parent_item_id', i.parent_item_id,
          'overlap_key', i.overlap_key, 'overlap_mode', i.overlap_mode,
          'selected', i.selected, 'exclusion_reason', i.exclusion_reason,
          'market_definition', i.market_definition, 'geography', i.geography, 'segment', i.segment,
          'period_label', i.period_label, 'period_kind', i.period_kind, 'measure_basis', i.measure_basis,
          'currency', i.currency, 'unit_label', i.unit_label, 'scope_confirmed', i.scope_confirmed,
          'growth_method', i.growth_method, 'growth_percent', app._bcg_txt(i.growth_percent),
          'size_previous', app._bcg_txt(i.size_previous), 'size_current', app._bcg_txt(i.size_current),
          'size_scale', i.size_scale, 'growth_evidence', i.growth_evidence,
          'share_method', i.share_method, 'own_share', app._bcg_txt(i.own_share),
          'leader_share', app._bcg_txt(i.leader_share), 'own_amount', app._bcg_txt(i.own_amount),
          'leader_amount', app._bcg_txt(i.leader_amount), 'amount_scale', i.amount_scale,
          'client_is_leader', i.client_is_leader, 'leader_name', i.leader_name, 'share_evidence', i.share_evidence
        ) || jsonb_build_object(
          'figures_conflict', i.figures_conflict, 'conflict_accepted', i.conflict_accepted,
          'figures_confirmed', i.figures_confirmed, 'manual_lock', i.manual_lock,
          'advisor_note', i.advisor_note, 'open_question', i.open_question, 'question_status', i.question_status,
          'gap_reason', i.gap_reason, 'review_status', i.review_status, 'needs_revision', i.needs_revision,
          'revision_note', i.revision_note, 'reviewed_at', i.reviewed_at,
          'ai_state', i.ai_state, 'ai_payload', i.ai_payload, 'ai_generated_at', i.ai_generated_at,
          'sort_order', i.sort_order, 'updated_at', i.updated_at,
          'refs', coalesce((
            select jsonb_agg(jsonb_build_object(
              'ref_type', r.ref_type, 'ref_id', r.ref_id, 'label', r.label, 'excerpt', r.excerpt, 'slot', r.slot
            ) order by r.created_at)
            from app.bcg_item_refs r where r.item_id = i.id
          ), '[]'::jsonb)
        )
      ) order by i.sort_order, i.created_at)
      from app.bcg_items i
      where i.version_id = v_version.id and i.deleted_at is null
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'item_id', h.item_id, 'decision', h.decision, 'created_at', h.created_at
      ) order by h.created_at desc)
      from (select * from app.bcg_ai_history where version_id = v_version.id order by created_at desc limit 30) h
    ), '[]'::jsonb),
    'inputs', jsonb_build_object(
      'tenant', jsonb_build_object('id', v_tenant.id, 'name', v_tenant.name, 'website', v_tenant.website, 'audit_goal', v_tenant.audit_goal),
      'swot_items', coalesce((
        select jsonb_agg(jsonb_build_object('id', si.id, 'quadrant', si.quadrant, 'statement', si.statement) order by si.quadrant, si.sort_order)
        from app.swot_items si where si.version_id = v_version.swot_version_id and si.deleted_at is null
      ), '[]'::jsonb),
      'five_c_items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', fi.id, 'c_key', fi.c_key, 'title', fi.title,
          'finding', left(fi.finding, 2000), 'client_relevance', left(fi.client_relevance, 1000)
        ) order by fi.c_key, fi.sort_order)
        from app.five_c_items fi
        where fi.version_id = v_version.five_c_version_id and fi.deleted_at is null
          and fi.review_status <> 'rejected'::app.five_c_review
          and fi.content_type <> 'input_needed'::app.five_c_content_type
      ), '[]'::jsonb),
      'five_c_synthesis', case when v_five.id is null then null else left(v_five.synthesis_text, 4000) end,
      'porter_forces', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id, 'force_key', f.force_key, 'intensity', f.intensity,
          'headline_factor', f.headline_factor, 'motivation', left(f.motivation, 1500)
        ) order by f.sort_order)
        from app.porter_forces f where f.version_id = v_version.porter_version_id
      ), '[]'::jsonb),
      'porter_scope', case when v_porter.id is null then null else jsonb_build_object(
        'id', v_porter.id, 'market_sector', v_porter.market_sector,
        'known_competitors', v_porter.known_competitors, 'synthesis_text', left(v_porter.synthesis_text, 3000)
      ) end,
      'pestel_insights', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ins.id, 'dimension', ins.dimension, 'title', ins.title, 'observation', left(ins.observation, 1500)
        ) order by ins.dimension, ins.sort_order)
        from app.pestel_insights ins
        where ins.version_id = v_version.pestel_version_id and ins.deleted_at is null
          and ins.review_status <> 'rejected'::app.pestel_insight_review
      ), '[]'::jsonb),
      'vrio_resources', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'title', r.title, 'description', left(r.description, 1000),
          'outcome', app.vrio_outcome(
            coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'value'), 'not_assessed'),
            coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'rarity'), 'not_assessed'),
            coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'imitability'), 'not_assessed'),
            coalesce((select a.answer from app.vrio_assessments a where a.resource_id = r.id and a.criterion = 'organization'), 'not_assessed')
          )
        ) order by r.sort_order)
        from app.vrio_resources r
        where r.version_id = v_version.vrio_version_id and r.deleted_at is null and r.selected
      ), '[]'::jsonb),
      'meetings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'title', coalesce(nullif(trim(m.title), ''), to_char(m.created_at, 'YYYY-MM-DD HH24:MI')),
          'created_at', m.created_at,
          'text', left(coalesce(nullif(trim(m.summary_text), ''), left(coalesce(m.full_text, ''), 3000)), 3000)
        ) order by m.created_at desc)
        from (select * from app.meeting_recordings where tenant_id = p_tenant_id and transcript_status = 'ready' order by created_at desc limit 8) m
      ), '[]'::jsonb),
      'documents', coalesce((
        select jsonb_agg(jsonb_build_object('id', inp.id, 'kind', inp.kind, 'label', inp.label, 'excerpt', left(coalesce(inp.excerpt, ''), 2000)) order by inp.sort_order)
        from app.pestel_version_research_inputs inp
        where inp.version_id = v_version.pestel_version_id and inp.kind in ('document', 'note')
      ), '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function app.get_bcg_workbench(uuid, uuid) to authenticated;
