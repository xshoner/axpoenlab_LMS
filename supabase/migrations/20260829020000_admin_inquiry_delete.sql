-- 관리자 1:1 문의 삭제 (답변은 FK cascade로 함께 삭제, 첨부파일 삭제 권한은 storage 정책에 이미 존재)
create policy "admin inquiry delete" on public.inquiries for delete using (public.is_admin());
