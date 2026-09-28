-- Linus's Sweden Move: Supabase schema
-- Run this in the Supabase SQL editor once, then run seed.sql.
--
-- IMPORTANT: run this against a Supabase project dedicated to this app.
-- It creates tables named `tasks`, `categories`, `phases`, etc. in the
-- public schema. If a project already has tables with those names, they
-- must not collide.
--
-- Assumptions:
--   * Supabase Auth (email + password, invite-only) provides auth.users.
--   * Two users to start: Linus (role 'linus') and Oscar (role 'helper').
--   * Add more family later with role 'family' (same permissions as helper).

-- ----------------------------------------------------------------------------
-- Profiles: extends auth.users with a display name and role.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role         text not null default 'helper' check (role in ('linus', 'helper', 'family')),
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'helper')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Reference tables
-- ----------------------------------------------------------------------------
create table if not exists public.phases (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  sort_order  int  not null default 0
);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  color       text not null default '#8892a0',
  sort_order  int  not null default 0
);

-- ----------------------------------------------------------------------------
-- Tasks
-- ----------------------------------------------------------------------------
create table if not exists public.tasks (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text unique,
  title                    text not null,
  explanation              text,
  category_id              uuid references public.categories(id) on delete set null,
  phase_id                 uuid references public.phases(id) on delete set null,
  status                   text not null default 'not_started'
                             check (status in ('not_started','preparing','ready','in_progress','waiting','blocked','completed','not_needed')),
  priority                 text not null default 'medium'
                             check (priority in ('low','medium','high','urgent')),
  target_date              date,
  assigned_to              text default 'both' check (assigned_to in ('linus','oscar','both','unassigned')),
  mode                     text default 'either' check (mode in ('online','in_person','either')),
  can_prepare_early        boolean not null default false,
  requires_folkbokforing   boolean not null default false,
  needs_help               boolean not null default false,
  reference_number         text,
  appointment_at           timestamptz,
  appointment_location     text,
  appointment_notes        text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid references auth.users(id) on delete set null
);

create index if not exists tasks_phase_idx    on public.tasks (phase_id);
create index if not exists tasks_category_idx on public.tasks (category_id);
create index if not exists tasks_status_idx   on public.tasks (status);

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute procedure public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Task dependencies (many-to-many)
-- ----------------------------------------------------------------------------
create table if not exists public.task_dependencies (
  task_id            uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

-- ----------------------------------------------------------------------------
-- Subtasks
-- ----------------------------------------------------------------------------
create table if not exists public.subtasks (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  title      text not null,
  done       boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists subtasks_task_idx on public.subtasks (task_id);

-- ----------------------------------------------------------------------------
-- Comments
-- ----------------------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  author_id  uuid not null references auth.users(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_task_idx on public.comments (task_id, created_at);

-- ----------------------------------------------------------------------------
-- Links (per-task or global)
-- ----------------------------------------------------------------------------
create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references public.tasks(id) on delete cascade,
  label       text not null,
  url         text not null,
  is_official boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists links_task_idx on public.links (task_id);

-- ----------------------------------------------------------------------------
-- Contacts (Vault)
-- ----------------------------------------------------------------------------
create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  role         text,
  organisation text,
  phone        text,
  email        text,
  notes        text,
  is_emergency boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Info records (Vault) - sensitive; supports per-record visibility.
-- ----------------------------------------------------------------------------
create table if not exists public.info_records (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  value      text,
  notes      text,
  visibility text not null default 'shared' check (visibility in ('shared','private_to_linus')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists info_records_touch on public.info_records;
create trigger info_records_touch before update on public.info_records
  for each row execute procedure public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.phases             enable row level security;
alter table public.categories         enable row level security;
alter table public.tasks              enable row level security;
alter table public.task_dependencies  enable row level security;
alter table public.subtasks           enable row level security;
alter table public.comments           enable row level security;
alter table public.links              enable row level security;
alter table public.contacts           enable row level security;
alter table public.info_records       enable row level security;

-- Helper: is the current user Linus?
create or replace function public.current_role_is_linus()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'linus'
  );
$$;

-- Profiles: everyone authenticated can read; you can only edit your own.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid());

-- Reference data + shared task data: read/write for any authenticated user.
do $$
declare
  t text;
begin
  foreach t in array array[
    'phases','categories','tasks','task_dependencies',
    'subtasks','comments','links','contacts'
  ]
  loop
    execute format('drop policy if exists %I on public.%I;', t || '_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t || '_all', t
    );
  end loop;
end $$;

-- info_records: private_to_linus rows only visible/writable to Linus.
drop policy if exists info_records_select on public.info_records;
create policy info_records_select on public.info_records
  for select to authenticated
  using (visibility = 'shared' or public.current_role_is_linus());

drop policy if exists info_records_insert on public.info_records;
create policy info_records_insert on public.info_records
  for insert to authenticated
  with check (visibility = 'shared' or public.current_role_is_linus());

drop policy if exists info_records_update on public.info_records;
create policy info_records_update on public.info_records
  for update to authenticated
  using (visibility = 'shared' or public.current_role_is_linus())
  with check (visibility = 'shared' or public.current_role_is_linus());

drop policy if exists info_records_delete on public.info_records;
create policy info_records_delete on public.info_records
  for delete to authenticated
  using (visibility = 'shared' or public.current_role_is_linus());

-- Realtime: enable for tables we want live updates on.
-- Wrapped so re-running the schema is idempotent.
do $$
declare
  t text;
begin
  foreach t in array array['tasks','comments','subtasks']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception
      when duplicate_object then null;
      when others then null;   -- publication may not exist on some setups
    end;
  end loop;
end $$;
