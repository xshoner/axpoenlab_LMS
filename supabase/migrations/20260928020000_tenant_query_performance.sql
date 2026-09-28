-- Optimize authorization inputs without changing tenant or publication rules.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

create or replace function private.tenant_row(p_table text, r jsonb, writing boolean default false) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare parent jsonb; parent_table text; parent_id uuid; owner_id uuid;
begin
  if r is null then return false; end if;
  if writing and public.admin_view_owner() is not null then return false; end if;
  if public.tenant_global() then return true; end if;
  if p_table = 'profiles' then
    return (r->>'id')::uuid = auth.uid() or (public.is_admin() and public.tenant_member((r->>'id')::uuid));
  end if;
  if not public.is_active_user() then return false; end if;
  if p_table = 'system_settings' then
    return not writing and r->>'key' <> 'board_guest_token';
  end if;
  if p_table in ('master_courses', 'master_course_groups') then
    owner_id := (r->>'owner_admin_id')::uuid;
    return public.is_admin() and (public.tenant_owns(owner_id) or (not writing and public.tenant_shared_owner(owner_id)));
  elsif p_table in ('cohorts', 'cohort_course_groups', 'cohort_members', 'cohort_courses',
                    'hackathon_entries', 'hackathon_rounds', 'hall_of_fame', 'help_requests') then
    parent_id := case when p_table = 'cohorts' then (r->>'id')::uuid else (r->>'cohort_id')::uuid end;
    if p_table = 'cohorts' and public.is_admin() then return public.tenant_owns((r->>'owner_admin_id')::uuid); end if;
    return case when public.is_admin() then public.tenant_cohort(parent_id)
      else parent_id = public.my_cohort_id() end;
  elsif p_table in ('notices', 'push_deliveries', 'arcade_games', 'board_posts') then
    owner_id := (r->>'owner_admin_id')::uuid;
    if public.is_admin() then return public.tenant_owns(owner_id); end if;
    if p_table = 'board_posts' then
      return owner_id is not distinct from public.tenant_owner();
    end if;
    return (public.tenant_shared_owner(owner_id) or owner_id = public.tenant_owner())
      and (r->>'cohort_id' is null or (r->>'cohort_id')::uuid = public.my_cohort_id());
  elsif p_table = 'visit_logs' then
    return public.is_admin() and public.tenant_owns((r->>'owner_admin_id')::uuid);
  elsif p_table in ('admin_memos', 'push_messages') then
    return public.is_admin() and (r->>case when p_table = 'admin_memos' then 'author_id' else 'sender_id' end)::uuid = public.tenant_owner();
  elsif p_table in ('user_bookmarks', 'push_hidden') then
    return (r->>'user_id')::uuid = coalesce(public.admin_view_owner(), auth.uid());
  elsif p_table = 'inquiries' then
    return case when public.is_admin() then public.tenant_owns((r->>'owner_admin_id')::uuid)
      else (r->>'user_id')::uuid = auth.uid() end;
  elsif p_table = 'inquiry_replies' then parent_table := 'inquiries'; parent_id := (r->>'inquiry_id')::uuid;
  elsif p_table = 'board_comments' then parent_table := 'board_posts'; parent_id := (r->>'post_id')::uuid;
  elsif p_table = 'notice_attachments' then parent_table := 'notices'; parent_id := (r->>'notice_id')::uuid;
  elsif p_table = 'master_attachments' then parent_table := 'master_courses'; parent_id := (r->>'master_course_id')::uuid;
  elsif p_table in ('cohort_attachments', 'course_views', 'course_ratings', 'submissions', 'submission_logs') then
    parent_table := 'cohort_courses'; parent_id := (r->>'cohort_course_id')::uuid;
  elsif p_table in ('surveys', 'quizzes') then
    if r->>'cohort_course_id' is not null then parent_table := 'cohort_courses'; parent_id := (r->>'cohort_course_id')::uuid;
    else parent_table := 'master_courses'; parent_id := (r->>'master_course_id')::uuid; end if;
  elsif p_table in ('survey_questions', 'survey_responses') then parent_table := 'surveys'; parent_id := (r->>'survey_id')::uuid;
  elsif p_table = 'survey_answers' then parent_table := 'survey_responses'; parent_id := (r->>'response_id')::uuid;
  elsif p_table in ('quiz_questions', 'quiz_submissions') then parent_table := 'quizzes'; parent_id := (r->>'quiz_id')::uuid;
  elsif p_table = 'quiz_answers' then parent_table := 'quiz_submissions'; parent_id := (r->>'submission_id')::uuid;
  elsif p_table in ('hackathon_attachments', 'hackathon_ratings', 'hackathon_comments') then
    parent_table := 'hackathon_entries'; parent_id := (r->>'entry_id')::uuid;
  else return false;
  end if;
  -- Never detoast/serialize lesson bodies or other content to check ownership.
  execute format('select %s from public.%I t where id = $1',
    case parent_table
      when 'master_courses' then 'jsonb_build_object(''owner_admin_id'',t.owner_admin_id)'
      when 'cohort_courses' then 'jsonb_build_object(''cohort_id'',t.cohort_id)'
      when 'hackathon_entries' then 'jsonb_build_object(''cohort_id'',t.cohort_id)'
      when 'inquiries' then 'jsonb_build_object(''owner_admin_id'',t.owner_admin_id,''user_id'',t.user_id)'
      when 'board_posts' then 'jsonb_build_object(''owner_admin_id'',t.owner_admin_id)'
      when 'notices' then 'jsonb_build_object(''owner_admin_id'',t.owner_admin_id,''cohort_id'',t.cohort_id)'
      when 'surveys' then 'jsonb_build_object(''cohort_course_id'',t.cohort_course_id,''master_course_id'',t.master_course_id)'
      when 'quizzes' then 'jsonb_build_object(''cohort_course_id'',t.cohort_course_id,''master_course_id'',t.master_course_id)'
      when 'survey_responses' then 'jsonb_build_object(''survey_id'',t.survey_id)'
      when 'quiz_submissions' then 'jsonb_build_object(''quiz_id'',t.quiz_id)'
    end, parent_table) into parent using parent_id;
  return coalesce(private.tenant_row(parent_table, parent, writing), false);
end $$;


-- Statement-level sets avoid re-reading the caller's profile and membership for
-- every course/rating row. SECURITY DEFINER bypasses only recursive RLS lookup;
-- the original permissive publication and own-submission policies still apply.
create function private.tenant_readable_cohorts() returns setof uuid
language sql stable security definer set search_path='' as $$
  select c.id from public.cohorts c
  where (select public.is_active_user()) and (
    (select public.tenant_global())
    or ((select public.is_admin()) and c.owner_admin_id=(select public.tenant_owner()))
    or (not (select public.is_admin()) and c.id=(select public.my_cohort_id()))
  )
$$;
create function private.tenant_readable_courses() returns setof uuid
language sql stable security definer set search_path='' as $$
  select c.id from public.cohort_courses c
  where c.cohort_id in (select private.tenant_readable_cohorts())
$$;
revoke all on function private.tenant_readable_cohorts(),private.tenant_readable_courses() from public,anon;
grant execute on function private.tenant_readable_cohorts(),private.tenant_readable_courses() to authenticated;

-- Keep the exact same restrictive policy checks, passing only the identifiers
-- they inspect. A whole-row to_jsonb(table) forces large TOAST bodies to be read
-- even for a list that selects only id/title, and repeats that work in joins.
do $$ declare t text; identity_sql text; read_check text; write_check text; begin
  for t in select tablename from pg_policies
    where schemaname='public' and policyname='tenant_read' order by tablename loop
    select 'jsonb_build_object(' || string_agg(format('%L, %I.%I',a.attname,t,a.attname), ', ' order by a.attnum) || ')'
      into identity_sql
    from pg_attribute a where a.attrelid=format('public.%I',t)::regclass and a.attnum>0 and not a.attisdropped
      and a.attname=any(array['id','owner_admin_id','cohort_id','user_id','author_id','sender_id','key',
        'inquiry_id','post_id','notice_id','master_course_id','cohort_course_id','survey_id','response_id',
        'quiz_id','submission_id','entry_id']);
    if identity_sql is null then raise exception 'Missing tenant identity for %',t; end if;
    read_check := format('(select public.tenant_global()) or private.tenant_row(%L, %s, false)',t,identity_sql);
    if t in ('cohort_course_groups','cohort_members','cohort_courses','hackathon_entries',
      'hackathon_rounds','hall_of_fame','help_requests') then
      read_check := '(select public.tenant_global()) or cohort_id in (select private.tenant_readable_cohorts())';
    elsif t in ('cohort_attachments','course_views','course_ratings','submissions','submission_logs') then
      read_check := '(select public.tenant_global()) or cohort_course_id in (select private.tenant_readable_courses())';
    end if;
    write_check := format('private.tenant_row(%L, %s, true)',t,identity_sql);
    execute format('alter policy tenant_read on public.%I using (%s)',t,read_check);
    execute format('alter policy tenant_insert on public.%I with check (%s)',t,write_check);
    execute format('alter policy tenant_update on public.%I using (%s) with check (%s)',t,write_check,write_check);
    execute format('alter policy tenant_delete on public.%I using (%s)',t,write_check);
  end loop;
end $$;
create or replace function private.course_rating_stats_rows()
returns table (
  cohort_course_id uuid, cohort_id uuid, master_course_id uuid,
  rating_count int, avg_rating numeric
)
language sql stable security definer set search_path = '' as $$
  with aggregate_ratings as (
    select
      coalesce(course.master_course_id::text, course.id::text) as group_key,
      count(rating.id)::int as rating_count,
      round(avg(rating.rating)::numeric, 2) as avg_rating
    from public.cohort_courses as course
    join public.course_ratings as rating on rating.cohort_course_id = course.id
    where course.cohort_id in (select private.tenant_readable_cohorts())
    group by 1
  )
  select
    course.id,
    course.cohort_id,
    course.master_course_id,
    aggregate_ratings.rating_count,
    aggregate_ratings.avg_rating
  from public.cohort_courses as course
  join public.cohort_course_groups as grp on grp.id = course.group_id
  join aggregate_ratings
    on aggregate_ratings.group_key = coalesce(course.master_course_id::text, course.id::text)
  where (select public.is_active_user())
    and (
      ((select public.is_admin()) and course.cohort_id in (select private.tenant_readable_cohorts()))
      or (course.cohort_id = (select public.my_cohort_id()) and grp.is_published)
    )
$$;

notify pgrst, 'reload schema';
commit;
