-- Read-only query changes: retain legacy content and administrator isolation.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

create or replace function public.visit_stats() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('today',count(*) filter(where visited_date=(now() at time zone 'Asia/Seoul')::date),'total',count(*))
  from public.visit_logs v where (select public.is_active_user()) and (
    (select public.tenant_global())
    or ((select public.is_admin()) and v.owner_admin_id=(select public.tenant_owner()))
    or (not (select public.is_admin()) and v.user_id=(select auth.uid()))
  )
$$;
alter policy "admin select visits" on public.visit_logs using ((select public.is_admin()));
alter policy tenant_read on public.visit_logs using (
  (select public.tenant_global()) or (
    (select public.is_active_user()) and (select public.is_admin())
    and owner_admin_id=(select public.tenant_owner())
  )
);
create or replace function public.visit_series(p_days int default 30) returns table(d date,cnt bigint)
language sql stable security invoker set search_path='' as $$
  select visited_date,count(*) from public.visit_logs
  where (select public.is_admin()) and visited_date>(now() at time zone 'Asia/Seoul')::date-least(greatest(p_days,1),366)
  group by visited_date order by visited_date
$$;

-- Include any previously created super-admin personal groups without moving or
-- rewriting them. They are shared master groups; normal admin groups stay private.
create function public.master_library_group_list() returns setof public.master_course_groups
language sql stable security invoker set search_path='' as $$
  select g.* from public.master_course_groups g
  where (select public.is_admin()) and public.tenant_shared_owner(g.owner_admin_id)
  order by g.sort_order,g.created_at
$$;

-- Invoker RPCs collapse HTTP waterfalls while all existing RLS remains active.
create function public.admin_dashboard_overview() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return (
    with members as materialized (select cohort_id,count(*) cnt from public.cohort_members group by cohort_id)
    select jsonb_build_object(
      'memberCounts',coalesce((select jsonb_agg(jsonb_build_object('cohort_id',cohort_id,'count',cnt)) from members),'[]'::jsonb),
      'totalStudents',coalesce((select sum(cnt) from members),0),
      'totalCourses',(select count(*) from public.cohort_courses),
      'totalSubmissions',(select count(*) from public.submissions),
      'unanswered',(select count(*) from public.inquiries where status='open'),
      'visits',public.visit_stats(),
      'visitSeriesRaw',coalesce((select jsonb_agg(s) from public.visit_series(365) s),'[]'::jsonb),
      'notices',coalesce((select jsonb_agg(n) from (
        select id,title,pinned,created_at,cohort_id from public.notices order by pinned desc,created_at desc limit 6
      ) n),'[]'::jsonb),
      'boardPosts',coalesce((select jsonb_agg(b) from (
        select p.id,p.title,p.author_name,p.author_org,p.is_guest,p.created_at,
          jsonb_build_array(jsonb_build_object('count',(select count(*) from public.board_comments c where c.post_id=p.id))) board_comments
        from public.board_posts p order by p.created_at desc limit 5
      ) b),'[]'::jsonb)
    )
  );
end $$;

create function public.student_dashboard() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if not public.is_active_user() or public.current_role_of()<>'student' then raise exception 'forbidden'; end if;
  return (
    with courses as materialized (
      select id,group_id,course_no,title,assignment_enabled,assignment_due from public.cohort_courses
      where cohort_id=(select public.my_cohort_id()) order by course_no
    ), surveys as materialized (
      select s.id,s.cohort_course_id,s.status from public.surveys s join courses c on c.id=s.cohort_course_id where s.status='open'
    ), quizzes as materialized (
      select q.id,q.cohort_course_id,q.status from public.quizzes q join courses c on c.id=q.cohort_course_id where q.status='open'
    )
    select jsonb_build_object(
      'courses',coalesce((select jsonb_agg(c order by course_no) from courses c),'[]'::jsonb),
      'groups',coalesce((select jsonb_agg(g) from (
        select id,name,sort_order,is_default from public.cohort_course_groups
        where cohort_id=(select public.my_cohort_id()) order by sort_order,created_at
      ) g),'[]'::jsonb),
      'views',coalesce((select jsonb_agg(v.cohort_course_id) from public.course_views v join courses c on c.id=v.cohort_course_id where v.user_id=(select auth.uid())),'[]'::jsonb),
      'submissions',coalesce((select jsonb_agg(s.cohort_course_id) from public.submissions s join courses c on c.id=s.cohort_course_id where s.user_id=(select auth.uid())),'[]'::jsonb),
      'surveys',coalesce((select jsonb_agg(s) from surveys s),'[]'::jsonb),
      'quizzes',coalesce((select jsonb_agg(q) from quizzes q),'[]'::jsonb),
      'responses',coalesce((select jsonb_agg(r.survey_id) from public.survey_responses r join surveys s on s.id=r.survey_id where r.user_id=(select auth.uid())),'[]'::jsonb),
      'quizSubmissions',coalesce((select jsonb_agg(s.quiz_id) from public.quiz_submissions s join quizzes q on q.id=s.quiz_id where s.user_id=(select auth.uid())),'[]'::jsonb),
      'notices',coalesce((select jsonb_agg(n) from (
        select id,title,created_at,pinned from public.notices order by pinned desc,created_at desc limit 5
      ) n),'[]'::jsonb),
      'boardPosts',coalesce((select jsonb_agg(b) from (
        select p.id,p.title,p.author_name,p.author_org,p.created_at,
          jsonb_build_array(jsonb_build_object('count',(select count(*) from public.board_comments c where c.post_id=p.id))) board_comments
        from public.board_posts p order by p.created_at desc limit 5
      ) b),'[]'::jsonb),
      'arcade',(select to_jsonb(a) from (
        select id,name,description,url from public.arcade_games order by created_at desc,id desc limit 1
      ) a)
    )
  );
end $$;

revoke all on function public.master_library_group_list(),public.admin_dashboard_overview(),public.student_dashboard() from public,anon;
grant execute on function public.master_library_group_list(),public.admin_dashboard_overview(),public.student_dashboard() to authenticated;
notify pgrst,'reload schema';
commit;
