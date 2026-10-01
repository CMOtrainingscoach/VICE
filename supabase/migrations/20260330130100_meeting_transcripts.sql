-- Transcript + token storage (lightweight vs raw audio); basis for LLM-analyse

create type app.transcript_status as enum (
  'pending',
  'processing',
  'ready',
  'failed'
);

alter table app.meeting_recordings
  add column if not exists transcript_status app.transcript_status not null default 'pending',
  add column if not exists full_text text,
  add column if not exists token_ids integer[],
  add column if not exists token_count integer not null default 0,
  add column if not exists segments jsonb not null default '[]'::jsonb,
  add column if not exists stt_provider text,
  add column if not exists stt_model text,
  add column if not exists audio_deleted_at timestamptz,
  add column if not exists transcript_error text;

create or replace function app.set_meeting_transcript_processing(p_recording_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.meeting_recordings;
begin
  select * into v_row from app.meeting_recordings where id = p_recording_id;
  if v_row.id is null or v_row.created_by <> auth.uid() then
    raise exception 'Not allowed';
  end if;
  update app.meeting_recordings
  set transcript_status = 'processing', transcript_error = null
  where id = p_recording_id;
end;
$$;

grant execute on function app.set_meeting_transcript_processing(uuid) to authenticated;

create or replace function app.save_meeting_transcript(
  p_recording_id uuid,
  p_full_text text,
  p_token_ids integer[],
  p_segments jsonb,
  p_stt_provider text,
  p_stt_model text,
  p_delete_audio boolean default true
)
returns void
language plpgsql
security definer
set search_path = app, public, auth, extensions
as $$
declare
  v_row app.meeting_recordings;
  v_count int;
begin
  select * into v_row from app.meeting_recordings where id = p_recording_id for update;

  if v_row.id is null then
    raise exception 'Recording not found';
  end if;

  if v_row.created_by <> auth.uid() then
    raise exception 'Not the recording owner';
  end if;

  if not app.has_capability(v_row.tenant_id, 'transcript.edit') then
    raise exception 'Not allowed';
  end if;

  v_count := coalesce(array_length(p_token_ids, 1), 0);

  update app.meeting_recordings
  set
    full_text = p_full_text,
    token_ids = p_token_ids,
    token_count = v_count,
    segments = coalesce(p_segments, '[]'::jsonb),
    stt_provider = p_stt_provider,
    stt_model = p_stt_model,
    transcript_status = 'ready',
    transcript_error = null,
    audio_deleted_at = case when p_delete_audio then now() else audio_deleted_at end
  where id = p_recording_id;

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    v_row.tenant_id,
    auth.uid(),
    'meeting.transcript.saved',
    'meeting_recording',
    p_recording_id::text,
    jsonb_build_object(
      'token_count', v_count,
      'char_count', char_length(p_full_text),
      'audio_deleted', p_delete_audio
    )
  );
end;
$$;

grant execute on function app.save_meeting_transcript(uuid, text, integer[], jsonb, text, text, boolean) to authenticated;

create or replace function app.fail_meeting_transcript(
  p_recording_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
begin
  update app.meeting_recordings
  set transcript_status = 'failed', transcript_error = left(p_error, 500)
  where id = p_recording_id and created_by = auth.uid();
end;
$$;

grant execute on function app.fail_meeting_transcript(uuid, text) to authenticated;
