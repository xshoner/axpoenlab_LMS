insert into storage.buckets (id, name, public, file_size_limit)
values
  ('course-files', 'course-files', false, 52428800),
  ('submissions', 'submissions', false, 5242880),
  ('inquiry-files', 'inquiry-files', false, 5242880),
  ('notice-files', 'notice-files', false, 52428800)
on conflict (id) do nothing;

-- 강좌/공지 자료: 관리자 쓰기, 로그인 사용자 읽기(서명 URL)
create policy "course files read" on storage.objects for select
  using (bucket_id in ('course-files','notice-files') and auth.uid() is not null);
create policy "course files admin write" on storage.objects for insert
  with check (bucket_id in ('course-files','notice-files') and public.is_admin());
create policy "course files admin update" on storage.objects for update
  using (bucket_id in ('course-files','notice-files') and public.is_admin());
create policy "course files admin delete" on storage.objects for delete
  using (bucket_id in ('course-files','notice-files') and public.is_admin());

-- 과제/문의 파일: 본인 폴더 쓰기, 본인+관리자 읽기
create policy "user files read" on storage.objects for select
  using (bucket_id in ('submissions','inquiry-files')
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
create policy "user files insert" on storage.objects for insert
  with check (bucket_id in ('submissions','inquiry-files')
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "user files update" on storage.objects for update
  using (bucket_id in ('submissions','inquiry-files')
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "user files delete" on storage.objects for delete
  using (bucket_id in ('submissions','inquiry-files')
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
