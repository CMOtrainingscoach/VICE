-- Merkhandleiding. Draai na 20260330133700. Eerdere migraties niet opnieuw.
-- Dit is niet de brand audit. Auditobservaties worden hier niet automatisch een merkrichtlijn.

create table app.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references app.tenants (id) on delete cascade,
  published_version_id uuid,
  created_at timestamptz not null default now()
);

create table app.brand_profile_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references app.brand_profiles (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'published')),
  source_document_id uuid references app.audit_context_documents (id) on delete set null,
  source_hash text not null default '',
  source_status text,
  source_saved_at timestamptz,
  brand_name text not null default '',
  essence text not null default '',
  positioning text not null default '',
  promise text not null default '',
  audience text not null default '',
  values_text text not null default '',
  voice jsonb not null default '{}'::jsonb,
  visual jsonb not null default '{}'::jsonb,
  import_warnings text[] not null default '{}',
  manual_keys text[] not null default '{}',
  not_applicable text[] not null default '{}',
  approved_snapshot jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  published_at timestamptz,
  published_by uuid references auth.users (id),
  unique (profile_id, version_number)
);

alter table app.brand_profiles
  add constraint brand_profiles_published_version_fkey
  foreign key (published_version_id) references app.brand_profile_versions (id) on delete set null;

create table app.brand_profile_provenance (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.brand_profile_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  field_key text not null,
  origin text not null,
  document_id uuid,
  content_hash text not null default '',
  section_path text not null default '',
  passage text not null default '',
  method text not null default '',
  imported_at timestamptz not null default now()
);

create table app.brand_profile_styles (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.brand_profile_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  role text not null default '',
  family text not null default '',
  weight text not null default '',
  italic boolean not null default false,
  size text not null default '',
  unit text not null default '',
  line_height text not null default '',
  letter_spacing text not null default '',
  transform text not null default '',
  usage text not null default '',
  fallback text not null default '',
  sample text not null default '',
  mobile_size text not null default '',
  mobile_unit text not null default '',
  sort integer not null default 0,
  archived_at timestamptz
);

create table app.brand_profile_fonts (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.brand_profile_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  name text not null default '',
  storage_path text not null default '',
  weights text not null default '',
  italic boolean not null default false,
  variable boolean not null default false,
  origin text not null default '',
  license_note text not null default '',
  export_allowed boolean not null default false,
  use_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table app.brand_profile_colors (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.brand_profile_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  name text not null default '',
  hex text not null,
  rgb text not null,
  role text not null default 'unknown',
  note text not null default '',
  cmyk text not null default '',
  pantone text not null default '',
  sort integer not null default 0,
  archived_at timestamptz,
  check (hex ~ '^#[0-9A-F]{6}$'),
  check (role in ('primary', 'secondary', 'accent', 'background', 'text', 'support', 'unknown'))
);

create table app.brand_profile_assets (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.brand_profile_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  kind text not null default 'primary',
  name text not null default '',
  storage_path text not null default '',
  format text not null default '',
  width text not null default '',
  height text not null default '',
  usage text not null default '',
  background text not null default '',
  min_size text not null default '',
  clear_space text not null default '',
  restrictions text not null default '',
  reference_status text not null default 'official',
  export_allowed boolean not null default false,
  missing_note text not null default '',
  archived_at timestamptz,
  check (kind in ('primary', 'alternate', 'wordmark', 'mark', 'light', 'dark', 'mono', 'favicon', 'reference')),
  check (reference_status in ('official', 'approved_reference', 'inspiration', 'ai_example'))
);

create table app.brand_profile_reviews (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.brand_profile_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  section text not null default 'overview',
  label text not null,
  origin text not null,
  section_path text not null default '',
  passage text not null default '',
  proposal jsonb,
  decision text not null default 'pending' check (decision in ('pending', 'accepted', 'dismissed'))
);

create table app.brand_profile_prompts (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.brand_profile_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  name text not null default '',
  purpose text not null default '',
  situation text not null default '',
  body text not null default '',
  exclusions text not null default '',
  composed boolean not null default false,
  source_passage text not null default '',
  archived_at timestamptz,
  updated_at timestamptz not null default now()
);

create table app.brand_prompt_instances (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.brand_profile_versions (id) on delete cascade,
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  template_id uuid references app.brand_profile_prompts (id) on delete set null,
  input jsonb not null default '{}'::jsonb,
  output text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

alter table app.brand_profiles enable row level security;
alter table app.brand_profile_versions enable row level security;
alter table app.brand_profile_provenance enable row level security;
alter table app.brand_profile_styles enable row level security;
alter table app.brand_profile_fonts enable row level security;
alter table app.brand_profile_colors enable row level security;
alter table app.brand_profile_assets enable row level security;
alter table app.brand_profile_reviews enable row level security;
alter table app.brand_profile_prompts enable row level security;
alter table app.brand_prompt_instances enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-kit',
  'brand-kit',
  false,
  8388608,
  array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'font/woff', 'font/woff2', 'application/font-woff', 'application/font-woff2']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function app._brand_profile_rgb(p_hex text)
returns text
language plpgsql
immutable
as $$
begin
  return format(
    'rgb(%s, %s, %s)',
    ('x' || substr(p_hex, 2, 2))::bit(8)::int,
    ('x' || substr(p_hex, 4, 2))::bit(8)::int,
    ('x' || substr(p_hex, 6, 2))::bit(8)::int
  );
end;
$$;

create or replace function app._brand_profile_lock(p_version_id uuid, p_expected timestamptz)
returns app.brand_profile_versions
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_row app.brand_profile_versions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_row := null;
  select * into v_row from app.brand_profile_versions where id = p_version_id for update;
  if v_row is null then raise exception 'Merkprofiel niet gevonden'; end if;
  if not app.has_capability(v_row.tenant_id, 'audit.edit') then raise exception 'Forbidden'; end if;
  if v_row.status <> 'draft' then
    raise exception 'Goedgekeurde versie is alleen-lezen. Maak eerst een nieuwe conceptversie.';
  end if;
  if p_expected is not null and v_row.updated_at <> p_expected then
    raise exception 'Deze versie is intussen gewijzigd. Vernieuw de pagina.';
  end if;
  return v_row;
end;
$$;

create or replace function app._brand_profile_touch(p_version_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_at timestamptz;
begin
  v_at := now();
  update app.brand_profile_versions
  set updated_at = v_at, updated_by = auth.uid()
  where id = p_version_id;
  return v_at;
end;
$$;

create or replace function app._brand_profile_version_json(p_row app.brand_profile_versions)
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
declare
  v_name text;
begin
  v_name := null;
  select display_name into v_name from app.profiles where user_id = p_row.updated_by;
  return jsonb_build_object(
    'id', p_row.id,
    'versionNumber', p_row.version_number,
    'status', p_row.status,
    'updatedAt', p_row.updated_at,
    'updatedByName', coalesce(v_name, ''),
    'brandName', p_row.brand_name,
    'essence', p_row.essence,
    'positioning', p_row.positioning,
    'promise', p_row.promise,
    'audience', p_row.audience,
    'valuesText', p_row.values_text,
    'voice', p_row.voice,
    'visual', p_row.visual,
    'sourceDocumentId', p_row.source_document_id,
    'sourceStatus', p_row.source_status,
    'sourceHash', p_row.source_hash,
    'sourceSavedAt', p_row.source_saved_at,
    'importWarnings', to_jsonb(p_row.import_warnings),
    'notApplicable', to_jsonb(p_row.not_applicable),
    'approvedAt', p_row.approved_at,
    'publishedAt', p_row.published_at
  );
end;
$$;

create or replace function app._brand_profile_children(p_version_id uuid, p_internal boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
declare
  v_styles jsonb;
  v_fonts jsonb;
  v_colors jsonb;
  v_assets jsonb;
  v_reviews jsonb;
  v_prompts jsonb;
  v_provenance jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'role', role, 'family', family, 'weight', weight, 'italic', italic,
    'size', size, 'unit', unit, 'lineHeight', line_height, 'letterSpacing', letter_spacing,
    'transform', transform, 'usage', usage, 'fallback', fallback, 'sample', sample,
    'mobileSize', mobile_size, 'mobileUnit', mobile_unit, 'sort', sort
  ) order by sort, role), '[]'::jsonb)
  into v_styles
  from app.brand_profile_styles
  where version_id = p_version_id and archived_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'path', storage_path, 'weights', weights, 'italic', italic,
    'variable', variable, 'origin', origin, 'licenseNote', license_note,
    'exportAllowed', export_allowed, 'useConfirmed', use_confirmed
  ) order by created_at), '[]'::jsonb)
  into v_fonts
  from app.brand_profile_fonts
  where version_id = p_version_id and (p_internal or export_allowed);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'hex', hex, 'rgb', rgb, 'role', role, 'note', note,
    'cmyk', cmyk, 'pantone', pantone, 'sort', sort
  ) order by sort, name), '[]'::jsonb)
  into v_colors
  from app.brand_profile_colors
  where version_id = p_version_id and archived_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'kind', kind, 'name', name, 'path', storage_path, 'format', format,
    'width', width, 'height', height, 'usage', usage, 'background', background,
    'minSize', min_size, 'clearSpace', clear_space, 'restrictions', restrictions,
    'referenceStatus', reference_status, 'exportAllowed', export_allowed, 'missingNote', missing_note
  ) order by name), '[]'::jsonb)
  into v_assets
  from app.brand_profile_assets
  where version_id = p_version_id and archived_at is null and (p_internal or export_allowed or storage_path = '');

  select case when p_internal then coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'section', section, 'label', label, 'origin', origin,
    'sectionPath', section_path, 'passage', passage, 'proposal', proposal, 'decision', decision
  ) order by label), '[]'::jsonb) else '[]'::jsonb end
  into v_reviews
  from app.brand_profile_reviews
  where version_id = p_version_id and decision = 'pending';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'purpose', purpose, 'situation', situation, 'body', body,
    'exclusions', exclusions, 'composed', composed, 'sourcePassage', source_passage, 'updatedAt', updated_at
  ) order by updated_at desc), '[]'::jsonb)
  into v_prompts
  from app.brand_profile_prompts
  where version_id = p_version_id and archived_at is null;

  select case when p_internal then coalesce(jsonb_agg(jsonb_build_object(
    'fieldKey', field_key, 'origin', origin, 'documentId', document_id, 'contentHash', content_hash,
    'sectionPath', section_path, 'passage', passage, 'importedAt', imported_at, 'method', method
  ) order by imported_at), '[]'::jsonb) else '[]'::jsonb end
  into v_provenance
  from app.brand_profile_provenance
  where version_id = p_version_id;

  return jsonb_build_object(
    'styles', v_styles, 'fonts', v_fonts, 'colors', v_colors, 'assets', v_assets,
    'reviews', v_reviews, 'prompts', v_prompts, 'provenance', v_provenance
  );
end;
$$;

revoke execute on function app._brand_profile_rgb(text) from public, anon, authenticated;
revoke execute on function app._brand_profile_lock(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function app._brand_profile_touch(uuid) from public, anon, authenticated;
revoke execute on function app._brand_profile_version_json(app.brand_profile_versions) from public, anon, authenticated;
revoke execute on function app._brand_profile_children(uuid, boolean) from public, anon, authenticated;
