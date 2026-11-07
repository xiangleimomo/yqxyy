/* Source-search navigation and page gate, using verified account roles. */
window.SourceAccess = {
  allowed:false, version:0, uid:null,
  apply(){
    if(this.uid!==window.SFCloud?.user?.id)this.allowed=false;
    document.querySelectorAll('a[href="/source-lab/"]').forEach(link=>{link.hidden=!this.allowed;link.style.display=this.allowed?'':'none';});
  },
  async check(client){
    const {data,error}=await client.auth.getUser();
    if(error||!data?.user)return false;
    if(data.user.app_metadata?.site_admin===true)return true;
    return String(data.user.email || '').trim().toLowerCase()==='hanyi888@qq.com';
  },
  async refresh(){
    const run=++this.version,uid=window.SFCloud?.user?.id;
    this.allowed=false;this.apply();
    if(!uid||!window.SFCloud?.client)return;
    try{
      const allowed=await this.check(window.SFCloud.client);
      if(run!==this.version||window.SFCloud?.user?.id!==uid)return;
      this.uid=uid;this.allowed=allowed;this.apply();
    }catch{/* An unavailable role check leaves the entry hidden. */}
  },
  async gate(){
    const status=document.getElementById('sourceAccessStatus');
    try{
      const config=window.STORYFOX_SUPABASE;
      const client=window.supabase.createClient(config.url,config.publishableKey);
      if(!await this.check(client))throw Error('片源探索仅向管理员和指定账号开放，请返回主站登录有权限的账号。');
      document.getElementById('sourceAccessContent').hidden=false;status.hidden=true;
      const script=document.createElement('script');script.src='app.js?v=20261107-role-access-1';document.body.append(script);
      client.auth.onAuthStateChange(()=>{setTimeout(async()=>{
        try{if(await this.check(client))return;}catch{}
        location.replace('/#/mobile-me');
      },0);});
    }catch(error){status.textContent=error.message||'暂时无法验证账号身份，请返回主站重试。';}
  }
};
if(document.getElementById('sourceAccessContent'))window.SourceAccess.gate();
else{
  window.SourceAccess.apply();
  new MutationObserver(()=>window.SourceAccess.apply()).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  document.addEventListener('sf-access-change',()=>window.SourceAccess.refresh());
  window.addEventListener('focus',()=>window.SourceAccess.refresh());
  window.SourceAccess.refresh();
}
