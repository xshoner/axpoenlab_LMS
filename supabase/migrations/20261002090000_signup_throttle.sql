begin;
create table public.signup_attempts(email_hash text not null,network_hash text not null,created_at timestamptz not null default now());
create index on public.signup_attempts(email_hash,created_at);
create index on public.signup_attempts(network_hash,created_at);
alter table public.signup_attempts enable row level security;
revoke all on public.signup_attempts from public,anon,authenticated;
grant all on public.signup_attempts to service_role;
create function public.reserve_signup(p_email text,p_network text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_email !~ '^[a-f0-9]{64}$' or p_network !~ '^[a-f0-9]{64}$' then return false; end if;
  perform pg_advisory_xact_lock(6100290);
  delete from public.signup_attempts where created_at<now()-interval '1 day';
  if (select count(*) from public.signup_attempts where email_hash=p_email and created_at>now()-interval '15 minutes')>=5
    or (select count(*) from public.signup_attempts where network_hash=p_network and created_at>now()-interval '15 minutes')>=500 then return false; end if;
  insert into public.signup_attempts(email_hash,network_hash) values(p_email,p_network);
  return true;
end $$;
revoke all on function public.reserve_signup(text,text) from public,anon,authenticated;
grant execute on function public.reserve_signup(text,text) to service_role;
commit;
