begin;
create table public.validation_sessions(
  id uuid primary key default gen_random_uuid(),
  participant_id text not null unique,
  supabase_user_id uuid references auth.users on delete set null,
  language text not null default 'en',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  device_type text not null default 'unknown',
  browser text not null default 'unknown',
  core_flow_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.validation_sessions(supabase_user_id);
create index on public.validation_sessions(created_at desc);

create table public.validation_events(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.validation_sessions on delete cascade,
  event_type text not null,
  workflow text,
  language text,
  processing_time_ms integer,
  success boolean,
  retry_count integer not null default 0,
  was_edited boolean not null default false,
  edited_field text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.validation_events(session_id, created_at);
create index on public.validation_events(event_type);

-- Trigger to keep updated_at current on sessions
create trigger touch_validation_session before update on public.validation_sessions for each row execute function public.touch_updated();

-- RLS: traders never see validation tables; admin access is via service-role key (backend only)
alter table public.validation_sessions enable row level security;
alter table public.validation_events enable row level security;
-- No policies for authenticated role — only beta_api (service-role backend) can write
grant select,insert,update on public.validation_sessions to beta_api;
grant select,insert on public.validation_events to beta_api;
commit;
