-- ============ 게시판 작성자 소속 자동 보충 ============
-- 구버전 캐시 화면 등 클라이언트가 author_org를 누락해도
-- insert 시점에 프로필에서 소속(과 비어있는 작성자명)을 서버가 채워 넣는다.
create or replace function public.fill_board_author() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org text; v_name text; v_nick text;
begin
  if new.user_id is not null then
    select org, name, nickname into v_org, v_name, v_nick
    from public.profiles where id = new.user_id;
    if coalesce(new.author_org, '') = '' then
      new.author_org := coalesce(v_org, '');
    end if;
    if coalesce(new.author_name, '') = '' then
      new.author_name := coalesce(nullif(v_nick, ''), v_name, '');
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.fill_board_author() from anon, authenticated, public;

create trigger board_posts_fill_author
  before insert on public.board_posts
  for each row execute function public.fill_board_author();
create trigger board_comments_fill_author
  before insert on public.board_comments
  for each row execute function public.fill_board_author();

-- 구버전 화면에서 소속 없이 등록된 글·댓글 백필
update public.board_posts p set author_org = pr.org
  from public.profiles pr where pr.id = p.user_id and p.author_org = '';
update public.board_comments c set author_org = pr.org
  from public.profiles pr where pr.id = c.user_id and c.author_org = '';
