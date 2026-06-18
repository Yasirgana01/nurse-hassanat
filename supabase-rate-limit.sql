-- Run this in Supabase SQL Editor to persist admin login rate limits.
-- The browser never accesses this table directly. The Vercel API uses SUPABASE_SERVICE_ROLE_KEY.

create table if not exists public.admin_login_attempts (
  client_id text primary key,
  attempt_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now()
);

alter table public.admin_login_attempts enable row level security;

drop policy if exists "No public access to admin login attempts" on public.admin_login_attempts;
