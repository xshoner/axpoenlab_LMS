import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'

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
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text);
  alter table storage.objects enable row level security;
  create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
  create publication supabase_realtime;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant all on all tables in schema storage to authenticated;
  alter default privileges in schema public grant all on tables to authenticated, service_role;
  alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
  alter default privileges in schema public grant execute on functions to authenticated, service_role;
`)
const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()
let baseline
async function fingerprint() {
  const tables = (await db.query("select tablename from pg_tables where schemaname='public' and tablename <> 'account_presence' order by tablename")).rows
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
await as('a')
const aCourseGroup = await scalar('select group_id from public.cohort_courses where id=$1',[aCourse])
await db.query('update public.cohort_course_groups set is_published=false where id=$1',[aCourseGroup])
await as('sa')
assert.equal(await scalar('select count(*)::int from public.cohort_courses where id=$1',[aCourse]),0)
assert.equal(await scalar('select count(*)::int from public.cohort_attachments where cohort_course_id=$1',[aCourse]),0)
assert.equal(await scalar('select count(*)::int from public.student_course_list($1)',[aCourseGroup]),0)
assert.equal(await scalar('select count(*)::int from public.quiz_questions_student where quiz_id=$1',[aQuiz]),0)
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
console.log('PASS: scoped online/visit counts and inactive-account denial')
await db.close()
