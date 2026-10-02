begin;
set local lock_timeout='5s';
alter table public.file_batches add column body_html text not null default '' check(length(body_html)<=1000000);
alter table public.file_recipients add column hidden_at timestamptz;
create function public.hide_distribution(p_batch uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.can_read_file_batch(p_batch) then raise exception 'forbidden recipient'; end if;
  update public.file_recipients set hidden_at=now() where batch_id=p_batch and user_id=auth.uid();
end $$;
-- Keep the existing file-only entry point strict while the unified one permits text.
alter function public.send_file_batch(uuid,jsonb,uuid[]) set schema private;
revoke all on function private.send_file_batch(uuid,jsonb,uuid[]) from public,anon,authenticated;
create function public.send_file_batch(p_batch uuid,p_files jsonb,p_students uuid[] default null) returns integer
language plpgsql security definer set search_path='' as $$
begin
  if p_files is null then raise exception 'file array required'; end if;
  return private.send_file_batch(p_batch,p_files,p_students);
end $$;

create function public.create_distribution(p_cohort uuid,p_title text,p_memo text default '',p_html text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  v_id := public.create_file_batch(p_cohort,p_title,p_memo);
  update public.file_batches set body_html=coalesce(p_html,'') where id=v_id;
  return v_id;
end $$;
create function public.send_distribution(p_batch uuid,p_files jsonb,p_students uuid[] default null) returns integer
language plpgsql security definer set search_path='' as $$
declare b public.file_batches; n integer;
begin
  select * into b from public.file_batches where id=p_batch for update;
  if b.id is null or b.sender_id<>auth.uid() or public.admin_view_owner() is not null
    or not public.can_manage_file_batch(b.id) then raise exception 'forbidden batch'; end if;
  if b.status='sent' then return(select count(*) from public.file_recipients where batch_id=b.id); end if;
  if p_files is null or jsonb_typeof(p_files)<>'array' then raise exception 'file array required'; end if;
  if jsonb_array_length(p_files)>0 then return public.send_file_batch(p_batch,p_files,p_students); end if;
  if trim(regexp_replace(b.body_html,'<[^>]*>|&nbsp;',' ','g'))='' and b.body_html !~* '<img|<iframe|copy-block'
    and trim(b.memo)='' then raise exception 'message or files required'; end if;
  if p_students is not null and (cardinality(p_students)=0 or exists(
    select 1 from unnest(p_students) u where not exists(select 1 from public.cohort_members m
      join public.profiles p on p.id=m.user_id where m.user_id=u and m.cohort_id=b.cohort_id and p.role='student' and p.status='active')))
    then raise exception 'invalid recipients'; end if;
  insert into public.file_recipients(batch_id,user_id,recipient_name)
    select b.id,p.id,p.name from public.cohort_members m join public.profiles p on p.id=m.user_id
    where m.cohort_id=b.cohort_id and p.role='student' and p.status='active' and (p_students is null or p.id=any(p_students));
  get diagnostics n=row_count;
  if n=0 then raise exception 'no active recipients'; end if;
  update public.file_batches set status='sent',sent_at=now() where id=b.id;
  return n;
end $$;
create or replace function private.guard_file_delivery() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='sent' and old.status='draft' then
    if not exists(select 1 from public.file_batch_files where batch_id=new.id)
      and trim(regexp_replace(new.body_html,'<[^>]*>|&nbsp;',' ','g'))=''
      and new.body_html !~* '<img|<iframe|copy-block' and trim(new.memo)='' then raise exception 'message or files required'; end if;
    if not exists(select 1 from public.file_recipients where batch_id=new.id) or new.sent_at is null
      then raise exception 'recipients required'; end if;
  end if;
  return new;
end $$;

-- Aggregate counts only: students never gain access to other users' rows/names.
create function public.student_service_stats() returns jsonb
language sql stable security definer set search_path='' as $$
  select case when public.is_active_user() then jsonb_build_object(
    'today',(select count(*) from public.visit_logs where visited_date=(now() at time zone 'Asia/Seoul')::date),
    'total',(select count(*) from public.visit_logs),
    'online',(select count(*) from public.account_presence a join public.profiles p on p.id=a.user_id
      join public.cohort_members m on m.user_id=a.user_id and m.cohort_id=a.cohort_id
      where p.status='active' and p.role='student' and a.seen_at>now()-interval '90 seconds'))
    else jsonb_build_object('today',0,'total',0,'online',0) end
$$;
revoke all on function public.create_distribution(uuid,text,text,text),public.send_distribution(uuid,jsonb,uuid[]),public.student_service_stats(),public.send_file_batch(uuid,jsonb,uuid[]),public.hide_distribution(uuid) from public,anon;
grant execute on function public.create_distribution(uuid,text,text,text),public.send_distribution(uuid,jsonb,uuid[]),public.student_service_stats(),public.send_file_batch(uuid,jsonb,uuid[]),public.hide_distribution(uuid) to authenticated;
commit;
