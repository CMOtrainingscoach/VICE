-- OpenArt platform-koppeling + tenant video-tegoed (handmatige facturatie).

create or replace function app.get_platform_integration_public(p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.platform_integrations;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.is_platform_admin() then raise exception 'Forbidden'; end if;

  select * into v_row from app.platform_integrations where provider = p_provider;

  if v_row.provider is null then
    return jsonb_build_object(
      'connected', false,
      'status', 'disconnected',
      'accountEmail', '',
      'customerId', '',
      'loginCustomerId', '',
      'projectId', '',
      'subscriptionActive', false,
      'openArtCredits', null,
      'lastError', ''
    );
  end if;

  return jsonb_build_object(
    'connected', v_row.status = 'connected' and coalesce(v_row.refresh_token, '') <> '',
    'status', v_row.status,
    'accountEmail', v_row.account_email,
    'customerId', coalesce(v_row.metadata->>'customerId', ''),
    'loginCustomerId', coalesce(v_row.metadata->>'loginCustomerId', ''),
    'projectId', coalesce(v_row.metadata->>'projectId', ''),
    'subscriptionActive', coalesce((v_row.metadata->>'subscriptionActive')::boolean, false),
    'openArtCredits', nullif(v_row.metadata->>'openArtCredits', '')::numeric,
    'lastError', v_row.last_error,
    'updatedAt', v_row.updated_at
  );
end;
$$;

alter table app.platform_integrations drop constraint if exists platform_integrations_provider_check;
alter table app.platform_integrations add constraint platform_integrations_provider_check
  check (provider in ('google_ads', 'openart'));

create table if not exists app.tenant_video_wallets (
  tenant_id uuid primary key references app.tenants (id) on delete cascade,
  credits_balance numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table if not exists app.tenant_video_credit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  delta numeric(12, 2) not null,
  balance_after numeric(12, 2) not null,
  kind text not null check (kind in ('top_up', 'generation', 'adjustment')),
  note text not null default '',
  video_concept_id uuid references app.video_concepts (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

alter table app.video_concepts
  add column if not exists video_provider text not null default 'openart'
    check (video_provider in ('openart', 'kling'));

alter table app.video_concepts
  add column if not exists openart_resource_id text not null default '';

create index tenant_video_credit_events_tenant_idx on app.tenant_video_credit_events (tenant_id, created_at desc);

alter table app.tenant_video_wallets enable row level security;
alter table app.tenant_video_credit_events enable row level security;

create or replace function app.get_tenant_video_wallet(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_balance numeric(12, 2);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.has_capability(p_tenant_id, 'audit.edit') and not app.is_platform_admin() then
    raise exception 'Forbidden';
  end if;
  select credits_balance into v_balance from app.tenant_video_wallets where tenant_id = p_tenant_id;
  return jsonb_build_object('creditsBalance', coalesce(v_balance, 0));
end;
$$;

create or replace function app.top_up_tenant_video_wallet(p_tenant_id uuid, p_delta numeric, p_note text)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_new numeric(12, 2);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not app.is_platform_admin() or not app.require_admin_mfa() then raise exception 'Forbidden'; end if;
  if p_delta is null or p_delta <= 0 then raise exception 'Voer een positief bedrag in'; end if;

  insert into app.tenant_video_wallets (tenant_id, credits_balance, updated_by)
  values (p_tenant_id, p_delta, auth.uid())
  on conflict (tenant_id) do update set
    credits_balance = app.tenant_video_wallets.credits_balance + p_delta,
    updated_at = now(),
    updated_by = auth.uid()
  returning credits_balance into v_new;

  insert into app.tenant_video_credit_events (tenant_id, delta, balance_after, kind, note, created_by)
  values (p_tenant_id, p_delta, v_new, 'top_up', coalesce(p_note, ''), auth.uid());

  return jsonb_build_object('creditsBalance', v_new);
end;
$$;

create or replace function app.try_deduct_tenant_video_credits(
  p_tenant_id uuid,
  p_amount numeric,
  p_video_concept_id uuid,
  p_note text
)
returns jsonb language plpgsql security definer set search_path = app, public, auth as $$
declare v_balance numeric(12, 2);
declare v_new numeric(12, 2);
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Ongeldig bedrag'; end if;

  insert into app.tenant_video_wallets (tenant_id, credits_balance)
  values (p_tenant_id, 0)
  on conflict (tenant_id) do nothing;

  select credits_balance into v_balance from app.tenant_video_wallets where tenant_id = p_tenant_id for update;
  if coalesce(v_balance, 0) < p_amount then
    raise exception 'Onvoldoende video-tegoed voor deze klant. Laad tegoed bij in Instellingen.';
  end if;

  update app.tenant_video_wallets set
    credits_balance = credits_balance - p_amount,
    updated_at = now()
  where tenant_id = p_tenant_id
  returning credits_balance into v_new;

  insert into app.tenant_video_credit_events (tenant_id, delta, balance_after, kind, note, video_concept_id)
  values (p_tenant_id, -p_amount, v_new, 'generation', coalesce(p_note, ''), p_video_concept_id);

  return jsonb_build_object('creditsBalance', v_new);
end;
$$;

-- Uitbreiden video JSON (provider + openart resource)
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

revoke execute on function app.get_tenant_video_wallet(uuid) from public, anon;
revoke execute on function app.top_up_tenant_video_wallet(uuid, numeric, text) from public, anon;
revoke execute on function app.try_deduct_tenant_video_credits(uuid, numeric, uuid, text) from public, anon;

grant execute on function app.get_tenant_video_wallet(uuid) to authenticated;
grant execute on function app.top_up_tenant_video_wallet(uuid, numeric, text) to authenticated;
grant execute on function app.try_deduct_tenant_video_credits(uuid, numeric, uuid, text) to service_role;

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
