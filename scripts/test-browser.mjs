import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const id='00000000-0000-4000-8000-000000000001',cohort='00000000-0000-4000-8000-000000000002',first='00000000-0000-4000-8000-000000000003',second='00000000-0000-4000-8000-000000000004';
const user={id,email:'readonly-mock@example.invalid',aud:'authenticated',role:'authenticated',user_metadata:{name:'Mock'}};
const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.MOCK_ONLY';
const session={access_token:token,refresh_token:'MOCK_ONLY',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
const base=process.env.LMS_TEST_URL||'http://127.0.0.1:5186';
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}),headless:true});
try {
 const context=await browser.newContext();
 let failProfile=false, mockShare=false;
 await context.addInitScript(s=>{localStorage.setItem('ax-lms-keep','1');localStorage.setItem('sb-ugelgndotyppgksbubot-auth-token',JSON.stringify(s))},session);
 await context.route('**/ugelgndotyppgksbubot.supabase.co/**',async route=>{
  const u=new URL(route.request().url()), table=u.pathname.split('/').pop();let data=[];
  if(table==='profiles'&&failProfile){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'TEST_OFFLINE'})});return;}
  if(table==='profiles')data={id,name:'Mock',role:'student',status:'active'};
  else if(table==='cohort_members')data={cohort_id:cohort,cohorts:{id:cohort,name:'Mock cohort',status:'active'}};
  else if(table==='screen_share_current')data=mockShare?{id:first,cohort_id:cohort,teacher_id:second,state:'live',lease_remaining_ms:4000}:null;
  else if(table==='screen-share')data={room:'https://example.invalid',token:'MOCK_ONLY'};
  else if(table==='my_help_position'||table==='record_visit')data=null;
  else if(table==='online_student_count'||table==='heartbeat')data=0;
  else if(table==='user')data=user;
  else if(table==='quizzes'){await route.fulfill({status:406,contentType:'application/json',body:JSON.stringify({code:'PGRST116',message:'No rows'})});return;}
  else if(table==='quiz_submissions')data=null;
  else if(table==='surveys'){const survey=u.searchParams.get('id')?.endsWith(first)?first:second;data={id:survey,title:survey===first?'First survey':'Second survey',status:'open',allow_edit:false};}
  else if(table==='survey_responses')data=u.searchParams.get('survey_id')?.endsWith(first)?{id:'response',survey_answers:[]}:null;
  else if(table==='survey_questions')data=[];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(''+base+'/#/quizzes/'+first);
 await page.waitForTimeout(2500);
 const quiz=await page.locator('body').innerText();
 assert.ok(quiz.includes('퀴즈를 찾을 수 없습니다'));
 assert.ok(!quiz.includes('불러오는 중'),'missing quiz leaves loading');
 console.log('PASS: nonexistent quiz shows not found without an indefinite spinner');
 await page.goto(''+base+'/#/surveys/'+first);
 await page.getByText('이미 응답을 제출했습니다').waitFor();
 await page.evaluate(hash=>{window.location.hash=hash},'#/surveys/'+second);
 await page.waitForTimeout(1200);
 assert.equal(await page.getByText('이미 응답을 제출했습니다').count(),0);
 console.log('PASS: navigating between surveys resets the previous response');
 failProfile=true;
 await page.reload();
 await page.getByText('계정 정보를 불러오지 못했습니다',{exact:true}).waitFor();
 failProfile=false;
 await page.getByRole('button',{name:'다시 시도',exact:true}).click();
 await page.getByText('Second survey',{exact:true}).waitFor();
 console.log('PASS: profile failure shows retry and recovers without reload');
 await context.route('**/assets/daily-esm-*.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:'export default {createCallObject(){return {on(){},participants(){return {}},async join(){window.__qaJoined=true},async destroy(){}}}}'}));
 mockShare=true;
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await page.locator('.student-screen-share').waitFor();
 await page.waitForFunction(()=>window.__qaJoined===true);
 const cdp=await context.newCDPSession(page);
 await cdp.send('Emulation.setScriptExecutionDisabled',{value:true});
 await new Promise(resolve=>setTimeout(resolve,6000));
 mockShare=false;
 await cdp.send('Emulation.setScriptExecutionDisabled',{value:false});
 await page.locator('.student-screen-share').waitFor({state:'hidden',timeout:3500});
 assert.equal(await page.locator('#root').evaluate(root=>root.inert),false);
 console.log('PASS: expired share releases the LMS after suspended one-shot timers are lost');
 assert.deepEqual(errors,[]);
 console.log('Browser runtime errors: '+JSON.stringify(errors));
 await context.close();
}finally{await browser.close()}
