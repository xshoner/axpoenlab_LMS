begin;
-- Guard the final transition even for malformed/null RPC payloads.
create function private.guard_file_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status='sent' and old.status='draft' then
    if not exists(select 1 from public.file_batch_files where batch_id=new.id)
      or not exists(select 1 from public.file_recipients where batch_id=new.id)
      or new.sent_at is null then raise exception 'files and recipients required'; end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_file_delivery() from public,anon,authenticated;
create trigger guard_file_delivery before update on public.file_batches
  for each row execute function private.guard_file_delivery();
commit;
