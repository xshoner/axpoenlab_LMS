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
 let failProfile=false, profileFailuresRemaining=0, mockShare=false, fileAvailable=false, fileSeen=false, fileReceived=false, downloadRequests=0, statsRequests=0, detailRequests=0;
 let adminMode=false, failHistory=false, sends=0;
 let failCourse=false, missingCourse=false, courseViews=0, failStudentDashboard=false, failAdminDashboard=false, failCohortMetrics=false;
 let uploadMode=false, draftAttempts=0, uploadAttempts=0, fileSendAttempts=0, deleteAttempts=0, draftId=null, uploadedPath=null;
 let adminReceiptRequests=0;
 let shareTtl=4000;
 const batch={id:first,title:'배포 자료',memo:'오프라인 학생에게도 전달',body_html:'<p>통합 쪽지 본문</p>',sent_at:'2026-10-02T08:00:00Z',file_batch_files:[{id:second,filename:'한글자료.txt',size_bytes:8,file_path:'mock/file.txt'}]};
 await context.addInitScript(s=>{localStorage.setItem('ax-lms-keep','1');localStorage.setItem('sb-ugelgndotyppgksbubot-auth-token',JSON.stringify(s));localStorage.setItem(`ax-distribution-seen:${s.user.id}`,JSON.stringify(['legacy-message']))},session);
 await context.route('**/ugelgndotyppgksbubot.supabase.co/**',async route=>{
  const u=new URL(route.request().url()), table=u.pathname.split('/').pop();let data=[];
  if(table==='profiles'&&(failProfile||profileFailuresRemaining>0)){
   if(profileFailuresRemaining>0)profileFailuresRemaining--;
   await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'TEST_OFFLINE'})});return;
  }
  if(table==='profiles')data={id,name:'Mock',role:adminMode?'super_admin':'student',status:'active'};
  else if(table==='cohorts')data=[{id:cohort,name:'Mock cohort',status:'active'}];
  else if(table==='cohort_members')data=u.searchParams.get('select')?.includes('profiles!inner')?[{user_id:id,profiles:{id,name:'Mock student',status:'active',role:'student'}}]
    :u.searchParams.get('select')==='user_id'?[{user_id:id}]
      :{cohort_id:cohort,cohorts:{id:cohort,name:'Mock cohort',status:'active'}};
  else if(table==='cohort_courses'){
   if(u.searchParams.get('select')?.includes('cohort_attachments(')){
    if(failCourse){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'TEST_OFFLINE'})});return;}
    if(missingCourse){await route.fulfill({status:406,contentType:'application/json',body:JSON.stringify({code:'PGRST116',message:'No rows'})});return;}
    data={id:first,group_id:cohort,course_no:1,title:'Mock lesson',cohort_attachments:[],surveys:[],quizzes:[]};
   }
  }
  else if(table==='record_course_view'){courseViews++;data=null;}
  else if(table==='student_dashboard'){
   if(failStudentDashboard){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'TEST_OFFLINE'})});return;}
   data={courses:[],groups:[],views:[],submissions:[],surveys:[],quizzes:[],responses:[],quizSubmissions:[],notices:[],boardPosts:[],arcade:null};
  }
  else if(table==='admin_dashboard_overview'){
   if(failAdminDashboard){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'TEST_OFFLINE'})});return;}
   data={memberCounts:[{cohort_id:cohort,count:3}],totalStudents:3,totalCourses:0,totalSubmissions:0,unanswered:0,visits:{today:3,total:3},visitSeriesRaw:[{d:new Date().toISOString().slice(0,10),cnt:3}],notices:[],boardPosts:[]};
  }
  else if(table==='admin_cohort_metrics'){
   if(failCohortMetrics){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'TEST_OFFLINE'})});return;}
   data={active:0,students:0,submitRate:0,surveyRate:0,quizRate:0,avgScore:0,courseGroups:[{id:cohort,name:'Mock group',is_default:true}],courseViewRates:[{name:'Mock course',groupId:cohort,열람률:75}],topRated:[],inquiries:[]};
  }
  else if(table==='screen_share_current')data=mockShare?{id:first,cohort_id:cohort,teacher_id:second,state:'live',lease_remaining_ms:shareTtl}:null;
  else if(table==='screen-share')data={room:'https://example.invalid',token:'MOCK_ONLY'};
  else if(table==='my_help_position'||table==='record_visit')data=null;
  else if(table==='online_student_count'||table==='heartbeat')data=0;
  else if(table==='student_service_stats'){statsRequests++;data={today:23,total:456,online:7};}
  else if(table==='user')data=user;
  else if(table==='quizzes'){await route.fulfill({status:406,contentType:'application/json',body:JSON.stringify({code:'PGRST116',message:'No rows'})});return;}
  else if(table==='quiz_submissions')data=null;
  else if(table==='surveys'){const survey=u.searchParams.get('id')?.endsWith(first)?first:second;data={id:survey,title:survey===first?'First survey':'Second survey',status:'open',allow_edit:false};}
  else if(table==='survey_responses')data=u.searchParams.get('survey_id')?.endsWith(first)?{id:'response',survey_answers:[]}:null;
  else if(table==='survey_questions')data=[];
  else if(table==='push_deliveries')data=fileAvailable?[{id:'legacy-message',body:'기존 쪽지도 유지됩니다.',sent_at:'2026-10-01T08:00:00Z',sender_name:'관리자'}]:[];
  else if(table==='file_recipients'){
    if(adminMode)adminReceiptRequests++;
    if(!adminMode)assert.ok(!/body_html|memo|\*/.test(u.searchParams.get('select')),'inbox polling retrieves metadata only');
    data=fileAvailable?[{batch_id:first,received_at:fileReceived?'2026-10-02T08:00:00Z':null,seen_at:fileSeen?'2026-10-02T08:00:00Z':null,
      file_batches:{id:batch.id,title:batch.title,sent_at:batch.sent_at,file_batch_files:[{id:second,deleted_at:batch.file_batch_files[0].deleted_at}]}}]:[];
  }
  else if(table==='file_batches'){
    if(adminMode){if(failHistory){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'history offline'})});return;}data=uploadMode?[{...batch,status:'sent',sender_id:id}]:[];}
    else {detailRequests++;data=batch;}
  }
  else if(table==='create_distribution'){
    if(uploadMode){const payload=JSON.parse(route.request().postData());draftId??=payload.p_id;assert.equal(payload.p_id,draftId);draftAttempts++;if(draftAttempts===1){await route.fulfill({status:504,contentType:'application/json',body:JSON.stringify({message:'HTTP 504 error'})});return;}data=draftId;}
    else data=first;
  }
  else if(u.pathname.startsWith('/storage/v1/object/student-deliveries/')&&route.request().method()==='POST'){
    const path=u.pathname.split('/student-deliveries/')[1];uploadedPath??=path;assert.equal(path,uploadedPath);assert.ok(path.includes(draftId));uploadAttempts++;
    await route.fulfill({status:uploadAttempts===1?504:409,contentType:'application/json',body:JSON.stringify({statusCode:uploadAttempts===1?'504':'409',error:uploadAttempts===1?'GatewayTimeout':'Duplicate',message:uploadAttempts===1?'HTTP 504 error':'already exists'})});return;
  }
  else if(u.pathname.startsWith('/storage/v1/object/info/student-deliveries/')){assert.equal(u.pathname.split('/student-deliveries/')[1],uploadedPath);data={size:8};}
  else if(table==='send_distribution'){
    if(uploadMode){const payload=JSON.parse(route.request().postData());assert.equal(payload.p_batch,draftId);assert.equal(payload.p_files[0].file_path,uploadedPath);fileSendAttempts++;if(fileSendAttempts===1){sends++;await route.fulfill({status:504,contentType:'application/json',body:JSON.stringify({message:'HTTP 504 error'})});return;}data=1;}
    else {sends++;failHistory=true;data=1;}
  }
  else if(table==='distribution-files'){
    assert.deepEqual(JSON.parse(route.request().postData()),{file_id:second});deleteAttempts++;
    if(deleteAttempts===1){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'storage_delete_failed'})});return;}
    batch.file_batch_files[0].deleted_at=new Date().toISOString();data={ok:true};
  }
  else if(table==='ack_file_batch'){fileReceived=true;if(JSON.parse(route.request().postData()).p_seen)fileSeen=true;data=null;}
  else if(table==='record_file_download'){downloadRequests++;data=null;}
  else if(u.pathname.includes('/storage/v1/object/sign/'))data={signedURL:'/object/mock-file-download?token=MOCK_ONLY'};
  else if(table==='mock-file-download'){
    assert.equal(u.searchParams.get('download'),'한글자료.txt','download filename must be encoded exactly once');
    await route.fulfill({status:200,contentType:'text/plain',headers:{'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(u.searchParams.get('download'))},body:'QA bytes'});return;
  }
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
 profileFailuresRemaining=1;
 await page.reload();
 await page.getByText('Second survey',{exact:true}).waitFor();
 assert.equal(await page.getByText('계정 정보를 불러오지 못했습니다',{exact:true}).count(),0);
 console.log('PASS: a transient profile failure recovers automatically');
 failProfile=true;
 await page.reload();
 await page.getByText('계정 정보를 불러오지 못했습니다',{exact:true}).waitFor();
 failProfile=false;
 await page.getByRole('button',{name:'다시 시도',exact:true}).click();
 await page.getByText('Second survey',{exact:true}).waitFor();
 console.log('PASS: profile failure shows retry and recovers without reload');
 fileAvailable=true;
 await page.reload();
 await page.getByRole('heading',{name:'배포 자료',exact:true}).waitFor();
 await page.getByText('통합 쪽지 본문',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.dialog'));
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'다운로드',exact:true}).click();
 const download=await downloadPromise;
 assert.equal(download.suggestedFilename(),'한글자료.txt');
 assert.equal(downloadRequests,1);
 assert.equal(fileReceived,true);assert.equal(fileSeen,true);
 await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
 await page.reload();
 await page.getByRole('button',{name:'쪽지/파일',exact:true}).waitFor();
 const detailsBefore=detailRequests;
 assert.equal(await page.getByRole('heading',{name:'배포 자료',exact:true}).count(),0);
 await page.getByRole('button',{name:'쪽지/파일',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:/관리자 쪽지/}).count(),1,'legacy messages appear in the same inbox');
 await page.getByRole('button',{name:/배포 자료/}).click();
 await page.getByRole('heading',{name:'배포 자료',exact:true}).waitFor();
 assert.equal(detailRequests,detailsBefore+1,'full contents are fetched only when an item is opened');
 await page.getByRole('dialog').last().getByRole('button',{name:'닫기',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
 console.log('PASS: offline file popup, persisted read status, retained inbox and original Korean download filename');
 await page.goto(base+'/#/courses');
 await page.getByText('접속 7명',{exact:true}).waitFor();
 await page.getByText('오늘 23',{exact:true}).waitFor();
 await page.getByText('누적 456',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'쪽지/파일',exact:true}).count(),1);
 assert.equal(await page.getByRole('button',{name:'받은 파일',exact:true}).count(),0);
 const statsBefore=statsRequests;
 await page.evaluate(()=>window.dispatchEvent(new Event('ax-visit-recorded')));
 await page.waitForTimeout(300);
 assert.equal(statsRequests,statsBefore,'visitor counter reuses presence statistics without another full count');
 console.log('PASS: single student inbox menu and service-wide online/today/total counters');
 await context.route('**/assets/daily-esm-*.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:'export default {createCallObject(){return {on(){},participants(){return window.__qaTrack?{teacher:{local:false,user_id:window.__qaTeacher,tracks:{screenVideo:{state:"playable",persistentTrack:window.__qaTrack}}}}:{}},async join(){window.__qaJoined=true},async leave(){window.__qaLeaves=(window.__qaLeaves||0)+1},async destroy(){}}}}'}));
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
 mockShare=true;shareTtl=45000;
 await page.evaluate(teacher=>{
   window.__qaTeacher=teacher;window.__qaTrack=document.createElement('canvas').captureStream(15).getVideoTracks()[0];
   window.__originalPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=()=>Promise.reject(new Error('mock playback failure'));
   window.dispatchEvent(new Event('online'));
 },second);
 await page.getByText('공유 영상을 재생하지 못했습니다. 다시 연결해 주세요.',{exact:false}).waitFor();
 assert.equal(await page.locator('#root').evaluate(root=>root.inert),false);
 assert.ok(await page.evaluate(()=>window.__qaLeaves>=2));
 await page.evaluate(()=>{HTMLMediaElement.prototype.play=window.__originalPlay;window.__qaTrack.stop()});
 mockShare=false;
 console.log('PASS: playback failure leaves Daily and unlocks the LMS instead of retaining a billed blank video');
 adminMode=true;fileAvailable=false;
 await page.goto(base+'/admin.html#/courses');
 await page.getByRole('button',{name:'쪽지/파일',exact:true}).click();
 assert.equal(await page.locator('.distribution-disclosure').first().evaluate(el=>el.open),false,'history starts collapsed');
 assert.equal(adminReceiptRequests,0,'collapsed history does not poll receipts');
 await page.getByRole('button',{name:'첨부파일 선택',exact:true}).focus();
 await page.locator('.distribution-dropzone').evaluate(el=>{
   const drop=new DataTransfer();drop.items.add(new File(['drag content'],'드래그 파일.txt',{type:'text/plain',lastModified:1}));
   el.dispatchEvent(new DragEvent('drop',{dataTransfer:drop,bubbles:true,cancelable:true}));
 });
 await page.getByText('드래그 파일.txt',{exact:true}).waitFor();
 await page.locator('.distribution-dropzone').evaluate(el=>{
   const drop=new DataTransfer();drop.items.add(new File(['drag content'],'드래그 파일.txt',{type:'text/plain',lastModified:1}));
   el.dispatchEvent(new DragEvent('drop',{dataTransfer:drop,bubbles:true,cancelable:true}));
 });
 assert.equal(await page.getByLabel('선택한 첨부파일').locator('.distribution-file-row').count(),1,'duplicate drop is ignored');
 await page.locator('.distribution-dropzone').evaluate(el=>{
   const drop=new DataTransfer();for(let n=0;n<10;n++)drop.items.add(new File(['data'],`overflow-${n}.txt`,{lastModified:1}));
   el.dispatchEvent(new DragEvent('drop',{dataTransfer:drop,bubbles:true,cancelable:true}));
 });
 await page.getByText('첨부파일은 최대 10개까지 추가할 수 있습니다. 기존 파일을 제거한 뒤 다시 추가해 주세요.',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('선택한 첨부파일').locator('.distribution-file-row').count(),1,'too many files do not silently replace earlier choices');
 await page.getByRole('button',{name:'드래그 파일.txt 제거',exact:true}).click();
 assert.equal(await page.getByLabel('선택한 첨부파일').count(),0);
 const chooserEvent=page.waitForEvent('filechooser');
 await page.getByRole('button',{name:'첨부파일 선택',exact:true}).focus();
 await page.keyboard.press('Enter');
 const chooser=await chooserEvent;
 await chooser.setFiles({name:'키보드 선택.txt',mimeType:'text/plain',buffer:Buffer.from('keyboard')});
 await page.getByRole('button',{name:'키보드 선택.txt 제거',exact:true}).click();
 await page.locator('.distribution-disclosure > summary').first().click();
 await page.getByRole('combobox',{name:'대상 기수',exact:true}).selectOption(cohort);
 await page.getByRole('textbox',{name:'파일 제목',exact:true}).fill('확인용 쪽지');
 await page.locator('[contenteditable="true"]').first().fill('쪽지 본문');
 await page.getByRole('button',{name:'1명에게 보내기',exact:true}).click();
 await page.getByText('1명에게 쪽지/파일을 보냈습니다.',{exact:true}).waitFor();
 await page.getByText('전송은 완료됐지만 이력을 불러오지 못했습니다. 창을 다시 열어 확인해 주세요.',{exact:true}).waitFor();
 assert.equal(sends,1);
 assert.equal(await page.getByRole('textbox',{name:'파일 제목',exact:true}).inputValue(),'');
 assert.equal(await page.getByRole('button',{name:'전송 다시 시도',exact:true}).count(),0);
 console.log('PASS: sent message remains successful when its history refresh fails, without inviting a duplicate send');
 failHistory=false;uploadMode=true;
 await page.getByRole('textbox',{name:'파일 제목',exact:true}).fill('504 파일 재시도');
 await page.getByLabel('전송 파일',{exact:true}).setInputFiles({name:'한글자료.txt',mimeType:'text/plain',buffer:Buffer.from('QA bytes')});
 await page.getByRole('button',{name:'1명에게 보내기',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.distribution-dropzone').disabled);
 await page.locator('.distribution-dropzone').evaluate(el=>{
   const drop=new DataTransfer();drop.items.add(new File(['blocked'],'전송 중 추가.txt'));
   el.dispatchEvent(new DragEvent('drop',{dataTransfer:drop,bubbles:true,cancelable:true}));
 });
 assert.equal(await page.getByText('전송 중 추가.txt',{exact:true}).count(),0,'an in-flight delivery cannot change its locked attachments');
 await page.getByText('수신 현황 · 첨부 관리',{exact:true}).waitFor();
 assert.equal(draftAttempts,2);assert.equal(uploadAttempts,2);assert.equal(fileSendAttempts,2);assert.equal(sends,2,'lost response retries do not commit a second delivery');
 assert.equal(await page.getByRole('textbox',{name:'파일 제목',exact:true}).inputValue(),'');
 await page.getByText('수신 현황 · 첨부 관리',{exact:true}).click();
 await page.getByRole('table',{name:'학생별 수신 현황',exact:true}).waitFor();
 assert.equal(await page.getByRole('dialog').count(),1,'receipt panel expands inline without another modal');
 await page.getByRole('button',{name:'파일 삭제',exact:true}).click();
 await page.getByRole('button',{name:'파일 영구 삭제',exact:true}).click();
 await page.getByText('8B · 삭제됨',{exact:true}).waitFor();
 assert.equal(deleteAttempts,2);assert.equal(await page.getByRole('button',{name:'파일 삭제',exact:true}).count(),0);
 console.log('PASS: 504 at draft, upload and send recovers with identical IDs/paths; attachment deletion retries and marks success only after completion');
 await page.locator('.distribution-disclosure > summary').first().click();
 await page.waitForTimeout(100);
 const receiptCount=adminReceiptRequests;
 await page.waitForTimeout(5500);
 assert.equal(adminReceiptRequests,receiptCount,'collapsing history stops the receipt poll');
 console.log('PASS: accessible drag/drop, duplicate and 10-file guards, per-file removal, collapsed history and inline receipt panel without background polling');
 adminMode=false;fileAvailable=true;
 await page.goto(base+'/#/courses');
 await page.getByRole('button',{name:'쪽지/파일',exact:true}).click();
 await page.getByRole('button',{name:/배포 자료/}).click();
 await page.getByText('관리자가 삭제한 첨부파일',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'다운로드',exact:true}).count(),0);
 console.log('PASS: deleted attachment keeps message and history visible without a student download button');

 fileAvailable=false;failStudentDashboard=true;
 await page.goto(base+'/#/');
 await page.reload();
 await page.getByText('대시보드를 불러오지 못했습니다',{exact:true}).waitFor();
 await page.evaluate(()=>{window.__retryMarker=1});
 failStudentDashboard=false;
 await page.getByRole('button',{name:'다시 시도',exact:true}).click();
 await page.getByRole('heading',{name:'Mock님, 안녕하세요.'}).waitFor();
 assert.equal(await page.evaluate(()=>window.__retryMarker),1,'student retry does not reload the page');
 console.log('PASS: student dashboard recovers in place after a failed read');

 failCourse=true;
 await page.goto(base+'/#/courses/'+first);
 await page.getByText('강좌를 불러오지 못했습니다',{exact:true}).waitFor();
 assert.equal(await page.getByText('강좌를 찾을 수 없습니다',{exact:true}).count(),0);
 const viewsBeforeRetry=courseViews;
 failCourse=false;
 await page.getByRole('button',{name:'다시 시도',exact:true}).click();
 await page.getByRole('heading',{name:'Mock lesson',exact:true}).waitFor();
 assert.equal(courseViews,viewsBeforeRetry,'retrying a read does not record another course view');
 missingCourse=true;
 await page.goto(base+'/#/courses/'+second);
 await page.getByText('강좌를 찾을 수 없습니다',{exact:true}).waitFor();
 missingCourse=false;
 console.log('PASS: course failures remain retryable while a missing course is shown as not found');

 let releaseCharts, chartBlocked=true;
 await page.route('**/assets/DashboardCharts-*.js', async route=>{
  if(chartBlocked)await new Promise(resolve=>{releaseCharts=resolve});
  await route.continue();
 });
 adminMode=true;failAdminDashboard=true;
 await page.evaluate(({userId,cohortId})=>localStorage.setItem(`ax-admin-cohort:${userId}:self`,cohortId),{userId:id,cohortId:cohort});
 await page.goto(base+'/admin.html#/');
 await page.getByText('대시보드를 불러오지 못했습니다',{exact:true}).waitFor();
 await page.evaluate(()=>{window.__retryMarker=2});
 failAdminDashboard=false;
 const chartChunkRequest=page.waitForRequest(/\/assets\/DashboardCharts-[^/]+\.js/);
 await page.getByRole('button',{name:'다시 시도',exact:true}).click();
 await page.getByRole('heading',{name:'전체 현황'}).waitFor();
 await chartChunkRequest;
 await page.getByText('전체 학생 수',{exact:true}).waitFor();
 assert.ok(await page.getByText('차트 준비 중…',{exact:true}).count()>=1,'dashboard KPIs render while chart code is still downloading');
 chartBlocked=false;releaseCharts();
 await page.getByRole('img',{name:'기수별 학생 수'}).waitFor();
 await page.getByRole('img',{name:'방문 추이'}).waitFor();
 await page.getByRole('button',{name:'연간'}).click();
 await page.getByRole('heading',{name:'방문 추이 (최근 1년)'}).waitFor();
 await page.setViewportSize({width:390,height:780});
 await page.waitForFunction(()=>document.querySelector('svg[aria-label="기수별 학생 수"]')?.viewBox.baseVal.width<390);
 await page.setViewportSize({width:1280,height:720});
 assert.equal(await page.evaluate(()=>window.__retryMarker),2,'admin retry does not reload the page');
 failCohortMetrics=true;
 await page.reload();
 await page.getByText('기수 통계를 불러오지 못했습니다',{exact:true}).waitFor();
 await page.getByRole('heading',{name:'전체 현황'}).waitFor();
 failCohortMetrics=false;
 await page.getByRole('button',{name:'다시 시도',exact:true}).click();
 await page.getByText('학생 수 (활성/전체)',{exact:true}).waitFor();
 await page.getByRole('img',{name:'강좌별 열람률'}).waitFor();
 console.log('PASS: admin global and cohort metrics recover independently without a reload');

 assert.deepEqual(errors,[]);
 console.log('Browser runtime errors: '+JSON.stringify(errors));
 await context.close();
}finally{await browser.close()}
