const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/source-access.js'),'utf8').split("if(document.getElementById('sourceAccessContent'))")[0];
const context={window:{},document:{querySelectorAll:()=>[]}};vm.runInNewContext(source,context);
const access=context.window.SourceAccess;
const client=(user,error=null)=>({auth:{getUser:async()=>({data:{user},error})},rpc(){throw Error('Family role must not grant source access');}});
(async()=>{
 for(const [user,expected] of [
  [{id:'admin',app_metadata:{site_admin:true}},true],
  [{id:'allowed',email:'hanyi888@qq.com'},true],
  [{id:'allowed',email:'HANYI888@QQ.COM'},true],
  [{id:'parent',email:'parent@example.com',user_metadata:{role:'parent'}},false],
  [{id:'child',email:'child@example.com'},false],
  [{id:'spoof',user_metadata:{email:'hanyi888@qq.com',site_admin:true}},false],
  [null,false],
 ])assert.equal(await access.check(client(user)),expected);
 assert.equal(await access.check(client({email:'hanyi888@qq.com'},new Error('Auth failed'))),false);
 let resolve;context.window.SFCloud={user:{id:'old'},client:{auth:{getUser:()=>new Promise(r=>resolve=r)}}};
 const pending=access.refresh();context.window.SFCloud.user={id:'new'};resolve({data:{user:{id:'old',email:'hanyi888@qq.com'}}});await pending;assert.equal(access.allowed,false);
 console.log('PASS admin/email allowlist, ordinary parent/child/guest denial, editable metadata rejection, Auth failure and account-switch isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});
