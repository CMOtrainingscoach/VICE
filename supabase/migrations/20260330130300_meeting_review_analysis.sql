-- Review-workflow + meeting-analyse (samenvatting, actiepunten)

create type app.meeting_review_status as enum (
  'pending',
  'in_review',
  'approved'
);

create type app.meeting_analysis_status as enum (
  'none',
  'pending',
  'ready',
  'failed'
);

alter table app.meeting_recordings
  add column if not exists notes text not null default '',
  add column if not exists review_status app.meeting_review_status not null default 'pending',
  add column if not exists analysis_status app.meeting_analysis_status not null default 'none',
  add column if not exists summary_text text,
  add column if not exists action_items jsonb not null default '[]'::jsonb,
  add column if not exists analysis_error text,
  add column if not exists analyzed_at timestamptz;

alter table app.meeting_recordings
  add constraint meeting_recordings_notes_len check (char_length(notes) <= 10000);

drop function if exists app.update_meeting_recording_meta(uuid, text, text);

create or replace function app.update_meeting_recording_meta(
  p_recording_id uuid,
  p_title text,
  p_subject text,
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id
  from app.meeting_recordings
  where id = p_recording_id;

  if v_tenant_id is null then
    raise exception 'Recording not found';
  end if;

  if not app.has_capability(v_tenant_id, 'meeting.record') then
    raise exception 'Not allowed';
  end if;

  update app.meeting_recordings
  set
    title = left(trim(coalesce(p_title, '')), 200),
    subject = left(trim(coalesce(p_subject, '')), 500),
    notes = left(trim(coalesce(p_notes, '')), 10000)
  where id = p_recording_id;

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id)
  values (
    v_tenant_id,
    auth.uid(),
    'meeting.recording.updated',
    'meeting_recording',
    p_recording_id::text
  );
end;
$$;

revoke all on function app.update_meeting_recording_meta(uuid, text, text, text) from public;
grant execute on function app.update_meeting_recording_meta(uuid, text, text, text) to authenticated;

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
    review_status = 'in_review',
    audio_deleted_at = case when p_delete_audio then now() else audio_deleted_at end
  where id = p_recording_id;

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    v_row.tenant_id,
    auth.uid(),
    'meeting.transcript.saved',
    'meeting_recording',
    p_recording_id::text,
    jsonb_build_object('token_count', v_count, 'audio_deleted', p_delete_audio)
  );
end;
$$;

create or replace function app.approve_meeting_transcript(p_recording_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id
  from app.meeting_recordings
  where id = p_recording_id;

  if v_tenant_id is null then
    raise exception 'Recording not found';
  end if;

  if not app.has_capability(v_tenant_id, 'task.review') then
    raise exception 'Not allowed';
  end if;

  update app.meeting_recordings
  set review_status = 'approved'
  where id = p_recording_id
    and transcript_status = 'ready';

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id)
  values (
    v_tenant_id,
    auth.uid(),
    'meeting.transcript.approved',
    'meeting_recording',
    p_recording_id::text
  );
end;
$$;

grant execute on function app.approve_meeting_transcript(uuid) to authenticated;

create or replace function app.set_meeting_analysis_pending(p_recording_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from app.meeting_recordings where id = p_recording_id;
  if v_tenant_id is null or not app.has_capability(v_tenant_id, 'audit.edit') then
    raise exception 'Not allowed';
  end if;
  update app.meeting_recordings
  set analysis_status = 'pending', analysis_error = null
  where id = p_recording_id and review_status = 'approved';
end;
$$;

grant execute on function app.set_meeting_analysis_pending(uuid) to authenticated;

create or replace function app.save_meeting_analysis(
  p_recording_id uuid,
  p_summary text,
  p_action_items jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from app.meeting_recordings where id = p_recording_id;

  if v_tenant_id is null then
    raise exception 'Recording not found';
  end if;

  if not app.has_capability(v_tenant_id, 'audit.edit') then
    raise exception 'Not allowed';
  end if;

  update app.meeting_recordings
  set
    summary_text = p_summary,
    action_items = coalesce(p_action_items, '[]'::jsonb),
    analysis_status = 'ready',
    analysis_error = null,
    analyzed_at = now()
  where id = p_recording_id;

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id)
  values (
    v_tenant_id,
    auth.uid(),
    'meeting.analysis.completed',
    'meeting_recording',
    p_recording_id::text
  );
end;
$$;

grant execute on function app.save_meeting_analysis(uuid, text, jsonb) to authenticated;

create or replace function app.fail_meeting_analysis(
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
  set analysis_status = 'failed', analysis_error = left(p_error, 500)
  where id = p_recording_id;
end;
$$;

grant execute on function app.fail_meeting_analysis(uuid, text) to authenticated;
