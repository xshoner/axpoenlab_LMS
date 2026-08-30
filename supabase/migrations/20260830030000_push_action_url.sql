-- 쪽지에 링크 버튼(action_url / action_label) 추가 — 예: "아래 사이트에 접속하세요 [Gemini 열기]"
alter table public.push_messages
  add column action_url text,
  add column action_label text not null default '';
alter table public.push_deliveries
  add column action_url text,
  add column action_label text not null default '';
