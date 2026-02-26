alter table public.profiles
  add column if not exists patient_tutorial_version_seen integer not null default 0;

alter table public.profiles
  add column if not exists pharmacist_tutorial_version_seen integer not null default 0;
