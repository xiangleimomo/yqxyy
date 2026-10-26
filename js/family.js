/* Family dashboards share course pages, but never share another account's cache. */
window.SFFamily = {
 app:null, data:null, uid:null, generation:0, settingsVersion:0, timer:null, flushing:null, lastError:'',
 labels:{watch:'Watch · 观看',read:'Listen and Read · 阅读',words:'Words · 单词',quiz:'Quiz · 测验'},
 statuses:{assigned:'待开始',submitted:'已提交，待家长确认',approved:'已完成',revision:'需要补做',cancelled:'已取消'},
 init(app){
  this.app=app;
  window.addEventListener('focus',()=>this.refreshIfVisible());
  window.addEventListener('online',()=>{this.flush();this.refreshIfVisible();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.refreshIfVisible();});
 },
 reset(){this.generation++;this.settingsVersion++;document.getElementById('familyAccountSettings')?.replaceChildren();this.data=null;this.uid=null;this.lastError='';clearTimeout(this.timer);},
 identitySwitch(){this.reset();if(this.isPage())this.app.el().innerHTML='<section class="family-shell"><p role="status">正在切换账号，读取对应家庭数据…</p></section>';},
 stop(){this.generation++;clearTimeout(this.timer);},
 accountChanged(){this.reset();const uid=this.uid=window.SFCloud?.user?.id;if(uid)this.rpc('dashboard').then(data=>{if(window.SFCloud?.user?.id===uid){this.data=data;this.flush();}}).catch(()=>{});},
 isPage(){return ['homework','family','parent','child'].includes(this.app?.route()[0]);},
 refreshIfVisible(){if(!this.isPage()||document.hidden)return;if(this.app.el().querySelector('form:focus-within,textarea:focus,[data-dirty]')){clearTimeout(this.timer);this.timer=setTimeout(()=>this.refreshIfVisible(),45000);return;}this.render(this.app);},
 escape(value){return this.app.escapeHtml(String(value??''));},
 async rpc(action,payload={}){
  const cloud=window.SFCloud,uid=cloud?.user?.id;
  if(!uid||!cloud.client)throw Error('请先登录自己的账号');
  const {data,error}=await cloud.client.rpc('sf_family',{p_action:action,p_payload:payload});
  if(window.SFCloud?.user?.id!==uid)throw Error('账号已切换，请重新操作');
  if(error)throw Error(error.code==='PGRST202'?'家庭功能正在部署，请稍后刷新。':error.message);
  return data;
 },
 async prepare(series,episode){
  const uid=window.SFCloud?.user?.id;
  const {data,error}=await window.SFCloud.client.functions.invoke('family-lesson-catalog',{body:{series_id:series,episode_id:Number(episode)}});
  if(window.SFCloud?.user?.id!==uid)throw Error('账号已切换');
  if(error||data?.error)throw Error(data?.error||'课程准备失败，请检查网络后重试');
  return data;
 },
 queueKey(uid){return 'sf_family_queue_'+uid;},
 queue(uid){try{return JSON.parse(localStorage.getItem(this.queueKey(uid))||'[]');}catch{return [];}},
 record(series,episode,module,answers){
  const uid=window.SFCloud?.user?.id;if(!uid||this.uid!==uid||this.data?.profile?.role!=='child')return;
  if(['directVideo','localVideo','hlsVideo'].includes(module))module='watch';
  if(!Object.hasOwn(this.labels,module))return;
  try{
   const queue=this.queue(uid);
   // Keep every attempt, including a lower score than the historic best.
   queue.push({id:crypto.randomUUID(),series_id:series,episode_id:Number(episode),module,occurred_at:new Date().toISOString(),...(module==='quiz'?{answers}: {})});
   localStorage.setItem(this.queueKey(uid),JSON.stringify(queue));
   this.flush();
  }catch{this.lastError='学习记录暂未保存，请检查浏览器存储空间。';}
 },
 async flush(){
  const uid=window.SFCloud?.user?.id;if(!uid||!window.SFCloud?.client)return;
  if(this.flushing){await this.flushing;if(this.uid===uid&&this.queue(uid).length&&this.lastError==='')return this.flush();return;}
  this.uid=uid;
  this.flushing=(async()=>{
   this.lastError='';
   for(const event of this.queue(uid).slice(0,100)){
    if(window.SFCloud?.user?.id!==uid)return;
    try{
     let result=await this.rpc('record',event);
     if(result.needs_catalog){await this.prepare(event.series_id,event.episode_id);result=await this.rpc('record',event);}
     if(result.needs_catalog)throw Error('本集测验暂时无法核对，请稍后重试');
     const remaining=this.queue(uid).filter(x=>x.id!==event.id);
     localStorage.setItem(this.queueKey(uid),JSON.stringify(remaining));
    }catch(e){this.lastError=e.message;break;}
   }
  })().finally(()=>{this.flushing=null;});
  await this.flushing;
 },
 canAccessLesson(series,episode){
  return this.uid===window.SFCloud?.user?.id&&this.data?.profile?.role==='child'&&this.data.assignments.some(a=>a.series_id===series&&Number(a.episode_id)===Number(episode)&&a.status!=='cancelled');
 },
 today(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');},
 time(value){return value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';},
 notice(text,error=false){const el=this.app.el().querySelector('#familyNotice');if(el){el.textContent=text;el.classList.toggle('error',error);}},
 async action(button,fn){
  button.disabled=true;const uid=window.SFCloud?.user?.id;
  try{await fn();}catch(e){if(window.SFCloud?.user?.id===uid)this.notice(e.message,true);}finally{button.disabled=false;}
 },
 async render(app){
  this.app=app;clearTimeout(this.timer);const run=++this.generation,uid=window.SFCloud?.user?.id,root=app.el(),e=v=>this.escape(v);
  if(!uid){root.innerHTML='<section class="family-shell"><div class="family-hero"><div><span>HOMEWORK</span><h1>打卡作业</h1><p>家长布置作业，孩子在同一条作业下回复、上传材料并打卡。</p></div></div><div class="family-panel"><h2>登录后查看你的作业</h2><p>每个账号对应自己的身份。身份设置和亲子绑定统一在“我的账户”中管理。</p><button class="btn" id="familyLogin">注册 / 登录</button></div></section>';root.querySelector('#familyLogin').onclick=()=>window.SFCloud?.open();return;}
  root.innerHTML='<section class="family-shell"><p role="status">正在读取作业…</p></section>';
  try{
   const data=await this.rpc('dashboard');if(run!==this.generation||window.SFCloud?.user?.id!==uid)return;
   data.assignments.forEach(a=>a.modules.sort((x,y)=>Object.keys(this.labels).indexOf(x)-Object.keys(this.labels).indexOf(y)));
   this.data=data;this.uid=uid;
   const parent=data.profile?.role==='parent',active=data.links.filter(l=>l.status==='active');
   root.innerHTML=`<section class="family-shell homework-inbox"><div class="family-hero"><div><span>HOMEWORK</span><h1>打卡作业</h1><p>${data.profile?e(data.profile.name)+' · ':''}每条作业里，上面是家长布置的内容，下面是孩子的完成情况和反馈。</p></div><div class="family-actions"><button class="btn secondary" id="familyRefresh">刷新 / Refresh</button><button class="btn secondary" data-family-settings>账号与绑定设置</button></div></div><div id="familyNotice" role="status" aria-live="polite"></div>${!data.profile?'<section class="family-panel"><h2>先在账户中设置身份</h2><p>一个账号对应一个身份。请在“我的账户”中选择家长或孩子，并完成亲子绑定。</p><button class="btn" data-family-settings>打开账号设置</button></section>':`${!active.length?'<section class="family-panel"><p>还没有已确认的亲子绑定，请在账户设置里完成绑定后使用作业功能。</p><button class="btn" data-family-settings>去绑定账号</button></section>':''}${parent&&active.length?`<details class="family-panel homework-compose" ${!data.assignments.length?'open':''}><summary>✉ 布置新作业</summary><div class="homework-compose-body">${this.assignmentForm(active)}</div></details>`:''}<section class="family-panel"><div class="family-section-head"><h2>作业往来</h2><div class="family-filters">${parent?`<select id="familyChildFilter" aria-label="按孩子筛选"><option value="all">全部孩子</option>${active.map(l=>`<option value="${e(l.child_id)}">${e(l.name)}</option>`).join('')}</select>`:''}<select id="familyStatusFilter" aria-label="按作业状态筛选"><option value="all">全部状态</option><option value="todo">待完成</option><option value="submitted">待确认</option><option value="approved">已完成</option><option value="cancelled">已取消</option></select></div></div><div id="familyAssignments" class="family-assignments"></div></section>${parent&&active.length?`<details class="family-panel homework-history"><summary>查看孩子的课程学习记录</summary><div class="family-section-head"><p>选择孩子查看学习操作与历史完成情况。</p><select id="familyRecordsChild" aria-label="选择孩子查看学习记录"><option value="">选择孩子</option>${active.map(l=>`<option value="${e(l.child_id)}">${e(l.name)}</option>`).join('')}</select></div><div id="familyRecords"></div></details>`:''}`}</section>`;
   root.querySelector('#familyRefresh').onclick=ev=>this.action(ev.currentTarget,async()=>{await this.flush();await this.render(app);});
   root.querySelectorAll('[data-family-settings]').forEach(b=>b.onclick=()=>window.SFCloud?.open());
   if(!data.profile)return;
   root.querySelector('#familyChildFilter')?.addEventListener('change',()=>this.renderAssignments());
   root.querySelector('#familyStatusFilter').onchange=()=>this.renderAssignments();
   root.querySelector('#familyRecordsChild')?.addEventListener('change',ev=>this.showRecords(ev.target.value));
   this.renderAssignments();
   root.querySelectorAll('form').forEach(form=>form.addEventListener('input',()=>{form.dataset.dirty='true';}));
   if(parent&&active.length)await this.bindAssignmentForm(run);
   if(run===this.generation)this.timer=setTimeout(()=>this.refreshIfVisible(),45000);
  }catch(err){if(run!==this.generation)return;root.innerHTML=`<section class="family-shell family-panel"><h1>作业暂时无法加载</h1><p>${e(err.message)}</p><button class="btn" id="familyRetry">重新加载</button></section>`;root.querySelector('button').onclick=()=>this.render(app);}
 },
 async renderSettings(){
  const root=document.getElementById('familyAccountSettings'),uid=window.SFCloud?.user?.id,run=++this.settingsVersion;
  if(!root)return;root.replaceChildren();if(!uid)return;
  const e=v=>this.escape(v);root.innerHTML='<p role="status">正在读取账号身份与绑定…</p>';
  try{
   const data=await this.rpc('dashboard');if(run!==this.settingsVersion||window.SFCloud?.user?.id!==uid)return;
   this.data=data;this.uid=uid;
   const profile=data.profile,parent=profile?.role==='parent';
   root.innerHTML=`<section class="family-account-panel"><h3>身份与亲子绑定</h3><p id="familySettingsNotice" role="status" aria-live="polite"></p><form id="familyProfile"><label>昵称<input name="name" maxlength="40" required value="${e(profile?.name||'')}" placeholder="例如：小雨 / 小雨妈妈"></label>${profile?`<p>当前身份：<strong>${parent?'家长':'孩子'}</strong>。一个账号对应一个身份。</p>`:'<fieldset><legend>这个账号属于谁？</legend><label><input type="radio" name="role" value="parent" required> 家长</label><label><input type="radio" name="role" value="child" required> 孩子</label></fieldset><p class="muted">设置后身份固定；家长与孩子分别使用自己的账号。</p>'}<button type="submit" class="btn">${profile?'保存昵称':'保存身份'}</button></form>${profile?`<hr><button type="button" class="btn secondary small" id="familySettingsRefresh">刷新绑定</button><h4>${parent?'绑定孩子':'绑定家长'}</h4><p>${parent?'生成绑定码，让孩子在自己的账号设置中输入，再由你确认。':'将家长提供的绑定码粘贴到下面，提交后等待家长确认。'}</p>${parent?'<button class="btn secondary" id="familyInvite" type="button">生成 15 分钟绑定码</button><div id="familyCode"></div>':'<form id="familyClaim"><label>家长绑定码<input name="code" required maxlength="50" autocomplete="off" placeholder="粘贴家长提供的绑定码"></label><button class="btn" type="submit">申请绑定</button></form>'}<div class="family-links">${data.links.map(l=>`<div class="family-link"><div><strong>${e(l.name)}</strong><small>${l.status==='active'?'已绑定':'等待家长确认'}</small></div><div>${parent&&l.status==='pending'?`<button class="btn small" data-confirm="${e(l.child_id)}">确认绑定</button>`:''}<button class="btn secondary small" data-unlink="${e(parent?l.child_id:l.parent_id)}">${l.status==='pending'?'取消申请':'解除绑定'}</button></div></div>`).join('')||'<p class="muted">还没有绑定关系。</p>'}</div>`:''}</section>`;
   const report=(message,error=false)=>{if(run===this.settingsVersion){const n=root.querySelector('#familySettingsNotice');n.textContent=message;n.classList.toggle('error',error);}};
   const action=async(button,fn)=>{button.disabled=true;try{await fn();if(window.SFCloud?.user?.id!==uid)return;if(run!==this.settingsVersion){if(this.isPage())await this.render(this.app);return;}await this.renderSettings();if(this.isPage())await this.render(this.app);}catch(err){report(err.message,true);}finally{button.disabled=false;}};
   root.querySelector('#familySettingsRefresh')?.addEventListener('click',()=>this.renderSettings());
   root.querySelector('#familyProfile').onsubmit=ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget);action(ev.submitter,()=>this.rpc('profile',{name:f.get('name'),role:profile?.role||f.get('role')}));};
   root.querySelector('#familyInvite')?.addEventListener('click',ev=>{const button=ev.currentTarget;button.disabled=true;this.rpc('invite').then(inv=>{if(run!==this.settingsVersion)return;const box=root.querySelector('#familyCode'),input=document.createElement('input');input.value=inv.code;input.readOnly=true;input.setAttribute('aria-label','绑定码');input.onclick=()=>input.select();box.replaceChildren(input);const help=document.createElement('p');help.textContent='点击选中后复制给孩子。有效至 '+this.time(inv.expires_at)+'，生成新码后旧码失效。';box.append(help);}).catch(err=>report(err.message,true)).finally(()=>{button.disabled=false;});});
   root.querySelector('#familyClaim')?.addEventListener('submit',ev=>{ev.preventDefault();const code=new FormData(ev.currentTarget).get('code');action(ev.submitter,()=>this.rpc('claim',{code}));});
   root.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=()=>action(b,()=>this.rpc('confirm',{user_id:b.dataset.confirm})));
   root.querySelectorAll('[data-unlink]').forEach(b=>b.onclick=()=>{if(window.confirm('解除后，双方将不能查看彼此的作业与学习记录。确定继续？'))action(b,()=>this.rpc('unlink',{user_id:b.dataset.unlink}));});
  }catch(err){if(run===this.settingsVersion)root.textContent='账号绑定暂时无法加载：'+err.message;}
 },
 parseLinks(text){
  if(text.length>3000)throw Error('链接和提取码说明请控制在 3000 字以内');
  const urls=[...new Set(text.match(/https?:\/\/[^\s<>"'，。；）]+/gi)||[])];
  if(urls.length>10)throw Error('每项作业最多 10 个链接');
  return urls.map(raw=>{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('链接地址无效');return {url:u.href};});
 },
 async upload(files){
  const uid=window.SFCloud?.user?.id;
  const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',heif:'image/heif',pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',txt:'text/plain'};
  if(files.length>5)throw Error('每次最多上传 5 个附件');
  for(const file of files){if(file.size>10*1024*1024)throw Error('单个附件不能超过 10 MB');if(!types[file.name.split('.').pop().toLowerCase()])throw Error('支持图片、PDF、Word、Excel、PPT 和 TXT 附件');}
  const result=[];
  for(const file of files){
   if(window.SFCloud?.user?.id!==uid)throw Error('账号已切换');
   const name='attachment.'+file.name.split('.').pop().toLowerCase();
   const path=uid+'/'+crypto.randomUUID()+'/'+name,mime=types[file.name.split('.').pop().toLowerCase()];
   const {error}=await window.SFCloud.client.storage.from('family-homework').upload(path,file,{upsert:false,contentType:mime});
   if(error)throw Error('附件上传失败，请检查网络后重试');
   result.push({path,name:file.name.slice(0,200),size:file.size});
  }
  return result;
 },
 resources(files=[],links=[],text=''){
  const e=v=>this.escape(v);
  return `${text?`<p class="family-note">${e(text)}</p>`:''}<div class="family-resources">${files.map(f=>`<button type="button" class="family-file" data-file="${e(f.path)}">📎 ${e(f.name)}${Number(f.size)>0?` <small>${Math.ceil(Number(f.size)/1024)} KB</small>`:''}</button>`).join('')}${links.map((l,i)=>`<a class="family-resource-link" href="${e(l.url)}" target="_blank" rel="noopener noreferrer">🔗 打开资料链接 ${i+1}</a>`).join('')}</div>`;
 },
 bindFiles(root){root.querySelectorAll('[data-file]').forEach(b=>b.onclick=()=>this.action(b,async()=>{
  const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;
  try{const {data,error}=await window.SFCloud.client.storage.from('family-homework').createSignedUrl(b.dataset.file,60);if(error||!data?.signedUrl)throw Error('附件暂时无法读取，请重新登录或刷新后再试');if(popup)popup.location.href=data.signedUrl;else this.notice('浏览器阻止了新窗口，请允许弹出窗口后再点击附件。',true);}catch(err){popup?.close();throw err;}
 }));},
 fileInput(name){return `<input type="file" name="${name}" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"><small class="muted">可选，最多 5 个；图片、PDF、Office、TXT，单个不超过 10 MB。</small>`;},
 assignmentForm(links){const e=v=>this.escape(v);return `<form id="familyAssignmentForm"><label>布置给谁<select name="child_id" required>${links.map(l=>`<option value="${e(l.child_id)}">${e(l.name)}</option>`).join('')}</select></label><label>作业方式<select name="kind"><option value="general">自由作业 · 文字 / 附件 / 链接</option><option value="course">站内课程作业（可选）</option></select></label><label>作业标题<input name="title" maxlength="120" required placeholder="例如：完成数学同步练习第 2 页"></label><label>作业说明<textarea name="note" maxlength="1000" rows="4" placeholder="写清需要做什么、做到哪里，也可以写鼓励的话。"></textarea></label><label>附件${this.fileInput('attachments')}</label><label>资料链接 / 网盘分享<textarea name="links_text" maxlength="3000" rows="3" placeholder="可直接粘贴网盘分享文字、链接和提取码；也可以填写多个网页链接。"></textarea></label><label>截止日期（可选，北京时间）<input name="due_on" type="date"></label><div data-course hidden><label>课程系列<select name="series_id"><option value="">请选择课程系列</option></select></label><label>集数<select name="episode_id" disabled><option value="">先选择系列</option></select></label><fieldset id="familyModuleChoices"><legend>学习任务</legend><span class="muted">选择课程后显示可布置的模块。</span></fieldset><label>Quiz 要求（%）<input name="quiz_min" type="number" min="0" max="100" value="80"></label></div><button class="btn" type="submit">发布作业</button></form>`;},
 async bindAssignmentForm(run){
  const form=this.app.el().querySelector('#familyAssignmentForm'),series=form.elements.series_id,episode=form.elements.episode_id,button=form.querySelector('[type=submit]'),kind=form.elements.kind;
  let change=0,course,loaded=false;
  kind.onchange=async()=>{
   const courseMode=kind.value==='course';form.querySelector('[data-course]').hidden=!courseMode;button.disabled=courseMode&&!episode.value;
   if(!courseMode||loaded)return;
   try{const catalogue=await this.app.getJSON('data/series-list.json');if(run!==this.generation)return;series.replaceChildren(new Option('请选择课程系列',''),...catalogue.filter(s=>!['coming','locked','draft'].includes(s.status)).map(s=>new Option(`${s.titleZh||s.title} · Level ${s.level}`,s.seriesId)));loaded=true;}catch{this.notice('课程列表暂时无法读取；也可以使用自由作业。',true);}
  };
  series.onchange=async()=>{
   const request=++change;episode.disabled=true;button.disabled=true;episode.replaceChildren(new Option('正在读取集数…',''));
   try{const bundle=await this.app.loadSeries(series.value);if(run!==this.generation||request!==change)return;course=bundle;
    const rows=course.episodes.filter(e=>!['coming','locked','draft'].includes(e.status));
    episode.replaceChildren(new Option('请选择集数',''),...rows.map(row=>new Option(`第 ${row.episodeId} 集 · ${row.title}`,String(row.episodeId))));episode.disabled=false;
   }catch{if(run===this.generation)this.notice('课程暂时无法读取，请重新选择。',true);}
  };
  episode.onchange=()=>{
   const row=course?.episodes.find(e=>Number(e.episodeId)===Number(episode.value));button.disabled=kind.value==='course'&&!row;
   const choices=form.querySelector('#familyModuleChoices');choices.innerHTML='<legend>学习任务（可多选）</legend>';if(!row)return;
   const available={watch:!!(row.modules?.watch||row.video?.hlsUrl||row.video?.embedUrl||row.video?.directUrl),read:!!row.modules?.read,words:!!(row.modules?.words||row.modules?.vocabulary),quiz:!!row.modules?.quiz};
   for(const [key,label] of Object.entries(this.labels))if(available[key]){const l=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.name='modules';i.value=key;i.checked=true;l.append(i,document.createTextNode(label));choices.append(l);}
   if(!form.elements.title.value)form.elements.title.value=`${course.series.seriesTitle||series.selectedOptions[0].text} · ${row.title}`.slice(0,120);
  };
  form.onsubmit=ev=>{ev.preventDefault();const f=new FormData(form),courseMode=f.get('kind')==='course',modules=courseMode?f.getAll('modules'):[];
   if(courseMode&&(!modules.length||!episode.value)){this.notice('请先选择课程、集数和学习模块。',true);return;}
   form.dataset.requestId ||= crypto.randomUUID();
   const payload={id:form.dataset.requestId,kind:f.get('kind'),child_id:f.get('child_id'),series_id:f.get('series_id'),episode_id:Number(f.get('episode_id')),title:f.get('title'),note:f.get('note'),due_on:f.get('due_on'),quiz_min:Number(f.get('quiz_min')),modules,links_text:f.get('links_text')};
   const files=Array.from(form.elements.attachments.files);
   this.action(button,async()=>{payload.links=this.parseLinks(payload.links_text);if(courseMode)await this.prepare(payload.series_id,payload.episode_id);this.notice(files.length?'正在上传附件，请稍候…':'正在发布作业…');payload.attachments=await this.upload(files);await this.rpc('create',payload);await this.render(this.app);this.notice('作业已发布，孩子刷新作业列表即可收到。');});
  };
 },
 renderAssignments(){
  const root=this.app.el(),box=root.querySelector('#familyAssignments');if(!box)return;
  const e=v=>this.escape(v),parent=this.data.profile.role==='parent',child=root.querySelector('#familyChildFilter')?.value||'all',status=root.querySelector('#familyStatusFilter').value;
  const rows=this.data.assignments.filter(a=>(child==='all'||a.child_id===child)&&(status==='all'||status==='todo'&&['assigned','revision'].includes(a.status)||a.status===status));
  box.innerHTML=rows.length?rows.map(a=>{
   const active=['assigned','revision'].includes(a.status),late=active&&a.due_on&&a.due_on<this.today(),general=a.kind==='general';
   return `<article class="family-assignment homework-thread" data-task="${e(a.id)}"><div class="family-section-head homework-subject"><div><span class="family-status ${e(a.status)}">${e(this.statuses[a.status])}</span>${late?'<span class="family-overdue">已逾期</span>':''}<h3>${e(a.title)}</h3></div><small>发给 ${e(a.child_name)}</small></div><section class="homework-message homework-request"><header><strong>✉ 家长布置 · ${e(a.parent_name)}</strong><small>${e(this.time(a.created_at))}</small></header>${!general?`<p class="muted">${e(a.series_title)} · 第 ${e(a.episode_id)} 集 · ${e(a.episode_title)}</p>`:''}<p class="family-deadline">${a.due_on?'截止：'+e(a.due_on)+'（北京时间）':'无截止日期'}${!general&&a.modules.includes('quiz')?' · Quiz ≥ '+e(a.quiz_min)+'%':''}</p>${a.note?`<p class="homework-text">${e(a.note)}</p>`:''}${this.resources(a.attachments,a.links,a.links_text)}${!general?`<div class="family-tasks">${a.modules.map(m=>`<button type="button" class="family-lesson" data-series="${e(a.series_id)}" data-episode="${e(a.episode_id)}" data-module="${e(m)}"><span data-done="${e(m)}">${a.submission?.done?.[m]&&!active?'✓':'○'}</span> ${e(this.labels[m])}</button>`).join('')}</div>`:''}</section>${a.submission?`<section class="homework-message homework-reply family-submission"><header><strong>↳ 孩子完成 · ${e(a.child_name)}</strong><small>${e(this.time(a.submitted_at))}</small></header><p class="homework-text">${e(a.submission.note||'已提交打卡。')}</p>${this.resources(a.submission.attachments,a.submission.links,a.submission.links_text)}</section>`:''}${a.feedback?`<section class="homework-message homework-feedback"><header><strong>家长反馈 · ${e(a.parent_name)}</strong></header><p class="homework-text">${e(a.feedback)}</p></section>`:''}${active?`<section class="homework-message homework-compose-reply"><header><strong>${parent?'等待孩子'+(a.status==='revision'?'补做后':'')+'回复':'↳ 回复作业 · '+e(a.child_name)}</strong></header><p class="muted" data-progress>${general?(parent?'孩子提交后，完成情况和照片会显示在这条作业下方。':'按说明完成后，可以填写完成情况或上传照片并打卡。'):'正在核对本次任务进度…'}</p>${!parent?`<label>完成情况 / 回复<textarea data-child-note maxlength="1000" rows="3" placeholder="例如：第 2 页已完成，照片在下面。"></textarea></label><label>作业照片或附件（可选）${this.fileInput('child_attachments')}</label><label>提交链接（可选）<textarea data-child-links maxlength="3000" rows="2" placeholder="也可以粘贴作业的网盘链接"></textarea></label><button class="btn" data-submit>提交打卡 / Submit</button>`:''}</section>`:'<p class="muted" data-progress></p>'}${parent&&a.status==='submitted'?'<section class="homework-message homework-review"><label>给孩子的反馈（可选）<textarea data-feedback maxlength="1000" rows="2"></textarea></label><div class="family-actions"><button class="btn" data-review="approved">确认完成</button><button class="btn secondary" data-review="revision">请孩子补做</button></div></section>':''}${parent&&!['approved','cancelled'].includes(a.status)?'<button class="btn secondary small" data-cancel>取消作业</button>':''}</article>`;
  }).join(''):'<div class="family-empty">这里还没有作业。'+(parent?'为孩子发布第一项任务吧。':'家长布置后，作业会显示在这里。')+'</div>';
  box.querySelectorAll('textarea,input[type=file]').forEach(input=>input.addEventListener('input',()=>{input.dataset.dirty='true';}));
  this.bindFiles(box);
  root.querySelectorAll('.family-lesson').forEach(b=>b.onclick=()=>{this.app.activeLessonTab=({read:'listenRead',watch:'watch',words:'words',quiz:'quiz'})[b.dataset.module];location.hash=`#/lesson/${encodeURIComponent(b.dataset.series)}/${Number(b.dataset.episode)}`;});
  box.querySelectorAll('[data-task]').forEach(card=>{
   const id=card.dataset.task,a=rows.find(x=>x.id===id);
   if(a.kind!=='general'&&['assigned','revision'].includes(a.status))this.rpc('task_progress',{id}).then(p=>{if(!card.isConnected)return;let count=0;for(const [module,done]of Object.entries(p.done)){if(done)count++;const node=card.querySelector(`[data-done="${module}"]`);if(node)node.textContent=done?'✓':'○';}card.querySelector('[data-progress]').textContent=`本次任务已完成 ${count}/${a.modules.length} 项${a.status==='revision'?' · 补做需重新完成任务':''}`;if(count&&a.status==='assigned')card.querySelector('.family-status').textContent='进行中';}).catch(err=>{if(card.isConnected)card.querySelector('[data-progress]').textContent='进度暂未同步：'+err.message;});
   card.querySelector('[data-submit]')?.addEventListener('click',ev=>this.action(ev.currentTarget,async()=>{
    if(a.kind!=='general'){await this.flush();if(this.queue(this.uid).length)throw Error('仍有学习记录未上传，请联网刷新后再提交。'+this.lastError);}
    const links_text=card.querySelector('[data-child-links]').value,links=this.parseLinks(links_text),files=Array.from(card.querySelector('[name=child_attachments]').files);
    this.notice(files.length?'正在上传作业材料…':'正在提交打卡…');
    const attachments=await this.upload(files);
    await this.rpc('submit',{id,note:card.querySelector('[data-child-note]').value,links_text,links,attachments});await this.render(this.app);this.notice('打卡已提交，等待家长确认。');
   }));
   card.querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>this.action(b,async()=>{await this.rpc('review',{id,decision:b.dataset.review,feedback:card.querySelector('[data-feedback]').value});await this.render(this.app);}));
   card.querySelector('[data-cancel]')?.addEventListener('click',ev=>{if(window.confirm('确定取消这项作业？'))this.action(ev.currentTarget,async()=>{await this.rpc('cancel',{id});await this.render(this.app);});});
  });
 },
 async showRecords(child){
  const box=this.app.el().querySelector('#familyRecords');if(!child){box.innerHTML='<p>请选择孩子。</p>';return;}
  const run=this.generation;box.textContent='正在读取学习记录…';
  try{
   const data=await this.rpc('records',{child_id:child});
   const index=await this.app.getJSON('data/search-index.json');
   if(run!==this.generation||this.app.el().querySelector('#familyRecordsChild')?.value!==child)return;
   const names=new Map(index.items.filter(x=>x.type!=='series').map(x=>[`${x.seriesId}:${x.episodeId}`,`${x.seriesTitle} · ${x.title}`]));
   const e=v=>this.escape(v),label=(series,episode)=>names.get(`${series}:${episode}`)||`${series} · 第 ${episode} 集`;
   const history=Object.entries(data.progress).sort((a,b)=>(b[1].updatedAt||'').localeCompare(a[1].updatedAt||'')).slice(0,50);
   box.innerHTML=`<h3>近期学习操作</h3><p class="muted">显示功能启用后的最近 200 次操作；观看和阅读为孩子标记完成，Quiz 为本次答题核对结果。</p><div class="family-records">${data.events.map(x=>`<div><strong>${e(label(x.series_id,x.episode_id))}</strong><span>${e(this.labels[x.module])}${x.module==='quiz'?` · ${x.score}/${x.total}（${Math.round(100*x.score/x.total)}%）`:' · 已标记完成'}</span><small>${e(this.time(x.occurred_at))}</small></div>`).join('')||'<p>还没有新的学习操作记录。</p>'}</div><h3>历史学习状态</h3><p class="muted">来自原有云同步；不代表本次作业已完成。这里只显示课程状态和最佳成绩。</p><div class="family-records">${history.map(([key,x])=>{const best=data.quiz_scores[key];return `<div><strong>${e(label(x.seriesId,x.episodeId))}</strong><span>${e(Object.keys(x.modules||{}).filter(m=>x.modules[m]).map(m=>this.labels[m]||m).join(' / '))}${best?` · 历史 Quiz 最佳 ${e(best.score)}/${e(best.total)}`:''}</span><small>${e(this.time(x.updatedAt))}</small></div>`;}).join('')||'<p>还没有已同步的历史记录。</p>'}</div>`;
  }catch(err){if(box.isConnected)box.textContent='读取失败：'+err.message;}
 }
};
