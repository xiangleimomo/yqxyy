/* Story Fox account / cross-device learning sync. Static Netlify; no server secret. */
window.SFCloud = {
  client: null,
  app: null,
  user: null,
  active: false,
  ready: false,
  syncing: false,
  pending: false,
  timer: null,
  loginTask: null,
  adminVerified: false,
  adminUserId: null,
  adminCheckVersion: 0,
  keys: ['progress','quizScores','wordbank','sentences','points','checkins'],

  isAdmin(){return !!this.user && this.adminVerified===true && this.adminUserId===this.user.id;},
  async verifyAdmin(user){
    const version=++this.adminCheckVersion;this.adminVerified=false;this.adminUserId=null;
    try{
      // getUser verifies with Auth; never authorize from editable user_metadata or cached session flags.
      const {data,error}=await this.client.auth.getUser();
      if(version!==this.adminCheckVersion||this.user?.id!==user.id)return;
      if(!error&&data.user?.id===user.id&&data.user.app_metadata?.site_admin===true){this.adminVerified=true;this.adminUserId=user.id;}
    }catch{/* Fail closed when administrator verification is unavailable. */}
    if(version===this.adminCheckVersion)document.dispatchEvent(new CustomEvent('sf-access-change'));
  },

  configured(){
    const c=window.STORYFOX_SUPABASE || {};
    return Boolean(/^https:\/\/[^/]+\.supabase\.co\/?$/.test((c.url||'').trim()) && c.publishableKey);
  },
  storageKey(key, uid=this.user?.id){
    return uid ? `sf_account_${uid}_${key}` : `sf_${key}`;
  },
  read(key, uid=this.user?.id){
    const raw=localStorage.getItem(this.storageKey(key,uid));
    if(key==='points') return Math.max(0,Number(raw||0)||0);
    try { return raw ? JSON.parse(raw) : (key==='wordbank'||key==='sentences'||key==='checkins' ? [] : {}); }
    catch { return key==='wordbank'||key==='sentences'||key==='checkins' ? [] : {}; }
  },
  write(key, value, uid=this.user?.id){
    localStorage.setItem(this.storageKey(key,uid), key==='points' ? String(value) : JSON.stringify(value));
  },
  snapshot(uid=this.user?.id){
    return {
      progress:this.read('progress',uid),
      quiz_scores:this.read('quizScores',uid),
      wordbank:this.read('wordbank',uid),
      sentences:this.read('sentences',uid),
      checkins:this.read('checkins',uid),
      points:this.read('points',uid)
    };
  },
  writeSnapshot(s, uid=this.user?.id){
    this.write('progress',s.progress||{},uid);
    this.write('quizScores',s.quiz_scores||{},uid);
    this.write('wordbank',s.wordbank||[],uid);
    this.write('sentences',s.sentences||[],uid);
    this.write('checkins',s.checkins||[],uid);
    this.write('points',Math.max(0,Number(s.points)||0),uid);
  },
  // Never drop a completed module or best quiz result when reconciling two devices.
  merge(a={},b={}){
    const progress={...(a.progress||{})};
    for(const [key, value] of Object.entries(b.progress||{})){
      if(!progress[key]) {progress[key]=value; continue;}
      const old=progress[key];
      progress[key]={...old,...value,
        modules:{...(old.modules||{}),...(value.modules||{})},
        typingCorrect:{...(old.typingCorrect||{}),...(value.typingCorrect||{})},
        pointSpends:{...(old.pointSpends||{}),...(value.pointSpends||{})},
        updatedAt:[old.updatedAt,value.updatedAt].filter(Boolean).sort().at(-1)||''};
    }
    const quiz_scores={...(a.quiz_scores||{})};
    for(const [key,value] of Object.entries(b.quiz_scores||{})){
      const old=quiz_scores[key];
      if(!old || (Number(value.score)/Math.max(1,Number(value.total))) > (Number(old.score)/Math.max(1,Number(old.total))) ||
        ((Number(value.score)/Math.max(1,Number(value.total)))===(Number(old.score)/Math.max(1,Number(old.total))) && (value.date||'')>(old.date||''))) quiz_scores[key]=value;
    }
    const unique=(xs,ys)=>{
      const m=new Map();
      for(const item of [...(Array.isArray(xs)?xs:[]),...(Array.isArray(ys)?ys:[])]){
        const key=item.id || [item.seriesId,item.episodeId,item.word||item.sentence||''].join(':');
        m.set(key,item);
      }
      return [...m.values()];
    };
    return {progress,quiz_scores,
      wordbank:unique(a.wordbank,b.wordbank), sentences:unique(a.sentences,b.sentences),
      checkins:[...new Set([...(a.checkins||[]),...(b.checkins||[]),
        ...Object.values(a.progress||{}).map(x=>(x.updatedAt||'').slice(0,10)).filter(Boolean),
        ...Object.values(b.progress||{}).map(x=>(x.updatedAt||'').slice(0,10)).filter(Boolean)])].sort(),
      // Compare earned totals before subtracting the union of unique game purchases.
      // A stale high-balance snapshot must not undo a game purchase.
      points:Math.max(0,Math.max((Number(a.points)||0)+this.spent(a.progress),(Number(b.points)||0)+this.spent(b.progress))-this.spent(progress))};
  },
  spent(progress={}){
    const events=new Map();for(const entry of Object.values(progress||{}))for(const [id,event] of Object.entries(entry.pointSpends||{}))if(event?.amount===2)events.set(id,2);
    return [...events.values()].reduce((sum,n)=>sum+n,0);
  },
  hasData(s){
    return Object.keys(s.progress||{}).length || Object.keys(s.quiz_scores||{}).length ||
      (s.wordbank||[]).length || (s.sentences||[]).length || (s.checkins||[]).length || Number(s.points)>0;
  },
  setMessage(text, error=false){
    const node=document.getElementById('accountNotice');
    if(node){node.textContent=text;node.className='account-notice'+(error?' error':'');}
  },
  updateHeader(){
    const link=document.getElementById('accountLink');
    if(link){link.textContent=this.user?`${this.isAdmin()?'🛠 管理员':'👤'} ${this.user.email?.split('@')[0]||'我的账户'}`:'👤 注册 / 登录';}
    const state=document.getElementById('syncState');
    if(state){state.textContent=this.isAdmin()?'开发调试管理员 · 已发布课程与全部游戏免解锁、游戏不扣积分':this.user?'已登录 · 学习记录可云端同步':'游客模式 · 记录仅在本设备';}
  },
  async loadLibrary(){
    if(window.supabase?.createClient) return;
    const load=url=>new Promise((resolve,reject)=>{
      const s=document.createElement('script'); s.src=url; s.async=true;
      s.onload=()=>window.supabase?.createClient ? resolve() : reject(new Error('Supabase SDK 未正确加载'));
      s.onerror=()=>reject(new Error('无法加载 Supabase SDK，请检查网络'));
      document.head.appendChild(s);
    });
    try{await load('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');}
    catch {await load('https://unpkg.com/@supabase/supabase-js@2');}
  },
  async init(app){
    this.app=app;
    document.getElementById('accountLink')?.addEventListener('click',e=>{e.preventDefault();this.open();});
    document.getElementById('accountClose')?.addEventListener('click',()=>this.close());
    document.getElementById('accountDialog')?.addEventListener('click',e=>{if(e.target.id==='accountDialog')this.close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')this.close();});
    document.getElementById('accountForm')?.addEventListener('submit',e=>{e.preventDefault();this.submit();});
    document.querySelectorAll('[data-auth-mode]').forEach(btn=>btn.addEventListener('click',()=>this.mode(btn.dataset.authMode)));
    document.getElementById('accountLogout')?.addEventListener('click',()=>this.signOut());
    document.getElementById('accountImport')?.addEventListener('click',()=>this.importGuest());
    document.getElementById('accountSync')?.addEventListener('click',()=>this.sync(true));
    window.addEventListener('online',()=>this.schedule());
    window.addEventListener('focus',()=>this.pull());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.pull();});
    this.updateHeader();
    if(!this.configured()) return;
    try{
      await this.loadLibrary();
      const c=window.STORYFOX_SUPABASE;
      this.client=window.supabase.createClient(c.url,c.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      this.client.auth.onAuthStateChange((event, session)=>{
        if(event==='SIGNED_OUT') this.onSignedOut();
        else if(event==='PASSWORD_RECOVERY') { this.open();this.mode('newPassword');this.setMessage('请设置一个新密码。'); }
        else if(['SIGNED_IN','INITIAL_SESSION','TOKEN_REFRESHED'].includes(event) && session?.user){
          // Auth calls must run after the callback releases the SDK's session lock.
          setTimeout(()=>this.onSession(session.user),0);
        }
      });
      const {data,error}=await this.client.auth.getSession();
      if(error) throw error;
      if(data.session?.user) await this.onSession(data.session.user);
      this.ready=true;
    }catch(e){this.setMessage('云端连接失败：'+e.message,true);this.updateHeader();}
  },
  async onSession(user){
    if(this.user?.id===user.id && this.active){const before=this.isAdmin();await this.verifyAdmin(user);this.updateHeader();if(before!==this.isAdmin()){this.app?.windowLayer?.replaceChildren();this.app?.updateUtilityNav();await this.app?.render();}return;}
    if(this.loginTask) return this.loginTask;
    this.loginTask=this.enterAccount(user).finally(()=>{this.loginTask=null;});
    return this.loginTask;
  },
  async enterAccount(user){
    // Close previous account/guest floating windows before switching identity.
    this.app?.windowLayer?.replaceChildren();
    // Switch scope BEFORE rendering; another account's cache is never shown.
    this.user=user;this.active=false;this.updateHeader();
    await this.verifyAdmin(user);this.updateHeader();
    if(this.user?.id!==user.id)return;
    try{
      const {data,error}=await this.client.from('user_learning_state').select('*').eq('user_id',user.id).maybeSingle();
      if(error) throw error;
      const cloud=data||{};
      if(this.user?.id!==user.id)return;
      const local=this.snapshot(user.id);
      let merged=this.merge(cloud,local);
      const guest=this.snapshot(null);
      const importKey=`sf_guest_imported_${user.id}`;
      if(this.hasData(guest) && !localStorage.getItem(importKey)){
        if(window.confirm('此浏览器还有游客学习记录。是否将它们导入当前账号？\n如果这些记录属于其他人，请选择取消。')){
          merged=this.merge(merged,guest);
          localStorage.setItem(importKey,'1');
        }
      }
      this.writeSnapshot(merged,user.id);
      this.active=true;
      this.updateHeader();
      this.app.updateUtilityNav();await this.app.render();
      if(!data || JSON.stringify(merged)!==JSON.stringify(this.merge(cloud,{}))) this.schedule();
      this.setMessage('登录成功，学习进度已加载。');
    }catch(e){
      if(this.user?.id!==user.id)return;
      this.active=true; // scoped offline fallback (not another user's guest state)
      this.setMessage('已登录，但云端读取失败。此设备记录仍可使用；网络恢复后重试同步。'+e.message,true);
      this.app.updateUtilityNav(); await this.app.render();
    }
  },
  onSignedOut(){
    this.adminCheckVersion++;this.adminVerified=false;this.adminUserId=null;
    if(this.timer)clearTimeout(this.timer);
    this.app?.windowLayer?.replaceChildren();
    this.user=null;this.active=false;this.pending=false;
    this.updateHeader();this.app?.updateUtilityNav();this.app?.render();
    this.setMessage('已退出账号，当前处于游客模式。');
  },
  schedule(){
    if(!this.user||!this.client)return;
    this.pending=true;
    if(this.timer)clearTimeout(this.timer);
    this.timer=setTimeout(()=>this.sync(),850);
  },
  async sync(manual=false){
    if(!this.user||!this.client){if(manual)this.setMessage('请先登录并配置 Supabase。',true);return;}
    if(this.syncing){this.pending=true;return;}
    this.syncing=true;this.pending=false;
    const uid=this.user.id;
    try{
      const {data,error}=await this.client.from('user_learning_state').select('*').eq('user_id',uid).maybeSingle();
      if(error)throw error;
      if(this.user?.id!==uid)return;
      const state=this.merge(data||{},this.snapshot(uid));
      const {error:saveError}=await this.client.from('user_learning_state').upsert({user_id:uid,...state,updated_at:new Date().toISOString()},{onConflict:'user_id'});
      if(saveError)throw saveError;
      if(this.user?.id!==uid)return;
      const latest=this.snapshot(uid);
      this.writeSnapshot(this.merge(state,latest),uid);
      if(JSON.stringify(latest)!==JSON.stringify(this.merge(state,latest))) this.pending=true;
      this.app.updateUtilityNav();
      if(manual)this.setMessage('云端同步完成。');
    }catch(e){this.pending=true;this.setMessage('同步暂时失败，已保存本机数据：'+e.message,true);}
    finally{this.syncing=false; if(this.pending && navigator.onLine){this.pending=false; if(this.timer)clearTimeout(this.timer); this.timer=setTimeout(()=>this.sync(),5000);}}
  },
  async pull(){
    if(!this.user||!this.client||this.syncing)return;
    const uid=this.user.id;
    try{
      const {data,error}=await this.client.from('user_learning_state').select('*').eq('user_id',uid).maybeSingle();
      if(error||!data||this.user?.id!==uid)return;
      const merged=this.merge(data,this.snapshot(uid));
      const before=JSON.stringify(this.snapshot(uid));
      this.writeSnapshot(merged,uid);
      if(before!==JSON.stringify(merged)){
        this.app.updateUtilityNav();await this.app.render();this.schedule();
      }
    }catch(e){/* Offline: retain scoped local cache. */}
  },
  open(){
    const modal=document.getElementById('accountDialog');if(!modal)return;
    modal.hidden=false;this.mode(this.user?'account':'login');
  },
  close(){const modal=document.getElementById('accountDialog');if(modal)modal.hidden=true;},
  mode(mode){
    this.authMode=mode;
    document.getElementById('accountForm').hidden=mode==='account';
    document.getElementById('accountActions').hidden=mode!=='account';
    document.getElementById('authPasswordRow').hidden=mode==='reset';
    document.getElementById('authEmailRow').hidden=mode==='newPassword';
    document.getElementById('accountPassword').required=mode==='login'||mode==='signup'||mode==='newPassword';
    document.getElementById('accountEmail').required=mode!=='newPassword';
    document.getElementById('accountSubmit').textContent=mode==='signup'?'注册':mode==='reset'?'发送重置邮件':mode==='newPassword'?'设置新密码':'登录';
    document.getElementById('accountSignup').hidden=mode==='account';
    document.getElementById('accountLogin').hidden=mode==='account';
    document.getElementById('accountReset').hidden=mode==='account';
    document.getElementById('accountEmailLabel').textContent=this.user?.email||'';
    this.setMessage(!this.configured()?'网站管理员尚未配置 Supabase；暂时只能使用游客模式。':'');
  },
  async submit(){
    if(!this.client){this.setMessage('Supabase 尚未配置或连接失败，请联系网站管理员。',true);return;}
    const email=document.getElementById('accountEmail').value.trim();
    const password=document.getElementById('accountPassword').value;
    const submit=document.getElementById('accountSubmit');
    submit.disabled=true;this.setMessage('正在处理…');
    try{
      let result;
      if(this.authMode==='newPassword'){
        if(password.length<8)throw new Error('新密码至少需要 8 位。');
        result=await this.client.auth.updateUser({password});
      }else if(this.authMode==='signup'){
        if(password.length<8)throw new Error('密码至少需要 8 位。');
        result=await this.client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
      }else if(this.authMode==='reset'){
        result=await this.client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
      }else result=await this.client.auth.signInWithPassword({email,password});
      if(result.error)throw result.error;
      if(this.authMode==='signup'&&!result.data.session) this.setMessage('请打开注册邮箱，点击确认邮件里的链接，再回来登录。');
      else if(this.authMode==='reset')this.setMessage('如账号存在，密码重置邮件已发送。');
      else if(this.authMode==='newPassword'){this.setMessage('密码已更新。');this.mode('account');}
      else {this.setMessage('登录成功，正在同步学习记录…');if(result.data?.user)await this.onSession(result.data.user);this.mode('account');}
    }catch(e){this.setMessage('操作失败：'+e.message,true);}finally{submit.disabled=false;}
  },
  async signOut(){
    if(!this.client)return;
    await this.sync();
    const {error}=await this.client.auth.signOut();
    if(error)this.setMessage('退出失败：'+error.message,true);
    else {this.onSignedOut();this.mode('login');}
  },
  importGuest(){
    if(!this.user)return;
    if(!window.confirm('将本设备游客记录合并到当前账号？请确认这些记录属于你。'))return;
    const merged=this.merge(this.snapshot(this.user.id),this.snapshot(null));
    this.writeSnapshot(merged,this.user.id);
    localStorage.setItem(`sf_guest_imported_${this.user.id}`,'1');
    this.app.updateUtilityNav();this.app.render();this.schedule();this.setMessage('已导入本地游客记录，正在同步。');
  }
};
