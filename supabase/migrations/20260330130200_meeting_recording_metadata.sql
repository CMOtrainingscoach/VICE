-- Titel, onderwerp, bewerken en verwijderen van meetings

alter table app.meeting_recordings
  add column if not exists title text not null default '',
  add column if not exists subject text not null default '',
  add column if not exists updated_at timestamptz not null default now();

alter table app.meeting_recordings
  add constraint meeting_recordings_title_len check (char_length(title) <= 200),
  add constraint meeting_recordings_subject_len check (char_length(subject) <= 500);

create or replace function app.touch_meeting_recording_updated()
returns trigger
language plpgsql
set search_path = app
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists meeting_recordings_updated on app.meeting_recordings;
create trigger meeting_recordings_updated
  before update on app.meeting_recordings
  for each row
  execute function app.touch_meeting_recording_updated();

create or replace function app.update_meeting_recording_meta(
  p_recording_id uuid,
  p_title text,
  p_subject text
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
    subject = left(trim(coalesce(p_subject, '')), 500)
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

grant execute on function app.update_meeting_recording_meta(uuid, text, text) to authenticated;

create or replace function app.update_meeting_transcript_text(
  p_recording_id uuid,
  p_full_text text,
  p_token_ids integer[]
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_tenant_id uuid;
  v_count int;
begin
  select tenant_id into v_tenant_id
  from app.meeting_recordings
  where id = p_recording_id;

  if v_tenant_id is null then
    raise exception 'Recording not found';
  end if;

  if not app.has_capability(v_tenant_id, 'transcript.edit') then
    raise exception 'Not allowed';
  end if;

  v_count := coalesce(array_length(p_token_ids, 1), 0);

  update app.meeting_recordings
  set
    full_text = p_full_text,
    token_ids = p_token_ids,
    token_count = v_count,
    transcript_status = 'ready'
  where id = p_recording_id;

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    v_tenant_id,
    auth.uid(),
    'meeting.transcript.edited',
    'meeting_recording',
    p_recording_id::text,
    jsonb_build_object('token_count', v_count)
  );
end;
$$;

grant execute on function app.update_meeting_transcript_text(uuid, text, integer[]) to authenticated;

create or replace function app.delete_meeting_recording(p_recording_id uuid)
returns text
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.meeting_recordings;
  v_path text;
begin
  select * into v_row
  from app.meeting_recordings
  where id = p_recording_id
  for update;

  if v_row.id is null then
    raise exception 'Recording not found';
  end if;

  if not app.has_capability(v_row.tenant_id, 'meeting.record') then
    raise exception 'Not allowed';
  end if;

  v_path := case
    when v_row.audio_deleted_at is null then v_row.storage_path
    else null
  end;

  delete from app.meeting_recordings where id = p_recording_id;

  insert into app.audit_events (tenant_id, actor_user_id, action, target_type, target_id)
  values (
    v_row.tenant_id,
    auth.uid(),
    'meeting.recording.deleted',
    'meeting_recording',
    p_recording_id::text
  );

  return v_path;
end;
$$;

grant execute on function app.delete_meeting_recording(uuid) to authenticated;
