import assert from 'node:assert/strict';import {handleMedalCatalog} from '../supabase/functions/medals-catalog/handler.mjs';
const env=name=>name==='SUPABASE_URL'?'https://project.test':name==='SUPABASE_SERVICE_ROLE_KEY'?'private-server-key':'public';
const resources=[{key:'series:test',type:'series',id:'test',title:'真实系列',href:'#/series/test',expected_count:2},{key:'episode:test:1',type:'episode',id:'test:1',title:'第1集',href:'#/lesson/test/1',parent_key:'series:test'},{key:'episode:test:2',type:'episode',id:'test:2',title:'第2集',href:'#/lesson/test/2',parent_key:'series:test'}];
const request=(data,token='parent')=>new Request('https://project.test/functions/v1/medals-catalog',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:'https://yqxyy.netlify.app'},body:JSON.stringify(data)});
let items;
const fetcher=async(url,options)=>{
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'user'});
 if(url.endsWith('/rpc/sf_medals'))return Response.json(options.headers.authorization.includes('admin')?{admin:true,role:'parent'}:{admin:false,role:'parent'});
 if(url==='https://yqxyy.netlify.app/data/medal-resources.json')return Response.json(resources);
 if(url.endsWith('/rpc/sf_medals_service')){assert.equal(options.headers.apikey,'private-server-key');items=JSON.parse(options.body).p_payload.items;return Response.json({ok:true});}
 if(url.includes('/story_books?'))return Response.json([{id:'new-magazine',title:'新期刊',content_kind:'magazine'}]);
 if(url.includes('/story_book_shelf?'))return Response.json([]);throw Error('Unexpected request');
};
assert.equal((await handleMedalCatalog(new Request('https://relay.test',{method:'POST'}),{env,fetcher})).status,401);
assert.equal((await handleMedalCatalog(request({key:'series:test',include_episodes:true}),{env,fetcher})).status,403);
assert.equal((await handleMedalCatalog(request({key:'series:test',include_episodes:true,title:'forged'},'admin'),{env,fetcher})).status,200);assert.equal(items.length,3);assert.equal(items[0].title,'真实系列');
assert.equal((await handleMedalCatalog(request({key:'episode:test:1'}),{env,fetcher})).status,200);assert.equal(items.length,2);assert.equal(items[0].key,'series:test');
assert.equal((await handleMedalCatalog(request({key:'magazine:new-magazine'}),{env,fetcher})).status,200);assert.equal(items[0].title,'新期刊');
assert.equal((await handleMedalCatalog(request({key:'book:../../etc/passwd'}),{env,fetcher})).status,400);
console.log('PASS: trusted GitHub catalogue, minimal selected indexing, parent/admin roles, series child indexing, cloud magazine type and path validation.');
