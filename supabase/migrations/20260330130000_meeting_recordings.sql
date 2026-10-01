-- Fase 2: lightweight meeting recordings (metadata + private storage)

create type app.recording_status as enum ('uploading', 'ready', 'failed');

create table app.meeting_recordings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  storage_path text not null,
  mime_type text not null default 'audio/webm',
  byte_size bigint not null default 0,
  duration_ms integer not null default 0,
  capture_mode text not null default 'microphone',
  status app.recording_status not null default 'uploading',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint meeting_recordings_path_unique unique (storage_path),
  constraint meeting_recordings_byte_size_nonneg check (byte_size >= 0),
  constraint meeting_recordings_duration_nonneg check (duration_ms >= 0),
  constraint meeting_recordings_capture_mode check (
    capture_mode in ('microphone', 'tab_audio')
  )
);

create index meeting_recordings_tenant_created_idx
  on app.meeting_recordings (tenant_id, created_at desc);

alter table app.meeting_recordings enable row level security;

create policy meeting_recordings_select_member
  on app.meeting_recordings for select to authenticated
  using (app.has_capability(tenant_id, 'source.read_internal'));

create policy meeting_recordings_select_admin_record
  on app.meeting_recordings for select to authenticated
  using (app.has_capability(tenant_id, 'meeting.record'));

-- Writes via RPC only
create policy meeting_recordings_no_direct_write
  on app.meeting_recordings for insert to authenticated
  with check (false);

create policy meeting_recordings_no_direct_update
  on app.meeting_recordings for update to authenticated
  using (false);

grant select on app.meeting_recordings to authenticated;

-- 25 MiB per file; webm/opus only (speech-optimized pipeline)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meeting-recordings',
  'meeting-recordings',
  false,
  26214400,
  array['audio/webm', 'audio/ogg', 'audio/mp4']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function app.meeting_recording_tenant_from_path(p_path text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select nullif(split_part(p_path, '/', 1), '')::uuid;
$$;

create policy meeting_recordings_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meeting-recordings'
    and app.has_capability(
      app.meeting_recording_tenant_from_path(name),
      'meeting.record'
    )
  );

create policy meeting_recordings_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'meeting-recordings'
    and (
      app.has_capability(
        app.meeting_recording_tenant_from_path(name),
        'meeting.record'
      )
      or app.has_capability(
        app.meeting_recording_tenant_from_path(name),
        'source.read_internal'
      )
    )
  );

create policy meeting_recordings_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'meeting-recordings'
    and app.has_capability(
      app.meeting_recording_tenant_from_path(name),
      'meeting.record'
    )
  );

create or replace function app.start_meeting_recording(
  p_tenant_id uuid,
  p_capture_mode text default 'microphone',
  p_mime_type text default 'audio/webm'
)
returns table (recording_id uuid, storage_path text)
language plpgsql
security definer
set search_path = app, public, auth, extensions
as $$
declare
  v_id uuid;
  v_path text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not app.has_capability(p_tenant_id, 'meeting.record') then
    raise exception 'Not allowed to record for this tenant';
  end if;

  if p_capture_mode not in ('microphone', 'tab_audio') then
    raise exception 'Invalid capture mode';
  end if;

  v_id := gen_random_uuid();
  v_path := p_tenant_id::text || '/' || v_id::text || '.webm';

  insert into app.meeting_recordings (
    id,
    tenant_id,
    storage_path,
    mime_type,
    capture_mode,
    created_by
  )
  values (v_id, p_tenant_id, v_path, p_mime_type, p_capture_mode, auth.uid());

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id)
  values (
    p_tenant_id,
    auth.uid(),
    'meeting.recording.started',
    'meeting_recording',
    v_id::text
  );

  return query select v_id, v_path;
end;
$$;

revoke all on function app.start_meeting_recording(uuid, text, text) from public;
grant execute on function app.start_meeting_recording(uuid, text, text) to authenticated;

create or replace function app.complete_meeting_recording(
  p_recording_id uuid,
  p_byte_size bigint,
  p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path = app, public, auth, extensions
as $$
declare
  v_row app.meeting_recordings;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_row
  from app.meeting_recordings
  where id = p_recording_id
  for update;

  if v_row.id is null then
    raise exception 'Recording not found';
  end if;

  if v_row.created_by <> auth.uid() then
    raise exception 'Not the recording owner';
  end if;

  if not app.has_capability(v_row.tenant_id, 'meeting.record') then
    raise exception 'Not allowed';
  end if;

  if p_byte_size > 26214400 then
    raise exception 'File exceeds 25 MiB limit';
  end if;

  update app.meeting_recordings
  set
    byte_size = p_byte_size,
    duration_ms = p_duration_ms,
    status = 'ready'
  where id = p_recording_id;

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    v_row.tenant_id,
    auth.uid(),
    'meeting.recording.completed',
    'meeting_recording',
    p_recording_id::text,
    jsonb_build_object(
      'byte_size', p_byte_size,
      'duration_ms', p_duration_ms
    )
  );
end;
$$;

revoke all on function app.complete_meeting_recording(uuid, bigint, integer) from public;
grant execute on function app.complete_meeting_recording(uuid, bigint, integer) to authenticated;

create or replace function app.fail_meeting_recording(p_recording_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth, extensions
as $$
declare
  v_row app.meeting_recordings;
begin
  select * into v_row from app.meeting_recordings where id = p_recording_id;
  if v_row.id is null or v_row.created_by <> auth.uid() then
    return;
  end if;

  update app.meeting_recordings set status = 'failed' where id = p_recording_id;
end;
$$;

revoke all on function app.fail_meeting_recording(uuid) from public;
grant execute on function app.fail_meeting_recording(uuid) to authenticated;
