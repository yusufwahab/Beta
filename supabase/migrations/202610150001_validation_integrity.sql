begin;
-- Apply after 202610120002_validation.sql. No business tables/records are rewritten.
alter table public.validation_sessions
 add column mode text not null default 'test' check(mode in ('live','test')),
 add column last_seen_at timestamptz not null default now(),
 add column excluded boolean not null default false,
 add column exclusion_reason text check(exclusion_reason in ('team_test','duplicate','withdrawn','invalid_evidence')),
 add column human_verified boolean not null default false,
 add column reviewed_at timestamptz,
 add column reviewed_by uuid references auth.users on delete set null;
alter table public.validation_sessions add constraint validation_language check(language in ('en','yo','ha','ig'));
create unique index validation_user_mode on public.validation_sessions(supabase_user_id,mode);
create index validation_session_reporting on public.validation_sessions(mode,excluded,started_at desc);
create sequence public.validation_participant_sequence;
select setval('public.validation_participant_sequence',greatest(coalesce((select max(substring(participant_id from '^BETA-([0-9]+)$')::bigint) from public.validation_sessions),0)+1,1),false);
create function public.validation_next_participant_id() returns text language plpgsql set search_path=pg_catalog,public as $$
declare n text; begin n:=nextval('public.validation_participant_sequence')::text;return 'BETA-'||lpad(n,greatest(3,length(n)),'0');end $$;
alter table public.validation_sessions alter column participant_id set default public.validation_next_participant_id();
alter table public.validation_events
 add column event_key text,
 add column interaction_id uuid,
 add column source text not null default 'legacy' check(source in ('client','server','legacy')),
 add column entity_id uuid,
 add column occurred_at timestamptz not null default now();
create unique index validation_event_dedup on public.validation_events(event_key) where event_key is not null;
create index validation_interaction_lookup on public.validation_events(session_id,interaction_id,source);
create index validation_entity_lookup on public.validation_events(entity_id) where entity_id is not null;
alter table public.validation_events add constraint validation_event_type check(event_type in ('VOICE_STARTED','VOICE_PAUSED','VOICE_RESUMED','VOICE_CANCELLED','VOICE_SUBMITTED','NATLAS_PROCESSING_STARTED','NATLAS_SUCCESS','NATLAS_FAILED','TRANSCRIPT_RETRY','TRANSCRIPT_EDITED','RESULT_CONFIRMED','TRANSACTION_SAVED','FLOW_COMPLETED'));
alter table public.validation_events add constraint validation_workflow check(workflow in ('onboarding','sale','expense','stock','debt','business_summary','profile','customer','ajo','assistant','other'));
alter table public.validation_events add constraint validation_event_language check(language in ('en','yo','ha','ig'));
alter table public.validation_events add constraint validation_nonnegative check((processing_time_ms is null or processing_time_ms>=0) and retry_count>=0);
-- beta_api is a non-login role reached only inside the authenticated Express boundary.
-- Admin scope is set locally only after verifying Supabase-owned app_metadata.
create policy validation_session_scope on public.validation_sessions for all to beta_api
 using(supabase_user_id=auth.uid() or current_setting('beta.validation_admin',true)='true')
 with check(supabase_user_id=auth.uid() or current_setting('beta.validation_admin',true)='true');
create policy validation_event_scope on public.validation_events for all to beta_api
 using(exists(select 1 from public.validation_sessions s where s.id=session_id))
 with check(exists(select 1 from public.validation_sessions s where s.id=session_id));
revoke all on public.validation_sessions,public.validation_events from public,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='anon') then revoke all on public.validation_sessions,public.validation_events from anon;end if;end $$;
revoke all on function public.validation_next_participant_id() from public;
grant usage,select on sequence public.validation_participant_sequence to beta_api;
grant execute on function public.validation_next_participant_id() to beta_api;
grant select,insert,update on public.validation_sessions to beta_api;
grant select,insert,update on public.validation_events to beta_api;
commit;
