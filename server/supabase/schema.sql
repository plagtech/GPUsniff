-- ============================================================
-- GPUSniff — Supabase schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- ============================================================

-- ---------- Price history ----------
create table if not exists public.price_snapshots (
  id           bigint generated always as identity primary key,
  gpu_id       text        not null,
  retailer     text        not null,
  price        numeric(10,2) not null,
  original_price numeric(10,2),
  in_stock     boolean     not null default true,
  source       text,
  captured_at  timestamptz not null default now()
);

-- Fast lookups for "history of GPU X over the last N days".
create index if not exists price_snapshots_gpu_time_idx
  on public.price_snapshots (gpu_id, captured_at desc);

create index if not exists price_snapshots_gpu_retailer_time_idx
  on public.price_snapshots (gpu_id, retailer, captured_at desc);

-- ---------- Waitlist ----------
create table if not exists public.waitlist (
  id          bigint generated always as identity primary key,
  email       text        not null unique,
  source      text        default 'landing',
  user_agent  text,
  referrer    text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- The backend uses the SERVICE ROLE key, which bypasses RLS, so these
-- tables are locked down to the public/anon role by default. We enable
-- RLS and add NO anon policies: only the service role (server) can read
-- or write. This keeps snapshots and emails private.
-- ============================================================
alter table public.price_snapshots enable row level security;
alter table public.waitlist        enable row level security;
