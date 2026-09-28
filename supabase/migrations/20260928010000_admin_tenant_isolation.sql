-- Apply the entire authorization change atomically; lock contention aborts safely.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Additive tenant boundaries. NULL ownership is the legacy super-admin estate.
-- No existing course, membership, response, attachment or profile is rewritten.
alter table public.cohorts add column owner_admin_id uuid references public.profiles(id) on delete restrict;
alter table public.master_course_groups add column owner_admin_id uuid references public.profiles(id) on delete restrict;
alter table public.master_courses add column owner_admin_id uuid references public.profiles(id) on delete restrict;
alter table public.notices add column owner_admin_id uuid references public.profiles(id) on delete restrict;
alter table public.board_posts add column owner_admin_id uuid references public.profiles(id) on delete restrict;
alter table public.push_deliveries add column owner_admin_id uuid references public.profiles(id) on delete restrict;
alter table public.arcade_games add column owner_admin_id uuid references public.profiles(id) on delete restrict;
alter table public.visit_logs add column owner_admin_id uuid references public.profiles(id) on delete restrict;
alter table public.inquiries add column owner_admin_id uuid references public.profiles(id) on delete restrict;

create index cohorts_owner_idx on public.cohorts(owner_admin_id);
create index master_groups_owner_idx on public.master_course_groups(owner_admin_id);
create index master_courses_owner_idx on public.master_courses(owner_admin_id);
create index notices_owner_idx on public.notices(owner_admin_id);
create index board_posts_owner_idx on public.board_posts(owner_admin_id);
create index push_deliveries_owner_idx on public.push_deliveries(owner_admin_id);
create index visit_logs_owner_date_idx on public.visit_logs(owner_admin_id, visited_date);
create index inquiries_owner_idx on public.inquiries(owner_admin_id);
drop index public.master_course_groups_one_default_idx;
create unique index master_course_groups_one_default_idx
  on public.master_course_groups ((coalesce(owner_admin_id, '00000000-0000-0000-0000-000000000000'::uuid))) where is_default;

-- A header can only narrow a genuine super-admin session. It never grants a role.
create function public.admin_view_owner() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  if not public.is_super_admin() then return null; end if;
  v := nullif(current_setting('request.headers', true), '')::jsonb->>'x-admin-view';
  if nullif(v, '') is null then return null; end if;
  if not exists (select 1 from public.profiles where id = v::uuid and role = 'admin') then
    raise exception 'invalid admin view';
  end if;
  return v::uuid;
end $$;

create function public.tenant_owner() returns uuid
language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then coalesce(public.admin_view_owner(), auth.uid())
    else (select c.owner_admin_id from public.cohorts c
          join public.cohort_members m on m.cohort_id = c.id where m.user_id = auth.uid()) end
$$;

create function public.tenant_global() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() and public.admin_view_owner() is null
$$;

create function public.tenant_owns(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() and (public.tenant_global() or p_owner = public.tenant_owner())
$$;

create function public.tenant_cohort(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cohorts c where c.id = p_id and public.tenant_owns(c.owner_admin_id))
$$;

create function public.tenant_member(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.tenant_global() or exists (
    select 1 from public.cohort_members m join public.cohorts c on c.id = m.cohort_id
    join public.profiles p on p.id = m.user_id
    where m.user_id = p_id and p.role = 'student' and public.tenant_owns(c.owner_admin_id))
$$;

create function public.tenant_shared_owner(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_owner is null or exists (select 1 from public.profiles where id = p_owner and role = 'super_admin')
$$;

-- Recursive lookup is confined to a fixed set of parent relationships. It does not
-- query RLS policies, avoiding recursive policy evaluation on membership/profile joins.
create function private.tenant_row(p_table text, r jsonb, writing boolean default false) returns boolean
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
  execute format('select to_jsonb(t) from public.%I t where id = $1', parent_table) into parent using parent_id;
  return coalesce(private.tenant_row(parent_table, parent, writing), false);
end $$;

-- A restrictive boundary intersects every existing permissive policy, including
-- policies added in older releases. Student publication/answer rules remain intact.
do $$ declare t text; begin
  foreach t in array array['profiles','visit_logs','cohorts','cohort_members','master_courses','master_course_groups',
    'master_attachments','cohort_courses','cohort_course_groups','cohort_attachments','course_views','submissions',
    'submission_logs','surveys','survey_questions','survey_responses','survey_answers','quizzes','quiz_questions',
    'quiz_submissions','quiz_answers','notices','notice_attachments','inquiries','inquiry_replies','board_posts',
    'board_comments','course_ratings','admin_memos','push_messages','push_deliveries','user_bookmarks','push_hidden',
    'hackathon_entries','hackathon_attachments','hackathon_ratings','hackathon_rounds','hall_of_fame','hackathon_comments',
    'help_requests','arcade_games','system_settings'] loop
    execute format('create policy tenant_read on public.%I as restrictive for select to authenticated using (private.tenant_row(%L, to_jsonb(%I), false))', t, t, t);
    execute format('create policy tenant_insert on public.%I as restrictive for insert to authenticated with check (private.tenant_row(%L, to_jsonb(%I), true))', t, t, t);
    execute format('create policy tenant_update on public.%I as restrictive for update to authenticated using (private.tenant_row(%L, to_jsonb(%I), true)) with check (private.tenant_row(%L, to_jsonb(%I), true))', t, t, t, t, t);
    execute format('create policy tenant_delete on public.%I as restrictive for delete to authenticated using (private.tenant_row(%L, to_jsonb(%I), true))', t, t, t);
  end loop;
end $$;

-- Ownership is assigned by the server and cannot be reassigned through REST.
create function private.stamp_tenant_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.owner_admin_id is distinct from old.owner_admin_id then raise exception 'ownership is immutable'; end if;
  elsif auth.uid() is not null then
    if tg_table_name in ('board_posts','visit_logs') and to_jsonb(new)->>'user_id' is null then return new;
    elsif tg_table_name = 'master_courses' then
      select owner_admin_id into new.owner_admin_id from public.master_course_groups where id = new.group_id;
    elsif tg_table_name = 'master_course_groups' and public.tenant_global() then
      new.owner_admin_id := new.owner_admin_id;
    else new.owner_admin_id := public.tenant_owner(); end if;
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['cohorts','master_courses','master_course_groups','notices','board_posts','push_deliveries','arcade_games','visit_logs','inquiries'] loop
    execute format('create trigger stamp_tenant_owner before insert or update on public.%I for each row execute function private.stamp_tenant_owner()', t);
  end loop;
end $$;

-- Guard links even inside SECURITY DEFINER RPCs, where RLS is bypassed.
create function private.guard_tenant_links() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(new); g jsonb; parent jsonb;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and public.is_admin() and not coalesce(private.tenant_row(tg_table_name, to_jsonb(old), true), false) then
    raise exception 'forbidden source';
  end if;
  if public.is_admin() and not coalesce(private.tenant_row(tg_table_name, r, true), false) then raise exception 'forbidden target'; end if;
  if tg_table_name = 'master_courses' then
    select to_jsonb(x) into g from public.master_course_groups x where id = new.group_id;
    if (g->>'owner_admin_id')::uuid is distinct from new.owner_admin_id then raise exception 'group owner mismatch'; end if;
  elsif tg_table_name = 'cohort_courses' then
    if not exists (select 1 from public.cohort_course_groups where id = new.group_id and cohort_id = new.cohort_id) then
      raise exception 'group cohort mismatch'; end if;
    if new.master_course_id is not null and public.is_admin() then
      select to_jsonb(x) into parent from public.master_courses x where id = new.master_course_id;
      if not private.tenant_row('master_courses', parent, false) then raise exception 'forbidden master'; end if;
    end if;
  elsif tg_table_name in ('surveys','quizzes') then
    if new.master_course_id is not null and new.cohort_course_id is not null then raise exception 'ambiguous course'; end if;
  elsif tg_table_name = 'cohort_members' and public.is_admin() and not public.tenant_global() then
    if tg_op = 'INSERT' and not public.tenant_member(new.user_id) then raise exception 'member must join with cohort code'; end if;
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['master_courses','cohort_courses','cohort_members','surveys','quizzes','survey_questions','quiz_questions',
    'master_attachments','cohort_attachments','notices','notice_attachments','push_deliveries','help_requests'] loop
    -- z prefix: ownership stamping must run first.
    execute format('create trigger z_guard_tenant_links before insert or update on public.%I for each row execute function private.guard_tenant_links()', t);
  end loop;
end $$;

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if public.admin_view_owner() is not null then raise exception 'read only admin view'; end if;
  if new.id is distinct from old.id then raise exception 'identity is immutable'; end if;
  if new.role is distinct from old.role and not public.tenant_global() then raise exception 'only super admin can change roles'; end if;
  if new.status is distinct from old.status or new.email is distinct from old.email then
    if not public.tenant_global() and not (public.is_admin() and old.role = 'student' and public.tenant_member(old.id)) then
      raise exception 'forbidden profile change'; end if;
  end if;
  return new;
end $$;

-- Own libraries use the same proven course/group/survey/quiz representation.
create function public.ensure_my_course_group() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.is_admin() or public.admin_view_owner() is not null then raise exception 'forbidden'; end if;
  insert into public.master_course_groups (name, is_default, owner_admin_id)
    values ('내 강좌', true, auth.uid()) on conflict do nothing;
  select id into v from public.master_course_groups where owner_admin_id = auth.uid() and is_default;
  return v;
end $$;

-- Invoker RPCs enforce the same boundaries as direct REST, including source reads.
alter function public.admin_master_course_list(uuid) security invoker;
alter function public.admin_cohort_course_list(uuid, uuid) security invoker;
alter function public.admin_reorder_master_courses(uuid, uuid[]) security invoker;
alter function public.admin_reorder_cohort_courses(uuid, uuid[]) security invoker;
alter function public.admin_transfer_master_course(uuid, uuid, boolean) security invoker;
alter function public.admin_transfer_cohort_course(uuid, uuid, boolean) security invoker;
alter function public.snapshot_courses_to_cohort(uuid, uuid[], boolean) security invoker;
alter function public.save_survey(uuid, jsonb, jsonb) security invoker;
alter function public.save_quiz(uuid, jsonb, jsonb) security invoker;
alter function public.close_hackathon(uuid) security invoker;
alter function public.reopen_hackathon(uuid) security invoker;
alter function public.today_account_visits() security invoker;

create function public.copy_master_to_my_courses(p_course_id uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare g uuid;
begin
  g := public.ensure_my_course_group();
  return public.admin_transfer_master_course(p_course_id, g, true);
end $$;

create or replace function public.assign_member(p_user_id uuid, p_cohort_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or public.admin_view_owner() is not null then raise exception 'forbidden'; end if;
  if not public.tenant_global() and (not public.tenant_member(p_user_id)
    or not coalesce(public.tenant_cohort(p_cohort_id), false)) then raise exception 'forbidden membership'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role = 'student') then raise exception 'student required'; end if;
  if p_cohort_id is null then delete from public.cohort_members where user_id = p_user_id;
  else
    insert into public.cohort_members (user_id, cohort_id) values (p_user_id, p_cohort_id)
    on conflict (user_id) do update set cohort_id = excluded.cohort_id;
  end if;
end $$;

create or replace function public.visit_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('today', count(*) filter (where visited_date = (now() at time zone 'Asia/Seoul')::date), 'total', count(*))
  from public.visit_logs v where public.is_active_user() and
    (public.tenant_global() or (public.is_admin() and private.tenant_row('visit_logs', to_jsonb(v), false))
      or (not public.is_admin() and v.user_id = auth.uid()))
$$;
create or replace function public.record_visit() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() then raise exception 'account inactive'; end if;
  if public.admin_view_owner() is null then
    insert into public.visit_logs (user_id, visited_date) values (auth.uid(), (now() at time zone 'Asia/Seoul')::date)
      on conflict (user_id, visited_date) do nothing;
    update public.profiles set last_login_at = now() where id = auth.uid();
  end if;
  return public.visit_stats();
end $$;
create or replace function public.visit_series(p_days int default 30) returns table(d date, cnt bigint)
language sql stable security invoker set search_path = '' as $$
  select visited_date, count(*) from public.visit_logs
  where public.is_admin() and visited_date > (now() at time zone 'Asia/Seoul')::date - least(greatest(p_days, 1), 366)
  group by visited_date order by visited_date
$$;

-- Revoke implicit PUBLIC execute for new entry points.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in ('admin_view_owner','tenant_owner','tenant_global','tenant_owns','tenant_cohort','tenant_member','tenant_shared_owner','ensure_my_course_group','copy_master_to_my_courses'))
       or (n.nspname = 'private' and p.proname in ('tenant_row','stamp_tenant_owner','guard_tenant_links')) loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;


-- Scope SECURITY DEFINER aggregates and privileged RPCs. No data mutations.
create or replace function public.grade_quiz(p_quiz_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sub record;
  v_q record;
  v_ans record;
  v_correct boolean;
  v_earned numeric;
  v_total numeric;
  v_graded int := 0;
  v_norm_val text;
  v_ok boolean;
  v_selected text[];
  v_answers text[];
begin
  if not public.is_admin() or public.admin_view_owner() is not null or not coalesce((
    select private.tenant_row('quizzes', to_jsonb(q), true) from public.quizzes q where id = p_quiz_id
  ), false) then raise exception 'forbidden'; end if;
  if exists (
    select 1 from public.quiz_questions
    where quiz_id = p_quiz_id and (answer is null or answer = 'null'::jsonb)
  ) then
    return jsonb_build_object('ok', false, 'error', 'missing_answers');
  end if;

  update public.quizzes set status = 'closed', graded_at = now() where id = p_quiz_id;

  for v_sub in select * from public.quiz_submissions where quiz_id = p_quiz_id loop
    v_total := 0;
    for v_q in select * from public.quiz_questions where quiz_id = p_quiz_id loop
      select * into v_ans from public.quiz_answers
        where submission_id = v_sub.id and question_id = v_q.id;
      v_correct := false;
      if v_ans.id is not null and v_ans.value is not null then
        if v_q.type = 'choice' then
          begin
            select array_agg(x) into v_selected from jsonb_array_elements_text(v_ans.value) as t(x);
            select array_agg(x) into v_answers from jsonb_array_elements_text(v_q.answer) as t(x);
            v_correct := v_selected is not null and array_length(v_selected, 1) > 0
              and v_selected <@ v_answers;
          exception when others then v_correct := false;
          end;
        elsif v_q.type = 'short' then
          v_norm_val := lower(regexp_replace(coalesce(v_ans.value #>> '{}', ''), '\s', '', 'g'));
          v_ok := false;
          begin
            select bool_or(lower(regexp_replace(x, '\s', '', 'g')) = v_norm_val) into v_ok
            from jsonb_array_elements_text(v_q.answer) as t(x);
          exception when others then v_ok := false;
          end;
          v_correct := coalesce(v_ok, false) and v_norm_val <> '';
        elsif v_q.type = 'ox' then
          v_correct := upper(coalesce(v_ans.value #>> '{}', '')) = upper(coalesce(v_q.answer #>> '{}', ''));
        end if;
      end if;
      v_earned := case when v_correct then v_q.points else 0 end;
      v_total := v_total + v_earned;
      if v_ans.id is not null then
        update public.quiz_answers set is_correct = v_correct, earned_score = v_earned where id = v_ans.id;
      else
        insert into public.quiz_answers (submission_id, question_id, value, is_correct, earned_score)
        values (v_sub.id, v_q.id, null, false, 0);
      end if;
    end loop;
    update public.quiz_submissions set total_score = v_total, graded = true where id = v_sub.id;
    v_graded := v_graded + 1;
  end loop;
  return jsonb_build_object('ok', true, 'graded', v_graded);
end $$;
create or replace function public.rate_hackathon(p_entry_id uuid, p_rating int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_entry public.hackathon_entries;
begin
  if not public.is_active_user() or public.admin_view_owner() is not null then raise exception 'forbidden'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid_rating');
  end if;
  if public.is_admin() then
    select e.* into v_entry from public.hackathon_entries e where e.id = p_entry_id and public.tenant_cohort(e.cohort_id);
  else
    select e.* into v_entry from public.hackathon_entries e
    join public.cohort_members m on m.cohort_id = e.cohort_id and m.user_id = auth.uid()
    where e.id = p_entry_id;
  end if;
  if v_entry.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if v_entry.user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'own_entry');
  end if;
  if exists (select 1 from public.hackathon_rounds hr
             where hr.cohort_id = v_entry.cohort_id and hr.closed) then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  insert into public.hackathon_ratings (entry_id, user_id, rating)
  values (p_entry_id, auth.uid(), p_rating)
  on conflict (entry_id, user_id)
  do update set rating = excluded.rating, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;
create or replace function private.quiz_questions_student_rows()
returns table (
  id uuid, quiz_id uuid, order_no int, type text, text text,
  points numeric, options jsonb, answer jsonb
)
language sql stable security definer set search_path = '' as $$
  select
    question.id,
    question.quiz_id,
    question.order_no,
    question.type,
    question.text,
    question.points,
    question.options,
    case when quiz.status = 'closed' and quiz.reveal_answers then question.answer else null end
  from public.quiz_questions as question
  join public.quizzes as quiz on quiz.id = question.quiz_id
  where public.is_active_user()
    and quiz.status in ('open', 'closed')
    and (
      (public.is_admin() and private.tenant_row('quizzes', to_jsonb(quiz), false))
      or exists (
        select 1
        from public.cohort_courses as course
        join public.cohort_course_groups as grp on grp.id = course.group_id
        where course.id = quiz.cohort_course_id
          and course.cohort_id = (select public.my_cohort_id())
          and grp.is_published
      )
    )
$$;
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
    where public.tenant_global() or public.tenant_cohort(course.cohort_id)
      or (not public.is_admin() and course.cohort_id = public.my_cohort_id())
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
  where public.is_active_user()
    and (
      (public.is_admin() and public.tenant_cohort(course.cohort_id))
      or (course.cohort_id = (select public.my_cohort_id()) and grp.is_published)
    )
$$;
create or replace function private.hackathon_rating_stats_rows()
returns table (entry_id uuid, cohort_id uuid, rating_count int, avg_rating numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    entry.id,
    entry.cohort_id,
    count(rating.id)::int,
    round(avg(rating.rating)::numeric, 2)
  from public.hackathon_entries as entry
  join public.hackathon_ratings as rating on rating.entry_id = entry.id
  where public.is_active_user()
    and (public.tenant_cohort(entry.cohort_id) or entry.cohort_id = public.my_cohort_id())
  group by entry.id
$$;
create or replace function public.student_course_list(p_group_id uuid)
returns table (
  id uuid, group_id uuid, course_no int, title text, summary text,
  attachment_count int, survey_count int, quiz_count int, viewed boolean,
  avg_rating numeric, rating_count int
)
language sql stable security definer set search_path = '' as $$
  select
    course.id,
    course.group_id,
    course.course_no,
    course.title,
    course.summary,
    (select count(*)::int from public.cohort_attachments as attachment
      where attachment.cohort_course_id = course.id),
    (select count(*)::int from public.surveys as survey
      where survey.cohort_course_id = course.id and survey.status <> 'draft'),
    (select count(*)::int from public.quizzes as quiz
      where quiz.cohort_course_id = course.id and quiz.status <> 'draft'),
    exists (
      select 1 from public.course_views as course_view
      where course_view.cohort_course_id = course.id and course_view.user_id = auth.uid()
    ),
    rating.avg_rating,
    coalesce(rating.rating_count, 0)
  from public.cohort_courses as course
  join public.cohort_course_groups as grp on grp.id = course.group_id
  left join lateral (
    select round(avg(course_rating.rating)::numeric, 2) as avg_rating,
           count(course_rating.id)::int as rating_count
    from public.cohort_courses as rated_course
    join public.course_ratings as course_rating
      on course_rating.cohort_course_id = rated_course.id
    where rated_course.cohort_id = course.cohort_id and (rated_course.id = course.id
       or (course.master_course_id is not null
           and rated_course.master_course_id = course.master_course_id))
  ) as rating on true
  where (select public.is_active_user())
    and course.cohort_id = (select public.my_cohort_id())
    and course.group_id = p_group_id
    and grp.is_published
  order by course.course_no, course.created_at
$$;

create or replace function private.staff_directory_rows()
returns table (id uuid, name text, nickname text, role text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.nickname, p.role from public.profiles p
  where public.is_active_user() and p.role in ('admin','super_admin') and
    (public.tenant_global() or p.id = public.tenant_owner() or p.role = 'super_admin')
$$;
create or replace function public.increment_notice_view(p_notice_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() or public.admin_view_owner() is not null then return; end if;
  update public.notices n set view_count = view_count + 1 where id = p_notice_id
    and private.tenant_row('notices', to_jsonb(n), false);
end $$;


-- File access follows the owning row, including copied attachments that share an
-- immutable storage object. Removing an attachment never removes a shared file.
create function private.tenant_storage(bucket text, path text, writing boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(path, '/'); target uuid; uid uuid;
begin
  if not writing and bucket = 'course-images' then return true; end if;
  if not public.is_active_user() or (writing and public.admin_view_owner() is not null) then return false; end if;
  if bucket in ('course-files', 'notice-files') then
    if not writing then
      if bucket = 'course-files' then
        return exists (select 1 from public.master_attachments a join public.master_courses c on c.id = a.master_course_id
          where a.file_path = path and private.tenant_row('master_courses', to_jsonb(c), false))
          or exists (select 1 from public.cohort_attachments a join public.cohort_courses c on c.id = a.cohort_course_id
            join public.cohort_course_groups g on g.id = c.group_id
            where a.file_path = path and private.tenant_row('cohort_courses', to_jsonb(c), false)
              and (public.is_admin() or g.is_published))
          or private.tenant_storage(bucket, path, true);
      else
        return exists (select 1 from public.notice_attachments a join public.notices n on n.id = a.notice_id
          where a.file_path = path and private.tenant_row('notices', to_jsonb(n), false))
          or private.tenant_storage(bucket, path, true);
      end if;
    end if;
    if not public.is_admin() then return false; end if;
    if parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
    target := parts[2]::uuid;
    -- Existing referenced objects are immutable, even for their uploader.
    if exists (select 1 from public.master_attachments where file_path = path)
      or exists (select 1 from public.cohort_attachments where file_path = path)
      or exists (select 1 from public.notice_attachments where file_path = path) then return false; end if;
    if bucket = 'notice-files' then
      return exists (select 1 from public.notices n where id = target and private.tenant_row('notices', to_jsonb(n), true));
    elsif parts[1] = 'master' then
      return exists (select 1 from public.master_courses c where id = target and private.tenant_row('master_courses', to_jsonb(c), true));
    else
      return exists (select 1 from public.cohort_courses c where id = target and c.cohort_id::text = parts[1]
        and private.tenant_row('cohort_courses', to_jsonb(c), true));
    end if;
  elsif bucket = 'course-images' then
    return public.is_admin() and (parts[1] = auth.uid()::text or public.tenant_global());
  elsif bucket in ('submissions','inquiry-files','help-files','hackathon-files') then
    if parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
    uid := parts[1]::uuid;
    if uid = auth.uid() or public.tenant_global() then return true; end if;
    if public.is_admin() then
      if bucket = 'submissions' then
        return exists (select 1 from public.submissions s join public.cohort_courses c on c.id = s.cohort_course_id
          where s.file_path = path and public.tenant_cohort(c.cohort_id));
      elsif bucket = 'inquiry-files' then
        return exists (select 1 from public.inquiries i where i.file_path = path and public.tenant_owns(i.owner_admin_id));
      elsif bucket = 'help-files' then
        return exists (select 1 from public.help_requests h where h.screenshot_path = path and public.tenant_cohort(h.cohort_id));
      elsif bucket = 'hackathon-files' then
        return exists (select 1 from public.hackathon_attachments a join public.hackathon_entries e on e.id = a.entry_id
          where a.file_path = path and public.tenant_cohort(e.cohort_id));
      end if;
    end if;
    if not writing and bucket = 'hackathon-files' then
      return exists (select 1 from public.hackathon_attachments a join public.hackathon_entries e on e.id = a.entry_id
        where a.file_path = path and e.cohort_id = public.my_cohort_id());
    end if;
  end if;
  return false;
end $$;
revoke all on function private.tenant_storage(text,text,boolean) from public, anon;
grant execute on function private.tenant_storage(text,text,boolean) to authenticated;
create policy tenant_file_read on storage.objects as restrictive for select to authenticated
  using (private.tenant_storage(bucket_id, name, false));
create policy tenant_file_insert on storage.objects as restrictive for insert to authenticated
  with check (private.tenant_storage(bucket_id, name, true));
create policy tenant_file_update on storage.objects as restrictive for update to authenticated
  using (private.tenant_storage(bucket_id, name, true)) with check (private.tenant_storage(bucket_id, name, true));
create policy tenant_file_delete on storage.objects as restrictive for delete to authenticated
  using (private.tenant_storage(bucket_id, name, true));

-- Presence contains no public broadcast of student UUIDs or cohort IDs.
create table public.account_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  cohort_id uuid references public.cohorts(id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.account_presence enable row level security;
revoke all on public.account_presence from anon, authenticated;
create function public.heartbeat() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_role_of() <> 'student' or public.my_cohort_id() is null then return; end if;
  insert into public.account_presence(user_id, cohort_id, seen_at) values (auth.uid(), public.my_cohort_id(), now())
    on conflict(user_id) do update set cohort_id = excluded.cohort_id, seen_at = now();
end $$;
create function public.online_student_count(p_cohort_id uuid default null) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.account_presence a join public.profiles p on p.id = a.user_id
    join public.cohort_members m on m.user_id = a.user_id and m.cohort_id = a.cohort_id
  where public.is_active_user() and p.status = 'active' and p.role = 'student'
    and a.seen_at > now() - interval '90 seconds'
    and (p_cohort_id is null or a.cohort_id = p_cohort_id)
    and (public.tenant_global() or public.tenant_cohort(a.cohort_id)
      or (not public.is_admin() and a.cohort_id = public.my_cohort_id()))
$$;
revoke all on function public.heartbeat() from public, anon;
revoke all on function public.online_student_count(uuid) from public, anon;
grant execute on function public.heartbeat() to authenticated;
grant execute on function public.online_student_count(uuid) to authenticated;

-- Each administrator has an independent guest QR token. The legacy token and
-- legacy guest rows stay in the super-admin estate without rewriting either.
create table private.tenant_guest_tokens (
  owner_admin_id uuid primary key references public.profiles(id) on delete restrict,
  token text not null unique
);
revoke all on private.tenant_guest_tokens from public, anon, authenticated;
create function private.guest_owner(p_token text) returns uuid
language sql stable security definer set search_path = '' as $$
  select owner_admin_id from private.tenant_guest_tokens where token = p_token
$$;
create or replace function public.board_guest_token_ok(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_token, '') <> '' and (
    exists (select 1 from public.system_settings where key = 'board_guest_token' and value = to_jsonb(p_token))
    or exists (select 1 from private.tenant_guest_tokens t join public.profiles p on p.id = t.owner_admin_id
      where t.token = p_token and p.status = 'active' and p.role in ('admin','super_admin')))
$$;
create function public.get_board_guest_token() returns text
language sql stable security definer set search_path = '' as $$
  select case when public.tenant_global() then (select value #>> '{}' from public.system_settings where key = 'board_guest_token')
    when public.is_admin() then (select token from private.tenant_guest_tokens where owner_admin_id = public.tenant_owner()) end
$$;
create or replace function public.rotate_board_guest_token() returns text
language plpgsql security definer set search_path = '' as $$
declare v text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_admin() or public.admin_view_owner() is not null then raise exception 'forbidden'; end if;
  if public.tenant_global() then
    insert into public.system_settings(key,value) values ('board_guest_token', to_jsonb(v))
    on conflict(key) do update set value = excluded.value, updated_at = now();
  else
    insert into private.tenant_guest_tokens(owner_admin_id,token) values (auth.uid(),v)
    on conflict(owner_admin_id) do update set token = excluded.token;
  end if;
  return v;
end $$;
revoke all on function private.guest_owner(text) from public, anon, authenticated;
revoke all on function public.get_board_guest_token() from public, anon;
grant execute on function public.get_board_guest_token() to authenticated;

create or replace function public.guest_board_list(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.board_guest_token_ok(p_token) then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  return jsonb_build_object('ok', true, 'posts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'author_name', p.author_name,
      'author_org', p.author_org, 'is_guest', p.is_guest, 'created_at', p.created_at,
      'comment_count', (select count(*)::int from public.board_comments c where c.post_id = p.id)
    ) order by p.created_at desc)
    from public.board_posts p where p.owner_admin_id is not distinct from private.guest_owner(p_token)), '[]'::jsonb));
end $$;

create or replace function public.guest_board_get(p_token text, p_post_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_post jsonb;
begin
  if not public.board_guest_token_ok(p_token) then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  select jsonb_build_object(
    'id', p.id, 'title', p.title, 'body', p.body, 'author_name', p.author_name,
    'author_org', p.author_org, 'is_guest', p.is_guest, 'created_at', p.created_at)
  into v_post from public.board_posts p where p.id = p_post_id and p.owner_admin_id is not distinct from private.guest_owner(p_token);
  if v_post is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'post', v_post, 'comments', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'author_name', c.author_name, 'author_org', c.author_org,
      'body', c.body, 'created_at', c.created_at
    ) order by c.created_at)
    from public.board_comments c where c.post_id = p_post_id), '[]'::jsonb));
end $$;

create or replace function public.guest_board_create_post(
  p_token text, p_org text, p_author text, p_title text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org text := trim(coalesce(p_org, ''));
  v_author text := trim(coalesce(p_author, ''));
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if not public.board_guest_token_ok(p_token) then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if v_org = '' or v_author = '' or v_title = '' or v_body = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_fields');
  end if;
  if length(v_org) > 40 or length(v_author) > 40 or length(v_title) > 120 or length(v_body) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  insert into public.board_posts (user_id, author_name, author_org, title, body, is_guest, owner_admin_id)
  values (null, v_author, v_org, v_title, v_body, true, private.guest_owner(p_token))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.guest_record_visit(p_token text, p_guest_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_gid text := trim(coalesce(p_guest_id, ''));
begin
  if not public.board_guest_token_ok(p_token) then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if v_gid = '' or length(v_gid) > 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid_guest_id');
  end if;
  insert into public.visit_logs (user_id, guest_id, visited_date, owner_admin_id)
  values (null, coalesce(private.guest_owner(p_token)::text, 'legacy') || ':' || v_gid, (now() at time zone 'Asia/Seoul')::date, private.guest_owner(p_token))
  on conflict (guest_id, visited_date) where guest_id is not null do nothing;
  return jsonb_build_object('ok', true);
end $$;


-- The site-wide signup default is a super-admin setting. Explicit invitations
-- take precedence, so one administrator cannot capture another's new members.
create or replace function public.set_forced_signup_cohort(p_cohort_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.tenant_global() then raise exception 'super admin required'; end if;
  update public.cohorts set signup_forced = false where signup_forced;
  if p_enabled then
    update public.cohorts set signup_forced = true where id = p_cohort_id and deleted_at is null;
    if not found then raise exception 'cohort not found'; end if;
  end if;
end $$;
create or replace function public.join_cohort_by_code(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v text := nullif(trim(p_code), '');
begin
  if public.current_role_of() <> 'student' then raise exception 'student required'; end if;
  if v is null then select code into v from public.cohorts where signup_forced and deleted_at is null limit 1; end if;
  return public.join_cohort_by_code_active_impl(v);
end $$;

create function private.guard_tenant_references() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(new); old_r jsonb; file_bucket text; cohort uuid;
begin
  if auth.uid() is null then return new; end if;
  if public.admin_view_owner() is not null then raise exception 'read only admin view'; end if;
  if tg_op = 'UPDATE' then old_r := to_jsonb(old); end if;
  if tg_table_name = 'cohorts' and not public.tenant_global() then
    if (tg_op = 'INSERT' and new.signup_forced) or
      (tg_op = 'UPDATE' and new.signup_forced is distinct from old.signup_forced) then
      raise exception 'super admin signup setting'; end if;
  end if;
  -- Attribution fields and membership identity cannot be reassigned.
  if tg_op = 'UPDATE' and r ? 'user_id' and r->>'user_id' is distinct from old_r->>'user_id' then
    raise exception 'author identity is immutable';
  end if;
  if tg_table_name in ('notices','push_deliveries') and r->>'cohort_id' is not null then
    if not public.tenant_cohort((r->>'cohort_id')::uuid) then raise exception 'forbidden cohort'; end if;
  end if;
  if tg_table_name = 'push_deliveries' and r->>'message_id' is not null then
    if not exists (select 1 from public.push_messages m where m.id = (r->>'message_id')::uuid
      and private.tenant_row('push_messages',to_jsonb(m),false)) then raise exception 'forbidden message'; end if;
  end if;
  if tg_table_name = 'help_requests' and not public.is_admin() then
    if new.cohort_id is distinct from public.my_cohort_id() then raise exception 'forbidden help cohort'; end if;
  end if;
  if tg_table_name = 'inquiries' and r->>'cohort_course_id' is not null then
    select cohort_id into cohort from public.cohort_courses where id = (r->>'cohort_course_id')::uuid;
    if not coalesce(case when public.is_admin() then public.tenant_cohort(cohort) else cohort = public.my_cohort_id() end, false) then
      raise exception 'forbidden inquiry course'; end if;
  end if;
  -- A forged attachment row must not turn an inaccessible object into an owned file.
  if tg_table_name in ('master_attachments','cohort_attachments','notice_attachments','hackathon_attachments') then
    file_bucket := case when tg_table_name = 'notice_attachments' then 'notice-files'
      when tg_table_name = 'hackathon_attachments' then 'hackathon-files' else 'course-files' end;
    if (tg_op = 'INSERT' or r->>'file_path' is distinct from old_r->>'file_path')
      and not coalesce(private.tenant_storage(file_bucket, r->>'file_path', false), false)
      and not coalesce(private.tenant_storage(file_bucket, r->>'file_path', true), false) then
      raise exception 'forbidden attachment source'; end if;
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['cohorts','cohort_members','board_posts','board_comments','inquiries','inquiry_replies',
    'notices','push_deliveries','help_requests','hackathon_entries','hackathon_attachments',
    'master_attachments','cohort_attachments','notice_attachments'] loop
    execute format('create trigger zz_guard_tenant_references before insert or update on public.%I for each row execute function private.guard_tenant_references()', t);
  end loop;
end $$;
revoke all on function private.guard_tenant_references() from public, anon, authenticated;

-- Super-admin preview may read this user's personal dashboard bookmarks, without
-- permitting any write or widening ordinary administrator access.
create policy "super preview bookmarks" on public.user_bookmarks for select to authenticated
  using (public.admin_view_owner() = user_id);

-- Guard own profile/status escalation even through inactive sessions.
-- Prevent physical removal of administrators who still own operational data.
create function private.preserve_admin_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role in ('admin','super_admin') and (
    exists(select 1 from public.cohorts where owner_admin_id = old.id)
    or exists(select 1 from public.master_courses where owner_admin_id = old.id)
  ) then raise exception 'deactivate administrator instead of deleting owned data'; end if;
  return old;
end $$;
create trigger preserve_admin_profile before delete on public.profiles for each row execute function private.preserve_admin_profile();
revoke all on function private.preserve_admin_profile() from public, anon, authenticated;

create policy "tenant admin moderate hackathon comments" on public.hackathon_comments for delete to authenticated
  using (public.is_admin());


notify pgrst, 'reload schema';
commit;
