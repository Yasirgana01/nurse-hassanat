-- Run this once in Supabase SQL Editor to add time slots to the existing availability table.

alter table public.nurse_availability
add column if not exists time_slots text[] not null default '{}';
