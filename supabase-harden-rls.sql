-- Run this after deploying the server API approach.
-- The browser no longer talks to Supabase directly, so public/anon table policies are not needed.
-- The Vercel API uses SUPABASE_SERVICE_ROLE_KEY on the server side.

alter table public.nurse_availability enable row level security;

drop policy if exists "Visitors can read nurse availability" on public.nurse_availability;
drop policy if exists "Authenticated nurse can add availability" on public.nurse_availability;
drop policy if exists "Authenticated nurse can update availability" on public.nurse_availability;
drop policy if exists "Authenticated nurse can delete availability" on public.nurse_availability;
