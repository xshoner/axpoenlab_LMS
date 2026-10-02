begin;
set local lock_timeout = '5s';

create table public.file_batches (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id),
  cohort_id uuid not null references public.cohorts(id),
  title text not null check (length(title) between 1 and 200),
  memo text not null default '' check (length(memo) <= 4000),
  status text not null default 'draft' check (status in ('draft','sent')),
  created_at timestamptz not null default now(), sent_at timestamptz
);
create table public.file_batch_files (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.file_batches(id) on delete cascade,
  filename text not null check (length(filename) between 1 and 255),
  file_path text not null unique,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800)
);
create table public.file_recipients (
  batch_id uuid not null references public.file_batches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_name text not null,
  created_at timestamptz not null default now(),
  received_at timestamptz, seen_at timestamptz,
  primary key(batch_id,user_id)
);
create index file_batches_cohort_sent on public.file_batches(cohort_id,sent_at desc);
create index file_recipients_user_date on public.file_recipients(user_id,created_at desc);
create index file_batch_files_batch on public.file_batch_files(batch_id);
create table public.file_download_requests (
  file_id uuid not null references public.file_batch_files(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  primary key(file_id,user_id)
);

create function public.can_manage_file_batch(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists(select 1 from public.file_batches b
    where b.id=p_id and public.tenant_cohort(b.cohort_id))
$$;
create function public.can_read_file_batch(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_manage_file_batch(p_id) or (public.is_active_user() and exists (
    select 1 from public.file_recipients r join public.file_batches b on b.id=r.batch_id
    join public.cohort_members m on m.user_id=r.user_id and m.cohort_id=b.cohort_id
    where r.batch_id=p_id and r.user_id=auth.uid() and b.status='sent'))
$$;
alter table public.file_batches enable row level security;
alter table public.file_batch_files enable row level security;
alter table public.file_recipients enable row level security;
alter table public.file_download_requests enable row level security;
create policy file_batches_read on public.file_batches for select to authenticated using(public.can_read_file_batch(id));
create policy file_files_read on public.file_batch_files for select to authenticated using(public.can_read_file_batch(batch_id));
create policy file_recipients_read on public.file_recipients for select to authenticated using(
  public.can_manage_file_batch(batch_id) or (user_id=auth.uid() and public.can_read_file_batch(batch_id)));
create policy file_downloads_read on public.file_download_requests for select to authenticated using(exists(
  select 1 from public.file_batch_files f where f.id=file_id and (public.can_manage_file_batch(f.batch_id)
    or (user_id=auth.uid() and public.can_read_file_batch(f.batch_id)))));
revoke all on public.file_batches,public.file_batch_files,public.file_recipients,public.file_download_requests from anon,authenticated;
grant select on public.file_batches,public.file_batch_files,public.file_recipients,public.file_download_requests to authenticated;
grant all on public.file_batches,public.file_batch_files,public.file_recipients,public.file_download_requests to service_role;

insert into storage.buckets(id,name,public,file_size_limit) values('student-deliveries','student-deliveries',false,52428800);
create function public.file_storage_allowed(p_path text,p_write boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.file_batches b where
    split_part(p_path,'/',1)=b.sender_id::text and split_part(p_path,'/',2)=b.id::text
    and case when p_write then b.sender_id=auth.uid() and b.status='draft' and public.admin_view_owner() is null and public.can_manage_file_batch(b.id)
      else exists(select 1 from public.file_batch_files f where f.batch_id=b.id and f.file_path=p_path)
        and public.can_read_file_batch(b.id) or (b.sender_id=auth.uid() and b.status='draft' and public.can_manage_file_batch(b.id)) end)
$$;
-- Existing tenant policies are restrictive: preserve their boundary for all older buckets.
drop policy tenant_file_read on storage.objects;
drop policy tenant_file_insert on storage.objects;
drop policy tenant_file_update on storage.objects;
drop policy tenant_file_delete on storage.objects;
create policy tenant_file_read on storage.objects as restrictive for select to authenticated using(
  case when bucket_id='student-deliveries' then public.file_storage_allowed(name) else private.tenant_storage(bucket_id,name,false) end);
create policy tenant_file_insert on storage.objects as restrictive for insert to authenticated with check(
  case when bucket_id='student-deliveries' then public.file_storage_allowed(name,true) else private.tenant_storage(bucket_id,name,true) end);
create policy tenant_file_update on storage.objects as restrictive for update to authenticated using(
  bucket_id<>'student-deliveries' and private.tenant_storage(bucket_id,name,true)) with check(
  bucket_id<>'student-deliveries' and private.tenant_storage(bucket_id,name,true));
create policy tenant_file_delete on storage.objects as restrictive for delete to authenticated using(
  case when bucket_id='student-deliveries' then public.file_storage_allowed(name,true) else private.tenant_storage(bucket_id,name,true) end);
create policy file_delivery_storage_read on storage.objects for select to authenticated
using(bucket_id='student-deliveries' and public.file_storage_allowed(name));
create policy file_delivery_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='student-deliveries' and public.file_storage_allowed(name,true));
create policy file_delivery_storage_delete on storage.objects for delete to authenticated
using(bucket_id='student-deliveries' and public.file_storage_allowed(name,true));

create function public.create_file_batch(p_cohort uuid,p_title text,p_memo text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_active_user() or public.admin_view_owner() is not null or not coalesce(public.tenant_cohort(p_cohort),false)
    or not exists(select 1 from public.cohorts where id=p_cohort and deleted_at is null) then raise exception 'forbidden cohort'; end if;
  insert into public.file_batches(sender_id,cohort_id,title,memo) values(auth.uid(),p_cohort,trim(p_title),coalesce(p_memo,'')) returning id into v_id;
  return v_id;
end $$;

create function public.send_file_batch(p_batch uuid,p_files jsonb,p_students uuid[] default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare b public.file_batches; f jsonb; n integer; v_limit bigint; v_extensions jsonb;
begin
  select * into b from public.file_batches where id=p_batch for update;
  if b.id is null or b.sender_id<>auth.uid() or public.admin_view_owner() is not null or not public.can_manage_file_batch(b.id) then raise exception 'forbidden batch'; end if;
  -- A retry after a lost network response must not deliver twice.
  if b.status='sent' then return (select count(*) from public.file_recipients where batch_id=b.id); end if;
  select least(50,coalesce((value::text)::numeric,5))*1048576 into v_limit from public.system_settings where key='max_file_size_mb';
  select value into v_extensions from public.system_settings where key='allowed_extensions';
  if jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files) not between 1 and 10 then raise exception '1 to 10 files required'; end if;
  if p_students is not null and (cardinality(p_students)=0 or exists(
    select 1 from unnest(p_students) u where not exists(select 1 from public.cohort_members m
    join public.profiles p on p.id=m.user_id where m.user_id=u and m.cohort_id=b.cohort_id and p.role='student' and p.status='active')))
    then raise exception 'invalid recipients'; end if;
  for f in select value from jsonb_array_elements(p_files) loop
    if (f->>'size_bytes')::bigint>coalesce(v_limit,5242880) or
      not coalesce(v_extensions ? lower(substring(f->>'filename' from '[^.]+$')),false) then raise exception 'file size or extension not allowed'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='student-deliveries'
      and o.name=f->>'file_path' and split_part(o.name,'/',1)=b.sender_id::text and split_part(o.name,'/',2)=b.id::text
      and (o.metadata->>'size')::bigint=(f->>'size_bytes')::bigint)
      then raise exception 'missing or mismatched uploaded file'; end if;
    insert into public.file_batch_files(batch_id,filename,file_path,size_bytes)
      values(b.id,f->>'filename',f->>'file_path',(f->>'size_bytes')::bigint);
  end loop;
  insert into public.file_recipients(batch_id,user_id,recipient_name)
    select b.id,p.id,p.name from public.cohort_members m join public.profiles p on p.id=m.user_id
    where m.cohort_id=b.cohort_id and p.role='student' and p.status='active'
    and (p_students is null or p.id=any(p_students));
  get diagnostics n = row_count;
  if n=0 then raise exception 'no active recipients'; end if;
  update public.file_batches set status='sent',sent_at=now() where id=b.id;
  return n;
end $$;

create function public.ack_file_batch(p_batch uuid,p_seen boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_read_file_batch(p_batch) then raise exception 'forbidden recipient'; end if;
  update public.file_recipients set received_at=coalesce(received_at,now()),
    seen_at=case when p_seen then coalesce(seen_at,now()) else seen_at end
    where batch_id=p_batch and user_id=auth.uid();
end $$;
create function public.record_file_download(p_file uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_batch uuid;
begin
  select batch_id into v_batch from public.file_batch_files where id=p_file;
  if not public.can_read_file_batch(v_batch) or not exists(select 1 from public.file_recipients where batch_id=v_batch and user_id=auth.uid()) then raise exception 'forbidden file'; end if;
  perform public.ack_file_batch(v_batch,true);
  insert into public.file_download_requests(file_id,user_id) values(p_file,auth.uid())
    on conflict(file_id,user_id) do update set requested_at=now();
end $$;
create function public.discard_file_batch(p_batch uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.file_batches;
begin
  select * into b from public.file_batches where id=p_batch for update;
  if b.id is null then return; end if;
  if b.sender_id<>auth.uid() or b.status<>'draft' or public.admin_view_owner() is not null or not public.can_manage_file_batch(b.id) then raise exception 'forbidden draft'; end if;
  if exists(select 1 from storage.objects where bucket_id='student-deliveries' and split_part(name,'/',2)=b.id::text) then raise exception 'remove draft uploads first'; end if;
  delete from public.file_batches where id=b.id;
end $$;

revoke all on function public.can_manage_file_batch(uuid),public.can_read_file_batch(uuid),public.file_storage_allowed(text,boolean),
  public.create_file_batch(uuid,text,text),public.send_file_batch(uuid,jsonb,uuid[]),public.ack_file_batch(uuid,boolean),public.record_file_download(uuid),public.discard_file_batch(uuid) from public,anon;
grant execute on function public.can_manage_file_batch(uuid),public.can_read_file_batch(uuid),public.file_storage_allowed(text,boolean),
  public.create_file_batch(uuid,text,text),public.send_file_batch(uuid,jsonb,uuid[]),public.ack_file_batch(uuid,boolean),public.record_file_download(uuid),public.discard_file_batch(uuid) to authenticated;
alter publication supabase_realtime add table public.file_recipients;
commit;
