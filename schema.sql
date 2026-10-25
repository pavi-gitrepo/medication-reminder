-- Run once in Supabase SQL Editor. Test data only.
create extension if not exists pgcrypto;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null,
 role text not null check(role in ('patient','caregiver'))
);
create table public.caregiver_patients (
 caregiver_id uuid not null references public.profiles(id) on delete cascade,
 patient_id uuid not null references public.profiles(id) on delete cascade,
 primary key(caregiver_id,patient_id),
 check(caregiver_id<>patient_id)
);
create table public.medications (
 id uuid primary key default gen_random_uuid(),
 patient_id uuid not null references public.profiles(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120),
 dosage text not null check(length(trim(dosage)) between 1 and 120),
 reminder_time time not null,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.dose_logs (
 id uuid primary key default gen_random_uuid(),
 medication_id uuid not null references public.medications(id) on delete cascade,
 patient_id uuid not null references public.profiles(id) on delete cascade,
 scheduled_for timestamp without time zone not null,
 status text not null default 'patient_reported_taken' check(status='patient_reported_taken'),
 confirmed_at timestamptz not null default now(),
 unique(medication_id,scheduled_for)
);
create index on public.caregiver_patients(patient_id);
create index on public.medications(patient_id);
create index on public.dose_logs(patient_id,scheduled_for);
-- SECURITY DEFINER functions read ONLY the caregiver relationship; avoid policy recursion.
create function public.is_caregiver_for(target_patient uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.caregiver_patients cp where cp.caregiver_id=(select auth.uid()) and cp.patient_id=target_patient)
$$;
revoke all on function public.is_caregiver_for(uuid) from public;
grant execute on function public.is_caregiver_for(uuid) to authenticated;
create function public.is_patient_user(target_patient uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=target_patient and p.role='patient')
$$;
revoke all on function public.is_patient_user(uuid) from public;
grant execute on function public.is_patient_user(uuid) to authenticated;
create function public.is_caregiver_user(target_caregiver uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=target_caregiver and p.role='caregiver')
$$;
revoke all on function public.is_caregiver_user(uuid) from public;
grant execute on function public.is_caregiver_user(uuid) to authenticated;
-- Validate caregiver/patient roles even for admin-provisioned relationships.
alter table public.caregiver_patients add constraint caregiver_role_check check (public.is_caregiver_user(caregiver_id));
alter table public.caregiver_patients add constraint patient_role_check check (public.is_patient_user(patient_id));
alter table public.profiles enable row level security;
alter table public.caregiver_patients enable row level security;
alter table public.medications enable row level security;
alter table public.dose_logs enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=(select auth.uid()) or public.is_caregiver_for(id));
create policy relationship_read on public.caregiver_patients for select to authenticated using(caregiver_id=(select auth.uid()) or patient_id=(select auth.uid()));
create policy medication_read on public.medications for select to authenticated using(patient_id=(select auth.uid()) or public.is_caregiver_for(patient_id));
create policy medication_insert on public.medications for insert to authenticated with check(public.is_caregiver_for(patient_id) and public.is_patient_user(patient_id));
create policy medication_update on public.medications for update to authenticated using(public.is_caregiver_for(patient_id)) with check(public.is_caregiver_for(patient_id) and public.is_patient_user(patient_id));
create policy log_read on public.dose_logs for select to authenticated using(patient_id=(select auth.uid()) or public.is_caregiver_for(patient_id));
-- Verify medication ownership and active status; no arbitrary dose status or caregiver-created confirmation.
create policy log_insert on public.dose_logs for insert to authenticated with check(
 patient_id=(select auth.uid()) and status='patient_reported_taken'
 and exists(select 1 from public.medications m where m.id=medication_id and m.patient_id=(select auth.uid()) and m.active and m.reminder_time=scheduled_for::time)
 and scheduled_for::date=current_date
);
-- Avoid direct profile creation, caregiver linking, log editing/deleting from browser.
revoke insert,update,delete on public.profiles from anon,authenticated;
revoke insert,update,delete on public.caregiver_patients from anon,authenticated;
revoke update,delete on public.dose_logs from anon,authenticated;
revoke delete on public.medications from anon,authenticated;
-- Browser access to allowed tables, constrained by RLS.
grant select on public.profiles,public.caregiver_patients,public.medications,public.dose_logs to authenticated;
grant insert,update on public.medications to authenticated;
grant insert on public.dose_logs to authenticated;
