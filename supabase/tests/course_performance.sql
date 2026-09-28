begin;
set local statement_timeout='60s';
create temp table perf_context as
select c.id course_id,c.cohort_id,c.group_id,
 (select user_id from public.cohort_members m join public.profiles p on p.id=m.user_id where m.cohort_id=c.cohort_id and p.status='active' and p.role='student' limit 1) student_id,
 (select id from public.profiles where role='super_admin' and status='active' limit 1) super_id,
 (select group_id from public.master_courses group by group_id order by count(*) desc limit 1) master_group_id
from public.cohort_courses c join public.cohort_course_groups g on g.id=c.group_id
where g.is_published and exists(select 1 from public.cohort_members m join public.profiles p on p.id=m.user_id where m.cohort_id=c.cohort_id and p.role='student' and p.status='active')
order by (select count(*) from public.cohort_courses x where x.group_id=c.group_id) desc,octet_length(c.body) desc limit 1;
create temp table perf_results(label text, run int, ms numeric, buffers bigint);
grant all on perf_context,perf_results to authenticated;
create function pg_temp.measure(label text,q text) returns void language plpgsql as $$
declare plan jsonb; i int; begin
 for i in 1..3 loop
 execute 'explain (analyze,buffers,format json) '||q into plan;
 insert into perf_results values(label,i,(plan->0->>'Execution Time')::numeric,(plan->0->'Plan'->>'Shared Hit Blocks')::bigint);
 end loop;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',super_id,'role','authenticated')::text,true),set_config('request.headers','{}',true) from perf_context;
set local role authenticated;
select pg_temp.measure('super master list',format('select * from public.admin_master_course_list(%L)',master_group_id)) from perf_context;
select pg_temp.measure('super cohort list',format('select * from public.admin_cohort_course_list(%L,%L)',cohort_id,group_id)) from perf_context;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',student_id,'role','authenticated')::text,true) from perf_context;
set local role authenticated;
select pg_temp.measure('student all course navigation','select id,group_id,course_no from public.cohort_courses order by course_no');
select pg_temp.measure('student course detail',format('select c.*,(select jsonb_agg(a) from public.cohort_attachments a where a.cohort_course_id=c.id),(select jsonb_agg(s.id) from public.surveys s where s.cohort_course_id=c.id),(select jsonb_agg(q.id) from public.quizzes q where q.cohort_course_id=c.id) from public.cohort_courses c where id=%L',course_id)) from perf_context;
select pg_temp.measure('student rating statistics',format('select avg_rating,rating_count from public.course_rating_stats where cohort_course_id=%L',course_id)) from perf_context;
reset role;
select label,round(avg(ms),2) average_ms,min(ms) min_ms,max(ms) max_ms,round(avg(buffers)) shared_buffer_hits from perf_results group by label order by label;
rollback;
