-- Video concepts (Kling image-to-video). Draai na 20260330136415.

create table if not exists app.platform_kling_credits (
  id int primary key default 1 check (id = 1),
  units_balance numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

insert into app.platform_kling_credits (id, units_balance) values (1, 0)
on conflict (id) do nothing;

create table if not exists app.platform_kling_credit_events (
  id uuid primary key default gen_random_uuid(),
  delta numeric(12, 2) not null,
  balance_after numeric(12, 2) not null,
  kind text not null check (kind in ('top_up', 'generation', 'adjustment')),
  note text not null default '',
  video_concept_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create table if not exists app.video_concepts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  internal_name text not null default '',
  intended_use text not null default 'general'
    check (intended_use in ('social', 'ads', 'hero', 'general')),
  aspect_preset text not null default 'reel_9_16',
  duration_seconds integer not null default 5 check (duration_seconds in (5, 10)),
  resolution text not null default '720p' check (resolution in ('720p', '1080p')),
  motion_prompt text not null default '',
  source_kind text not null default 'upload' check (source_kind in ('upload', 'beeld')),
  source_image_path text not null default '',
  source_mime_type text not null default 'image/jpeg',
  beeld_composition_id uuid references app.beeld_compositions (id) on delete set null,
  output_video_path text not null default '',
  output_mime_type text not null default 'video/mp4',
  job_status text not null default 'idle'
    check (job_status in ('idle', 'processing', 'ready', 'failed')),
  kling_task_id text not null default '',
  job_error text not null default '',
  units_estimated numeric(12, 2),
  units_charged numeric(12, 2),
  brand_id uuid references app.client_brands (id) on delete set null,
  brand_version_number integer,
  brand_voice_snapshot text not null default '',
  brand_visual_snapshot jsonb not null default '{}'::jsonb,
  buyer_persona_id uuid references app.persona_people (id) on delete set null,
  brand_character_id uuid references app.brand_characters (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create index video_concepts_tenant_updated_idx on app.video_concepts (tenant_id, updated_at desc);

alter table app.platform_kling_credits enable row level security;
alter table app.platform_kling_credit_events enable row level security;
alter table app.video_concepts enable row level security;

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

create or replace function app.get_platform_kling_credits_public()
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_balance numeric(12, 2);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.is_platform_admin() then raise exception 'Forbidden'; end if;
  select units_balance into v_balance from app.platform_kling_credits where id = 1;
  return jsonb_build_object(
    'unitsBalance', coalesce(v_balance, 0),
    'apiKeyConfigured', false
  );
end;
$$;

create or replace function app.top_up_platform_kling_credits(p_delta numeric, p_note text)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_new numeric(12, 2);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.is_platform_admin() or not app.require_admin_mfa() then raise exception 'Forbidden'; end if;
  if p_delta is null or p_delta <= 0 then raise exception 'Voer een positief aantal units in'; end if;

  update app.platform_kling_credits set
    units_balance = units_balance + p_delta,
    updated_at = now(),
    updated_by = auth.uid()
  where id = 1
  returning units_balance into v_new;

  insert into app.platform_kling_credit_events (delta, balance_after, kind, note, created_by)
  values (p_delta, v_new, 'top_up', coalesce(p_note, ''), auth.uid());

  return jsonb_build_object('unitsBalance', v_new);
end;
$$;

create or replace function app.try_deduct_platform_kling_credits(
  p_amount numeric,
  p_video_concept_id uuid,
  p_note text
)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_balance numeric(12, 2);
declare v_new numeric(12, 2);
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Ongeldig bedrag'; end if;

  select units_balance into v_balance from app.platform_kling_credits where id = 1 for update;
  if coalesce(v_balance, 0) < p_amount then
    raise exception 'Onvoldoende Kling-units. Laad saldo op in Instellingen.';
  end if;

  update app.platform_kling_credits set
    units_balance = units_balance - p_amount,
    updated_at = now()
  where id = 1
  returning units_balance into v_new;

  insert into app.platform_kling_credit_events (delta, balance_after, kind, note, video_concept_id)
  values (-p_amount, v_new, 'generation', coalesce(p_note, ''), p_video_concept_id);

  return jsonb_build_object('unitsBalance', v_new);
end;
$$;

create or replace function app.list_video_concepts(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'internalName', c.internal_name,
      'intendedUse', c.intended_use,
      'aspectPreset', c.aspect_preset,
      'durationSeconds', c.duration_seconds,
      'jobStatus', c.job_status,
      'updatedAt', c.updated_at
    ) order by c.updated_at desc), '[]'::jsonb)
    from app.video_concepts c
    where c.tenant_id = p_tenant_id
  );
end;
$$;

create or replace function app.get_video_concept(p_concept_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_row app.video_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.video_concepts where id = p_concept_id;
  if v_row.id is null then raise exception 'Video niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  return app._video_concept_json(v_row);
end;
$$;

create or replace function app.create_video_concept(
  p_tenant_id uuid,
  p_internal_name text,
  p_intended_use text,
  p_aspect_preset text,
  p_duration_seconds integer,
  p_resolution text,
  p_brand_id uuid,
  p_brand_version_number integer,
  p_brand_voice_snapshot text,
  p_brand_visual_snapshot jsonb
)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_row app.video_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;

  insert into app.video_concepts (
    tenant_id, internal_name, intended_use, aspect_preset, duration_seconds, resolution,
    brand_id, brand_version_number, brand_voice_snapshot, brand_visual_snapshot,
    created_by, updated_by
  ) values (
    p_tenant_id,
    coalesce(p_internal_name, 'Nieuwe video'),
    coalesce(p_intended_use, 'general'),
    coalesce(p_aspect_preset, 'reel_9_16'),
    coalesce(p_duration_seconds, 5),
    coalesce(p_resolution, '720p'),
    p_brand_id, p_brand_version_number,
    coalesce(p_brand_voice_snapshot, ''), coalesce(p_brand_visual_snapshot, '{}'::jsonb),
    auth.uid(), auth.uid()
  ) returning * into v_row;

  return app._video_concept_json(v_row);
end;
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

create or replace function app.delete_video_concept(p_concept_id uuid)
returns void language plpgsql security definer set search_path = app, public, auth as $$
declare v_row app.video_concepts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from app.video_concepts where id = p_concept_id for update;
  if v_row.id is null then raise exception 'Video niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  delete from app.video_concepts where id = p_concept_id;
end;
$$;

revoke execute on function app.get_platform_kling_credits_public() from public, anon;
revoke execute on function app.top_up_platform_kling_credits(numeric, text) from public, anon;
revoke execute on function app.try_deduct_platform_kling_credits(numeric, uuid, text) from public, anon;
revoke execute on function app.list_video_concepts(uuid) from public, anon;
revoke execute on function app.get_video_concept(uuid) from public, anon;
revoke execute on function app.create_video_concept(uuid, text, text, text, integer, text, uuid, integer, text, jsonb) from public, anon;
revoke execute on function app.save_video_concept(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function app.delete_video_concept(uuid) from public, anon;

grant execute on function app.get_platform_kling_credits_public() to authenticated;
grant execute on function app.top_up_platform_kling_credits(numeric, text) to authenticated;
grant execute on function app.try_deduct_platform_kling_credits(numeric, uuid, text) to service_role;
grant execute on function app.list_video_concepts(uuid) to authenticated;
grant execute on function app.get_video_concept(uuid) to authenticated;
grant execute on function app.create_video_concept(uuid, text, text, text, integer, text, uuid, integer, text, jsonb) to authenticated;
grant execute on function app.save_video_concept(uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.delete_video_concept(uuid) to authenticated;
