import { build } from 'esbuild'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server.js'

// Render the actual tabs with mocked contexts. Rich HTML is never rendered here;
// its browser-only sanitizer is an explicit unused stub in this Node test.
fs.mkdirSync('.bkit',{recursive:true})
const output=path.resolve('.bkit/course-tabs-test.mjs')
await build({
  entryPoints:['src/admin/pages/CoursesAdmin.jsx'],outfile:output,bundle:true,
  platform:'node',format:'esm',packages:'external',jsx:'automatic',
  plugins:[{name:'test-context',setup(b){
    b.onResolve({filter:/^dompurify$/},()=>({path:'dompurify',namespace:'unused-dom'}))
    b.onLoad({filter:/.*/,namespace:'unused-dom'},()=>({contents:'export default {addHook(){},sanitize(){throw new Error("Rich HTML is outside this tab test")}};'}))
    b.onResolve({filter:/\/(auth|supabase|cohortContext)(\.[jt]sx?)?$/},({path:p})=>({path:p,namespace:'test-context'}))
    b.onLoad({filter:/.*/,namespace:'test-context'},({path:p})=>({contents:
      p.endsWith('/auth') ? 'export const useAuth=()=>({profile:globalThis.courseTabContext.profile});' :
      p.endsWith('/supabase') ? 'export const getAdminView=()=>globalThis.courseTabContext.view; export const supabase={};' :
      'export const useCohort=()=>({cohorts:[],selectedId:"",selected:null});'
    }))
  }}],
})
try {
  const {default:CoursesAdmin}=await import(pathToFileURL(output))
  for(const [role,view,route,expected] of [
    ['super_admin',null,'/courses','마스터 강좌'],
    ['admin',null,'/courses','내 강좌'],
    ['super_admin',{id:'test-admin'},'/courses','내 강좌'],
    ['super_admin',null,'/courses/mine/legacy-course','마스터 강좌'],
    ['admin',null,'/courses/cohort/course-id','기수별 강좌'],
  ]) {
    globalThis.courseTabContext={profile:{id:'test-profile',role},view}
    const html=renderToStaticMarkup(React.createElement(StaticRouter,{location:route},React.createElement(CoursesAdmin)))
    assert.ok(html.includes(`class="btn btn-sm btn-primary">${expected}</button>`),`${role} ${route} defaults to ${expected}`)
    if(role==='super_admin'&&!view) assert.ok(!html.includes('>내 강좌</button>'),'super-admin must not have a personal tab')
  }
  console.log('PASS: rendered course tabs respect roles, scoped preview and legacy personal-course links')
} finally {
  delete globalThis.courseTabContext
  fs.unlinkSync(output)
}
