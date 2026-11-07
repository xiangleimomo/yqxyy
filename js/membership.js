/* Membership metadata and administrator tools. Content enforcement is not enabled. */
window.SFMembership = {
  generation:0, request:0, uid:null, data:null,
  labels:{trial:'体验用户',monthly:'月卡用户',annual:'年卡用户'},
  escape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
  time(value){return value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'尚未开始';},
  reset(){this.generation++;this.request++;this.uid=null;this.data=null;document.getElementById('membershipAccountSettings')?.replaceChildren();},
  async rpc(action,payload={}){
    const cloud=window.SFCloud,uid=cloud?.user?.id;
    if(!uid||!cloud.client)throw Error('请先登录');
    const {data,error}=await cloud.client.rpc('sf_membership',{p_action:action,p_payload:payload});
    if(window.SFCloud?.user?.id!==uid)throw Error('账号已切换，请重新操作');
    if(error){
      if(error.code==='PGRST202'||error.code==='42883')throw Error('会员服务尚未启用，请联系管理员完成配置。');
      throw Error(error.message||'会员资料读取失败，请重试。');
    }
    return data;
  },
  async refresh(){
    const uid=window.SFCloud?.user?.id,run=++this.generation;
    this.uid=uid;this.data=null;
    if(!uid)return;
    try{const data=await this.rpc('me');if(run===this.generation&&window.SFCloud?.user?.id===uid)this.data=data;}catch{/* Account panel offers an explicit retry. */}
  },
  summary(data){
    const e=v=>this.escape(v);
    if(data.exempt)return '<strong>长期使用账号</strong><p>此账号不受体验期和会员有效期限制。</p>';
    const expiry=data.tier==='trial'?data.trial_ends_at:data.valid_until;
    return `<strong>${e(this.labels[data.tier]||'体验用户')}</strong><p>${data.tier==='trial'?'体验截止':'会员到期'}：${e(this.time(expiry))}${data.status==='expired'?' · 已到期':''}</p>`;
  },
  async render(){
    const root=document.getElementById('membershipAccountSettings'),uid=window.SFCloud?.user?.id;
    if(!root||!uid)return;
    const run=++this.generation,current=()=>run===this.generation&&window.SFCloud?.user?.id===uid&&root.isConnected;
    root.innerHTML='<section class="membership-panel"><h3>账号类型</h3><p role="status">正在读取会员资料…</p></section>';
    try{
      const data=await this.rpc('me');if(!current())return;this.uid=uid;this.data=data;
      root.innerHTML=`<section class="membership-panel"><h3>账号类型</h3><div id="membershipSummary">${this.summary(data)}</div><p class="membership-foundation-note">当前仅记录账号类型与有效期，暂未启用到期限制。</p>${window.SFCloud?.isAdmin?.()?'<details id="membershipAdmin"><summary>会员管理</summary><form id="membershipSearch"><label>查找账号<input name="query" type="search" maxlength="100" placeholder="输入邮箱，或留空查看全部"></label><button type="submit">查询</button></form><p id="membershipNotice" role="status" aria-live="polite"></p><div id="membershipResults"></div><div class="membership-pagination"><button type="button" id="membershipPrev">上一页</button><span id="membershipPage"></span><button type="button" id="membershipNext">下一页</button></div><div id="membershipEditor"></div></details>':''}</section>`;
      if(!root.querySelector('#membershipAdmin'))return;
      let page=0,query='',selected=null,hasMore=false;
      const notice=root.querySelector('#membershipNotice'),results=root.querySelector('#membershipResults'),editor=root.querySelector('#membershipEditor');
      const report=(message,error=false)=>{notice.textContent=message;notice.classList.toggle('error',error);};
      const edit=account=>{
        selected=account;const e=v=>this.escape(v);
        editor.innerHTML=`<form id="membershipEdit"><h4>${e(account.email)}</h4>${account.exempt?'<p>此账号享有长期使用权限，修改会员类型不会取消该权限。</p>':''}<label>账号类型<select name="tier">${Object.entries(this.labels).map(([value,label])=>`<option value="${value}" ${value===account.tier?'selected':''}>${label}</option>`).join('')}</select></label><label id="membershipExpiry">自定义到期时间（可选）<input name="valid_until" type="datetime-local"><small>留空：保存时起算，月卡30天，年卡365天；替换原到期时间。</small></label><p id="membershipTrialNote" hidden>改回体验用户会保留最初的体验起点，不会重新赠送3天。</p><label>调整备注<input name="note" maxlength="500" placeholder="例如：已收款，开通月卡"></label><button type="submit">保存账号类型</button></form>`;
        const form=editor.querySelector('form'),tier=form.elements.tier;
        const toggle=()=>{const trial=tier.value==='trial';form.querySelector('#membershipExpiry').hidden=trial;form.querySelector('#membershipTrialNote').hidden=!trial;form.elements.valid_until.disabled=trial;};
        tier.onchange=toggle;toggle();
        form.onsubmit=async event=>{
          event.preventDefault();const target=selected,button=form.querySelector('button');button.disabled=true;report('正在保存…');
          try{
            const value=form.elements.valid_until.value;
            const saved=await this.rpc('set',{user_id:target.user_id,tier:tier.value,version:target.version,
              valid_until:tier.value==='trial'||!value?null:new Date(value).toISOString(),note:form.elements.note.value.trim()});
            if(!current())return;
            if(target.user_id===uid){this.data=saved;root.querySelector('#membershipSummary').innerHTML=this.summary(saved);}
            await search(false);if(!current())return;
            if(selected?.user_id===target.user_id)edit({...target,...saved});
            report('已保存账号类型与有效期。');
          }catch(error){if(current())report(error.message,true);}finally{if(form.isConnected)button.disabled=false;}
        };
      };
      const search=async(clear=true)=>{
        const request=++this.request;if(clear){selected=null;editor.replaceChildren();}report('正在查询…');
        root.querySelector('#membershipPrev').disabled=true;root.querySelector('#membershipNext').disabled=true;
        try{
          const response=await this.rpc('list',{query,page});if(!current()||request!==this.request)return;
          hasMore=response.has_more;results.replaceChildren();
          for(const account of response.items){
            const button=document.createElement('button');button.type='button';button.className='membership-account';
            button.innerHTML=`<strong>${this.escape(account.email)}</strong><span>${this.escape(account.exempt?'长期使用账号':this.labels[account.tier])} · ${account.status==='expired'?'已到期':account.exempt?'不受有效期限制':this.escape(this.time(account.tier==='trial'?account.trial_ends_at:account.valid_until))}</span>`;
            button.onclick=()=>edit(account);results.append(button);
          }
          root.querySelector('#membershipPage').textContent=`第 ${page+1} 页`;
          report(response.items.length?'点击账号可修改会员类型。':'没有找到账号。');
        }catch(error){if(current()&&request===this.request){hasMore=false;results.replaceChildren();report(error.message,true);}}
        finally{if(current()&&request===this.request){root.querySelector('#membershipPrev').disabled=page===0;root.querySelector('#membershipNext').disabled=!hasMore;}}
      };
      root.querySelector('#membershipSearch').onsubmit=event=>{event.preventDefault();query=event.currentTarget.elements.query.value.trim();page=0;search();};
      root.querySelector('#membershipPrev').onclick=()=>{if(page>0){page--;search();}};
      root.querySelector('#membershipNext').onclick=()=>{if(hasMore){page++;search();}};
      root.querySelector('#membershipAdmin').addEventListener('toggle',event=>{if(event.currentTarget.open&&!results.children.length)search();});
    }catch(error){
      if(!current())return;
      root.innerHTML=`<section class="membership-panel"><h3>账号类型</h3><p role="status">${this.escape(error.message)}</p><button type="button">重新读取</button></section>`;
      root.querySelector('button').onclick=()=>this.render();
    }
  }
};
document.addEventListener('sf-access-change',()=>{
  window.SFMembership.reset();
  if(window.SFCloud?.authMode==='account'&&!document.getElementById('accountDialog')?.hidden)window.SFMembership.render();
  else window.SFMembership.refresh();
});
