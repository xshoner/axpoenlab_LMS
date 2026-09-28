begin;
set local statement_timeout='90s';
create temp table dashboard_perf(role_name text,label text,ms numeric);
grant all on dashboard_perf to authenticated;
create function pg_temp.measure(actor text,label text,q text) returns void language plpgsql as $$
declare plan jsonb; begin
 execute 'explain(analyze,format json) '||q into plan;
 insert into dashboard_perf values(actor,label,(plan->0->>'Execution Time')::numeric);
end $$;
do $$ declare actor record; q record; begin
 for actor in select distinct on (role) id,role from public.profiles where status='active' order by role,created_at loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 execute 'set local role authenticated';
 for q in select * from (values
 ('admin snapshot','select public.admin_dashboard_overview()'),
 ('student snapshot','select public.student_dashboard()'),
 ('visits','select public.visit_stats()'),
 ('visit series','select * from public.visit_series(365)'),
 ('courses','select id,group_id,title from public.cohort_courses'),
 ('members','select cohort_id,user_id from public.cohort_members'),
 ('notices','select id,title from public.notices order by pinned desc,created_at desc limit 6'),
 ('board','select p.id,p.title,(select count(*) from public.board_comments c where c.post_id=p.id) from public.board_posts p order by created_at desc limit 5'),
 ('surveys','select id,cohort_course_id from public.surveys where status=''open'''),
 ('quizzes','select id,cohort_course_id from public.quizzes where status=''open''')
 ) t(label,sql) loop
 if (q.label<>'admin snapshot' or actor.role<>'student') and (q.label<>'student snapshot' or actor.role='student') then
 perform pg_temp.measure(actor.role,q.label,q.sql);
 end if;
 end loop;
 execute 'reset role';
 end loop;
end $$;
select * from dashboard_perf order by ms desc;
rollback;
