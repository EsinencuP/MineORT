-- Fix for migration 3: IN SCHEMA default-privilege revokes cannot remove the global
-- default EXECUTE grant to PUBLIC. Revoke the global default for objects created by postgres.
alter default privileges for role postgres revoke execute on functions from public;
