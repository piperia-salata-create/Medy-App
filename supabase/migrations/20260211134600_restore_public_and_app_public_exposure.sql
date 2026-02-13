begin;

-- Keep app_public available for patient-safe views while restoring existing app reads/writes on public.
alter role authenticator set pgrst.db_schemas = 'public,app_public';
notify pgrst, 'reload config';

commit;
