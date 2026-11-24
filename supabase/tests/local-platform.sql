-- Minimal platform objects for validating migrations on an isolated PostgreSQL instance.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create schema realtime;
create table realtime.messages (extension text);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql as $$ select ''::text $$;
create schema auth;
create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
