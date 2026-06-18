-- Run this in Supabase SQL Editor.
-- Then create one Auth user for the nurse in Authentication > Users.

create table if not exists public.nurse_availability (
  date date primary key,
  status text not null check (status in ('available', 'unavailable')),
  time_slots text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.nurse_availability
add column if not exists time_slots text[] not null default '{}';

alter table public.nurse_availability enable row level security;

drop policy if exists "Visitors can read nurse availability" on public.nurse_availability;
create policy "Visitors can read nurse availability"
on public.nurse_availability
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated nurse can add availability" on public.nurse_availability;
create policy "Authenticated nurse can add availability"
on public.nurse_availability
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated nurse can update availability" on public.nurse_availability;
create policy "Authenticated nurse can update availability"
on public.nurse_availability
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated nurse can delete availability" on public.nurse_availability;
create policy "Authenticated nurse can delete availability"
on public.nurse_availability
for delete
to authenticated
using (true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists nurse_availability_set_updated_at on public.nurse_availability;
create trigger nurse_availability_set_updated_at
before update on public.nurse_availability
for each row
execute function public.set_updated_at();
