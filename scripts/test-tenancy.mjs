import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { restoreSql } from './restore-backup.mjs'

// Real PostgreSQL engine in memory: no production credentials, network or data.
const db = new PGlite()
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
  create function auth.role() returns text language sql stable as
    $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text, metadata jsonb);
  alter table storage.objects enable row level security;
  create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
  create publication supabase_realtime;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant all on all tables in schema storage to authenticated;
  alter default privileges in schema public grant all on tables to authenticated, service_role;
  alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
  alter default privileges in schema public grant execute on functions to authenticated, service_role;
`)
const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && !['20260929010000_shared_catalogs.sql','20260929020000_course_group_default_and_deletion.sql'].includes(f)).sort()
let baseline
async function fingerprint() {
  // New feature tables do not exist in the legacy baseline; original rows must still match exactly.
  const tables = (await db.query("select tablename from pg_tables where schemaname='public' and tablename not in ('account_presence','screen_share_sessions','screen_share_usage','screen_share_admissions','submission_versions','operation_events','client_errors','screen_share_receivers','signup_attempts','backup_runs','backup_snapshots','backup_snapshot_rows','file_batches','file_batch_files','file_recipients','file_download_requests') order by tablename")).rows
  const data = {}
  for (const { tablename } of tables) data[tablename] = (await db.query(`select to_jsonb(t) - 'owner_admin_id' as value from public.${tablename} t order by to_jsonb(t)::text`)).rows
  return data
}
for (const file of files) {
  if (file.startsWith('20260928010000')) {
    await db.exec(`
      insert into auth.users(id,email) values ('ffffffff-0000-0000-0000-000000000001','preserve@test.local');
      insert into public.cohorts(id,name,code) values ('ffffffff-0000-0000-0000-000000000002','기존 기수','KEEP');
      insert into public.cohort_members(cohort_id,user_id) values ('ffffffff-0000-0000-0000-000000000002','ffffffff-0000-0000-0000-000000000001');
      insert into public.master_courses(id,group_id,title,body) select 'ffffffff-0000-0000-0000-000000000003',id,'기존 강좌','기존 본문 그대로' from public.master_course_groups where is_default;
      insert into public.board_posts(user_id,author_name,title,body) values ('ffffffff-0000-0000-0000-000000000001','기존 회원','기존 게시글','기존 본문');
      insert into public.visit_logs(user_id) values ('ffffffff-0000-0000-0000-000000000001');
    `)
    baseline = await fingerprint()
    const migration = fs.readFileSync(`supabase/migrations/${file}`, 'utf8')
    let aborted = false
    try {
      await db.exec(migration.replace(/commit;\s*$/i, "do $$ begin raise exception 'simulated deployment failure'; end $$; commit;"))
    } catch { aborted = true; await db.exec('rollback') }
    assert.ok(aborted, 'simulated migration failure must abort')
    assert.equal((await db.query("select column_name from information_schema.columns where table_schema='public' and column_name='owner_admin_id'")).rows.length,0)
    assert.deepEqual(await fingerprint(),baseline,'failed migration must roll back data and schema')
    console.log('PASS: failed deployment rolls back every schema and authorization change atomically')
  }
  try { await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8')) }
  catch (e) { console.error(`Migration failed: ${file}\n${e.message}`); process.exit(1) }
}
console.log(`PASS: ${files.length} migrations applied to empty PostgreSQL database`)
assert.deepEqual(await fingerprint(), baseline, 'migration preserves every existing row and original column value')
await db.exec(`
  delete from public.cohort_members where user_id='ffffffff-0000-0000-0000-000000000001';
  delete from public.cohorts where id='ffffffff-0000-0000-0000-000000000002';
  delete from public.master_courses where id='ffffffff-0000-0000-0000-000000000003';
  delete from auth.users where id='ffffffff-0000-0000-0000-000000000001';
`)
console.log('PASS: all legacy data preserved byte-for-byte across tenant migrations')

const ids = {
  super: '00000000-0000-0000-0000-000000000001',
  a: '00000000-0000-0000-0000-000000000002', b: '00000000-0000-0000-0000-000000000003',
  sa: '00000000-0000-0000-0000-000000000004', sb: '00000000-0000-0000-0000-000000000005',
  legacy: '10000000-0000-0000-0000-000000000001',
  ca: '10000000-0000-0000-0000-000000000002', cb: '10000000-0000-0000-0000-000000000003',
  master: '20000000-0000-0000-0000-000000000001',
}
async function as(who, view) {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claims', $1, false), set_config('request.headers', $2, false)`,
    [JSON.stringify({ sub: ids[who], role: 'authenticated' }), JSON.stringify(view ? { 'x-admin-view': ids[view] } : {})])
  await db.exec('set role authenticated')
}
async function system() {
  await db.exec("reset role; select set_config('request.jwt.claims','{}',false); select set_config('request.headers','{}',false)")
}
async function scalar(sql, params = []) { return Object.values((await db.query(sql, params)).rows[0])[0] }
async function denied(sql, params = []) {
  let error
  try { await db.query(sql, params) } catch (e) { error = e }
  assert.ok(error, `Expected rejection: ${sql}`)
}
await db.query(`insert into auth.users(id,email) values ($1,'xshoner@gmail.com'),($2,'a@test.local'),($3,'b@test.local'),($4,'sa@test.local'),($5,'sb@test.local')`, [ids.super, ids.a, ids.b, ids.sa, ids.sb])
await db.query("update public.profiles set role='super_admin' where id=$1",[ids.super])
await db.query(`update public.profiles set role = 'admin' where id in ($1,$2)`, [ids.a, ids.b])
await db.query(`insert into public.cohorts(id,name,code) values ($1,'Legacy','LEGACY')`, [ids.legacy])
await db.query(`insert into public.master_courses(id,group_id,title,body,assignment_enabled) select $1,id,'Shared master','Original body',true from public.master_course_groups where is_default`, [ids.master])
await db.query(`insert into public.master_attachments(master_course_id,file_path,filename) values ($1,'master/original.pdf','original.pdf')`, [ids.master])
await db.query(`insert into storage.objects(bucket_id,name) values ('course-files','master/original.pdf')`)
await as('super')
await db.query("select public.save_survey(null,$1::jsonb,$2::jsonb)", [JSON.stringify({master_course_id:ids.master,title:'Template survey'}),JSON.stringify([{type:'short',text:'Question',required:true}])])
await db.query("select public.save_quiz(null,$1::jsonb,$2::jsonb)", [JSON.stringify({master_course_id:ids.master,title:'Template quiz'}),JSON.stringify([{type:'short',text:'Question',answer:['yes'],points:2}])])
await db.query('select public.set_forced_signup_cohort($1,true)',[ids.legacy])
await as('a')
await db.query(`insert into public.cohorts(id,name,code,owner_admin_id) values ($1,'A','ADMINA',$2)`, [ids.ca, ids.b])
assert.equal(await scalar('select owner_admin_id from public.cohorts'), ids.a, 'owner spoof overwritten')
await as('b')
await db.query(`insert into public.cohorts(id,name,code) values ($1,'B','ADMINB')`, [ids.cb])
await as('sa')
assert.equal((await scalar("select public.join_cohort_by_code('ADMINA')")).ok, true)
await as('sb')
assert.equal((await scalar("select public.join_cohort_by_code('ADMINB')")).ok, true)
await as('a')
assert.equal(await scalar('select count(*)::int from public.cohorts'), 1)
assert.equal(await scalar("select count(*)::int from public.profiles where role = 'student'"), 1)
assert.equal(await scalar('select count(*)::int from public.master_courses'), 1)
assert.equal((await db.query(`update public.master_courses set body='ATTACK' where id=$1 returning id`, [ids.master])).rows.length, 0)
assert.equal((await db.query(`delete from public.master_courses where id=$1 returning id`, [ids.master])).rows.length, 0)
await denied(`select public.save_survey(null, $1::jsonb, '[]')`, [JSON.stringify({ master_course_id: ids.master, title: 'ATTACK' })])
const copied = await scalar('select public.copy_master_to_my_courses($1)', [ids.master])
await db.query(`update public.master_courses set body='A copy' where id=$1`, [copied])
assert.equal(await scalar('select body from public.master_courses where id=$1', [ids.master]), 'Original body')
assert.equal(await scalar('select count(*)::int from public.master_attachments where master_course_id=$1', [copied]), 1)
assert.equal(await scalar('select count(*)::int from public.survey_questions q join public.surveys s on s.id=q.survey_id where s.master_course_id=$1',[copied]),1)
assert.equal(await scalar('select count(*)::int from public.quiz_questions q join public.quizzes s on s.id=q.quiz_id where s.master_course_id=$1',[copied]),1)
await denied('select public.set_forced_signup_cohort($1,true)',[ids.ca])
await denied('update public.cohorts set signup_forced=true where id=$1',[ids.ca])
await denied('select public.snapshot_courses_to_cohort($1,$2::uuid[],true)', [ids.cb,[copied]])
assert.equal(await scalar('select public.snapshot_courses_to_cohort($1,$2::uuid[],true)', [ids.ca,[copied]]), 1)
const aCourse = await scalar('select id from public.cohort_courses limit 1')
const aQuiz = await scalar('select id from public.quizzes where cohort_course_id=$1',[aCourse])
const aSurvey = await scalar('select id from public.surveys where cohort_course_id=$1',[aCourse])
await db.query("update public.quizzes set status='open' where id=$1",[aQuiz])
await db.query("update public.surveys set status='open' where id=$1",[aSurvey])
await db.query('select public.save_survey($1,$2::jsonb,$3::jsonb)', [aSurvey, JSON.stringify({cohort_course_id:aCourse,title:'A survey',allow_edit:true}),JSON.stringify([{type:'short',text:'A question'}])])
await db.query("insert into public.notices(title) values ('A notice')")
await db.query("insert into public.admin_memos(author_id,body) values ($1,'A memo')",[ids.a])
const aMessage=await scalar("insert into public.push_messages(sender_id,body) values ($1,'A message') returning id",[ids.a])
await db.query("insert into public.push_deliveries(message_id,body) values ($1,'A delivery')",[aMessage])
const aToken=await scalar('select public.rotate_board_guest_token()')
const aPost=(await scalar("select public.guest_board_create_post($1,'Org','Guest','A guest','Body')",[aToken])).id
await db.query("select public.guest_record_visit($1,'browser-test')",[aToken])
await denied('select public.assign_member($1,$2)', [ids.sb,ids.ca])
await denied('select public.assign_member($1,$2)', [ids.sa,ids.cb])
assert.equal(await scalar('select count(*)::int from storage.objects'), 1)
assert.equal((await db.query("delete from storage.objects where name='master/original.pdf' returning id")).rows.length, 0)
console.log('PASS: tenant ownership, member isolation, protected master, independent deep copy, files and RPC boundaries')

await as('b')
assert.equal(await scalar('select count(*)::int from public.master_courses where id=$1', [copied]), 0)
assert.equal(await scalar('select count(*)::int from public.cohort_courses'), 0)
for (const table of ['notices','admin_memos','push_messages','push_deliveries','board_posts','surveys','quiz_submissions','course_views','help_requests']) {
  // Shared master template surveys are intentionally visible, tenant responses are not.
  if (table !== 'surveys') assert.equal(await scalar(`select count(*)::int from public.${table}`),0,`${table} isolated`)
}
await denied('select public.grade_quiz($1)',[aQuiz])
await denied('select public.save_survey($1,$2::jsonb,\'[]\')',[aSurvey,JSON.stringify({cohort_course_id:aCourse,title:'ATTACK'})])
await denied('select public.close_hackathon($1)',[ids.ca])
const bToken=await scalar('select public.rotate_board_guest_token()')
assert.equal((await scalar('select public.guest_board_list($1)',[bToken])).posts.length,0)
assert.equal((await scalar('select public.guest_board_get($1,$2)',[bToken,aPost])).ok,false)
assert.equal((await scalar('select public.guest_board_list($1)',[aToken])).posts.length,1,'guest token is a scoped bearer capability')
const bGroup=await scalar('select public.ensure_my_course_group()')
const bMaster=await scalar("insert into public.master_courses(group_id,title) values ($1,'B private') returning id",[bGroup])
await db.query("insert into storage.objects(bucket_id,name) values ('course-files',$1)",[`master/${bMaster}/secret.pdf`])
await db.query("insert into public.master_attachments(master_course_id,file_path,filename) values ($1,$2,'secret.pdf')",[bMaster,`master/${bMaster}/secret.pdf`])
await as('a')
assert.equal(await scalar("select count(*)::int from storage.objects where name like '%secret.pdf'"),0)
await denied("insert into public.master_attachments(master_course_id,file_path,filename) values ($1,$2,'stolen.pdf')",[copied,`master/${bMaster}/secret.pdf`])
await denied('update public.cohort_members set user_id=$1 where user_id=$2',[ids.sb,ids.sa])
console.log('PASS: all management areas, survey/quiz RPCs, independent guest tokens, invitation precedence and forged attachment denial')
await as('a','b')
assert.equal(await scalar('select id from public.cohorts'), ids.ca, 'admin cannot spoof preview header')
await as('super','a')
assert.equal(await scalar('select id from public.cohorts'), ids.ca)
assert.equal(await scalar("select count(*)::int from public.profiles where role='student'"), 1)
await denied("insert into public.cohorts(name,code) values ('ATTACK','ATTACK')")
await denied('select public.copy_master_to_my_courses($1)', [ids.master])
await denied('select public.assign_member($1,$2)', [ids.sa,ids.cb])
await as('super')
assert.equal(await scalar('select count(*)::int from public.cohorts'), 3)
assert.equal(await scalar('select body from public.master_courses where id=$1', [ids.master]), 'Original body')
console.log('PASS: super-admin global access, scoped read-only inspection and forged-header rejection')

await as('sa')
assert.equal(await scalar('select count(*)::int from public.cohort_courses'), 1)
assert.equal(await scalar('select count(*)::int from public.push_deliveries'),1)
assert.equal(await scalar('select count(*)::int from public.notices'),1)
const question = await scalar('select id from public.quiz_questions_student where quiz_id=$1',[aQuiz])
await denied('insert into public.quiz_submissions(quiz_id,user_id,total_score,graded) values ($1,$2,9999,true)',[aQuiz,ids.sa])
await denied('insert into public.quiz_answers(submission_id,question_id,value,is_correct,earned_score) values ($1,$2,$3::jsonb,true,9999)',[crypto.randomUUID(),question,JSON.stringify('forged')])
assert.equal(await scalar('select answer from public.quiz_questions_student where quiz_id=$1',[aQuiz]),null,'answer stays hidden before close')
assert.equal((await scalar('select public.submit_quiz($1,$2::jsonb)',[aQuiz,JSON.stringify([{question_id:question,value:'yes'}])])).ok,true)
const surveyQuestion = await scalar('select id from public.survey_questions where survey_id=$1',[aSurvey])
assert.equal((await scalar('select public.submit_survey($1,$2::jsonb)',[aSurvey,JSON.stringify([{question_id:surveyQuestion,value:'good'}])])).ok,true)
await db.query('select public.record_course_view($1)',[aCourse])
await db.query("insert into public.submissions(user_id,cohort_course_id,type,url) values ($1,$2,'url','https://example.com/assignment')",[ids.sa,aCourse])
const inquiry = await scalar("insert into public.inquiries(user_id,title) values ($1,'A question') returning id",[ids.sa])
await db.query("insert into public.inquiry_replies(inquiry_id,user_id,body) values ($1,$2,'Followup')",[inquiry,ids.sa])
const entry = await scalar("insert into public.hackathon_entries(user_id,cohort_id,title) values ($1,$2,'A project') returning id",[ids.sa,ids.ca])
await db.query("insert into public.help_requests(user_id,cohort_id) values ($1,$2)",[ids.sa,ids.ca])
await denied("insert into public.help_requests(user_id,cohort_id) values ($1,$2)",[ids.sa,ids.cb])
const post = await scalar("insert into public.board_posts(user_id,title) values ($1,'A student post') returning id",[ids.sa])
await db.query("insert into public.board_comments(post_id,user_id,body) values ($1,$2,'Comment')",[post,ids.sa])
await db.query('select public.heartbeat()')
await db.query('select public.record_visit()')
await as('sb')
assert.equal(await scalar('select count(*)::int from public.push_deliveries'),0)
assert.equal(await scalar('select count(*)::int from public.notices'),0)
await db.query('select public.heartbeat()')
await db.query('select public.record_visit()')
await as('a')
assert.equal((await scalar('select public.rate_hackathon($1,5)',[entry])).ok,true)
assert.equal((await scalar('select public.close_hackathon($1)',[ids.ca])).ok,true)
assert.equal(await scalar('select public.online_student_count()'), 1)
assert.equal(await scalar('select public.online_student_count($1)', [ids.cb]), 0)
assert.equal((await scalar('select public.visit_stats()')).total, 2)
assert.equal((await db.query('select * from public.today_account_visits()')).rows.length, 1)
assert.equal((await scalar('select public.grade_quiz($1)',[aQuiz])).ok,true)
assert.equal(await scalar('select total_score::int from public.quiz_submissions where quiz_id=$1',[aQuiz]),2)
await as('b')
for (const table of ['submissions','submission_logs','course_views','survey_responses','survey_answers','quiz_submissions','quiz_answers',
  'inquiries','inquiry_replies','board_posts','board_comments','hackathon_entries','hackathon_ratings','hall_of_fame','help_requests']) {
  assert.equal(await scalar(`select count(*)::int from public.${table}`),0, `${table} student activity isolated`)
}
assert.equal((await scalar('select public.rate_hackathon($1,1)',[entry])).ok,false)
assert.equal(await scalar('select count(*)::int from public.hackathon_rating_stats'),0)
console.log('PASS: student learning flows, grading, hackathon close and all derived records isolated')
await as('super')
const superPersonalGroup = await scalar('select public.ensure_my_course_group()')
await db.query("insert into public.master_courses(group_id,title) values ($1,'Existing super personal course')",[superPersonalGroup])
for (const [who,view] of [['super'],['a'],['b'],['super','a']]) {
  await as(who,view)
  const libraryGroups=(await db.query('select id from public.master_library_group_list()')).rows.map((r)=>r.id)
  assert.ok(libraryGroups.includes(superPersonalGroup),'super personal library must remain available as masters')
  assert.ok(!libraryGroups.includes(bGroup),'admin private library must not enter master library')
  const overview=await scalar('select public.admin_dashboard_overview()')
  assert.equal(overview.totalStudents,await scalar('select count(*)::int from public.cohort_members'))
  assert.equal(overview.totalCourses,await scalar('select count(*)::int from public.cohort_courses'))
  assert.equal(overview.totalSubmissions,await scalar('select count(*)::int from public.submissions'))
  assert.equal(overview.unanswered,await scalar("select count(*)::int from public.inquiries where status='open'"))
  assert.deepEqual(overview.visits,await scalar('select public.visit_stats()'))
  assert.deepEqual(overview.boardPosts.map((p)=>p.id),(await db.query('select id from public.board_posts order by created_at desc limit 5')).rows.map((p)=>p.id))
  await denied('select public.student_dashboard()')
}
for (const who of ['sa','sb']) {
  await as(who)
  const dashboard=await scalar('select public.student_dashboard()')
  assert.deepEqual(dashboard.courses.map((c)=>c.id).sort(),(await db.query('select id from public.cohort_courses')).rows.map((c)=>c.id).sort())
  assert.deepEqual(dashboard.views.sort(),(await db.query('select cohort_course_id from public.course_views where user_id=auth.uid()')).rows.map((r)=>r.cohort_course_id).sort())
  assert.deepEqual(dashboard.submissions.sort(),(await db.query('select cohort_course_id from public.submissions where user_id=auth.uid()')).rows.map((r)=>r.cohort_course_id).sort())
  await denied('select public.admin_dashboard_overview()')
}
console.log('PASS: dashboard snapshots retain role/tenant isolation and super-owned libraries remain shared masters')
await as('a')
const aCourseGroup = await scalar('select group_id from public.cohort_courses where id=$1',[aCourse])
await db.query('update public.cohort_course_groups set is_published=false where id=$1',[aCourseGroup])
await as('sa')
assert.equal(await scalar('select count(*)::int from public.cohort_courses where id=$1',[aCourse]),0)
assert.equal(await scalar('select count(*)::int from public.cohort_attachments where cohort_course_id=$1',[aCourse]),0)
assert.equal(await scalar('select count(*)::int from public.student_course_list($1)',[aCourseGroup]),0)
assert.equal(await scalar('select count(*)::int from public.quiz_questions_student where quiz_id=$1',[aQuiz]),0)
const hiddenDashboard=await scalar('select public.student_dashboard()')
assert.equal(hiddenDashboard.courses.length,0)
assert.equal(hiddenDashboard.surveys.length,0)
assert.equal(hiddenDashboard.quizzes.length,0)
console.log('PASS: optimized tenant sets retain student publication and attachment/quiz restrictions')

// Compare optimized predicates with the original full-row implementation across
// every fixture and role, including rows RLS would normally hide from the caller.
await system()
const originalTenantSql = fs.readFileSync('supabase/migrations/20260928010000_admin_tenant_isolation.sql', 'utf8')
const referenceTenantFunction = originalTenantSql.slice(originalTenantSql.indexOf('create function private.tenant_row('), originalTenantSql.indexOf('-- A restrictive boundary'))
  .replaceAll('private.tenant_row(', 'private.tenant_row_reference(')
await db.exec(referenceTenantFunction)
await db.exec(`create function private.assert_tenant_policy_equivalence() returns void
language plpgsql security definer set search_path='' as $$
declare p record; mismatch bigint; writing boolean; expression text;
begin
  for p in select * from pg_policies where schemaname='public' and policyname in ('tenant_read','tenant_insert','tenant_update','tenant_delete') loop
    writing := p.policyname <> 'tenant_read';
    expression := coalesce(p.qual,p.with_check);
    execute format('select count(*) from public.%I where coalesce(private.tenant_row_reference(%L,to_jsonb(%I),%L),false) is distinct from coalesce((%s),false)',
      p.tablename,p.tablename,p.tablename,writing,expression) into mismatch;
    if mismatch <> 0 then raise exception 'Authorization changed for %.% (% rows)',p.tablename,p.policyname,mismatch; end if;
  end loop;
end $$;`)
for (const [who, view] of [['super'],['a'],['b'],['sa'],['sb'],['super','a'],['a','b']]) {
  await as(who,view)
  await db.query('select private.assert_tenant_policy_equivalence()')
}
console.log('PASS: optimized read/write policies match original authorization for all fixtures and roles')
await system()
await db.query(`update public.profiles set status='inactive' where id=$1`, [ids.a])
await as('a')
await db.query('select private.assert_tenant_policy_equivalence()')
assert.equal(await scalar('select count(*)::int from public.cohorts'), 0)
await denied('select public.copy_master_to_my_courses($1)', [ids.master])
await denied('select public.admin_dashboard_overview()')
assert.equal((await scalar('select public.visit_stats()')).total,0)
console.log('PASS: scoped online/visit counts and inactive-account denial')

// Apply the catalog migration to populated data, after verifying legacy isolation.
await system()
await db.query("update public.profiles set status='active' where id=$1",[ids.a])
const existingAIGroup = await scalar("insert into public.master_course_groups(name) values ('AI 활용 기본 강좌') returning id")
const beforeCourses = (await db.query('select id,title,body,owner_admin_id from public.master_courses order by id')).rows
await db.exec(fs.readFileSync('supabase/migrations/20260929010000_shared_catalogs.sql','utf8'))
assert.deepEqual((await db.query('select id,title,body,owner_admin_id from public.master_courses order by id')).rows,beforeCourses)
assert.equal(await scalar("select count(*)::int from public.master_course_groups where public.tenant_shared_owner(owner_admin_id) and name in ('마스터 강좌','내 강좌','기본 강좌')"),0)
const defaultGroup=await scalar("select id from public.master_course_groups where name='AI 활용 기본 강좌' and is_default")
assert.equal(defaultGroup,existingAIGroup)
await as('super')
assert.equal(await scalar('select public.ensure_my_course_group()'),defaultGroup)
const game=await scalar("insert into public.arcade_games(name,url,description) values ('Shared game','https://example.com/game','Public catalog') returning id")
await as('a')
const ownGame=await scalar("insert into public.arcade_games(name,url,description) values ('Admin game','https://example.com/admin','Public catalog') returning id")
for(const who of ['a','b','sa','sb']) {
  await as(who)
  assert.equal(await scalar('select count(*)::int from public.arcade_games where id in ($1,$2)',[game,ownGame]),2)
  assert.ok(await scalar('select count(*)::int from public.hall_of_fame') > 0)
  assert.equal((await db.query("update public.arcade_games set name='Forbidden' where id=$1 returning id",[game])).rows.length,0)
  assert.equal((await db.query('delete from public.arcade_games where id=$1 returning id',[game])).rows.length,0)
  assert.equal((await db.query("update public.hall_of_fame set title='Forbidden' returning id")).rows.length,0)
  assert.equal((await db.query('delete from public.hall_of_fame returning id')).rows.length,0)
}
await as('a')
await denied('select public.reopen_hackathon($1)',[ids.ca])
assert.equal((await db.query("update public.arcade_games set name='My edited game' where id=$1 returning id",[ownGame])).rows.length,1)
await as('super')
assert.equal((await db.query('delete from public.arcade_games where id=$1 returning id',[game])).rows.length,1)
assert.equal((await scalar('select public.reopen_hackathon($1)',[ids.ca])).ok,true)
console.log('PASS: shared catalogs visible across tenants, protected writes denied, courses preserved and AI default selected')

await system()
const correctGroup = await scalar("insert into public.master_course_groups(name) values ('ai 활용 기본 과정') returning id")
const savedCourses=(await db.query('select id,title,body,owner_admin_id from public.master_courses order by id')).rows
await db.exec(fs.readFileSync('supabase/migrations/20260929020000_course_group_default_and_deletion.sql','utf8'))
assert.deepEqual((await db.query('select id,title,body,owner_admin_id from public.master_courses order by id')).rows,savedCourses)
assert.equal(await scalar('select count(*)::int from public.master_courses where group_id=$1',[defaultGroup]),0)
assert.equal(await scalar('select count(*)::int from public.master_course_groups where id=$1',[defaultGroup]),0)
assert.equal(await scalar('select is_default from public.master_course_groups where id=$1',[correctGroup]),true)
await as('super')
assert.equal(await scalar('select public.ensure_my_course_group()'),correctGroup)
await denied('delete from public.master_course_groups where id=$1',[correctGroup])
const emptyMaster=await scalar("insert into public.master_course_groups(name) values ('Delete empty master') returning id")
assert.equal((await db.query('delete from public.master_course_groups where id=$1 returning id',[emptyMaster])).rows.length,1)
await as('a')
assert.equal((await db.query('delete from public.master_course_groups where id=$1 returning id',[correctGroup])).rows.length,0)
const ownDefault=await scalar('select public.ensure_my_course_group()')
await denied('delete from public.master_course_groups where id=$1',[ownDefault])
const removable=await scalar("insert into public.master_course_groups(name) values ('Remove me') returning id")
const retained=await scalar("insert into public.master_courses(group_id,title) values ($1,'Retain lesson') returning id",[removable])
await denied('delete from public.master_course_groups where id=$1',[removable])
await as('b')
assert.equal((await db.query('delete from public.master_course_groups where id=$1 returning id',[removable])).rows.length,0)
await as('a')
await db.query('update public.master_courses set group_id=$1 where id=$2',[ownDefault,retained])
assert.equal((await db.query('delete from public.master_course_groups where id=$1 returning id',[removable])).rows.length,1)
const cohortDefault=await scalar('select id from public.cohort_course_groups where cohort_id=$1 and is_default',[ids.ca])
await denied('delete from public.cohort_course_groups where id=$1',[cohortDefault])
const emptyCohort=await scalar("insert into public.cohort_course_groups(cohort_id,name) values ($1,'Empty cohort group') returning id",[ids.ca])
await as('b')
assert.equal((await db.query('delete from public.cohort_course_groups where id=$1 returning id',[emptyCohort])).rows.length,0)
await as('a')
assert.equal((await db.query('delete from public.cohort_course_groups where id=$1 returning id',[emptyCohort])).rows.length,1)
console.log('PASS: existing AI 기본 과정 reused, incorrect group removed without lesson loss, group deletion respects defaults, contents and ownership')
await system()
const share = await scalar('select to_jsonb(public.screen_share_claim($1,$2,$3))',[ids.super,ids.ca,ids.master])
await db.query("update public.screen_share_sessions set state='live' where id=$1",[share.id])
await denied('select public.screen_share_claim($1,$2,$3)',[ids.super,ids.cb,ids.master])
await as('sa')
assert.equal(await scalar('select count(*)::int from public.screen_share_sessions'),1)
const liveShare = await scalar('select public.screen_share_current($1)',[ids.ca])
assert.equal(liveShare.id,share.id)
assert.ok(liveShare.lease_remaining_ms>0 && liveShare.lease_remaining_ms<=45000)
assert.equal(await scalar('select public.screen_share_current($1)',[ids.cb]),null)
await db.query('select public.screen_share_report($1,$2,$3)',[share.id,ids.master,'receiving'])
await denied('select public.screen_share_receiver_status($1)',[share.id])
await denied('select public.operations_status()')
await denied('select public.lms_backup_stage()')
assert.equal(await scalar('select public.admin_cohort_metrics($1)',[ids.ca]),null)
await as('sb')
await db.query('select public.screen_share_report($1,$2,$3)',[share.id,ids.master,'receiving'])
await as('super')
const receivers=await scalar('select public.screen_share_receiver_status($1)',[share.id])
assert.equal(receivers.students.length,1)
assert.equal(receivers.students[0].id,ids.sa)
assert.equal(receivers.students[0].state,'receiving')
assert.equal((await scalar('select public.operations_status()')).integrityProtected,true)
await as('super','a')
await denied('select public.screen_share_receiver_status($1)',[share.id])
await as('sa')
await denied('update public.screen_share_sessions set state=\'live\'')
await denied('select public.screen_share_reserve_token($1)',[share.id])
await denied('select * from public.screen_share_admissions')
await denied('select public.screen_share_monthly_usage()')
await as('sb')
assert.equal(await scalar('select count(*)::int from public.screen_share_sessions'),0)
assert.equal(await scalar('select public.screen_share_current($1)',[ids.ca]),null)
await as('a')
assert.equal(await scalar('select count(*)::int from public.screen_share_sessions'),0)
assert.equal(await scalar('select public.screen_share_current($1)',[ids.ca]),null)
await as('super','a')
assert.equal(await scalar('select count(*)::int from public.screen_share_sessions'),0)
await denied('select public.screen_share_monthly_usage()')
await system()
assert.equal(await scalar('select public.screen_share_reserve_token($1)',[share.id]),true)
await db.query("update public.screen_share_sessions set state='ended' where id=$1",[share.id])
await denied('select public.screen_share_claim($1,$2,$3)',[ids.super,ids.cb,ids.master])
await db.query("update public.screen_share_sessions set token_until=now()-interval '1 second' where id=$1",[share.id])
const next = await scalar('select to_jsonb(public.screen_share_claim($1,$2,$3))',[ids.super,ids.cb,ids.master])
await db.query("update public.screen_share_sessions set sampled_at=now()-interval '60 seconds', participant_count=2 where id=$1",[next.id])
await db.query('select public.screen_share_sample($1,0)',[next.id])
await as('super')
assert.equal(Number(await scalar('select public.screen_share_monthly_usage()')),2)
await denied('select public.screen_share_lock_stop($1,false)',[next.id])
await system()
assert.equal(await scalar('select to_jsonb(public.screen_share_lock_stop(null,true))'),null,'healthy session cannot be swept')
await db.query("update public.screen_share_sessions set lease_until=now()-interval '1 second' where id=$1",[next.id])
const closing=await scalar('select to_jsonb(public.screen_share_lock_stop(null,true))')
assert.equal(closing.id,next.id)
assert.equal(closing.state,'stopping')
await denied('select public.screen_share_claim($1,$2,$3)',[ids.super,ids.ca,ids.master])
assert.equal(await scalar('select to_jsonb(public.screen_share_lock_stop($1,false))',[next.id]),null,'second cleanup must not eject a future room session')
console.log('PASS: screen share RLS, service-only writes, single room lock, stale-token cooldown and participant-minute accounting')
await system()
await db.exec('begin')
await db.exec(`insert into auth.users(id,email) select ('99999999-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'paging-'||n||'@test.local' from generate_series(1,1100)n`)
await db.query("insert into public.cohort_members(cohort_id,user_id) select $1,id from public.profiles where email like 'paging-%'",[ids.ca])
await db.query("insert into public.course_views(cohort_course_id,user_id) select $1,id from public.profiles where email like 'paging-%'",[aCourse])
await as('a')
const metrics=await scalar('select public.admin_cohort_metrics($1)',[ids.ca])
assert.equal(metrics.students,1101)
assert.ok(metrics.courseViewRates.some(v=>v['열람률']===100))
const page=await scalar('select public.admin_member_page($1,$2,37,30)',[ids.ca,'paging-'])
assert.equal(page.total,1100);assert.equal(page.items.length,20)
await system();await db.exec('rollback')
assert.equal(await scalar('select count(*)::int from public.submission_versions')>0,true)
const emailHash='a'.repeat(64),networkHash='b'.repeat(64)
for(let n=0;n<5;n++)assert.equal(await scalar('select public.reserve_signup($1,$2)',[emailHash,networkHash]),true)
assert.equal(await scalar('select public.reserve_signup($1,$2)',[emailHash,networkHash]),false)
console.log('PASS: receiver reports, monitoring access, >1000-row metrics/member paging, submission versions and signup throttling')
// File distribution: real database/storage policies and transactional retries.
await as('sa')
await denied('select public.create_file_batch($1,$2)', [ids.ca,'Forged student batch'])
await as('a')
await denied('select public.create_file_batch($1,$2)', [ids.cb,'Other tenant'])
const batchId = await scalar('select public.create_file_batch($1,$2,$3)',[ids.ca,'자료 보내기','학생용 안내'])
const filePath = `${ids.a}/${batchId}/lesson.pdf`
await denied('select public.send_file_batch($1,null)',[batchId])
assert.equal(await scalar('select count(*)::int from public.file_recipients where batch_id=$1',[batchId]),0,'null payload cannot publish a delivery without files')
await db.query("insert into storage.objects(bucket_id,name,metadata) values ('student-deliveries',$1,'{\"size\":123}')",[filePath])
await denied("insert into storage.objects(bucket_id,name,metadata) values ('student-deliveries',$1,'{\"size\":123}')",[`${ids.b}/${batchId}/spoof.pdf`])
const payload = [{filename:'수업자료.pdf',file_path:filePath,size_bytes:123}]
await denied('select public.send_file_batch($1,$2::jsonb,$3)',[batchId,JSON.stringify(payload),[ids.sb]])
await denied('select public.send_file_batch($1,$2::jsonb)',[batchId,JSON.stringify([{...payload[0],size_bytes:321}])])
assert.equal(await scalar('select count(*)::int from public.file_batch_files where batch_id=$1',[batchId]),0,'failed send rolls back all attachments')
assert.equal(await scalar('select public.send_file_batch($1,$2::jsonb,$3)',[batchId,JSON.stringify(payload),[ids.sa]]),1)
assert.equal(await scalar('select public.send_file_batch($1,$2::jsonb,$3)',[batchId,JSON.stringify(payload),[ids.sa]]),1,'retry does not duplicate recipients')
const fileId = await scalar('select id from public.file_batch_files where batch_id=$1',[batchId])
await denied('select public.discard_file_batch($1)',[batchId])
assert.equal(await scalar("select public.file_storage_allowed($1,true)",[filePath]),false,'sent files cannot be replaced or deleted')
await as('sb')
assert.equal(await scalar('select count(*)::int from public.file_batches where id=$1',[batchId]),0)
assert.equal(await scalar("select count(*)::int from storage.objects where bucket_id='student-deliveries'"),0)
await denied('select public.record_file_download($1)',[fileId])
await as('sa')
assert.equal(await scalar("select count(*)::int from storage.objects where name=$1",[filePath]),1)
await denied('insert into public.file_download_requests(file_id,user_id) values ($1,$2)',[fileId,ids.sa])
await db.query('select public.ack_file_batch($1,true)',[batchId])
await db.query('select public.record_file_download($1)',[fileId])
await db.query('select public.record_file_download($1)',[fileId])
assert.equal(await scalar('select count(*)::int from public.file_download_requests where file_id=$1',[fileId]),1)
await system()
await db.query("update public.profiles set status='inactive' where id=$1",[ids.sa])
await as('sa')
assert.equal(await scalar("select count(*)::int from storage.objects where name=$1",[filePath]),0)
await denied('select public.record_file_download($1)',[fileId])
await system()
await db.query("update public.profiles set status='active' where id=$1",[ids.sa])
await as('a')
const recipient = (await db.query('select * from public.file_recipients where batch_id=$1',[batchId])).rows[0]
assert.ok(recipient.received_at && recipient.seen_at)
assert.equal(await scalar('select count(*)::int from public.file_download_requests where file_id=$1',[fileId]),1)
const discarded = await scalar('select public.create_file_batch($1,$2)',[ids.ca,'Cancelled draft'])
await db.query('select public.discard_file_batch($1)',[discarded])
assert.equal(await scalar('select count(*)::int from public.file_batches where id=$1',[discarded]),0)
await as('super','b')
assert.equal(await scalar('select count(*)::int from public.file_batches where id=$1',[batchId]),0)
await as('super')
assert.equal(await scalar('select count(*)::int from public.file_batches where id=$1',[batchId]),1)
await system()
console.log('PASS: file delivery recipient/storage isolation, inactive denial, atomic send, retry, receipt/read/download tracking and draft cancellation')
await as('a')
const textBatch = await scalar('select public.create_distribution($1,$2,$3,$4)',[ids.ca,'통합 쪽지','','<p><strong>쪽지만 전송</strong></p>'])
await denied('select public.send_distribution($1,null,$2)',[textBatch,[ids.sa]])
assert.equal(await scalar('select public.send_distribution($1,$2::jsonb,$3)',[textBatch,'[]',[ids.sa]]),1)
assert.equal(await scalar('select public.send_distribution($1,$2::jsonb,$3)',[textBatch,'[]',[ids.sa]]),1)
assert.equal(await scalar('select count(*)::int from public.file_batch_files where batch_id=$1',[textBatch]),0)
const emptyBatch = await scalar('select public.create_distribution($1,$2)',[ids.ca,'빈 쪽지'])
await denied('select public.send_distribution($1,$2::jsonb)',[emptyBatch,'[]'])
await db.query('select public.discard_file_batch($1)',[emptyBatch])
await as('sb')
assert.equal(await scalar('select count(*)::int from public.file_batches where id=$1',[textBatch]),0)
await denied('select public.hide_distribution($1)',[textBatch])
await as('sa')
await db.query('select public.ack_file_batch($1,true)',[textBatch])
await db.query('select public.hide_distribution($1)',[textBatch])
assert.ok(await scalar('select hidden_at from public.file_recipients where batch_id=$1',[textBatch]))
await db.query('select public.heartbeat()')
await as('sb'); await db.query('select public.heartbeat()')
await as('super')
const allVisits = await scalar('select public.visit_stats()')
const allOnline = await scalar('select public.online_student_count(null)')
await as('sa')
const allStudentStats = await scalar('select public.student_service_stats()')
assert.equal(allStudentStats.today,allVisits.today)
assert.equal(allStudentStats.total,allVisits.total)
assert.equal(allStudentStats.online,allOnline)
assert.ok(allOnline>=2,'global online count includes students in other cohorts')
await denied('select * from public.account_presence')
await system(); await db.query("update public.profiles set status='inactive' where id=$1",[ids.sa])
await as('sa')
assert.deepEqual(await scalar('select public.student_service_stats()'),{today:0,total:0,online:0})
await system(); await db.query("update public.profiles set status='active' where id=$1",[ids.sa])
await as('super','a')
await denied('select public.create_distribution($1,$2,$3,$4)',[ids.ca,'확인 모드','','<p>금지</p>'])
await system()
console.log('PASS: unified text-only delivery, optional files, retry, scoped recipients, per-student hiding and global aggregate counts without row disclosure')
const snapshot=await scalar('select public.lms_backup_snapshot()')
const staged=await scalar('select public.lms_backup_stage()')
for(const [table,count] of Object.entries(staged.tables)) {
  const rows=[]
  for(let offset=0;offset<count;offset+=2)rows.push(...await scalar('select public.lms_backup_chunk($1,$2,$3,2)',[staged.id,table,offset]))
  assert.deepEqual(rows.map(JSON.stringify).sort(),snapshot.tables[table].map(JSON.stringify).sort())
}
await db.query('delete from public.backup_snapshots where id=$1',[staged.id])
console.log('PASS: staged backup chunks reproduce a consistent snapshot without an unbounded database response')
await db.exec(restoreSql(snapshot))
const restored=await scalar('select public.lms_backup_snapshot()')
const normalize=tables=>Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.map(row=>JSON.stringify(row)).sort()]))
assert.deepEqual(normalize(restored.tables),normalize(snapshot.tables))
console.log('PASS: isolated PostgreSQL restore reproduces every database row, revalidates foreign keys and restores sequences')
await db.close()
