-- Run this in Supabase SQL Editor to store booking records server-side.
-- The browser never accesses this table directly. The Vercel API uses SUPABASE_SERVICE_ROLE_KEY.

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  full_name text not null,
  phone text not null,
  service text not null,
  consultation_type text not null,
  preferred_date text,
  preferred_time text,
  provider_preference text,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'cancelled')),
  payment_reference text,
  payment_verified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.bookings enable row level security;

drop policy if exists "No public access to bookings" on public.bookings;
