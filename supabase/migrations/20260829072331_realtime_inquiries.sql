-- 1:1 문의 실시간 건수 갱신: inquiries 테이블 변경 이벤트를 Realtime으로 발행
alter publication supabase_realtime add table public.inquiries;
