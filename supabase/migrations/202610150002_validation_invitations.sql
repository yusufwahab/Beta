begin;
create table public.validation_invitations(
 id uuid primary key default gen_random_uuid(),
 participant_id text not null unique default public.validation_next_participant_id(),
 mode text not null check(mode in ('live','test')),
 name text not null default '' check(length(name)<=200),
 email text not null check(email=lower(email) and length(email)<=254),
 phone text not null default '' check(length(phone)<=40),
 reference_id text not null default '' check(length(reference_id)<=100),
 created_by uuid references auth.users on delete set null,
 created_at timestamptz not null default clock_timestamp(),
 delivery_status text not null default 'pending' check(delivery_status in ('pending','sending','sent','failed')),
 send_attempts integer not null default 0,
 last_attempt_at timestamptz,
 delivery_error text check(delivery_error in ('delivery_failed','configuration','interrupted')),
 provider_message_id text,
 token_hash text unique,
 expires_at timestamptz,
 used_at timestamptz,
 invited_at timestamptz,
 invite_opened_at timestamptz,
 accepted_at timestamptz,
 consent_at timestamptz,
 consent_version text,
 supabase_user_id uuid references auth.users on delete set null,
 validation_session_id uuid unique references public.validation_sessions on delete set null,
 testing_started_at timestamptz,
 testing_completed_at timestamptz,
 revoked_at timestamptz,
 unique(mode,email),unique(mode,supabase_user_id)
);
create index validation_invitation_funnel on public.validation_invitations(mode,created_at desc);
alter table public.validation_invitations enable row level security;
create policy validation_invitation_scope on public.validation_invitations for all to beta_api
 using(current_setting('beta.validation_admin',true)='true' or supabase_user_id=auth.uid())
 with check(current_setting('beta.validation_admin',true)='true' or supabase_user_id=auth.uid());
revoke all on public.validation_invitations from public,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='anon') then revoke all on public.validation_invitations from anon;end if;end $$;
grant select,insert,update on public.validation_invitations to beta_api;
commit;
