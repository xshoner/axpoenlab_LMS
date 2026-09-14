-- Transactional fixtures: no test users, games, or access records are retained.
begin;
insert into auth.users (id, email) values
 ('a1400000-0000-4000-8000-000000000001', 'arcade-student@test.local'),
 ('a1400000-0000-4000-8000-000000000002', 'arcade-admin@test.local'),
 ('a1400000-0000-4000-8000-000000000003', 'arcade-yesterday@test.local');
update public.profiles set role = 'admin' where id = 'a1400000-0000-4000-8000-000000000002';
update public.profiles set last_login_at = (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') - interval '1 second'
 where id = 'a1400000-0000-4000-8000-000000000003';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1400000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$ begin
  perform public.record_visit();
  perform public.record_visit();
  if not exists (select 1 from public.arcade_games where url = 'https://jellyrungo.vercel.app/') then raise exception 'missing example game'; end if;
  begin
    perform public.today_account_visits();
    raise exception 'student read private access logs';
  exception when raise_exception then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  begin
    insert into public.arcade_games (url, name, description) values ('https://example.com/', 'denied', 'denied');
    raise exception 'student inserted game';
  exception when insufficient_privilege then null;
  end;
end $$;
set local request.jwt.claims = '{"sub":"a1400000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.today_account_visits() where id = 'a1400000-0000-4000-8000-000000000001') <> 1 then raise exception 'repeat access was not deduplicated'; end if;
  if exists (select 1 from public.today_account_visits() where id = 'a1400000-0000-4000-8000-000000000003') then raise exception 'yesterday leaked'; end if;
  if (select count(*) from public.visit_logs where user_id = 'a1400000-0000-4000-8000-000000000001') <> 1 then raise exception 'duplicate visitor count'; end if;
  insert into public.arcade_games (url, name, description) values ('https://example.com/', 'test one', 'first'), ('https://example.org/', 'test two', 'second');
end $$;
reset role;
set local request.jwt.claims = '{}';
update public.profiles set status = 'inactive' where id = 'a1400000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1400000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$ begin
  if exists (select 1 from public.arcade_games) then raise exception 'inactive account read games'; end if;
  begin
    perform public.today_account_visits();
    raise exception 'inactive admin read logs';
  exception when raise_exception then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
end $$;
select 'PASS: today only, deduplication, visitor count, admin inserts, student and inactive permissions' as result;
rollback;
