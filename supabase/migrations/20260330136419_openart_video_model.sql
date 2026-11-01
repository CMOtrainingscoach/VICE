-- OpenArt model keuze per video concept (Kling 2.6 vs Seedance 2.5). Draai na 20260330136418.

alter table app.video_concepts
  add column if not exists openart_model text not null default 'kling2-6'
  check (openart_model in ('kling2-6', 'byte-plus-seedance-2-5'));

create or replace function app._video_concept_json(p_row app.video_concepts)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', p_row.id,
    'tenantId', p_row.tenant_id,
    'internalName', p_row.internal_name,
    'intendedUse', p_row.intended_use,
    'aspectPreset', p_row.aspect_preset,
    'durationSeconds', p_row.duration_seconds,
    'resolution', p_row.resolution,
    'motionPrompt', p_row.motion_prompt,
    'sourceKind', p_row.source_kind,
    'sourceImagePath', p_row.source_image_path,
    'sourceMimeType', p_row.source_mime_type,
    'beeldCompositionId', p_row.beeld_composition_id,
    'outputVideoPath', p_row.output_video_path,
    'outputMimeType', p_row.output_mime_type,
    'jobStatus', p_row.job_status,
    'klingTaskId', p_row.kling_task_id,
    'videoProvider', p_row.video_provider,
    'openartResourceId', p_row.openart_resource_id,
    'openartModel', p_row.openart_model,
    'jobError', p_row.job_error,
    'unitsEstimated', p_row.units_estimated,
    'unitsCharged', p_row.units_charged,
    'brandId', p_row.brand_id,
    'brandVersionNumber', p_row.brand_version_number,
    'brandVoiceSnapshot', p_row.brand_voice_snapshot,
    'brandVisualSnapshot', p_row.brand_visual_snapshot,
    'buyerPersonaId', p_row.buyer_persona_id,
    'brandCharacterId', p_row.brand_character_id,
    'createdAt', p_row.created_at,
    'updatedAt', p_row.updated_at
  );
$$;

create or replace function app.save_video_concept(p_concept_id uuid, p_expected timestamptz, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_row app.video_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.video_concepts where id = p_concept_id for update;
  if v_row.id is null then raise exception 'Video niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if p_expected is not null and v_row.updated_at <> p_expected then
    raise exception 'Video is ondertussen gewijzigd. Herlaad de pagina.';
  end if;

  update app.video_concepts set
    internal_name = case when p_patch ? 'internalName' then coalesce(p_patch->>'internalName', '') else internal_name end,
    intended_use = case when p_patch ? 'intendedUse' then coalesce(p_patch->>'intendedUse', intended_use) else intended_use end,
    aspect_preset = case when p_patch ? 'aspectPreset' then coalesce(p_patch->>'aspectPreset', aspect_preset) else aspect_preset end,
    duration_seconds = case when p_patch ? 'durationSeconds' then (p_patch->>'durationSeconds')::integer else duration_seconds end,
    resolution = case when p_patch ? 'resolution' then coalesce(p_patch->>'resolution', resolution) else resolution end,
    motion_prompt = case when p_patch ? 'motionPrompt' then coalesce(p_patch->>'motionPrompt', '') else motion_prompt end,
    source_kind = case when p_patch ? 'sourceKind' then coalesce(p_patch->>'sourceKind', source_kind) else source_kind end,
    source_image_path = case when p_patch ? 'sourceImagePath' then coalesce(p_patch->>'sourceImagePath', '') else source_image_path end,
    source_mime_type = case when p_patch ? 'sourceMimeType' then coalesce(p_patch->>'sourceMimeType', source_mime_type) else source_mime_type end,
    beeld_composition_id = case when p_patch ? 'beeldCompositionId' then nullif(p_patch->>'beeldCompositionId', '')::uuid else beeld_composition_id end,
    output_video_path = case when p_patch ? 'outputVideoPath' then coalesce(p_patch->>'outputVideoPath', '') else output_video_path end,
    job_status = case when p_patch ? 'jobStatus' then coalesce(p_patch->>'jobStatus', job_status) else job_status end,
    kling_task_id = case when p_patch ? 'klingTaskId' then coalesce(p_patch->>'klingTaskId', '') else kling_task_id end,
    video_provider = case when p_patch ? 'videoProvider' then coalesce(p_patch->>'videoProvider', video_provider) else video_provider end,
    openart_resource_id = case when p_patch ? 'openartResourceId' then coalesce(p_patch->>'openartResourceId', '') else openart_resource_id end,
    openart_model = case when p_patch ? 'openartModel' then coalesce(p_patch->>'openartModel', openart_model) else openart_model end,
    job_error = case when p_patch ? 'jobError' then coalesce(p_patch->>'jobError', '') else job_error end,
    units_estimated = case when p_patch ? 'unitsEstimated' then (p_patch->>'unitsEstimated')::numeric else units_estimated end,
    units_charged = case when p_patch ? 'unitsCharged' then (p_patch->>'unitsCharged')::numeric else units_charged end,
    buyer_persona_id = case when p_patch ? 'buyerPersonaId' then nullif(p_patch->>'buyerPersonaId', '')::uuid else buyer_persona_id end,
    brand_character_id = case when p_patch ? 'brandCharacterId' then nullif(p_patch->>'brandCharacterId', '')::uuid else brand_character_id end,
    updated_at = now(),
    updated_by = auth.uid()
  where id = p_concept_id returning * into v_row;

  return app._video_concept_json(v_row);
end;
$$;
