-- סכמה ל-Supabase עבור שמירת תוכניות.
-- הריצו בעורך ה-SQL של פרויקט ה-Supabase.

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id), -- ימולא כשמוסיפים Google Login
  input jsonb not null,
  plan jsonb not null
);

-- הפעלת Row Level Security (מומלץ לפני חיבור Auth)
alter table plans enable row level security;

-- מדיניות פתוחה ל-MVP בלבד. בעת הוספת Auth החליפו במדיניות לפי user_id:
--   create policy "own plans" on plans
--     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "mvp open access" on plans
  for all using (true) with check (true);
