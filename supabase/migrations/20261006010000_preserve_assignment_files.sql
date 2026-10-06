begin;
set local lock_timeout='5s';

-- Preserve all existing data. Referenced current and historical files are immutable.
create index if not exists submissions_file_path_idx on public.submissions(file_path) where file_path is not null;
create index if not exists submission_versions_file_path_idx on public.submission_versions(file_path) where file_path is not null;
create function private.assignment_file_unreferenced(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.submissions where file_path=p_path)
    and not exists(select 1 from public.submission_versions where file_path=p_path)
$$;
revoke all on function private.assignment_file_unreferenced(text) from public,anon;
grant execute on function private.assignment_file_unreferenced(text) to authenticated;
create policy assignment_file_update_guard on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'submissions' or private.assignment_file_unreferenced(name))
  with check(bucket_id<>'submissions' or private.assignment_file_unreferenced(name));
create policy assignment_file_delete_guard on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'submissions' or private.assignment_file_unreferenced(name));
commit;
