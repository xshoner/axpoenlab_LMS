begin;
set local lock_timeout='5s';

alter table public.file_batch_files add column deleted_at timestamptz;

-- A client-generated draft ID survives a lost HTTP response without creating duplicates.
drop function public.create_distribution(uuid,text,text,text);
create function public.create_distribution(p_cohort uuid,p_title text,p_memo text default '',p_html text default '',p_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare b public.file_batches; v_id uuid:=coalesce(p_id,gen_random_uuid());
begin
  if not public.is_active_user() or public.admin_view_owner() is not null or not coalesce(public.tenant_cohort(p_cohort),false)
    or not exists(select 1 from public.cohorts where id=p_cohort and deleted_at is null) then raise exception 'forbidden cohort'; end if;
  insert into public.file_batches(id,sender_id,cohort_id,title,memo,body_html)
    values(v_id,auth.uid(),p_cohort,trim(p_title),coalesce(p_memo,''),coalesce(p_html,'')) on conflict(id) do nothing;
  select * into b from public.file_batches where id=v_id;
  if b.sender_id<>auth.uid() or b.cohort_id<>p_cohort or b.title is distinct from trim(p_title)
    or b.memo is distinct from coalesce(p_memo,'') or b.body_html is distinct from coalesce(p_html,'') then raise exception 'draft conflict'; end if;
  return v_id;
end $$;
revoke all on function public.create_distribution(uuid,text,text,text,uuid) from public,anon;
grant execute on function public.create_distribution(uuid,text,text,text,uuid) to authenticated;

create or replace function public.file_storage_allowed(p_path text,p_write boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.file_batches b where
    split_part(p_path,'/',1)=b.sender_id::text and split_part(p_path,'/',2)=b.id::text
    and case when p_write then b.sender_id=auth.uid() and b.status='draft' and public.admin_view_owner() is null and public.can_manage_file_batch(b.id)
      else (exists(select 1 from public.file_batch_files f where f.batch_id=b.id and f.file_path=p_path and f.deleted_at is null)
        and public.can_read_file_batch(b.id)) or (b.sender_id=auth.uid() and b.status='draft' and public.can_manage_file_batch(b.id)) end)
$$;

create or replace function public.record_file_download(p_file uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_batch uuid;
begin
  select batch_id into v_batch from public.file_batch_files where id=p_file and deleted_at is null;
  if not coalesce(public.can_read_file_batch(v_batch),false) or not exists(select 1 from public.file_recipients where batch_id=v_batch and user_id=auth.uid()) then raise exception 'forbidden file'; end if;
  perform public.ack_file_batch(v_batch,true);
  insert into public.file_download_requests(file_id,user_id) values(p_file,auth.uid())
    on conflict(file_id,user_id) do update set requested_at=now();
end $$;

-- Only the authenticated Edge handler can finalize physical Storage API removal.
create function public.complete_distribution_file_delete(p_file uuid,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare f public.file_batch_files;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='super_admin' and status='active') then raise exception 'super admin required'; end if;
  select * into f from public.file_batch_files where id=p_file for update;
  if f.id is null then raise exception 'file not found'; end if;
  if f.deleted_at is not null then return; end if;
  if exists(select 1 from storage.objects where bucket_id='student-deliveries' and name=f.file_path) then raise exception 'storage file still exists'; end if;
  update public.file_batch_files set deleted_at=now() where id=f.id;
  insert into public.operation_events(actor_id,action,target_type,target_id) values(p_actor,'delete_file','file_batch_files',f.id::text);
end $$;
revoke all on function public.complete_distribution_file_delete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_distribution_file_delete(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
