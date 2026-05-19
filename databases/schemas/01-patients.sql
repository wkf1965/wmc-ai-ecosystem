create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  risk_score integer default 0,
  created_at timestamptz default now()
);