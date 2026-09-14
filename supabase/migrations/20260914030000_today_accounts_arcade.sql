-- Only the most recent access per account is needed; profiles already stores it.
create or replace function public.today_account_visits()
returns table (id uuid, email text, org text, name text, last_login_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select p.id, p.email, p.org, p.name, p.last_login_at
    from public.profiles p
    where p.last_login_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
      and p.last_login_at < ((date_trunc('day', now() at time zone 'Asia/Seoul') + interval '1 day') at time zone 'Asia/Seoul')
    order by p.last_login_at desc, p.id;
end $$;
revoke all on function public.today_account_visits() from public, anon;
grant execute on function public.today_account_visits() to authenticated;

create table public.arcade_games (
  id uuid primary key default gen_random_uuid(),
  url text not null check (length(url) <= 2048 and url ~ '^https://[^[:space:]]+$'),
  name text not null check (length(trim(name)) between 1 and 100),
  description text not null check (length(trim(description)) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.arcade_games enable row level security;
create policy "active accounts read arcade" on public.arcade_games
  for select to authenticated using (public.is_active_user());
create policy "admins add arcade" on public.arcade_games
  for insert to authenticated with check (public.is_admin());
revoke all on public.arcade_games from anon, authenticated;
grant select, insert on public.arcade_games to authenticated;

insert into public.arcade_games (url, name, description)
values ('https://jellyrungo.vercel.app/', '젤리런 GO', '통통 튀는 젤리와 함께 달리는 웹 게임! 잠깐 쉬어 가며 새로운 기록에 도전해 보세요.');
