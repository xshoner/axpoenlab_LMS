import fs from 'node:fs'
import assert from 'node:assert/strict'
import { transform } from 'esbuild'

// Execute the actual Edge handlers with a deterministic service-role adapter.
// These tests exercise the authorization branch before any auth/admin mutation.
const profiles = [
  { id: 'super', role: 'super_admin', status: 'active' },
  { id: 'a', role: 'admin', status: 'active' },
  { id: 'b', role: 'admin', status: 'active' },
  { id: 'inactive', role: 'admin', status: 'inactive' },
  { id: 'sa', role: 'student', status: 'active' },
  { id: 'sb', role: 'student', status: 'active' },
]
const rows = {
  profiles,
  cohorts: [
    { id: 'legacy', code: 'LEGACY', signup_forced: true, deleted_at: null, owner_admin_id: null },
    { id: 'ca', code: 'ADMINA', signup_forced: false, deleted_at: null, owner_admin_id: 'a' },
    { id: 'cb', code: 'ADMINB', signup_forced: false, deleted_at: null, owner_admin_id: 'b' },
  ],
  cohort_members: [{ user_id: 'sa', cohort_id: 'ca' }, { user_id: 'sb', cohort_id: 'cb' }],
  master_courses: [], master_course_groups: [],
}
const mutations = []
let failMembership = false
const client = {
  auth: {
    getUser: async jwt => ({ data: { user: profiles.some(p => p.id === jwt) ? { id: jwt } : null } }),
    admin: {
      listUsers: async () => ({ data: { users: profiles } }),
      createUser: async attrs => {
        const user = { id: `created-${profiles.length}`, email: attrs.email, role: 'student', status: 'active' }
        profiles.push(user); mutations.push(['create',user.id]); return { data: { user } }
      },
      deleteUser: async id => { mutations.push(['delete',id]); return {} },
      updateUserById: async (id, patch) => { mutations.push(['auth-update',id,patch]); return {} },
    },
  },
  from(table) {
    let filters = [], operation = 'select', payload, count = false
    const query = {
      select: (_columns, options) => { count = !!options?.count; return query },
      eq: (key,value) => { filters.push([key,value]); return query },
      is: (key,value) => { filters.push([key,value]); return query },
      update: value => { operation = 'update'; payload = value; return query },
      insert: value => { operation = 'insert'; payload = value; return query },
      single: () => query,
      maybeSingle: () => query,
      then(resolve, reject) {
        if (failMembership && table === 'cohort_members') return Promise.resolve({ error: { message: 'database unavailable' } }).then(resolve, reject)
        const matches = (rows[table] || []).filter(row => filters.every(([key,value]) => key === 'cohorts.owner_admin_id'
          ? rows.cohorts.find(c => c.id === row.cohort_id)?.owner_admin_id === value : row[key] === value))
        if (operation === 'insert') { rows[table].push(payload); mutations.push(['insert',table,payload]) }
        if (operation === 'update') { for (const row of matches) Object.assign(row,payload); mutations.push(['update',table,payload]) }
        return Promise.resolve({ data: matches[0] || null, count: count ? matches.length : null }).then(resolve,reject)
      },
    }
    return query
  },
}
async function handler(name) {
  let serve
  const source = fs.readFileSync(`supabase/functions/${name}/index.ts`,'utf8').replace(/^import \{ createClient \} from [^\n]+\n/,'')
  const { code } = await transform(source,{loader:'ts',target:'es2022'})
  new Function('Deno','createClient',code)({env:{get:()=>'test'},serve:fn=>{serve=fn}},()=>client)
  return async (caller,body,view) => {
    const response = await serve(new Request('https://test.local',{method:'POST',headers:{Authorization:`Bearer ${caller}`,'Content-Type':'application/json',...(view?{'x-admin-view':view}:{})},body:JSON.stringify(body)}))
    return { status: response.status, ...await response.json() }
  }
}
const admin = await handler('admin-users')
for (const [caller,body,view] of [
  ['a',{action:'create_admin',email:'x@test.local',password:'password1'}],
  ['a',{action:'delete_user',user_id:'sb'}],
  ['a',{action:'set_status',user_id:'sb',status:'inactive'}],
  ['a',{action:'set_status',user_id:'b',status:'inactive'}],
  ['inactive',{action:'set_status',user_id:'sa',status:'inactive'}],
  ['super',{action:'set_status',user_id:'sa',status:'inactive'},'a'],
]) {
  const before = mutations.length
  assert.equal((await admin(caller,body,view)).status,403)
  assert.equal(mutations.length,before,'forbidden request must never reach service-role mutation')
}
failMembership = true
assert.equal((await admin('a',{action:'set_status',user_id:'sa',status:'inactive'})).status,403)
failMembership = false
assert.equal((await admin('a',{action:'set_status',user_id:'sa',status:'inactive'})).ok,true)
assert.equal(profiles.find(p=>p.id==='sa').status,'inactive')
assert.equal((await admin('super',{action:'delete_user',user_id:'a'})).error,'admin_has_data')
assert.equal((await admin('super',{action:'set_status',user_id:'b',status:'inactive'})).ok,true)
assert.equal((await admin('super',{action:'create_admin',email:'new-admin@test.local',password:'password1',name:'New'})).ok,true)
console.log('PASS: actual admin-users handler rejects cross-tenant, inactive, preview and role-escalation mutations; own-member and super-admin operations succeed')

const signup = await handler('signup')
const application = {email:'new-student@test.local',password:'password1',name:'New',org:'Org'}
const enrolled = await signup('',{...application,cohort_code:'admina'})
assert.equal(enrolled.ok,true)
assert.equal(rows.cohort_members.find(m=>m.user_id===enrolled.user_id).cohort_id,'ca','explicit invitation overrides legacy signup default')
const before = mutations.length
assert.equal((await signup('',{...application,cohort_code:'INVALID'})).error,'invalid_cohort_code')
assert.equal(mutations.length,before,'invalid code must not create an orphan account')
failMembership = true
assert.equal((await signup('',{...application,cohort_code:'ADMINB'})).ok,false)
assert.equal(mutations.at(-1)[0],'delete','failed membership assignment rolls back only the newly created user')
console.log('PASS: actual signup handler honors tenant invitation, validates before account creation and compensates failed membership creation')
