const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function check({exists=false,lookupError=null,response={data:{user:{identities:[{}]},session:null}},expected,signupCalls=0}) {
  const elements={accountNickname:{value:'测试家长'},accountEmail:{value:'test@example.com'},accountPassword:{value:'password123'},accountSubmit:{disabled:false}};
  let calls=0, message='';
  const context={window:{},document:{getElementById:id=>elements[id]},location:{origin:'https://example.com',pathname:'/'}};
  vm.runInNewContext(fs.readFileSync('js/cloud-account.js','utf8'),context);
  const cloud=context.window.SFCloud;
  cloud.client={rpc:async()=>({data:exists,error:lookupError}),auth:{signUp:async(args)=>{assert.equal(args.options.data.display_name,'测试家长');calls++;return response;}}};
  cloud.authMode='signup'; cloud.setMessage=text=>{message=text;};
  await cloud.submit();
  assert.match(message,expected); assert.equal(calls,signupCalls); assert.equal(elements.accountSubmit.disabled,false);
}
(async()=>{
  await check({exists:true,expected:/该邮箱已注册/});
  await check({lookupError:{message:'offline'},expected:/暂时无法检查邮箱/});
  await check({expected:/点击确认邮件/,signupCalls:1});
  await check({response:{data:{user:{identities:[]},session:null}},expected:/该邮箱已注册/,signupCalls:1});
  await check({response:{error:{code:'user_already_exists',message:'User already registered'}},expected:/该邮箱已注册/,signupCalls:1});
  await check({response:{error:{message:'Email rate limit exceeded'}},expected:/Email rate limit exceeded/,signupCalls:1});
  console.log('Signup email checks: 6 scenarios passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
