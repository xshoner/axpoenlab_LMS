begin;
create function public.admin_cohort_metrics(p_cohort uuid) returns jsonb
language sql stable security invoker set search_path=public as $$
with courses as (select id,group_id,course_no,title,assignment_enabled from public.cohort_courses where cohort_id=p_cohort),
members as (select user_id,p.status from public.cohort_members m join public.profiles p on p.id=m.user_id where cohort_id=p_cohort),
surveys as (select s.id from public.surveys s join courses c on c.id=s.cohort_course_id where s.status<>'draft'),
quizzes as (select q.id from public.quizzes q join courses c on c.id=q.cohort_course_id where q.status<>'draft'),
counts as(select (select count(*) from members) as n,
  (select count(*) from courses where assignment_enabled) as ac,
  (select count(*) from surveys) as sc,(select count(*) from quizzes) as qc)
select jsonb_build_object(
  'students',n,'active',(select count(*) from members where status='active'),
  'courseGroups',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'sort_order',sort_order,'is_default',is_default) order by sort_order,created_at) from public.cohort_course_groups where cohort_id=p_cohort),'[]'::jsonb),
  'courseViewRates',coalesce((select jsonb_agg(jsonb_build_object('name',lpad(c.course_no::text,2,'0')||'. '||left(c.title,12),'groupId',c.group_id,'열람률',case when n>0 then round(100.0*(select count(*) from public.course_views v join members m on m.user_id=v.user_id where v.cohort_course_id=c.id)/n) else 0 end) order by c.course_no) from courses c),'[]'::jsonb),
  'submitRate',case when n*ac>0 then round(100.0*(select count(*) from public.submissions s join courses c on c.id=s.cohort_course_id join members m on m.user_id=s.user_id where c.assignment_enabled)/(n*ac)) else 0 end,
  'surveyRate',case when n*sc>0 then round(100.0*(select count(*) from public.survey_responses r join surveys s on s.id=r.survey_id join members m on m.user_id=r.user_id)/(n*sc)) else 0 end,
  'quizRate',case when n*qc>0 then round(100.0*(select count(*) from public.quiz_submissions s join quizzes q on q.id=s.quiz_id join members m on m.user_id=s.user_id)/(n*qc)) else 0 end,
  'avgScore',coalesce((select round(avg(total_score),1)::text from public.quiz_submissions s join quizzes q on q.id=s.quiz_id join members m on m.user_id=s.user_id where s.graded),'-'),
  'topRated',coalesce((select jsonb_agg(t) from (select r.cohort_course_id,r.avg_rating,r.rating_count,jsonb_build_object('course_no',c.course_no,'title',c.title) as course from public.course_rating_stats r join courses c on c.id=r.cohort_course_id where r.cohort_id=p_cohort order by r.avg_rating desc,r.rating_count desc limit 5)t),'[]'::jsonb),
  'inquiries',coalesce((select jsonb_agg(t) from (select i.id,i.title,i.status,i.created_at,jsonb_build_object('name',p.name) as profiles from public.inquiries i join members m on m.user_id=i.user_id join public.profiles p on p.id=i.user_id order by i.status desc,i.created_at desc limit 10)t),'[]'::jsonb)
) from counts where (select public.is_admin())
$$;
create function public.admin_member_page(p_cohort uuid default null,p_search text default '',p_page integer default 1,p_size integer default 30) returns jsonb
language sql stable security invoker set search_path=public as $$
with matches as (
  select p.id,p.name,p.org,p.email,p.status,p.created_at,p.last_login_at,
    case when m.cohort_id is null then null else jsonb_build_object('cohort_id',m.cohort_id,'cohorts',jsonb_build_object('id',c.id,'name',c.name)) end as cohort_members
  from public.profiles p left join public.cohort_members m on m.user_id=p.id left join public.cohorts c on c.id=m.cohort_id
  where (select public.is_admin()) and p.role='student' and (p_cohort is null or m.cohort_id=p_cohort)
    and (coalesce(p_search,'')='' or position(lower(left(p_search,100)) in lower(p.name||' '||p.email||' '||p.org))>0)
),page as(select * from matches order by created_at desc,id offset (greatest(p_page,1)-1)*least(greatest(p_size,1),100) limit least(greatest(p_size,1),100))
select jsonb_build_object('total',(select count(*) from matches),'items',coalesce((select jsonb_agg(page) from page),'[]'::jsonb))
$$;
revoke all on function public.admin_cohort_metrics(uuid),public.admin_member_page(uuid,text,integer,integer) from public,anon;
grant execute on function public.admin_cohort_metrics(uuid),public.admin_member_page(uuid,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
