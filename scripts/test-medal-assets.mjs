import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {validatePng,crc32,encryptImage,decryptImage} from '../supabase/functions/medals-assets/png.mjs';
import {handleMedalAssets} from '../supabase/functions/medals-assets/handler.mjs';
function png(size){const chunk=(name,data)=>{const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);};const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc((size*4+1)*size))),chunk('IEND',Buffer.alloc(0))]);}
const full=png(512),thumb=png(256),key='a1'.repeat(32),id='11111111-1111-4111-a111-111111111111';
assert.equal((await validatePng(full)).width,512);await validatePng(thumb,{thumbnail:true});
await assert.rejects(validatePng(Buffer.from('<svg onload="alert(1)"/>')));
await assert.rejects(validatePng(png(32)));const corrupt=Buffer.from(full);corrupt[40]^=1;await assert.rejects(validatePng(corrupt));
const encrypted=await encryptImage(full,key);assert.notDeepEqual(Buffer.from(encrypted.cipher.subarray(0,8)),full.subarray(0,8));assert.deepEqual(Buffer.from(await decryptImage(encrypted.cipher,key,encrypted.iv)),full);const tampered=Uint8Array.from(encrypted.cipher);tampered[5]^=1;await assert.rejects(decryptImage(tampered,key,encrypted.iv));
const env=name=>name==='SUPABASE_URL'?'https://project.test':name==='SUPABASE_SERVICE_ROLE_KEY'?'server-secret':'publishable';
const origin='https://yqxyy.netlify.app',base='https://project.test/functions/v1/medals-assets';
assert.equal((await handleMedalAssets(new Request(base,{method:'POST'}),{env,fetcher:()=>{throw Error('unauthorized network');}})).status,401);
assert.equal((await handleMedalAssets(new Request(base,{method:'OPTIONS',headers:{Origin:origin}}),{env})).headers.get('access-control-allow-origin'),origin);
assert.equal((await handleMedalAssets(new Request(base,{method:'OPTIONS',headers:{Origin:'https://untrusted.example'}}),{env})).status,403);
let stored=[],finalized;
const fetcher=async(url,options)=>{
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'parent'});
 if(url.endsWith('/rpc/sf_medals_service')){assert.equal(options.headers.Authorization,'Bearer server-secret');const {p_action,p_payload}=JSON.parse(options.body);assert.equal(p_payload.viewer_id,'parent');if(p_action==='prepare')return Response.json({id,key});if(p_action==='finalize'){finalized=p_payload;return Response.json({ok:true});}if(p_action==='resolve')return Response.json({url:'https://u.pone.rs/cipher.bin',iv:encrypted.iv,key});}
 if(url==='https://pone.rs/upload'){assert.equal(options.headers?.Authorization,undefined);assert.equal(options.headers?.apikey,undefined);const file=options.body.get('files[]');assert.equal(file.type,'application/octet-stream');const bytes=new Uint8Array(await file.arrayBuffer());stored.push(bytes);assert.notDeepEqual(Buffer.from(bytes.subarray(0,8)),full.subarray(0,8));return Response.json({success:true,files:[{url:'https://u.pone.rs/cipher.bin'}]});}
 if(url==='https://u.pone.rs/cipher.bin')return new Response(encrypted.cipher);throw Error('Unexpected network');
};
const form=new FormData();form.append('full',new File([full],'full.png',{type:'image/png'}));form.append('thumbnail',new File([thumb],'thumb.png',{type:'image/png'}));
const result=await handleMedalAssets(new Request(base,{method:'POST',headers:{Authorization:'Bearer user-token',Origin:origin},body:form}),{env,fetcher});const data=await result.json();assert.equal(result.status,200);assert.deepEqual(data,{id,width:512,height:512});assert.ok(!JSON.stringify(data).includes('key'));assert.ok(!JSON.stringify(data).includes('pone.rs'));assert.equal(stored.length,2);assert.equal(finalized.width,512);
const image=await handleMedalAssets(new Request(base+'?id='+id,{headers:{Authorization:'Bearer user-token',Origin:origin}}),{env,fetcher});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.match(image.headers.get('cache-control'),/no-store/);assert.deepEqual(Buffer.from(await image.arrayBuffer()),full);
const denied=await handleMedalAssets(new Request(base+'?id='+id,{headers:{Authorization:'Bearer user-token'}}),{env,fetcher:async(url,options)=>url.endsWith('/auth/v1/user')?Response.json({id:'unbound'}):Response.json({error:'denied'},{status:403})});assert.equal(denied.status,403);
console.log('PASS: PNG validation, bounds, CRC, AES-GCM authentication, encrypted Pone storage, role enforcement, CORS and private image serving without URLs or keys.');
